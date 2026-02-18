//! Database module - provides the Database struct for SQLite connections

use crate::db::convert_params;
use crate::error::to_napi_error;
use crate::models::{QueryResult, TransactionResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use std::sync::{Arc, Mutex};

use super::Statement;
use super::Transaction;

/// Database connection struct - represents an SQLite database connection
#[napi]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

#[napi]
impl Database {
    /// Create a new Database connection
    /// 
    /// # Arguments
    /// * `path` - Path to SQLite database file, or ":memory:" for in-memory database
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        let conn = if path == ":memory:" {
            Connection::open_in_memory().map_err(to_napi_error)?
        } else {
            Connection::open(path).map_err(to_napi_error)?
        };
        // Enable extended result codes for better error handling
        conn.execute_batch("PRAGMA extended_result_codes = ON")
            .map_err(to_napi_error)?;
        Ok(Database {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Prepare a SQL statement for execution
    /// 
    /// # Arguments
    /// * `sql` - SQL query string
    /// 
    /// # Returns
    /// A Statement object that can be used to execute the query
    #[napi]
    pub fn query(&self, sql: String) -> Result<Statement> {
        // Validate SQL is preparable
        {
            let conn = self
                .conn
                .lock()
                .map_err(|_| Error::from_reason("DB Lock failed"))?;
            conn.prepare(&sql).map_err(to_napi_error)?;
        }

        Ok(Statement::new(sql, self.conn.clone()))
    }

    /// Execute a SQL statement directly (without preparing)
    /// 
    /// # Arguments
    /// * `sql` - SQL statement to execute
    /// * `params` - Optional parameters for the statement
    /// 
    /// # Returns
    /// QueryResult with changes and last_insert_rowid
    #[napi]
    pub fn run(&self, sql: String, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let rusqlite_params = convert_params(&params);
        let params_refs: Vec<&dyn ToSql> =
            rusqlite_params.iter().map(|p| p as &dyn ToSql).collect();

        conn.execute(&sql, params_refs.as_slice())
            .map_err(to_napi_error)?;

        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Begin a transaction with the specified mode
    /// 
    /// # Arguments
    /// * `mode` - Transaction mode: "deferred" (default), "immediate", or "exclusive"
    /// 
    /// # Returns
    /// A Transaction object
    #[napi]
    pub fn transaction(&self, mode: Option<String>) -> Result<Transaction> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Determine transaction mode
        let mode_str = match mode.as_deref() {
            Some("deferred") => "DEFERRED",
            Some("immediate") => "IMMEDIATE",
            Some("exclusive") => "EXCLUSIVE",
            _ => "DEFERRED", // Default mode
        };

        // Begin transaction
        conn.execute(&format!("BEGIN {}", mode_str), [])
            .map_err(to_napi_error)?;

        Ok(Transaction::new(self.conn.clone(), false, None))
    }

    /// Execute within a transaction (convenience method)
    /// 
    /// # Arguments
    /// * `mode` - Transaction mode: "deferred" (default), "immediate", or "exclusive"
    /// * `sql_statements` - Vector of SQL statements to execute in the transaction
    /// 
    /// # Returns
    /// TransactionResult with changes and last_insert_rowid
    #[napi]
    pub fn transaction_fn(
        &self,
        mode: Option<String>,
        sql_statements: Vec<String>,
    ) -> Result<TransactionResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Determine transaction mode
        let mode_str = match mode.as_deref() {
            Some("deferred") => "DEFERRED",
            Some("immediate") => "IMMEDIATE",
            Some("exclusive") => "EXCLUSIVE",
            _ => "DEFERRED",
        };

        // Begin transaction
        conn.execute(&format!("BEGIN {}", mode_str), [])
            .map_err(to_napi_error)?;

        // Execute all statements
        let mut last_changes: u32 = 0;
        let mut last_rowid: i64 = 0;

        for sql in &sql_statements {
            match conn.execute(sql, []) {
                Ok(changes) => {
                    last_changes = changes as u32;
                    last_rowid = conn.last_insert_rowid();
                }
                Err(e) => {
                    // Rollback on error
                    let _ = conn.execute("ROLLBACK", []);
                    return Err(to_napi_error(e));
                }
            }
        }

        // Commit transaction
        conn.execute("COMMIT", []).map_err(to_napi_error)?;

        Ok(TransactionResult {
            changes: last_changes,
            last_insert_rowid: last_rowid,
        })
    }

    /// Execute SQL directly (without callback)
    /// 
    /// # Arguments
    /// * `sql` - SQL statement to execute
    /// 
    /// # Returns
    /// QueryResult with changes and last_insert_rowid
    #[napi]
    pub fn exec(&self, sql: String) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute(&sql, []).map_err(to_napi_error)?;
        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }
}
