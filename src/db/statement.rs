//! Statement module - provides the Statement struct for prepared SQL statements

use crate::db::convert_params;
use crate::db::sqlite_to_json;
use crate::error::to_napi_error;
use crate::models::QueryResult;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{params_from_iter, Connection, ToSql};
use std::sync::{Arc, Mutex};

/// Statement struct - represents a prepared SQL statement
#[napi]
pub struct Statement {
    sql: String,
    conn: Arc<Mutex<Connection>>,
}

impl Statement {
    /// Create a new Statement (internal use)
    pub(crate) fn new(sql: String, conn: Arc<Mutex<Connection>>) -> Self {
        Statement { sql, conn }
    }
}

#[napi]
impl Statement {
    /// Execute query and return all rows as objects
    #[napi]
    pub fn all(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare_cached(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> = rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let mut rows = stmt
            .query(params_from_iter(params_refs))
            .map_err(to_napi_error)?;

        let mut results = Vec::new();

        while let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                map.insert(name.clone(), val);
            }
            results.push(serde_json::Value::Object(map));
        }

        Ok(serde_json::Value::Array(results))
    }

    /// Execute query and return first row as object
    #[napi]
    pub fn get(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare_cached(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> = rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let mut rows = stmt
            .query(params_from_iter(params_refs))
            .map_err(to_napi_error)?;

        if let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                map.insert(name.clone(), val);
            }
            Ok(serde_json::Value::Object(map))
        } else {
            Ok(serde_json::Value::Null)
        }
    }

    /// Execute query and return metadata (changes, last_insert_rowid)
    #[napi]
    pub fn run(&self, env: Env, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare_cached(&self.sql).map_err(to_napi_error)?;

        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> = rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let changes = stmt
            .execute(params_from_iter(params_refs))
            .map_err(to_napi_error)?;

        Ok(QueryResult {
            changes: changes as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Execute query and return all rows as arrays (values)
    #[napi]
    pub fn values(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare_cached(&self.sql).map_err(to_napi_error)?;

        let column_count = stmt.column_count();
        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> = rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let mut rows = stmt
            .query(params_from_iter(params_refs))
            .map_err(to_napi_error)?;

        let mut results = Vec::new();

        while let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut row_arr = Vec::new();
            for i in 0..column_count {
                let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                row_arr.push(val);
            }
            results.push(serde_json::Value::Array(row_arr));
        }

        Ok(serde_json::Value::Array(results))
    }

    /// Finalize the statement, releasing resources
    #[napi]
    pub fn finalize(&self) -> Result<()> {
        Ok(())
    }
}
