use napi_derive::napi;

pub mod db;
mod error;
mod models;
pub mod schema;

pub use db::{Database, Iter, Statement, Transaction};
pub use models::{Migration, QueryResult, TransactionResult};
pub use schema::{
    check_sql_expression, get_autoincrement_info, get_sqlite_functions, is_sql_expression,
    validate_column_definition, validate_create_table, AutoincrementInfo, ColumnValidation,
    ExpressionCheck, SchemaValidation, SqliteType, TypeMapping,
};

#[napi]
pub fn get_sqlite_version() -> String {
    rusqlite::version().to_string()
}
