//! Statement module - provides the Statement struct for prepared SQL statements

use crate::db::convert_params_container;
use crate::db::sqlite_to_json;
use crate::error::to_napi_error;
use crate::models::QueryResult;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use std::sync::{Arc, Mutex};

/// Column metadata for a prepared statement
#[napi(object)]
pub struct ColumnInfo {
    /// Column name
    pub name: String,
    /// Column type (may be empty if not specified)
    #[napi(js_name = "type")]
    pub type_: String,
}

/// Statement struct - represents a prepared SQL statement
#[napi]
pub struct Statement {
    sql: String,
    conn: Arc<Mutex<Connection>>,
}

/// Iter struct - provides iterator for streaming query results
#[napi]
pub struct Iter {
    // Store rows as a vector for iteration
    rows: Vec<serde_json::Value>,
    column_names: Vec<String>,
    current_index: usize,
}

impl Iter {
    /// Create a new Iter (internal use)
    pub(crate) fn new(rows: Vec<serde_json::Value>, column_names: Vec<String>) -> Self {
        Iter {
            rows,
            column_names,
            current_index: 0,
        }
    }
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

        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows = stmt.query(params_refs.as_slice()).map_err(to_napi_error)?;
                let mut results = Vec::new();
                while let Some(row) = rows.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
                    }
                    results.push(serde_json::Value::Object(map));
                }
                Ok(serde_json::Value::Array(results))
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut results = Vec::new();
                // For named params, we need to use a different approach with rusqlite
                // rusqlite supports named parameters with :name, @name, or $name syntax
                // We'll convert the named params to rusqlite's named parameter format
                let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let mut rows = stmt
                    .query(named_params_refs.as_slice())
                    .map_err(to_napi_error)?;
                while let Some(row) = rows.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
                    }
                    results.push(serde_json::Value::Object(map));
                }
                Ok(serde_json::Value::Array(results))
            }
        }
    }

    /// Execute query and return first row as object
    #[napi]
    pub fn get(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows = stmt.query(params_refs.as_slice()).map_err(to_napi_error)?;
                if let Some(row) = rows.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
                    }
                    Ok(serde_json::Value::Object(map))
                } else {
                    Ok(serde_json::Value::Null)
                }
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let mut rows = stmt
                    .query(named_params_refs.as_slice())
                    .map_err(to_napi_error)?;
                if let Some(row) = rows.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
                    }
                    Ok(serde_json::Value::Object(map))
                } else {
                    Ok(serde_json::Value::Null)
                }
            }
        }
    }

    /// Execute query and return metadata (changes, last_insert_rowid)
    #[napi]
    pub fn run(&self, env: Env, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let changes = stmt
                    .execute(params_refs.as_slice())
                    .map_err(to_napi_error)?;
                Ok(QueryResult {
                    changes: changes as u32,
                    last_insert_rowid: conn.last_insert_rowid(),
                })
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let changes = stmt
                    .execute(named_params_refs.as_slice())
                    .map_err(to_napi_error)?;
                Ok(QueryResult {
                    changes: changes as u32,
                    last_insert_rowid: conn.last_insert_rowid(),
                })
            }
        }
    }

    /// Execute query and return all rows as arrays (values)
    #[napi]
    pub fn values(&self, env: Env, params: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows = stmt.query(params_refs.as_slice()).map_err(to_napi_error)?;
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
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let mut rows = stmt
                    .query(named_params_refs.as_slice())
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
        }
    }

    /// Finalize the statement, releasing resources
    #[napi]
    pub fn finalize(&self) -> Result<()> {
        Ok(())
    }

    /// Create an iterator for streaming query results
    /// Returns an Iter object that can be used to fetch rows one at a time
    #[napi]
    pub fn iter(&self, env: Env, params: Option<Unknown>) -> Result<Iter> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;
        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let rows: Vec<serde_json::Value> = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows_iter = stmt.query(params_refs.as_slice()).map_err(to_napi_error)?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
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
                    .map_err(to_napi_error)?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(to_napi_error)? {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        let name = column_names
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| format!("col_{}", i));
                        map.insert(name, val);
                    }
                    rows.push(serde_json::Value::Object(map));
                }
                rows
            }
        };

        Ok(Iter::new(rows, column_names))
    }

    /// Get column metadata for this statement
    /// Returns an array of column information objects
    #[napi]
    pub fn columns(&self) -> Result<Vec<ColumnInfo>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

        // Get column declarations (if available)
        // Note: rusqlite doesn't provide full column metadata without executing
        // a query, so we return the column names with empty types
        let columns: Vec<ColumnInfo> = column_names
            .into_iter()
            .map(|name| ColumnInfo {
                name,
                type_: String::new(),
            })
            .collect();

        Ok(columns)
    }

    /// Get the original SQL string for this statement
    #[napi]
    pub fn source(&self) -> String {
        self.sql.clone()
    }

    /// Get the original SQL string for this statement (alias for source)
    #[napi(js_name = "toString")]
    pub fn to_string_method(&self) -> String {
        self.sql.clone()
    }
}

#[napi]
impl Iter {
    /// Continue iterating and get the next row as an object
    /// Returns null when there are no more rows
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

    /// Continue iterating and get the next row as an array of values
    /// Returns null when there are no more rows
    #[napi]
    pub fn next_values(&mut self) -> Result<Option<serde_json::Value>> {
        if self.current_index >= self.rows.len() {
            return Ok(None);
        }

        // Convert the current row object to an array
        let row = self.rows[self.current_index].clone();
        self.current_index += 1;

        if let serde_json::Value::Object(map) = row {
            let mut arr = Vec::new();
            for name in &self.column_names {
                let val = map.get(name).cloned().unwrap_or(serde_json::Value::Null);
                arr.push(val);
            }
            Ok(Some(serde_json::Value::Array(arr)))
        } else {
            Ok(None)
        }
    }

    /// Check if there are more rows to iterate
    #[napi]
    pub fn has_more(&self) -> bool {
        self.current_index < self.rows.len()
    }

    /// Get all remaining rows at once
    #[napi]
    pub fn all(&mut self) -> Result<serde_json::Value> {
        let remaining: Vec<serde_json::Value> = self.rows[self.current_index..].to_vec();
        self.current_index = self.rows.len();
        Ok(serde_json::Value::Array(remaining))
    }

    /// Reset the iterator to the beginning
    #[napi]
    pub fn reset(&mut self) {
        self.current_index = 0;
    }
}
