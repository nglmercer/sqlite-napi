//! Params module - utilities for converting NAPI values to SQLite parameters

use napi::bindgen_prelude::*;
use rusqlite::types::{ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use std::collections::HashMap;

pub enum Param {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Blob(Vec<u8>),
    Bool(bool),
}

impl ToSql for Param {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            Param::Null => Ok(ToSqlOutput::Borrowed(ValueRef::Null)),
            Param::Int(i) => Ok(ToSqlOutput::Borrowed(ValueRef::Integer(*i))),
            Param::Float(f) => Ok(ToSqlOutput::Borrowed(ValueRef::Real(*f))),
            Param::Text(s) => Ok(ToSqlOutput::Borrowed(ValueRef::Text(s.as_bytes()))),
            Param::Blob(b) => Ok(ToSqlOutput::Borrowed(ValueRef::Blob(b))),
            Param::Bool(b) => Ok(ToSqlOutput::Borrowed(ValueRef::Integer(if *b {
                1
            } else {
                0
            }))),
        }
    }
}

/// Convert a JavaScript value to a SQLite parameter
pub fn js_to_param(val: &Unknown) -> Result<Param> {
    match val.get_type()? {
        ValueType::Undefined | ValueType::Null => Ok(Param::Null),
        ValueType::Boolean => Ok(Param::Bool(val.coerce_to_bool()?)),
        ValueType::Number => {
            // Try to get as int32 first - if it fails, get as float
            let num = val.coerce_to_number()?;
            // Try getting as double first - if it's a float it will work
            if let Ok(d) = num.get_double() {
                // Check if it's actually a whole number that fits in i64
                if d.fract() == 0.0 && d.abs() < (i64::MAX as f64) && d.abs() < (i64::MIN as f64).abs() {
                    Ok(Param::Int(d as i64))
                } else {
                    Ok(Param::Float(d))
                }
            } else if let Ok(i) = num.get_int32() {
                Ok(Param::Int(i as i64))
            } else {
                // Fallback - try to get as int64
                let n = val.coerce_to_number()?;
                Ok(Param::Float(n.get_double().unwrap_or(0.0)))
            }
        }
        ValueType::String => {
            let s = val.coerce_to_string()?.into_utf8()?;
            Ok(Param::Text(s.as_str()?.to_string()))
        }
        ValueType::BigInt => {
            let (value, _) = unsafe { val.cast::<BigInt>()?.get_i64() };
            Ok(Param::Int(value))
        }
        ValueType::Object => {
            if val.is_buffer()? {
                let buf = unsafe { val.cast::<Buffer>()? };
                Ok(Param::Blob(buf.as_ref().to_vec()))
            } else if val.is_date()? {
                // Coerces to number to get timestamp
                let num = val.coerce_to_number()?;
                Ok(Param::Float(num.get_double()?))
            } else if val.is_arraybuffer()? || val.is_typedarray()? {
                // Handle ArrayBuffer and TypedArray (like Uint8Array)
                let env = Env::from_raw(val.env());
                let json_value: serde_json::Value = env.from_js_value(*val)?;
                // Try to convert to blob if it's an array of numbers
                if let Some(arr) = json_value.as_array() {
                    let mut bytes = Vec::new();
                    for item in arr {
                        if let Some(n) = item.as_i64() {
                            bytes.push(n as u8);
                        } else if let Some(n) = item.as_u64() {
                            bytes.push(n as u8);
                        } else {
                            // Not an array of numbers, convert to string
                            return Ok(Param::Text(json_value.to_string()));
                        }
                    }
                    return Ok(Param::Blob(bytes));
                }
                Ok(Param::Text(json_value.to_string()))
            } else {
                let env = Env::from_raw(val.env());
                let json_value: serde_json::Value = env.from_js_value(*val)?;
                Ok(Param::Text(json_value.to_string()))
            }
        }
        _ => Ok(Param::Null),
    }
}

/// Convert a serde_json::Value to Param
fn json_value_to_param(value: &serde_json::Value) -> Result<Param> {
    match value {
        serde_json::Value::Null => Ok(Param::Null),
        serde_json::Value::Bool(b) => Ok(Param::Bool(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Param::Int(i))
            } else if let Some(f) = n.as_f64() {
                Ok(Param::Float(f))
            } else {
                Ok(Param::Float(n.as_f64().unwrap_or(0.0)))
            }
        }
        serde_json::Value::String(s) => Ok(Param::Text(s.clone())),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            Ok(Param::Text(value.to_string()))
        }
    }
}

/// Parameter container that supports both positional and named parameters
pub enum ParamsContainer {
    Positional(Vec<Param>),
    Named(HashMap<String, Param>),
}

/// Convert JavaScript parameters to a ParamsContainer
/// Handles arrays (positional) and objects (named parameters)
pub fn convert_params_container(_env: &Env, params: Option<Unknown>) -> Result<ParamsContainer> {
    if let Some(p) = params {
        if p.is_array()? {
            // Positional parameters: [value1, value2, ...]
            let arr = unsafe { p.cast::<Array>()? };
            let mut result = Vec::new();
            for i in 0..arr.len() {
                result.push(js_to_param(&arr.get_element(i)?)?);
            }
            Ok(ParamsContainer::Positional(result))
        } else if p.get_type()? == ValueType::Object {
            // Named parameters: { $name: value, :name: value, @name: value }
            let env = Env::from_raw(p.env());
            let json_value: serde_json::Value = env.from_js_value(p)?;

            if let serde_json::Value::Object(map) = json_value {
                let mut result = HashMap::new();
                for (key, value) in map.iter() {
                    // Normalize the parameter name - SQLite accepts $name, :name, @name
                    // We need to ensure the key matches what SQLite expects
                    let normalized_key =
                        if key.starts_with('$') || key.starts_with(':') || key.starts_with('@') {
                            key.to_string()
                        } else {
                            // If no prefix, add $ prefix (bun:sqlite style)
                            format!("${}", key)
                        };
                    result.insert(normalized_key, json_value_to_param(value)?);
                }
                Ok(ParamsContainer::Named(result))
            } else {
                Ok(ParamsContainer::Positional(vec![js_to_param(&p)?]))
            }
        } else {
            Ok(ParamsContainer::Positional(vec![js_to_param(&p)?]))
        }
    } else {
        Ok(ParamsContainer::Positional(Vec::new()))
    }
}

/// Convert JavaScript parameters to rusqlite parameters
/// Handles arrays (positional) and objects (named parameters)
#[allow(unused_variables)]
pub fn convert_params(env: &Env, params: Option<Unknown>) -> Result<Vec<Param>> {
    let mut result = Vec::new();
    if let Some(p) = params {
        if p.is_array()? {
            // Positional parameters: [value1, value2, ...]
            let arr = unsafe { p.cast::<Array>()? };
            for i in 0..arr.len() {
                result.push(js_to_param(&arr.get_element(i)?)?);
            }
        } else if p.get_type()? == ValueType::Object {
            // Named parameters: { $name: value, :name: value, @name: value }
            // Convert to a string representation that rusqlite can parse
            let env = Env::from_raw(p.env());
            let json_value: serde_json::Value = env.from_js_value(p)?;

            if let serde_json::Value::Object(map) = json_value {
                // For named parameters, we need to build a list of values in order
                // SQLite named parameters are $name, :name, or @name
                for (_key, value) in map.iter() {
                    result.push(json_value_to_param(value)?);
                }
            } else {
                result.push(js_to_param(&p)?);
            }
        } else {
            result.push(js_to_param(&p)?);
        }
    }
    Ok(result)
}
