use napi::bindgen_prelude::*;
use napi::JsValue;
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

pub enum ParamsContainer {
    Positional(Vec<Param>),
    Named(HashMap<String, Param>),
}

pub fn js_to_param(val: &Unknown) -> Result<Param> {
    match val.get_type()? {
        ValueType::Undefined | ValueType::Null => Ok(Param::Null),
        ValueType::Boolean => Ok(Param::Bool(val.coerce_to_bool()?)),
        ValueType::Number => {
            let num = val.coerce_to_number()?;
            if let Ok(d) = num.get_double() {
                if d.fract() == 0.0 && d >= (i64::MIN as f64) && d <= (i64::MAX as f64) {
                    Ok(Param::Int(d as i64))
                } else {
                    Ok(Param::Float(d))
                }
            } else if let Ok(i) = num.get_int32() {
                Ok(Param::Int(i as i64))
            } else {
                Ok(Param::Null)
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
                let num = val.coerce_to_number()?;
                Ok(Param::Float(num.get_double()?))
            } else {
                // For other objects (typed arrays, plain objects used as positional params),
                // serialize to JSON string using serde
                let raw_env = val.value().env;
                let env = Env::from_raw(raw_env);
                let json_value: serde_json::Value = env.from_js_value(*val)?;
                Ok(Param::Text(json_value.to_string()))
            }
        }
        _ => Ok(Param::Null),
    }
}

/// Convert params, optimizing for the common cases:
/// - Arrays -> positional params with direct element iteration
/// - Plain objects -> named params with direct property iteration (no serde_json)
pub fn convert_params_container(_env: &Env, params: Option<Unknown>) -> Result<ParamsContainer> {
    if let Some(p) = params {
        if p.is_array()? {
            let arr = unsafe { p.cast::<Array>()? };
            let len = arr.len();
            let mut result = Vec::with_capacity(len as usize);
            for i in 0..len {
                result.push(js_to_param(&arr.get_element(i)?)?);
            }
            Ok(ParamsContainer::Positional(result))
        } else if p.get_type()? == ValueType::Object && !p.is_buffer()? && !p.is_date()? {
            // Plain object -> named params: iterate properties directly
            let obj = unsafe { p.cast::<Object>()? };
            let keys = Object::keys(&obj)?;
            let mut result = HashMap::with_capacity(keys.len());
            for key in keys {
                let val: Unknown = obj.get(key.as_str())?.ok_or_else(|| {
                    Error::from_reason(format!("Failed to get property: {}", key))
                })?;
                let normalized_key =
                    if key.starts_with('$') || key.starts_with(':') || key.starts_with('@') {
                        key
                    } else {
                        format!("${}", key)
                    };
                result.insert(normalized_key, js_to_param(&val)?);
            }
            Ok(ParamsContainer::Named(result))
        } else {
            Ok(ParamsContainer::Positional(vec![js_to_param(&p)?]))
        }
    } else {
        Ok(ParamsContainer::Positional(Vec::new()))
    }
}

/// Convert params to positional only (used by Transaction::run)
pub fn convert_params(_env: &Env, params: Option<Unknown>) -> Result<Vec<Param>> {
    let mut result = Vec::new();
    if let Some(p) = params {
        if p.is_array()? {
            let arr = unsafe { p.cast::<Array>()? };
            let len = arr.len();
            result.reserve(len as usize);
            for i in 0..len {
                result.push(js_to_param(&arr.get_element(i)?)?);
            }
        } else {
            result.push(js_to_param(&p)?);
        }
    }
    Ok(result)
}
