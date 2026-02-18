//! Row module - utilities for converting SQLite rows to JSON values

use rusqlite::Row;
use serde_json::{Number, Value};

/// Convert SQLite row to JSON value with proper type handling
pub fn sqlite_to_json(row: &Row, i: usize) -> Result<Value, rusqlite::Error> {
    match row.get_ref(i)? {
        rusqlite::types::ValueRef::Null => Ok(Value::Null),
        rusqlite::types::ValueRef::Integer(i) => Ok(Value::Number(i.into())),
        rusqlite::types::ValueRef::Real(f) => Ok(Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null)),
        rusqlite::types::ValueRef::Text(t) => {
            Ok(Value::String(String::from_utf8_lossy(t).into_owned()))
        }
        rusqlite::types::ValueRef::Blob(b) => Ok(Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b,
        ))),
    }
}
