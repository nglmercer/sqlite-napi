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

pub fn convert_params(_env: &Env, params: Option<Unknown>) -> Result<Vec<Param>> {
    let mut result = Vec::new();
    if let Some(p) = params {
        if p.is_array()? {
            let arr = unsafe { p.cast::<Array>()? };
            for i in 0..arr.len() {
                result.push(js_to_param(&arr.get_element(i)?)?);
            }
        } else {
            result.push(js_to_param(&p)?);
        }
    }
    Ok(result)
}
