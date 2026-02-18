use napi::Error;
use rusqlite::Error as SqliteError;

pub fn to_napi_error(err: SqliteError) -> Error {
    Error::from_reason(format!("SQLite Error: {}", err))
}
