use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[napi(object)]
#[derive(Serialize, Deserialize, Debug)]
pub struct QueryResult {
    pub changes: u32,
    pub last_insert_rowid: i64,
}

#[napi(object)]
#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionResult {
    pub changes: u32,
    pub last_insert_rowid: i64,
}

/// Migration definition for schema versioning
#[napi(object)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Migration {
    /// Version number for this migration (must be sequential)
    pub version: u32,
    /// SQL statements to execute for this migration
    pub sql: String,
    /// Optional description of what this migration does
    pub description: Option<String>,
}
