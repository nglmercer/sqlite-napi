use crate::error::to_napi_error;
use crate::models::QueryResult;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use std::sync::{Arc, Mutex};

#[napi(object)]
pub struct ColumnInfo {
    pub name: String,
    #[napi(js_name = "type")]
    pub type_: String,
}

#[napi]
pub struct Statement {
    sql: String,
    conn: Arc<Mutex<Connection>>,
}

#[napi]
pub struct Iter {
    rows: Vec<serde_json::Value>,
    column_names: Vec<String>,
    current: usize,
}

fn params_to_refs(params: &[crate::db::Param]) -> Vec<&dyn ToSql> {
    params.iter().map(|p| p as &dyn ToSql).collect()
}

impl Statement {
    pub(crate) fn new(sql: String, conn: Arc<Mutex<Connection>>) -> Self {
        Statement { sql, conn }
    }
}

impl Iter {
    pub(crate) fn new(rows: Vec<serde_json::Value>, column_names: Vec<String>) -> Self {
        Iter {
            rows,
            column_names,
            current: 0,
        }
    }
}

fn build_row_map(
    row: &rusqlite::Row,
    column_names: &[String],
    column_count: usize,
) -> Result<serde_json::Value> {
    let mut map = serde_json::Map::with_capacity(column_count);
    for i in 0..column_count {
        let val = match row.get_ref(i).map_err(to_napi_error)? {
            rusqlite::types::ValueRef::Null => serde_json::Value::Null,
            rusqlite::types::ValueRef::Integer(v) => serde_json::Value::Number(v.into()),
            rusqlite::types::ValueRef::Real(v) => serde_json::Number::from_f64(v)
                .map_or(serde_json::Value::Null, serde_json::Value::Number),
            rusqlite::types::ValueRef::Text(v) => {
                serde_json::Value::String(String::from_utf8_lossy(v).into_owned())
            }
            rusqlite::types::ValueRef::Blob(v) => serde_json::Value::String(
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, v),
            ),
        };
        map.insert(column_names[i].clone(), val);
    }
    Ok(serde_json::Value::Object(map))
}

fn build_row_array(row: &rusqlite::Row, column_count: usize) -> Result<serde_json::Value> {
    let mut arr = Vec::with_capacity(column_count);
    for i in 0..column_count {
        let val = match row.get_ref(i).map_err(to_napi_error)? {
            rusqlite::types::ValueRef::Null => serde_json::Value::Null,
            rusqlite::types::ValueRef::Integer(v) => serde_json::Value::Number(v.into()),
            rusqlite::types::ValueRef::Real(v) => serde_json::Number::from_f64(v)
                .map_or(serde_json::Value::Null, serde_json::Value::Number),
            rusqlite::types::ValueRef::Text(v) => {
                serde_json::Value::String(String::from_utf8_lossy(v).into_owned())
            }
            rusqlite::types::ValueRef::Blob(v) => serde_json::Value::String(
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, v),
            ),
        };
        arr.push(val);
    }
    Ok(serde_json::Value::Array(arr))
}

#[napi]
impl Statement {
    #[napi]
    pub fn all(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = crate::db::convert_params_container(&env, params)?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Prepare failed: {}", self.sql)),
            )
        })?;

        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let count = names.len();

        let mut rows = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r = params_to_refs(p);
                stmt.query(r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(n) => {
                let mut nr: Vec<(&str, &dyn ToSql)> = Vec::with_capacity(n.len());
                for (k, v) in n.iter() {
                    nr.push((k.as_str(), v as &dyn ToSql));
                }
                stmt.query(nr.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
        };

        let mut results = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Fetch failed: {}", self.sql)),
            )
        })? {
            results.push(build_row_map(&row, &names, count)?);
        }
        Ok(serde_json::Value::Array(results))
    }

    #[napi]
    pub fn get(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = crate::db::convert_params_container(&env, params)?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Prepare failed: {}", self.sql)),
            )
        })?;

        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let count = names.len();

        let mut rows = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r = params_to_refs(p);
                stmt.query(r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(n) => {
                let mut nr: Vec<(&str, &dyn ToSql)> = Vec::with_capacity(n.len());
                for (k, v) in n.iter() {
                    nr.push((k.as_str(), v as &dyn ToSql));
                }
                stmt.query(nr.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
        };

        match rows.next().map_err(to_napi_error)? {
            Some(row) => build_row_map(&row, &names, count),
            None => Ok(serde_json::Value::Null),
        }
    }

    #[napi]
    pub fn run(&self, env: Env, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = crate::db::convert_params_container(&env, params)?;

        let changes = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r = params_to_refs(p);
                conn.execute(&self.sql, r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Run failed: {}", self.sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(n) => {
                let mut nr: Vec<(&str, &dyn ToSql)> = Vec::with_capacity(n.len());
                for (k, v) in n.iter() {
                    nr.push((k.as_str(), v as &dyn ToSql));
                }
                conn.execute(&self.sql, nr.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Run failed: {}", self.sql)),
                    )
                })?
            }
        };

        Ok(QueryResult {
            changes: changes as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    #[napi]
    pub fn values(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = crate::db::convert_params_container(&env, params)?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Prepare failed: {}", self.sql)),
            )
        })?;

        let count = stmt.column_count();

        let mut rows = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r = params_to_refs(p);
                stmt.query(r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(n) => {
                let mut nr: Vec<(&str, &dyn ToSql)> = Vec::with_capacity(n.len());
                for (k, v) in n.iter() {
                    nr.push((k.as_str(), v as &dyn ToSql));
                }
                stmt.query(nr.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
        };

        let mut results = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Fetch failed: {}", self.sql)),
            )
        })? {
            results.push(build_row_array(&row, count)?);
        }
        Ok(serde_json::Value::Array(results))
    }

    #[napi]
    pub fn finalize(&self) -> Result<()> {
        Ok(())
    }

    #[napi]
    pub fn iter(&self, env: Env, params: Option<Unknown>) -> Result<Iter> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = crate::db::convert_params_container(&env, params)?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Prepare failed: {}", self.sql)),
            )
        })?;

        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let count = names.len();

        let mut rows = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r = params_to_refs(p);
                stmt.query(r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", self.sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(_) => {
                return Err(Error::from_reason(
                    "Named parameters not supported for iter",
                ));
            }
        };

        let mut result_rows = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Fetch failed: {}", self.sql)),
            )
        })? {
            result_rows.push(build_row_map(&row, &names, count)?);
        }

        Ok(Iter::new(result_rows, names))
    }

    #[napi]
    pub fn columns(&self) -> Result<Vec<ColumnInfo>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let s = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Prepare failed: {}", self.sql)),
            )
        })?;
        Ok(s.column_names()
            .iter()
            .map(|n| ColumnInfo {
                name: n.to_string(),
                type_: String::new(),
            })
            .collect())
    }

    #[napi]
    pub fn source(&self) -> String {
        self.sql.clone()
    }

    #[napi(js_name = "toString")]
    pub fn to_string_method(&self) -> String {
        self.sql.clone()
    }
}

#[napi]
impl Iter {
    #[allow(clippy::should_implement_trait)]
    #[napi]
    pub fn next(&mut self) -> Result<Option<serde_json::Value>> {
        if self.current >= self.rows.len() {
            return Ok(None);
        }
        let row = self.rows[self.current].clone();
        self.current += 1;
        Ok(Some(row))
    }

    #[napi]
    pub fn next_values(&mut self) -> Result<Option<serde_json::Value>> {
        if self.current >= self.rows.len() {
            return Ok(None);
        }
        let row = self.rows[self.current].clone();
        self.current += 1;

        if let serde_json::Value::Object(map) = row {
            let mut arr = Vec::with_capacity(self.column_names.len());
            for name in &self.column_names {
                let val = map.get(name).cloned().unwrap_or(serde_json::Value::Null);
                arr.push(val);
            }
            Ok(Some(serde_json::Value::Array(arr)))
        } else {
            Ok(None)
        }
    }

    #[napi]
    pub fn has_more(&self) -> bool {
        self.current < self.rows.len()
    }

    #[napi]
    pub fn all(&mut self) -> Result<serde_json::Value> {
        let remaining: Vec<serde_json::Value> = self.rows[self.current..].to_vec();
        self.current = self.rows.len();
        Ok(serde_json::Value::Array(remaining))
    }

    #[napi]
    pub fn reset(&mut self) {
        self.current = 0;
    }
}
