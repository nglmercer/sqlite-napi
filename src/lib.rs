use napi_derive::napi;

pub mod db;
mod error;
mod models;

pub use db::{Database, Iter, Statement, Transaction};
pub use models::{QueryResult, TransactionResult};

#[napi]
pub fn get_sqlite_version() -> String {
    rusqlite::version().to_string()
}
