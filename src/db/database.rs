//! Database module - provides the Database struct for SQLite connections

use crate::db::convert_params_container;
use crate::error::to_napi_error;
use crate::models::{Migration, QueryResult};
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

impl Database {
    /// Extract table name from CREATE TABLE SQL
    fn extract_table_name(sql: &str) -> Result<String> {
        let sql_lower = sql.to_lowercase();
        if let Some(idx) = sql_lower.find("create table") {
            let after_create = &sql[idx + 12..];
            let sql_trimmed = after_create.trim();

            // Handle IF NOT EXISTS
            let name_start = if sql_trimmed.starts_with("if not exists") {
                let after_if = sql_trimmed[12..].trim();
                after_if
                    .find(|c: char| !c.is_whitespace())
                    .map(|i| i + 12)
                    .unwrap_or(0)
            } else {
                0
            };

            let remaining = &sql_trimmed[name_start..];
            let mut end_idx = 0;
            let mut paren_depth = 0;
            let mut in_name = true;

            for (i, c) in remaining.chars().enumerate() {
                if in_name && (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '(') {
                    if c == '(' {
                        paren_depth = 1;
                        in_name = false;
                    } else {
                        end_idx = i;
                        break;
                    }
                } else if !in_name && c == '(' {
                    paren_depth += 1;
                } else if !in_name && c == ')' {
                    paren_depth -= 1;
                    if paren_depth == 0 {
                        end_idx = i;
                        break;
                    }
                }
            }

            if end_idx == 0 {
                end_idx = remaining.len();
            }

            let table_name = remaining[..end_idx].trim();

            // Remove quotes if present
            let table_name = table_name.trim_matches('"').trim_matches('`');

            Ok(table_name.to_string())
        } else {
            Err(Error::from_reason("Invalid CREATE TABLE SQL"))
        }
    }
}

#[napi]
impl Database {
    /// Create a new Database connection
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

            if flags.is_empty() {
                flags.insert(OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE);
            }

            Connection::open_with_flags(&path, flags).map_err(to_napi_error)?
        };

        conn.execute_batch("PRAGMA extended_result_codes = ON")
            .map_err(to_napi_error)?;

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
        // Don't validate SQL here - let it fail at execution time if invalid
        // This allows getting stmt.source() even for queries referencing non-existent tables
        Ok(Statement::new(sql, self.conn.clone()))
    }

    /// Execute a SQL statement directly
    #[napi]
    pub fn run(&self, env: Env, sql: String, params: Option<Unknown>) -> Result<QueryResult> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;

        let params_container = convert_params_container(&env, params)?;

        match params_container {
            crate::db::ParamsContainer::Positional(positional_params) => {
                let params_refs: Vec<&dyn ToSql> =
                    positional_params.iter().map(|p| p as &dyn ToSql).collect();
                conn.execute(&sql, params_refs.as_slice())
                    .map_err(to_napi_error)?;
            }
            crate::db::ParamsContainer::Named(named_params) => {
                let mut named_params_refs: Vec<(&str, &dyn ToSql)> = Vec::new();
                for (key, param) in named_params.iter() {
                    named_params_refs.push((key.as_str(), param as &dyn ToSql));
                }
                conn.execute(&sql, named_params_refs.as_slice())
                    .map_err(to_napi_error)?;
            }
        }

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

    /// Serialize the database to binary format
    #[napi]
    pub fn serialize_binary(&self) -> Result<Buffer> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let data = conn.serialize(DatabaseName::Main).map_err(to_napi_error)?;
        Ok(Buffer::from(data.to_vec()))
    }

    /// Deserialize a database from binary format
    #[napi]
    pub fn deserialize_binary(&self, data: Buffer, read_only: Option<bool>) -> Result<()> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
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

    /// Serialize the database schema to SQL statements
    #[napi]
    pub fn serialize(&self) -> Result<String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE WHEN type = 'table' THEN 1 WHEN type = 'index' THEN 2 ELSE 3 END, name").map_err(to_napi_error)?;
        let statements: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        Ok(statements.join(";\n"))
    }

    /// Deserialize a database from SQL statements
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
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map_err(to_napi_error)?;
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
                Ok(serde_json::json!({
                    "cid": row.get::<_, i32>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "notnull": row.get::<_, i32>(3)? == 1,
                    "dflt_value": row.get::<_, Option<String>>(4)?,
                    "pk": row.get::<_, i32>(5)?
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
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
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
            indexes.push(serde_json::json!({ "name": name, "unique": unique == 1, "origin": origin, "partial": partial == 1, "columns": columns }));
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
        let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE WHEN type = 'table' THEN 1 WHEN type = 'index' THEN 2 ELSE 3 END, name").map_err(to_napi_error)?;
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
        let table_count: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0)).map_err(to_napi_error)?;
        let index_count: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0)).map_err(to_napi_error)?;
        let page_count: i32 = conn
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        let page_size: i32 = conn
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        let version: String = conn
            .query_row("SELECT sqlite_version()", [], |row| row.get(0))
            .map_err(to_napi_error)?;
        Ok(
            serde_json::json!({ "table_count": table_count, "index_count": index_count, "page_count": page_count, "page_size": page_size, "db_size_bytes": page_count * page_size, "sqlite_version": version }),
        )
    }

    /// Close the database connection
    #[napi]
    pub fn close(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").ok();
        drop(conn);
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
    // Safe Schema Helpers (for idempotent migrations)
    // ========================================

    /// Create a table if it doesn't exist
    /// Returns true if created, false if already existed
    #[napi]
    pub fn create_table_if_not_exists(&self, sql: String) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let table_name = Self::extract_table_name(&sql)?;
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
                [&table_name],
                |row| row.get(0),
            )
            .map_err(to_napi_error)?;
        if exists > 0 {
            return Ok(false);
        }
        conn.execute_batch(&sql).map_err(to_napi_error)?;
        Ok(true)
    }

    /// Add a column to a table if it doesn't exist
    /// Returns true if added, false if already existed
    #[napi]
    pub fn add_column_if_not_exists(
        &self,
        table_name: String,
        column_name: String,
        column_def: String,
    ) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table_name))
            .map_err(to_napi_error)?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(to_napi_error)?
            .filter_map(|r| r.ok())
            .collect();
        if columns.contains(&column_name) {
            return Ok(false);
        }
        let sql = format!(
            "ALTER TABLE {} ADD COLUMN {} {}",
            table_name, column_name, column_def
        );
        conn.execute_batch(&sql).map_err(to_napi_error)?;
        Ok(true)
    }

    /// Run SQL safely - returns success without throwing if table/column already exists
    #[napi]
    pub fn run_safe(&self, sql: String, ignore_errors: Option<Vec<String>>) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let result = conn.execute_batch(&sql);
        match result {
            Ok(_) => Ok(true),
            Err(e) => {
                let error_msg = e.to_string();
                if let Some(errors) = ignore_errors {
                    for ignore in errors {
                        if error_msg.contains(&ignore) {
                            return Ok(false);
                        }
                    }
                }
                Err(to_napi_error(e))
            }
        }
    }

    // ========================================
    // Schema Initialization and Migration
    // ========================================

    /// Get the current schema version
    #[napi]
    pub fn get_schema_version(&self) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let table_exists: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_schema_version'", [], |row| row.get(0)).map_err(to_napi_error)?;
        if table_exists == 0 {
            return Ok(0);
        }
        let version: std::result::Result<i64, _> = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _schema_version",
            [],
            |row| row.get(0),
        );
        match version {
            Ok(v) => Ok(v as u32),
            Err(_) => Ok(0),
        }
    }

    /// Set the schema version
    #[napi]
    pub fn set_schema_version(&self, version: u32) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        conn.execute("CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT)", []).map_err(to_napi_error)?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))", [&version.to_string(), "manual"]).map_err(to_napi_error)?;
        Ok(())
    }

    /// Initialize the database with a schema
    #[napi]
    pub fn init_schema(
        &self,
        schema: String,
        version: Option<u32>,
        description: Option<String>,
    ) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let ver = version.unwrap_or(1);
        conn.execute("BEGIN IMMEDIATE", []).map_err(to_napi_error)?;
        if let Err(e) = conn.execute_batch(&schema) {
            conn.execute("ROLLBACK", []).ok();
            return Err(to_napi_error(e));
        }
        conn.execute("CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT)", []).map_err(to_napi_error)?;
        let desc = description.unwrap_or_else(|| "initial".to_string());
        conn.execute("INSERT OR REPLACE INTO _schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))", [&ver.to_string(), &desc]).map_err(to_napi_error)?;
        conn.execute("COMMIT", []).map_err(|e| {
            conn.execute("ROLLBACK", []).ok();
            to_napi_error(e)
        })?;
        Ok(ver)
    }

    /// Migrate the database to a new schema version
    #[napi]
    pub fn migrate(&self, migrations: Vec<Migration>, target_version: Option<u32>) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        let current_version = {
            let table_exists: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_schema_version'", [], |row| row.get(0)).unwrap_or(0);
            if table_exists == 0 {
                0
            } else {
                conn.query_row(
                    "SELECT COALESCE(MAX(version), 0) FROM _schema_version",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0) as u32
            }
        };
        let mut sorted_migrations = migrations;
        sorted_migrations.sort_by(|a, b| a.version.cmp(&b.version));
        let target = target_version
            .unwrap_or_else(|| sorted_migrations.last().map(|m| m.version).unwrap_or(1));
        if current_version >= target {
            return Ok(current_version);
        }
        conn.execute("BEGIN IMMEDIATE", []).map_err(to_napi_error)?;
        conn.execute("CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT)", []).map_err(to_napi_error)?;
        let mut new_version = current_version;
        for migration in sorted_migrations.iter() {
            if migration.version > current_version && migration.version <= target {
                if let Err(e) = conn.execute_batch(&migration.sql) {
                    conn.execute("ROLLBACK", []).ok();
                    return Err(Error::from_reason(format!(
                        "Migration {} failed: {}",
                        migration.version, e
                    )));
                }
                let desc = migration
                    .description
                    .clone()
                    .unwrap_or_else(|| format!("migration to v{}", migration.version));
                conn.execute("INSERT OR REPLACE INTO _schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))", [&migration.version.to_string(), &desc]).map_err(to_napi_error)?;
                new_version = migration.version;
            }
        }
        conn.execute("COMMIT", []).map_err(|e| {
            conn.execute("ROLLBACK", []).ok();
            to_napi_error(e)
        })?;
        Ok(new_version)
    }

    // ========================================
    // Custom Functions and Collations
    // ========================================

    #[napi]
    pub fn create_function(&self, _env: Env, name: String, _func: Function) -> Result<()> {
        let functions = self.functions.clone();
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

    #[napi]
    pub fn create_collation(&self, _env: Env, name: String, _compare_fn: Function) -> Result<()> {
        let collations = self.collations.clone();
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

    #[napi]
    pub fn pragma(&self, name: String, value: Option<Unknown>) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| Error::from_reason("DB Lock failed"))?;
        if let Some(val) = value {
            let env = Env::from_raw(val.env());
            let params_container = convert_params_container(&env, Some(val))?;

            match params_container {
                crate::db::ParamsContainer::Positional(positional_params) => {
                    if positional_params.len() == 1 {
                        match &positional_params[0] {
                            crate::db::Param::Int(i) => {
                                // Check if this pragma returns results (e.g., busy_timeout)
                                // Try query_row first, if it fails use execute
                                let pragma_name_lower = name.to_lowercase();
                                if pragma_name_lower == "busy_timeout" {
                                    // busy_timeout returns an integer
                                    let result: i64 = conn
                                        .query_row(&format!("PRAGMA {} = {}", name, i), [], |row| {
                                            row.get(0)
                                        })
                                        .map_err(to_napi_error)?;
                                    return Ok(serde_json::Value::Number(result.into()));
                                }
                                // Execute the pragma (integer pragmas don't return results)
                                conn.execute(&format!("PRAGMA {} = {}", name, i), [])
                                    .map_err(to_napi_error)?;
                            }
                            crate::db::Param::Text(s) => {
                                // String pragmas like journal_mode return a result
                                let result: String = conn
                                    .query_row(&format!("PRAGMA {} = '{}'", name, s), [], |row| {
                                        row.get(0)
                                    })
                                    .map_err(to_napi_error)?;
                                return Ok(serde_json::Value::String(result));
                            }
                            crate::db::Param::Float(f) => {
                                // For Float, we need to check if it's a whole number
                                if *f == f.floor()
                                    && f.abs() < (i64::MAX as f64)
                                    && f.abs() < (i64::MAX as f64)
                                {
                                    conn.execute(&format!("PRAGMA {} = {}", name, *f as i64), [])
                                        .map_err(to_napi_error)?;
                                } else {
                                    conn.execute(&format!("PRAGMA {} = {}", name, *f), [])
                                        .map_err(to_napi_error)?;
                                }
                            }
                            _ => {
                                return Err(Error::from_reason("Invalid pragma value type"));
                            }
                        }
                    } else {
                        return Err(Error::from_reason("Invalid pragma value"));
                    }
                }
                crate::db::ParamsContainer::Named(named_params) => {
                    // Handle named params - get first value
                    let first_value = named_params.values().next();
                    if let Some(param) = first_value {
                        match param {
                            crate::db::Param::Int(i) => {
                                conn.execute(&format!("PRAGMA {} = {}", name, i), [])
                                    .map_err(to_napi_error)?;
                            }
                            crate::db::Param::Text(s) => {
                                let result: String = conn
                                    .query_row(&format!("PRAGMA {} = '{}'", name, s), [], |row| {
                                        row.get(0)
                                    })
                                    .map_err(to_napi_error)?;
                                return Ok(serde_json::Value::String(result));
                            }
                            crate::db::Param::Float(f) => {
                                if *f == f.floor() && f.abs() < (i64::MAX as f64) {
                                    conn.execute(&format!("PRAGMA {} = {}", name, *f as i64), [])
                                        .map_err(to_napi_error)?;
                                } else {
                                    conn.execute(&format!("PRAGMA {} = {}", name, *f), [])
                                        .map_err(to_napi_error)?;
                                }
                            }
                            _ => {
                                return Err(Error::from_reason("Invalid pragma value type"));
                            }
                        }
                    } else {
                        return Err(Error::from_reason("Invalid pragma value"));
                    }
                }
            }

            // Read back the pragma value after setting it
            let mut stmt = conn
                .prepare(&format!("PRAGMA {}", name))
                .map_err(to_napi_error)?;
            let results: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    let val: std::result::Result<String, _> = row.get(0);
                    if let Ok(s) = val {
                        Ok(serde_json::Value::String(s))
                    } else {
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
        } else {
            let mut stmt = conn
                .prepare(&format!("PRAGMA {}", name))
                .map_err(to_napi_error)?;
            let results: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    let val: std::result::Result<String, _> = row.get(0);
                    if let Ok(s) = val {
                        Ok(serde_json::Value::String(s))
                    } else {
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
