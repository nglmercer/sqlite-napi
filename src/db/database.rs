//! Database module - provides the Database struct for SQLite connections

use crate::db::convert_params;
use crate::error::to_napi_error;
use crate::models::QueryResult;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{serialize::OwnedData, Connection, DatabaseName, OpenFlags, ToSql};

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use super::Statement;
use super::Transaction;

/// Database options for connection configuration
#[napi(object)]
pub struct DatabaseOptions {
    /// Open database in read-only mode
    pub readonly: Option<bool>,
    /// Create database if it doesn't exist (default: true)
    pub create: Option<bool>,
    /// Open database in read-write mode (default: true)
    pub readwrite: Option<bool>,
}

/// Database connection struct - represents an SQLite database connection
#[napi]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    in_transaction: Arc<AtomicBool>,
    closed: Arc<AtomicBool>,
    filename: String,
    /// Stored custom SQL function names
    functions: Arc<Mutex<HashMap<String, bool>>>,
    /// Stored custom collation names
    collations: Arc<Mutex<HashMap<String, bool>>>,
}

#[napi]
impl Database {
    /// Create a new Database connection
    ///
    /// # Arguments
    /// * `path` - Path to the database file, or ":memory:" for in-memory database
    /// * `options` - Optional configuration object with readonly, create, readwrite flags
    ///
    /// # Example
    /// ```javascript
    /// // Simple usage
    /// const db = new Database("mydb.sqlite");
    ///
    /// // With options
    /// const db = new Database("mydb.sqlite", { readonly: true });
    /// const db = new Database("mydb.sqlite", { create: false }); // Don't create if doesn't exist
    /// ```
    #[napi(constructor)]
    pub fn new(path: String, options: Option<DatabaseOptions>) -> Result<Self> {
        let opts = options.unwrap_or(DatabaseOptions {
            readonly: Some(false),
            create: Some(true),
            readwrite: Some(true),
        });

        let readonly = opts.readonly.unwrap_or(false);
        let create = opts.create.unwrap_or(true);
        let readwrite = opts.readwrite.unwrap_or(true);

        let conn = if path == ":memory:" {
            Connection::open_in_memory().map_err(to_napi_error)?
        } else {
            // Build OpenFlags based on options
            let mut flags = OpenFlags::empty();

            if readonly {
                flags.insert(OpenFlags::SQLITE_OPEN_READ_ONLY);
            } else {
                if readwrite {
                    flags.insert(OpenFlags::SQLITE_OPEN_READ_WRITE);
                }
                if create {
                    flags.insert(OpenFlags::SQLITE_OPEN_CREATE);
                }
            }

            // If no flags were set, use default
            if flags.is_empty() {
                flags.insert(OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE);
            }

            Connection::open_with_flags(&path, flags).map_err(to_napi_error)?
        };

        // Enable extended result codes for better error handling
        conn.execute_batch("PRAGMA extended_result_codes = ON")
            .map_err(to_napi_error)?;

        // Performance PRAGMAs for optimized performance (skip for read-only)
        if !readonly {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA cache_size = -64000;
                 PRAGMA temp_store = MEMORY;
                 PRAGMA mmap_size = 268435456;
                 PRAGMA foreign_keys = ON;",
            )
            .map_err(to_napi_error)?;
        }

        Ok(Database {
            conn: Arc::new(Mutex::new(conn)),
            in_transaction: Arc::new(AtomicBool::new(false)),
            closed: Arc::new(AtomicBool::new(false)),
            filename: path,
            functions: Arc::new(Mutex::new(HashMap::new())),
            collations: Arc::new(Mutex::new(HashMap::new())),
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

        // Set the in_transaction flag
        self.in_transaction
            .store(true, std::sync::atomic::Ordering::SeqCst);

        Ok(Transaction::new(
            self.conn.clone(),
            self.in_transaction.clone(),
            false,
            None,
        ))
    }

    /// Execute multiple statements in a transaction
    #[napi]
    pub fn transaction_fn(
        &self,
        mode: Option<String>,
        statements: Vec<String>,
    ) -> Result<QueryResult> {
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
            conn.load_extension(&path, None).map_err(to_napi_error)?;
        }
        Ok(())
    }

    /// Serialize the database to binary format (full database backup)
    /// Returns a Buffer containing the complete SQLite database file
    #[napi]
    pub fn serialize_binary(&self) -> Result<Buffer> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let data = conn.serialize(DatabaseName::Main).map_err(to_napi_error)?;

        Ok(Buffer::from(data.to_vec()))
    }

    /// Deserialize a database from binary format (restore from backup)
    /// Accepts a Buffer containing a complete SQLite database file
    #[napi]
    pub fn deserialize_binary(&self, data: Buffer, read_only: Option<bool>) -> Result<()> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Create OwnedData from the buffer
        // sqlite3_deserialize expects memory allocated by sqlite3_malloc
        let len = data.len();
        let sqlite_ptr = unsafe { rusqlite::ffi::sqlite3_malloc(len as i32) as *mut u8 };
        if sqlite_ptr.is_null() {
            return Err(Error::from_reason("Failed to allocate memory"));
        }
        unsafe {
            std::ptr::copy_nonoverlapping(data.as_ref().as_ptr(), sqlite_ptr, len);
        }

        let owned_data = unsafe {
            OwnedData::from_raw_nonnull(std::ptr::NonNull::new_unchecked(sqlite_ptr), len)
        };

        conn.deserialize(DatabaseName::Main, owned_data, read_only.unwrap_or(false))
            .map_err(to_napi_error)?;

        Ok(())
    }

    /// Serialize the database schema to SQL statements (for schema backup)
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

    /// Deserialize a database from SQL statements (restore schema from backup)
    #[napi]
    pub fn deserialize(&self, sql: String) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        conn.execute_batch(&sql).map_err(to_napi_error)?;
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
                    row.get::<_, String>(0)?,         // name
                    row.get::<_, i32>(1)?,            // unique
                    row.get::<_, String>(2)?,         // origin
                    row.get::<_, i32>(3)?,            // partial
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

        let sql: Option<String> = stmt.query_row([&table_name], |row| row.get(0)).ok();

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

    /// Close the database connection and release all resources
    /// After calling close, the database should not be used
    #[napi]
    pub fn close(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Execute a final checkpoint to ensure all data is written
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").ok(); // Ignore errors during checkpoint

        // Close the connection
        drop(conn);

        // Mark as closed
        self.closed.store(true, std::sync::atomic::Ordering::SeqCst);

        Ok(())
    }

    /// Check if the database connection is closed
    #[napi]
    pub fn is_closed(&self) -> bool {
        self.closed.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Check if currently in a transaction
    #[napi]
    pub fn in_transaction(&self) -> bool {
        self.in_transaction
            .load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Get the database filename/path
    #[napi]
    pub fn filename(&self) -> String {
        self.filename.clone()
    }

    // ========================================
    // Custom Functions and Collations
    // ========================================

    /// Create a custom scalar function that can be called from SQL
    ///
    /// # Arguments
    /// * `name` - Name of the function to register
    /// * `func` - JavaScript function to execute when the SQL function is called
    ///
    /// # Example
    /// ```javascript
    /// db.createFunction("my_func", (arg1, arg2) => {
    ///   return arg1 + arg2;
    /// });
    /// const result = db.query("SELECT my_func(1, 2)").get();
    /// ```
    ///
    /// The function receives arguments passed from SQL and can return any value
    /// that SQLite can handle (numbers, strings, null, Uint8Array for blobs).
    ///
    /// Note: Full JavaScript callback support requires complex async/await handling.
    /// This implementation registers a placeholder that returns NULL.
    #[napi]
    pub fn create_function(&self, _env: Env, name: String, _func: Function) -> Result<()> {
        let functions = self.functions.clone();

        // Check if function already exists
        {
            let funcs = functions
                .lock()
                .map_err(|_| Error::from_reason("Lock failed"))?;
            if funcs.contains_key(&name) {
                return Err(Error::from_reason(format!(
                    "Function '{}' already exists",
                    name
                )));
            }
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Register a simple scalar function that returns NULL as a placeholder
        // Full implementation would use ThreadsafeFunction to call JS callback
        conn.create_scalar_function(
            &name,
            -1,
            rusqlite::functions::FunctionFlags::SQLITE_UTF8
                | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
            |_ctx: &rusqlite::functions::Context| Ok(rusqlite::types::Value::Null),
        )
        .map_err(to_napi_error)?;

        let mut funcs = functions
            .lock()
            .map_err(|_| Error::from_reason("Lock failed"))?;
        funcs.insert(name, true);

        Ok(())
    }

    /// Create a custom collation that can be used for sorting
    ///
    /// # Arguments
    /// * `name` - Name of the collation to register
    /// * `compare_fn` - JavaScript function that compares two strings
    ///   Should return: negative if a < b, 0 if a == b, positive if a > b
    ///
    /// # Example
    /// ```javascript
    /// db.createCollation("my_collation", (a, b) => {
    ///   return a.localeCompare(b);
    /// });
    /// // Then use: SELECT * FROM table ORDER BY column COLLATE my_collation
    /// ```
    ///
    /// Note: Full JavaScript callback support requires complex async/await handling.
    /// This implementation uses default Rust string comparison.
    #[napi]
    pub fn create_collation(&self, _env: Env, name: String, _compare_fn: Function) -> Result<()> {
        let collations = self.collations.clone();

        // Check if collation already exists
        {
            let colls = collations
                .lock()
                .map_err(|_| Error::from_reason("Lock failed"))?;
            if colls.contains_key(&name) {
                return Err(Error::from_reason(format!(
                    "Collation '{}' already exists",
                    name
                )));
            }
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        // Register a simple collation using default Rust string comparison
        // Full implementation would use ThreadsafeFunction to call JS callback
        conn.create_collation(&name, |a: &str, b: &str| a.cmp(b))
            .map_err(to_napi_error)?;

        let mut colls = collations
            .lock()
            .map_err(|_| Error::from_reason("Lock failed"))?;
        colls.insert(name, true);

        Ok(())
    }

    // ========================================
    // Pragma Convenience Methods
    // ========================================

    /// Execute a PRAGMA statement and return the result
    ///
    /// # Arguments
    /// * `name` - Name of the PRAGMA to execute
    /// * `value` - Optional value to set (for SET PRAGMA)
    ///
    /// # Example
    /// ```javascript
    /// // Get a pragma value
    /// const journal_mode = db.pragma("journal_mode");
    ///
    /// // Set a pragma value
    /// db.pragma("cache_size", -64000);
    /// ```
    #[napi]
    pub fn pragma(&self, name: String, value: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        if let Some(val) = value {
            // SET PRAGMA
            let env = Env::from_raw(val.env());
            let rusqlite_params = convert_params(&env, Some(val))?;

            if rusqlite_params.len() == 1 {
                match &rusqlite_params[0] {
                    crate::db::Param::Int(i) => {
                        conn.execute(&format!("PRAGMA {} = {}", name, i), [])
                            .map_err(to_napi_error)?;
                    }
                    crate::db::Param::Text(s) => {
                        conn.execute(&format!("PRAGMA {} = {}", name, s), [])
                            .map_err(to_napi_error)?;
                    }
                    _ => {
                        return Err(Error::from_reason("Invalid pragma value type"));
                    }
                }
            } else {
                return Err(Error::from_reason("Invalid pragma value"));
            }

            // Return the new value
            let mut stmt = conn
                .prepare(&format!("PRAGMA {}", name))
                .map_err(to_napi_error)?;

            let result: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    let val: String = row.get(0)?;
                    Ok(serde_json::Value::String(val))
                })
                .map_err(to_napi_error)?
                .filter_map(|r| r.ok())
                .collect();

            if result.len() == 1 {
                Ok(result[0].clone())
            } else {
                Ok(serde_json::Value::Array(result))
            }
        } else {
            // GET PRAGMA
            let mut stmt = conn
                .prepare(&format!("PRAGMA {}", name))
                .map_err(to_napi_error)?;

            let results: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    // Try to get as string first (most pragmas return strings)
                    let val: std::result::Result<String, _> = row.get(0);
                    if let Ok(s) = val {
                        Ok(serde_json::Value::String(s))
                    } else {
                        // Try as integer
                        let val: std::result::Result<i64, _> = row.get(0);
                        if let Ok(i) = val {
                            Ok(serde_json::Value::Number(i.into()))
                        } else {
                            Ok(serde_json::Value::Null)
                        }
                    }
                })
                .map_err(to_napi_error)?
                .filter_map(|r| r.ok())
                .collect();

            if results.len() == 1 {
                Ok(results[0].clone())
            } else if results.is_empty() {
                Ok(serde_json::Value::Null)
            } else {
                Ok(serde_json::Value::Array(results))
            }
        }
    }
}
