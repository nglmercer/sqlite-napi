//! Database module - provides the Database struct for SQLite connections

use crate::db::convert_params;
use crate::error::to_napi_error;
use crate::models::{QueryResult};
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
        
        // Performance PRAGMAs for optimized performance
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA temp_store = MEMORY;
             PRAGMA mmap_size = 268435456;
             PRAGMA foreign_keys = ON;"
        ).map_err(to_napi_error)?;
        
        Ok(Database {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Prepare a SQL statement for execution
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

    /// Execute a SQL statement directly
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

    /// Execute SQL directly (without callback)
    #[napi]
    pub fn exec(&self, sql: String) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute_batch(&sql).map_err(to_napi_error)?;
        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Begin a transaction
    #[napi]
    pub fn transaction(&self, mode: Option<String>) -> Result<Transaction> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mode_str = match mode.as_deref() {
            Some("immediate") => "IMMEDIATE",
            Some("exclusive") => "EXCLUSIVE",
            _ => "DEFERRED",
        };

        conn.execute(&format!("BEGIN {}", mode_str), [])
            .map_err(to_napi_error)?;

        Ok(Transaction::new(self.conn.clone(), false, None))
    }

    /// Execute multiple statements in a transaction
    #[napi]
    pub fn transaction_fn(&self, mode: Option<String>, statements: Vec<String>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let mode_str = match mode.as_deref() {
            Some("immediate") => "IMMEDIATE",
            Some("exclusive") => "EXCLUSIVE",
            _ => "DEFERRED",
        };

        conn.execute(&format!("BEGIN {}", mode_str), [])
            .map_err(to_napi_error)?;

        for sql in statements {
            if let Err(e) = conn.execute_batch(&sql) {
                conn.execute("ROLLBACK", []).ok();
                return Err(to_napi_error(e));
            }
        }

        conn.execute("COMMIT", []).map_err(|e| {
            conn.execute("ROLLBACK", []).ok();
            to_napi_error(e)
        })?;

        Ok(QueryResult {
            changes: conn.changes() as u32,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    /// Load a SQLite extension
    #[napi]
    pub fn load_extension(&self, path: String) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        unsafe {
            conn.load_extension(&path, None)
                .map_err(to_napi_error)?;
        }
        Ok(())
    }

    /// Serialize the database to SQL statements (for in-memory backup)
    #[napi]
    pub fn serialize(&self) -> Result<String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE WHEN type = 'table' THEN 1 WHEN type = 'index' THEN 2 ELSE 3 END, name")
            .map_err(to_napi_error)?;
        
        let statements: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(statements.join(";\n"))
    }

    /// Deserialize a database from SQL statements (restore from backup)
    #[napi]
    pub fn deserialize(&self, sql: String) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        conn.execute_batch(&sql)
            .map_err(to_napi_error)?;
        Ok(())
    }

    // ========================================
    // Schema Introspection Methods
    // ========================================

    /// Get list of all tables in the database
    #[napi]
    pub fn get_tables(&self) -> Result<Vec<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .map_err(to_napi_error)?;
        
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(tables)
    }

    /// Get column information for a table
    #[napi]
    pub fn get_columns(&self, table_name: String) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table_name))
            .map_err(to_napi_error)?;
        
        let columns: Vec<serde_json::Value> = stmt
            .query_map([], |row| {
                let cid: i32 = row.get(0)?;
                let name: String = row.get(1)?;
                let col_type: String = row.get(2)?;
                let notnull: i32 = row.get(3)?;
                let dflt_value: Option<String> = row.get(4)?;
                let pk: i32 = row.get(5)?;
                
                Ok(serde_json::json!({
                    "cid": cid,
                    "name": name,
                    "type": col_type,
                    "notnull": notnull == 1,
                    "dflt_value": dflt_value,
                    "pk": pk
                }))
            })
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(columns)
    }

    /// Get index information for a table
    #[napi]
    pub fn get_indexes(&self, table_name: String) -> Result<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare(&format!("PRAGMA index_list({})", table_name))
            .map_err(to_napi_error)?;
        
        let mut indexes: Vec<serde_json::Value> = Vec::new();
        
        let index_rows: Vec<(String, i32, String, i32, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // name
                    row.get::<_, i32>(1)?,    // unique
                    row.get::<_, String>(2)?, // origin
                    row.get::<_, i32>(3)?,    // partial
                    row.get::<_, Option<String>>(4)?, // tbl_name (optional)
                ))
            })
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        
        for (name, unique, origin, partial, _tbl_name) in index_rows {
            let mut col_stmt = conn
                .prepare(&format!("PRAGMA index_info({})", name))
                .map_err(to_napi_error)?;
            
            let columns: Vec<String> = col_stmt
                .query_map([], |row| row.get(2))
                .map_err(to_napi_error)?
                .filter_map(|r| r.ok())
                .collect();
            
            indexes.push(serde_json::json!({
                "name": name,
                "unique": unique == 1,
                "origin": origin,
                "partial": partial == 1,
                "columns": columns
            }));
        }
        
        Ok(indexes)
    }

    /// Get the CREATE statement for a table
    #[napi]
    pub fn get_table_sql(&self, table_name: String) -> Result<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
            .map_err(to_napi_error)?;
        
        let sql: Option<String> = stmt
            .query_row([&table_name], |row| row.get(0))
            .ok();
        
        Ok(sql)
    }

    /// Export the entire schema as SQL statements
    #[napi]
    pub fn export_schema(&self) -> Result<String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let mut stmt = conn
            .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE WHEN type = 'table' THEN 1 WHEN type = 'index' THEN 2 ELSE 3 END, name")
            .map_err(to_napi_error)?;
        
        let statements: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(statements.join(";\n"))
    }

    /// Check if a table exists
    #[napi]
    pub fn table_exists(&self, table_name: String) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
                [&table_name],
                |row| row.get(0),
            )
            .map_err(to_napi_error)?;
        
        Ok(count > 0)
    }

    /// Get database metadata
    #[napi]
    pub fn get_metadata(&self) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        
        let table_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .map_err(to_napi_error)?;
        
        let index_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .map_err(to_napi_error)?;
        
        let page_count: i32 = conn
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        
        let page_size: i32 = conn
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        
        let version: String = conn
            .query_row("SELECT sqlite_version()", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        
        Ok(serde_json::json!({
            "table_count": table_count,
            "index_count": index_count,
            "page_count": page_count,
            "page_size": page_size,
            "db_size_bytes": page_count * page_size,
            "sqlite_version": version
        }))
    }
}
