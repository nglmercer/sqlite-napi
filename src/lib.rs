use napi_derive::napi;

mod db;
mod error;
mod models;

pub use db::Database;
pub use models::QueryResult;

#[napi]
pub fn get_sqlite_version() -> String {
    rusqlite::version().to_string()
}
