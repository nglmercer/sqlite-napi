//! Transaction module - provides the Transaction struct for SQLite transactions

use crate::db::convert_params;
use crate::error::to_napi_error;
use crate::models::{QueryResult, TransactionResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

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
            .map_err(to_napi_error)?;

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
            self.in_transaction.store(false, std::sync::atomic::Ordering::SeqCst);
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
            self.in_transaction.store(false, std::sync::atomic::Ordering::SeqCst);
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
}
