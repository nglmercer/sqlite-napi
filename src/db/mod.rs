//! Database module - provides SQLite database access via NAPI
//! 
//! This module is organized into sub-modules:
//! - database: Database struct for creating connections
//! - statement: Prepared statement handling
//! - transaction: Transaction management
//! - params: Parameter conversion utilities
//! - row: Row to JSON conversion utilities

mod database;
mod params;
mod row;
mod statement;
mod transaction;

pub use database::Database;
pub use params::{convert_params, convert_params_with_named, convert_single_param};
pub use row::sqlite_to_json;
pub use statement::Statement;
pub use transaction::Transaction;
