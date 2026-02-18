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
