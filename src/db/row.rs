//! Row module - utilities for converting SQLite rows to JSON values

use rusqlite::Row;
use serde_json::{Number, Value};

/// Convert SQLite row to JSON value with proper type handling
pub fn sqlite_to_json(row: &Row, i: usize) -> Result<Value, rusqlite::Error> {
    match row.get_ref(i)? {
        rusqlite::types::ValueRef::Null => Ok(Value::Null),
        // For integers, check if they fit in JavaScript's safe integer range
        // If not, convert to Number anyway (JavaScript will lose precision but it's compatible)
        rusqlite::types::ValueRef::Integer(i) => {
            // JavaScript's MAX_SAFE_INTEGER is 2^53 - 1
            const MAX_SAFE_INTEGER: i64 = 9007199254740991;
            const MIN_SAFE_INTEGER: i64 = -9007199254740991;

            if (MIN_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&i) {
                // Safe integer - convert directly
                Ok(Value::Number(i.into()))
            } else {
                // Outside safe range - convert to Number (JavaScript will lose precision)
                // but this maintains backward compatibility
                let n = i as f64;
                Ok(Number::from_f64(n)
                    .map(Value::Number)
                    .unwrap_or(Value::Null))
            }
        }
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
