//! Row module - utilities for converting SQLite rows to JSON values

use rusqlite::Row;
use serde_json::{Number, Value};

/// Convert SQLite row to JSON value with proper type handling
/// 
/// # Arguments
/// * `row` - Reference to the SQLite row
/// * `i` - Column index
/// 
/// # Returns
/// JSON value representing the SQLite column value
pub fn sqlite_to_json(row: &Row, i: usize) -> Value {
    match row.get_ref(i) {
        Ok(rusqlite::types::ValueRef::Null) => Value::Null,
        Ok(rusqlite::types::ValueRef::Integer(i)) => Value::Number(i.into()),
        Ok(rusqlite::types::ValueRef::Real(f)) => {
            Value::Number(Number::from_f64(f).unwrap_or(Number::from(0)))
        }
        Ok(rusqlite::types::ValueRef::Text(t)) => {
            Value::String(String::from_utf8_lossy(t).into_owned())
        }
        Ok(rusqlite::types::ValueRef::Blob(b)) => Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b,
        )),
        _ => Value::Null,
    }
}
