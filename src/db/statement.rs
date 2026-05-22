use crate::db::convert_params_container;
use crate::db::sqlite_to_json;
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
    current_index: usize,
}

impl Iter {
    pub(crate) fn new(rows: Vec<serde_json::Value>, column_names: Vec<String>) -> Self {
        Iter {
            rows,
            column_names,
            current_index: 0,
        }
    }
}

impl Statement {
    pub(crate) fn new(sql: String, conn: Arc<Mutex<Connection>>) -> Self {
        Statement { sql, conn }
    }
}

#[napi]
impl Statement {
    #[napi]
    pub fn all(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let mut rows = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", self.sql)))
                })?
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                stmt.query(named_params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", self.sql)))
                })?
            }
        };

        let mut results = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", self.sql)))
        })? {
            let mut map = serde_json::Map::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                let name = &column_names[i];
                map.insert(name.clone(), val);
            }
            results.push(serde_json::Value::Object(map));
        }
        Ok(serde_json::Value::Array(results))
    }

    #[napi]
    pub fn get(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let mut rows = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(params_refs.as_slice()).map_err(to_napi_error)?
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                stmt.query(named_params_refs.as_slice()).map_err(to_napi_error)?
            }
        };

        if let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = serde_json::Map::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                let name = &column_names[i];
                map.insert(name.clone(), val);
            }
            Ok(serde_json::Value::Object(map))
        } else {
            Ok(serde_json::Value::Null)
        }
    }

    #[napi]
    pub fn run(&self, env: Env, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let params_container = convert_params_container(&env, params)?;

        let changes = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.execute(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Run failed: {}", self.sql)))
                })?
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                stmt.execute(named_params_refs.as_slice())
                    .map_err(to_napi_error)?
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

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let mut rows = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", self.sql)))
                })?
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                stmt.query(named_params_refs.as_slice())
                    .map_err(to_napi_error)?
            }
        };

        let mut results = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", self.sql)))
        })? {
            let mut row_arr = Vec::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                row_arr.push(val);
            }
            results.push(serde_json::Value::Array(row_arr));
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

        let mut stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let rows: Vec<serde_json::Value> = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows_iter = stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", self.sql)))
                })?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", self.sql)))
                })? {
                    let mut map = serde_json::Map::with_capacity(column_count);
                    for i in 0..column_count {
                        let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                        let name = &column_names[i];
                        map.insert(name.clone(), val);
                    }
                    rows.push(serde_json::Value::Object(map));
                }
                rows
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let mut rows_iter = stmt
                    .query(named_params_refs.as_slice())
                    .map_err(|e| {
                        crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", self.sql)))
                    })?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", self.sql)))
                })? {
                    let mut map = serde_json::Map::with_capacity(column_count);
                    for i in 0..column_count {
                        let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                        let name = &column_names[i];
                        map.insert(name.clone(), val);
                    }
                    rows.push(serde_json::Value::Object(map));
                }
                rows
            }
        };

        Ok(Iter::new(rows, column_names))
    }

    #[napi]
    pub fn columns(&self) -> Result<Vec<ColumnInfo>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let stmt = conn.prepare_cached(&self.sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", self.sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

        let columns: Vec<ColumnInfo> = column_names
            .into_iter()
            .map(|name| ColumnInfo {
                name,
                type_: String::new(),
            })
            .collect();

        Ok(columns)
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
        if self.current_index >= self.rows.len() {
            return Ok(None);
        }
        let row = self.rows[self.current_index].clone();
        self.current_index += 1;
        Ok(Some(row))
    }

    #[napi]
    pub fn next_values(&mut self) -> Result<Option<serde_json::Value>> {
        if self.current_index >= self.rows.len() {
            return Ok(None);
        }
        let row = self.rows[self.current_index].clone();
        self.current_index += 1;

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
        self.current_index < self.rows.len()
    }

    #[napi]
    pub fn all(&mut self) -> Result<serde_json::Value> {
        let remaining: Vec<serde_json::Value> = self.rows[self.current_index..].to_vec();
        self.current_index = self.rows.len();
        Ok(serde_json::Value::Array(remaining))
    }

    #[napi]
    pub fn reset(&mut self) {
        self.current_index = 0;
    }
}
