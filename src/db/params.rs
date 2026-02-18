//! Params module - utilities for converting JSON parameters to SQLite parameters

use rusqlite::ToSql;
use serde_json::Value;

/// Convert JSON parameters to SQLite parameters
///
/// # Arguments
/// * `sql` - Slice of JSON values representing the parameters
///
/// # Returns
/// Vector of boxed traits that implement ToSql
pub fn convert_params(sql: &[Value]) -> Vec<Box<dyn ToSql + Send>> {
    sql.iter().map(convert_single_param).collect()
}

/// Convert JSON parameters with support for named parameters ($name, @name, :name) and positional (?1, ?)
///
/// # Arguments
/// * `sql` - The SQL string to check for parameter types
/// * `params` - Slice of JSON values representing the parameters
///
/// # Returns
/// Vector of boxed traits that implement ToSql
pub fn convert_params_with_named(sql: &str, params: &[Value]) -> Vec<Box<dyn ToSql + Send>> {
    // Check if SQL has named parameters
    let has_named =
        sql.contains(':') || sql.contains('$') || sql.contains('@') || sql.contains("?name");

    if has_named && params.len() == 1 {
        // If we have a single object with named parameters
        if let Value::Object(map) = &params[0] {
            return map.values().map(convert_single_param).collect();
        }
    }

    // Otherwise, treat as positional parameters
    params.iter().map(convert_single_param).collect()
}

/// Convert a single JSON value to a SQLite parameter
///
/// # Arguments
/// * `v` - JSON value to convert
///
/// # Returns
/// Boxed trait that implements ToSql
pub fn convert_single_param(v: &Value) -> Box<dyn ToSql + Send> {
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
