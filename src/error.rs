use napi::Error;
use rusqlite::Error as SqliteError;

pub fn to_napi_error(err: SqliteError) -> Error {
    let message = match &err {
        SqliteError::SqliteFailure(lib_err, msg) => {
            let code = lib_err.extended_code;
            match msg {
                Some(m) => format!("SQLite Error: {} (extended code {})", m, code),
                None => format!("SQLite Error: {} (extended code {})", err, code),
            }
        }
        SqliteError::SqlInputError { msg, offset, .. } => {
            format!("SQLite Input Error: {} (offset {})", msg, offset)
        }
        _ => format!("SQLite Error: {}", err),
    };
    Error::from_reason(message)
}

pub fn to_napi_error_with_context(err: SqliteError, context: &str) -> Error {
    let base_error = to_napi_error(err);
    Error::from_reason(format!("{} [Context: {}]", base_error.reason, context))
}
