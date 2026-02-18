//! Statement module - provides the Statement struct for prepared SQL statements

use crate::db::convert_params_with_named;
use crate::db::sqlite_to_json;
use crate::error::to_napi_error;
use crate::models::QueryResult;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use serde_json::{Map, Value};
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
    ///
    /// # Arguments
    /// * `params` - Optional parameters for the query
    ///
    /// # Returns
    /// Vector of JSON objects representing each row
    #[napi]
    pub fn all(&self, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                let mut map = Map::new();
                for (i, name) in column_names.iter().enumerate() {
                    map.insert(name.clone(), sqlite_to_json(row, i));
                }
                Ok(Value::Object(map))
            })
            .map_err(to_napi_error)?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(to_napi_error)?);
        }
        Ok(results)
    }

    /// Execute query and return first row as object
    ///
    /// # Arguments
    /// * `params` - Optional parameters for the query
    ///
    /// # Returns
    /// Optional JSON object representing the first row, or None if no rows
    #[napi]
    pub fn get(&self, params: Vec<serde_json::Value>) -> Result<Option<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let mut rows = stmt.query(params_refs.as_slice()).map_err(to_napi_error)?;

        if let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = Map::new();
            for (i, name) in column_names.iter().enumerate() {
                map.insert(name.clone(), sqlite_to_json(row, i));
            }
            Ok(Some(Value::Object(map)))
        } else {
            Ok(None)
        }
    }

    /// Execute query and return metadata (changes, last_insert_rowid)
    ///
    /// # Arguments
    /// * `params` - Optional parameters for the query
    ///
    /// # Returns
    /// QueryResult with changes and last_insert_rowid
    #[napi]
    pub fn run(&self, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let changes = stmt
            .execute(params_refs.as_slice())
            .map_err(to_napi_error)?;

        Ok(QueryResult {
            changes: changes as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Execute query and return all rows as arrays (values)
    ///
    /// # Arguments
    /// * `params` - Optional parameters for the query
    ///
    /// # Returns
    /// Vector of arrays containing JSON values for each row
    #[napi]
    pub fn values(&self, params: Vec<serde_json::Value>) -> Result<Vec<Vec<serde_json::Value>>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_count = stmt.column_count();
        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                let mut values = Vec::new();
                for i in 0..column_count {
                    values.push(sqlite_to_json(row, i));
                }
                Ok(values)
            })
            .map_err(to_napi_error)?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(to_napi_error)?);
        }
        Ok(results)
    }
}
