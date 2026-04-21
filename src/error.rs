use napi::{Error, Status};
use rusqlite::Error as SqliteError;

pub fn to_napi_error(err: SqliteError) -> Error {
    to_napi_error_with_context(err, None)
}

pub fn to_napi_error_with_context(err: SqliteError, context: Option<&str>) -> Error {
    let base_msg = match &err {
        SqliteError::SqliteFailure(ffi_err, desc) => {
            let code = ffi_err.extended_code;
            match desc {
                Some(d) => format!("SQLite Error [Extended Code {}]: {}", code, d),
                None => format!("SQLite Error [Extended Code {}]: {}", code, ffi_err),
            }
        }
        SqliteError::ToSqlConversionFailure(e) => format!("SQLite Parameter Conversion Error: {}", e),
        SqliteError::FromSqlConversionFailure(_, t, e) => format!("SQLite Result Conversion Error (type {:?}): {}", t, e),
        SqliteError::InvalidParameterName(name) => format!("SQLite Invalid Parameter Name: {}", name),
        SqliteError::InvalidColumnType(idx, name, t) => format!("SQLite Invalid Column Type at {} ({}): {:?}", idx, name, t),
        _ => format!("SQLite Error: {}", err),
    };

    let final_msg = match context {
        Some(ctx) => format!("{} - {}", ctx, base_msg),
        None => base_msg,
    };

    Error::new(Status::GenericFailure, final_msg)
}

