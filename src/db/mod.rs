//! Database module - provides SQLite database access via NAPI

mod connection;
mod database;
mod params;
mod row;
mod statement;
mod transaction;

pub(crate) use connection::ConnectionStore;
pub use database::Database;
pub use params::{convert_params, convert_params_container, Param, ParamsContainer};
pub use row::sqlite_to_json;
pub use statement::{ColumnInfo, Iter, Statement};
pub use transaction::Transaction;

pub(crate) fn changes_since(conn: &rusqlite::Connection, start_total_changes: u64) -> u32 {
    let changes = conn.total_changes().saturating_sub(start_total_changes);
    changes.min(u32::MAX as u64) as u32
}
