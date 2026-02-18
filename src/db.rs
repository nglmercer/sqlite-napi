use crate::error::to_napi_error;
use crate::models::{QueryResult, TransactionResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{Connection, ToSql};
use serde_json::{Map, Value};
use std::sync::{Arc, Mutex};

#[napi]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

#[napi]
pub struct Statement {
    sql: String,
    conn: Arc<Mutex<Connection>>,
}

#[napi]
pub struct Transaction {
    conn: Arc<Mutex<Connection>>,
    committed: bool,
    savepoint_name: Option<String>,
}

#[napi]
impl Database {
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

    #[napi]
    pub fn query(&self, sql: String) -> Result<Statement> {
        // Validate SQL is preparable
        {
            let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
            conn.prepare(&sql).map_err(to_napi_error)?;
        }

        Ok(Statement {
            sql,
            conn: self.conn.clone(),
        })
    }

    #[napi]
    pub fn run(&self, sql: String, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
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
    /// Modes: "deferred" (default), "immediate", "exclusive"
    #[napi]
    pub fn transaction(&self, mode: Option<String>) -> Result<Transaction> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;

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

        Ok(Transaction {
            conn: self.conn.clone(),
            committed: false,
            savepoint_name: None,
        })
    }

    /// Execute within a transaction (convenience method)
    #[napi]
    pub fn transaction_fn(
        &self,
        mode: Option<String>,
        sql_statements: Vec<String>,
    ) -> Result<TransactionResult> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;

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

    /// Execute SQL within a transaction directly (without callback)
    #[napi]
    pub fn exec(&self, sql: String) -> Result<QueryResult> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute(&sql, []).map_err(to_napi_error)?;
        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }
}

#[napi]
impl Statement {
    /// Execute query and return all rows as objects
    #[napi]
    pub fn all(&self, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> = rusqlite_params
            .iter()
            .map(|p| p as &dyn ToSql)
            .collect();

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                let mut map = Map::new();
                for i in 0..column_names.len() {
                    map.insert(column_names[i].clone(), sqlite_to_json(row, i));
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
    #[napi]
    pub fn get(&self, params: Vec<serde_json::Value>) -> Result<Option<serde_json::Value>> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> = rusqlite_params
            .iter()
            .map(|p| p as &dyn ToSql)
            .collect();

        let mut rows = stmt
            .query(params_refs.as_slice())
            .map_err(to_napi_error)?;

        if let Some(row) = rows.next().map_err(to_napi_error)? {
            let mut map = Map::new();
            for i in 0..column_names.len() {
                map.insert(column_names[i].clone(), sqlite_to_json(row, i));
            }
            Ok(Some(Value::Object(map)))
        } else {
            Ok(None)
        }
    }

    /// Execute query and return metadata (changes, last_insert_rowid)
    #[napi]
    pub fn run(&self, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> = rusqlite_params
            .iter()
            .map(|p| p as &dyn ToSql)
            .collect();

        let changes = stmt
            .execute(params_refs.as_slice())
            .map_err(to_napi_error)?;

        Ok(QueryResult {
            changes: changes as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Execute query and return all rows as arrays (values)
    #[napi]
    pub fn values(&self, params: Vec<serde_json::Value>) -> Result<Vec<Vec<serde_json::Value>>> {
        let conn = self.conn.lock().map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare(&self.sql).map_err(to_napi_error)?;

        let rusqlite_params = convert_params_with_named(&self.sql, &params);
        let params_refs: Vec<&dyn ToSql> = rusqlite_params
            .iter()
            .map(|p| p as &dyn ToSql)
            .collect();

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                let mut values = Vec::new();
                for i in 0..row.column_count() {
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

/// Convert SQLite row to JSON value with proper type handling
fn sqlite_to_json(row: &rusqlite::Row, i: usize) -> Value {
    match row.get_ref(i) {
        Ok(rusqlite::types::ValueRef::Null) => Value::Null,
        Ok(rusqlite::types::ValueRef::Integer(i)) => Value::Number(i.into()),
        Ok(rusqlite::types::ValueRef::Real(f)) => Value::Number(
            serde_json::Number::from_f64(f).unwrap_or(serde_json::Number::from(0)),
        ),
        Ok(rusqlite::types::ValueRef::Text(t)) => {
            Value::String(String::from_utf8_lossy(t).into_owned())
        }
        Ok(rusqlite::types::ValueRef::Blob(b)) => {
            Value::String(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b))
        }
        _ => Value::Null,
    }
}

/// Convert JSON parameters to SQLite parameters with support for named and positional parameters
fn convert_params(sql: &[Value]) -> Vec<Box<dyn ToSql + Send>> {
    sql.iter().map(convert_single_param).collect()
}

/// Convert JSON parameters with support for named parameters ($name, @name, :name) and positional (?1, ?)
fn convert_params_with_named(sql: &str, params: &[Value]) -> Vec<Box<dyn ToSql + Send>> {
    // Check if SQL has named parameters
    let has_named = sql.contains(':')
        || sql.contains('$')
        || sql.contains('@')
        || sql.contains("?name");

    if has_named && params.len() == 1 {
        // If we have a single object with named parameters
        if let Value::Object(map) = &params[0] {
            return map
                .values()
                .map(|v| convert_single_param(v))
                .collect();
        }
    }

    // Otherwise, treat as positional parameters
    params.iter().map(convert_single_param).collect()
}

/// Convert a single JSON value to a SQLite parameter
fn convert_single_param(v: &Value) -> Box<dyn ToSql + Send> {
    match v {
        Value::Null => Box::new(rusqlite::types::Null) as Box<dyn ToSql + Send>,
        Value::Bool(b) => Box::new(*b) as Box<dyn ToSql + Send>,
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i) as Box<dyn ToSql + Send>
            } else {
                Box::new(n.as_f64().unwrap_or(0.0)) as Box<dyn ToSql + Send>
            }
        }
        Value::String(s) => Box::new(s.clone()) as Box<dyn ToSql + Send>,
        Value::Array(arr) => {
            // Convert array to JSON string for complex types
            Box::new(serde_json::to_string(arr).unwrap_or_default()) as Box<dyn ToSql + Send>
        }
        Value::Object(obj) => {
            // Convert object to JSON string
            Box::new(serde_json::to_string(obj).unwrap_or_default()) as Box<dyn ToSql + Send>
        }
    }
}
