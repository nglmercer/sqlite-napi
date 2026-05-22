use crate::db::convert_params;
use crate::db::convert_params_container;
use crate::db::sqlite_to_json;
use crate::db::Iter;
use crate::db::Statement;
use crate::error::to_napi_error;
use crate::models::{QueryResult, TransactionResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[napi]
pub struct Transaction {
    conn: Arc<Mutex<Connection>>,
    in_transaction: Arc<AtomicBool>,
    #[allow(dead_code)]
    committed: bool,
    savepoint_name: Option<String>,
}

impl Transaction {
    pub(crate) fn new(
        conn: Arc<Mutex<Connection>>,
        in_transaction: Arc<AtomicBool>,
        committed: bool,
        savepoint_name: Option<String>,
    ) -> Self {
        Transaction {
            conn,
            in_transaction,
            committed,
            savepoint_name,
        }
    }
}

#[napi]
impl Transaction {
    #[napi]
    pub fn run(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        conn.execute(&sql, params_refs.as_slice()).map_err(|e| {
            let snippet = if sql.len() > 100 {
                format!("{}...", &sql[..100])
            } else {
                sql.clone()
            };
            crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", snippet)))
        })?;

        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    #[napi]
    pub fn commit(&self) -> Result<TransactionResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        if let Some(ref savepoint) = self.savepoint_name {
            conn.execute(&format!("RELEASE SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
        } else {
            conn.execute("COMMIT", []).map_err(to_napi_error)?;
            self.in_transaction
                .store(false, std::sync::atomic::Ordering::SeqCst);
        }

        Ok(TransactionResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    #[napi]
    pub fn rollback(&self) -> Result<TransactionResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        if let Some(ref savepoint) = self.savepoint_name {
            conn.execute(&format!("ROLLBACK TO SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
            conn.execute(&format!("RELEASE SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
        } else {
            conn.execute("ROLLBACK", []).map_err(to_napi_error)?;
            self.in_transaction
                .store(false, std::sync::atomic::Ordering::SeqCst);
        }

        Ok(TransactionResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    #[napi]
    pub fn savepoint(&self, name: String) -> Result<Transaction> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        conn.execute(&format!("SAVEPOINT {}", name), [])
            .map_err(to_napi_error)?;

        Ok(Transaction::new(
            self.conn.clone(),
            self.in_transaction.clone(),
            false,
            Some(name),
        ))
    }

    #[napi]
    pub fn query(&self, sql: String) -> Result<Statement> {
        Ok(Statement::new(sql, self.conn.clone()))
    }

    #[napi]
    pub fn all(
        &self,
        env: Env,
        sql: String,
        params: Option<Unknown>,
    ) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let mut rows = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", sql)),
                    )
                })?
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                stmt.query(named_params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", sql)),
                    )
                })?
            }
        };

        let mut results = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Fetching row failed: {}", sql)),
            )
        })? {
            let mut map = serde_json::Map::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                let name = &column_names[i];
                map.insert(name.clone(), val);
            }
            results.push(serde_json::Value::Object(map));
        }
        Ok(results)
    }

    #[napi]
    pub fn get(
        &self,
        env: Env,
        sql: String,
        params: Option<Unknown>,
    ) -> Result<Option<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
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
                stmt.query(named_params_refs.as_slice())
                    .map_err(to_napi_error)?
            }
        };

        if let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = serde_json::Map::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                let name = &column_names[i];
                map.insert(name.clone(), val);
            }
            Ok(Some(serde_json::Value::Object(map)))
        } else {
            Ok(None)
        }
    }

    #[napi]
    pub fn values(
        &self,
        env: Env,
        sql: String,
        params: Option<Unknown>,
    ) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare_cached(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;

        let column_count = stmt.column_count();
        let params_container = convert_params_container(&env, params)?;

        let mut rows = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", sql)),
                    )
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
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Fetching row failed: {}", sql)),
            )
        })? {
            let mut row_arr = Vec::with_capacity(column_count);
            for i in 0..column_count {
                let val = sqlite_to_json(&row, i).map_err(to_napi_error)?;
                row_arr.push(val);
            }
            results.push(serde_json::Value::Array(row_arr));
        }
        Ok(results)
    }

    #[napi]
    pub fn iter(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<Iter> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let pc = convert_params_container(&env, params)?;

        let mut stmt = conn.prepare_cached(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;

        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let count = names.len();

        let mut rows = match &pc {
            crate::db::ParamsContainer::Positional(p) => {
                let r: Vec<&dyn ToSql> = p.iter().map(|p| p as &dyn ToSql).collect();
                stmt.query(r.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(
                        e,
                        Some(&format!("Query failed: {}", sql)),
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
                        Some(&format!("Query failed: {}", sql)),
                    )
                })?
            }
        };

        let mut result_rows = Vec::new();
        while let Some(row) = rows.next().map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Fetch failed: {}", sql)))
        })? {
            let mut map = serde_json::Map::with_capacity(count);
            for i in 0..count {
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
                map.insert(names[i].clone(), val);
            }
            result_rows.push(serde_json::Value::Object(map));
        }

        Ok(Iter::new(result_rows, names))
    }

    #[napi]
    pub fn exec(&self, sql: String) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute_batch(&sql).map_err(|e| {
            let snippet = if sql.len() > 100 {
                format!("{}...", &sql[..100])
            } else {
                sql.clone()
            };
            crate::error::to_napi_error_with_context(
                e,
                Some(&format!("Execute failed: {}", snippet)),
            )
        })?;
        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }
}
