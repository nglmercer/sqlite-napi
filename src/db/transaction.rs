//! Transaction module - provides the Transaction struct for SQLite transactions

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

/// Transaction struct - represents an SQLite transaction
#[napi]
pub struct Transaction {
    conn: Arc<Mutex<Connection>>,
    in_transaction: Arc<AtomicBool>,
    #[allow(dead_code)]
    committed: bool,
    savepoint_name: Option<String>,
}

impl Transaction {
    /// Create a new Transaction (internal use)
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
    /// Execute a SQL statement within the transaction
    ///
    /// # Arguments
    /// * `sql` - SQL statement to execute
    /// * `params` - Optional parameters for the statement
    ///
    /// # Returns
    /// QueryResult with changes and last_insert_rowid
    #[napi]
    pub fn run(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let rusqlite_params = convert_params(&env, params)?;
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| {
                let snippet = if sql.len() > 100 { format!("{}...", &sql[..100]) } else { sql.clone() };
                crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", snippet)))
            })?;

        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Commit the transaction
    ///
    /// # Returns
    /// TransactionResult with changes and last_insert_rowid
    #[napi]
    pub fn commit(&self) -> Result<TransactionResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // If this is a savepoint, release it; otherwise commit
        if let Some(ref savepoint) = self.savepoint_name {
            conn.execute(&format!("RELEASE SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
        } else {
            conn.execute("COMMIT", []).map_err(to_napi_error)?;
            // Only reset the transaction flag when committing a real transaction (not savepoint)
            self.in_transaction
                .store(false, std::sync::atomic::Ordering::SeqCst);
        }

        Ok(TransactionResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Rollback the transaction
    ///
    /// # Returns
    /// TransactionResult with changes and last_insert_rowid
    #[napi]
    pub fn rollback(&self) -> Result<TransactionResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // If this is a savepoint, rollback to it; otherwise rollback the transaction
        if let Some(ref savepoint) = self.savepoint_name {
            conn.execute(&format!("ROLLBACK TO SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
            // Release the savepoint after rollback
            conn.execute(&format!("RELEASE SAVEPOINT {}", savepoint), [])
                .map_err(to_napi_error)?;
        } else {
            conn.execute("ROLLBACK", []).map_err(to_napi_error)?;
            // Only reset the transaction flag when rolling back a real transaction (not savepoint)
            self.in_transaction
                .store(false, std::sync::atomic::Ordering::SeqCst);
        }

        Ok(TransactionResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Create a savepoint for nested transactions
    ///
    /// # Arguments
    /// * `name` - Name for the savepoint
    ///
    /// # Returns
    /// A new Transaction object representing the savepoint
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

    /// Prepare a SQL statement for execution within this transaction
    #[napi]
    pub fn query(&self, sql: String) -> Result<Statement> {
        Ok(Statement::new(sql, self.conn.clone()))
    }

    /// Execute a query and return all rows as objects within the transaction
    #[napi]
    pub fn all(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;

        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows = stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", sql)))
                })?;
                let mut results = Vec::new();
                while let Some(row) = rows.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", sql)))
                })? {
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
                Ok(results)
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut results = Vec::new();
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                let mut rows = stmt
                    .query(named_params_refs.as_slice())
                    .map_err(|e| {
                        crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", sql)))
                    })?;
                while let Some(row) = rows.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", sql)))
                })? {
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
                Ok(results)
            }
        }
    }

    /// Execute a query and return the first row as an object within the transaction
    #[napi]
    pub fn get(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<Option<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;

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
                    Ok(Some(serde_json::Value::Object(map)))
                } else {
                    Ok(None)
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
                    Ok(Some(serde_json::Value::Object(map)))
                } else {
                    Ok(None)
                }
            }
        }
    }

    /// Execute a query and return all rows as arrays (values) within the transaction
    #[napi]
    pub fn values(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows = stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", sql)))
                })?;
                let mut results = Vec::new();
                while let Some(row) = rows.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", sql)))
                })? {
                    let mut row_arr = Vec::new();
                    for i in 0..column_count {
                        let val = sqlite_to_json(row, i).map_err(to_napi_error)?;
                        row_arr.push(val);
                    }
                    results.push(serde_json::Value::Array(row_arr));
                }
                Ok(results)
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
                Ok(results)
            }
        }
    }

    /// Create an iterator for a query within the transaction
    #[napi]
    pub fn iter(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<Iter> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mut stmt = conn.prepare(&sql).map_err(|e| {
            crate::error::to_napi_error_with_context(e, Some(&format!("Prepare failed: {}", sql)))
        })?;
        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = stmt.column_count();

        let params_container = convert_params_container(&env, params)?;

        let rows: Vec<serde_json::Value> = match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                let mut rows_iter = stmt.query(params_refs.as_slice()).map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", sql)))
                })?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", sql)))
                })? {
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
                    .map_err(|e| {
                        crate::error::to_napi_error_with_context(e, Some(&format!("Query failed: {}", sql)))
                    })?;
                let mut rows = Vec::new();
                while let Some(row) = rows_iter.next().map_err(|e| {
                    crate::error::to_napi_error_with_context(e, Some(&format!("Fetching row failed: {}", sql)))
                })? {
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

    /// Execute SQL directly within the transaction (for DDL, multiple statements)
    #[napi]
    pub fn exec(&self, sql: String) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute_batch(&sql).map_err(|e| {
            let snippet = if sql.len() > 100 { format!("{}...", &sql[..100]) } else { sql.clone() };
            crate::error::to_napi_error_with_context(e, Some(&format!("Execute failed: {}", snippet)))
        })?;
        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }
}
