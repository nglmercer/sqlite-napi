//! Params module - utilities for converting NAPI values to SQLite parameters

use napi::bindgen_prelude::*;
use rusqlite::types::{ToSqlOutput, ValueRef};
use rusqlite::ToSql;

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
            let num = val.coerce_to_number()?;
            Ok(Param::Float(num.get_double()?))
        }
        ValueType::String => {
            let s = val.coerce_to_string()?.into_utf8()?;
            Ok(Param::Text(s.as_str()?.to_string()))
        }
        ValueType::BigInt => {
            let i = unsafe { val.cast::<BigInt>()?.get_i64() };
            Ok(Param::Int(i.0))
        }
        ValueType::Object => {
            if val.is_buffer()? {
                let buf = unsafe { val.cast::<Buffer>()? };
                Ok(Param::Blob(buf.as_ref().to_vec()))
            } else if val.is_date()? {
                // Coerces to number to get timestamp
                let num = val.coerce_to_number()?;
                Ok(Param::Float(num.get_double()?))
            } else {
                let env = Env::from_raw(val.env());
                let json_value: serde_json::Value = env.from_js_value(*val)?;
                Ok(Param::Text(json_value.to_string()))
            }
        }
        _ => Ok(Param::Null),
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
