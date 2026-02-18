//! Schema utilities for SQLite type mapping and validation
//! Provides native Rust functions for schema building and validation

use napi_derive::napi;
use once_cell::sync::Lazy;
use regex::Regex;

/// Regex for detecting SQL function calls like datetime('now'), strftime('%s', 'now')
static SQL_FUNCTION_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z_]+\s*\(").unwrap());

/// Regex for detecting SQL expressions (starts with parenthesis)
static SQL_EXPRESSION_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\(").unwrap());

/// Known SQL keywords that should not be quoted in DEFAULT clauses
static SQL_KEYWORDS: Lazy<Vec<&'static str>> = Lazy::new(|| {
    vec![
        "CURRENT_TIMESTAMP",
        "CURRENT_DATE",
        "CURRENT_TIME",
        "NULL",
        "TRUE",
        "FALSE",
    ]
});

/// SQLite column types supported by the database
#[derive(Debug, PartialEq)]
#[napi]
pub enum SqliteType {
    /// Null type
    Null,
    /// Integer type (INTEGER)
    Integer,
    /// Real/Float type (REAL)
    Real,
    /// Text type (TEXT)
    Text,
    /// Blob/Binary type (BLOB)
    Blob,
}

impl SqliteType {
    /// Get the SQLite type name as string
    pub fn as_str(&self) -> &'static str {
        match self {
            SqliteType::Null => "NULL",
            SqliteType::Integer => "INTEGER",
            SqliteType::Real => "REAL",
            SqliteType::Text => "TEXT",
            SqliteType::Blob => "BLOB",
        }
    }

    /// Get type from string name (case insensitive)
    #[allow(clippy::should_implement_trait)]
    pub fn parse_type(s: &str) -> Option<SqliteType> {
        match s.to_uppercase().as_str() {
            "NULL" => Some(SqliteType::Null),
            "INTEGER" | "INT" | "TINYINT" | "SMALLINT" | "MEDIUMINT" | "BIGINT"
            | "UNSIGNED BIG INT" => Some(SqliteType::Integer),
            "REAL" | "DOUBLE" | "FLOAT" | "NUMERIC" | "DECIMAL" => Some(SqliteType::Real),
            "TEXT" | "CHARACTER" | "VARCHAR" | "VARYING CHARACTER" | "NCHAR"
            | "NATIVE CHARACTER" | "NVARCHAR" | "CLOB" => Some(SqliteType::Text),
            "BLOB" | "NONE" => Some(SqliteType::Blob),
            _ => None,
        }
    }
}

/// Type mapping result from TypeScript/JS type to SQLite
#[napi]
pub struct TypeMapping {
    /// The SQLite type name
    pub sqlite_type: String,
    /// Whether the mapping was successful
    pub valid: bool,
}

/// SQL expression detection result
#[napi]
pub struct ExpressionCheck {
    /// Whether the value is an SQL expression
    pub is_expression: bool,
    /// The type of expression detected
    pub expression_type: Option<String>,
}

#[napi]
impl SqliteType {
    /// Get all supported SQLite type names
    #[napi(getter)]
    pub fn supported_types() -> Vec<String> {
        vec![
            "NULL".to_string(),
            "INTEGER".to_string(),
            "REAL".to_string(),
            "TEXT".to_string(),
            "BLOB".to_string(),
        ]
    }

    /// Check if a type name is a valid SQLite type
    #[napi]
    pub fn is_valid_type(type_name: String) -> bool {
        SqliteType::parse_type(&type_name).is_some()
    }

    /// Get the SQLite type from a type name string
    #[napi]
    pub fn from_type_name(type_name: String) -> TypeMapping {
        // Handle constructor function names (e.g., "String", "Number", "Boolean", "Date", "Buffer")
        let mapped = match type_name.as_str() {
            "String" | "string" => Some("TEXT"),
            "Number" | "number" | "Int" | "int" => Some("INTEGER"),
            "Boolean" | "boolean" | "Bool" | "bool" => Some("INTEGER"),
            "Date" | "date" => Some("INTEGER"), // Unix timestamp
            "Buffer" | "buffer" | "Uint8Array" => Some("BLOB"),
            "UUID" | "uuid" => Some("TEXT"),
            "Float" | "float" | "Double" | "double" => Some("REAL"),
            _ => None,
        };

        if let Some(sqlite_type) = mapped {
            TypeMapping {
                sqlite_type: sqlite_type.to_string(),
                valid: true,
            }
        } else {
            // Try to parse as native SQLite type
            if SqliteType::parse_type(&type_name).is_some() {
                TypeMapping {
                    sqlite_type: type_name.to_uppercase(),
                    valid: true,
                }
            } else {
                TypeMapping {
                    sqlite_type: "TEXT".to_string(), // Default fallback
                    valid: false,
                }
            }
        }
    }
}

/// Check if a value is an SQL expression that should not be quoted
///
/// # Examples
/// ```rust
/// assert!(is_sql_expression("datetime('now')"));
/// assert!(is_sql_expression("CURRENT_TIMESTAMP"));
/// assert!(is_sql_expression("(strftime('%s', 'now'))"));
/// assert!(!is_sql_expression("hello world"));
/// ```
#[napi]
pub fn is_sql_expression(value: String) -> bool {
    is_sql_expression_internal(&value)
}

fn is_sql_expression_internal(value: &str) -> bool {
    let trimmed = value.trim();

    // Check for expression in parentheses
    if SQL_EXPRESSION_REGEX.is_match(trimmed) {
        return true;
    }

    // Check for SQL function calls
    if SQL_FUNCTION_REGEX.is_match(trimmed) {
        return true;
    }

    // Check for SQL keywords
    let upper = trimmed.to_uppercase();
    for keyword in SQL_KEYWORDS.iter() {
        if upper == *keyword {
            return true;
        }
    }

    false
}

/// Check if a value is an SQL expression with detailed information
#[napi]
pub fn check_sql_expression(value: String) -> ExpressionCheck {
    let trimmed = value.trim();

    // Check for expression in parentheses
    if SQL_EXPRESSION_REGEX.is_match(trimmed) {
        return ExpressionCheck {
            is_expression: true,
            expression_type: Some("parenthesized_expression".to_string()),
        };
    }

    // Check for SQL function calls
    if SQL_FUNCTION_REGEX.is_match(trimmed) {
        return ExpressionCheck {
            is_expression: true,
            expression_type: Some("function_call".to_string()),
        };
    }

    // Check for SQL keywords
    let upper = trimmed.to_uppercase();
    for keyword in SQL_KEYWORDS.iter() {
        if upper == *keyword {
            return ExpressionCheck {
                is_expression: true,
                expression_type: Some("keyword".to_string()),
            };
        }
    }

    ExpressionCheck {
        is_expression: false,
        expression_type: None,
    }
}

/// Get a list of known SQL function names that can be used in expressions
#[napi]
pub fn get_sqlite_functions() -> Vec<String> {
    vec![
        // Date and time functions
        "date".to_string(),
        "time".to_string(),
        "datetime".to_string(),
        "julianday".to_string(),
        "strftime".to_string(),
        // String functions
        "length".to_string(),
        "lower".to_string(),
        "upper".to_string(),
        "trim".to_string(),
        "ltrim".to_string(),
        "rtrim".to_string(),
        "substr".to_string(),
        "replace".to_string(),
        "instr".to_string(),
        "printf".to_string(),
        "quote".to_string(),
        "glob".to_string(),
        "like".to_string(),
        "printf".to_string(),
        // Numeric functions
        "abs".to_string(),
        "round".to_string(),
        "random".to_string(),
        "randomblob".to_string(),
        "zeroblob".to_string(),
        // Type conversion
        "cast".to_string(),
        "typeof".to_string(),
        "coalesce".to_string(),
        "ifnull".to_string(),
        "nullif".to_string(),
        // Aggregate functions (can be used in DEFAULT but not as values)
        "count".to_string(),
        "sum".to_string(),
        "avg".to_string(),
        "total".to_string(),
        "group_concat".to_string(),
        // JSON functions
        "json".to_string(),
        "json_array".to_string(),
        "json_object".to_string(),
        "json_extract".to_string(),
        "json_valid".to_string(),
        // Other
        "hex".to_string(),
        "quote".to_string(),
        "zeroblob".to_string(),
        "unicode".to_string(),
        "char".to_string(),
    ]
}

/// Validate a column definition for common issues
#[napi]
pub struct ColumnValidation {
    /// Whether the column definition is valid
    pub valid: bool,
    /// List of warnings or errors
    pub issues: Vec<String>,
}

/// Validate a column definition
#[napi]
pub fn validate_column_definition(
    column_name: String,
    column_type: String,
    is_primary_key: bool,
    is_not_null: bool,
    has_default: bool,
    default_value: Option<String>,
) -> ColumnValidation {
    let mut issues = Vec::new();

    // Validate column name
    if column_name.is_empty() {
        issues.push("Column name cannot be empty".to_string());
    }

    if column_name.contains(' ') {
        issues.push("Column name should not contain spaces".to_string());
    }

    // Validate column type
    if SqliteType::parse_type(&column_type).is_none() {
        issues.push(format!("Unknown SQLite type: {}", column_type));
    }

    // Check for AUTOINCREMENT without PRIMARY KEY
    // Note: AUTOINCREMENT only works with INTEGER PRIMARY KEY in SQLite

    // Check for NOT NULL without DEFAULT on primary key
    if is_primary_key && is_not_null && !has_default {
        // This is actually fine for primary keys
    }

    // Warn about default with expression for non-text types
    if let Some(ref default) = default_value {
        if is_sql_expression_internal(default) {
            // Expression defaults are allowed but warn about it
            if column_type.to_uppercase() != "TEXT" {
                issues.push(format!(
                    "Expression default for {} type column: {}",
                    column_type, default
                ));
            }
        }
    }

    ColumnValidation {
        valid: issues.is_empty(),
        issues,
    }
}

/// Get information about SQLite's AUTOINCREMENT behavior
#[napi]
pub struct AutoincrementInfo {
    /// Whether AUTOINCREMENT requires INTEGER PRIMARY KEY
    pub requires_integer_primary_key: bool,
    /// Whether the column can use AUTOINCREMENT
    pub can_use_autoincrement: bool,
    /// Explanation of the behavior
    pub explanation: String,
}

#[napi]
pub fn get_autoincrement_info(column_type: String, is_primary_key: bool) -> AutoincrementInfo {
    let is_integer = column_type.to_uppercase() == "INTEGER" || column_type.to_uppercase() == "INT";

    let requires_integer = true;
    let can_use = is_integer && is_primary_key;

    let explanation = if !is_primary_key {
        "AUTOINCREMENT can only be used on PRIMARY KEY columns".to_string()
    } else if !is_integer {
        "AUTOINCREMENT only works with INTEGER type (not TEXT, REAL, or BLOB)".to_string()
    } else {
        "INTEGER PRIMARY KEY AUTOINCREMENT will generate sequential IDs".to_string()
    };

    AutoincrementInfo {
        requires_integer_primary_key: requires_integer,
        can_use_autoincrement: can_use,
        explanation,
    }
}

/// Schema validation result
#[napi]
pub struct SchemaValidation {
    /// Whether the schema is valid
    pub valid: bool,
    /// List of issues found
    pub issues: Vec<String>,
    /// List of warnings
    pub warnings: Vec<String>,
}

/// Validate a CREATE TABLE SQL statement
#[napi]
pub fn validate_create_table(sql: String) -> SchemaValidation {
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    let sql_lower = sql.to_lowercase();

    // Check if it starts with CREATE TABLE
    if !sql_lower.contains("create table") {
        issues.push("SQL does not appear to be a CREATE TABLE statement".to_string());
        return SchemaValidation {
            valid: false,
            issues,
            warnings,
        };
    }

    // Check for table name
    if let Some(pos) = sql_lower.find("create table") {
        let after_create = &sql[pos + 12..];
        let trimmed = after_create.trim();
        if trimmed.is_empty() {
            issues.push("Missing table name".to_string());
        }
    }

    // Check for missing PRIMARY KEY
    if !sql_lower.contains("primary key") {
        warnings.push("Table has no PRIMARY KEY defined".to_string());
    }

    // Check for FOREIGN KEY without ON DELETE
    if sql_lower.contains("foreign key") && !sql_lower.contains("on delete") {
        warnings.push("FOREIGN KEY defined without ON DELETE clause".to_string());
    }

    // Check for likely issues with AUTOINCREMENT
    if sql_lower.contains("autoincrement") && !sql_lower.contains("integer") {
        issues.push("AUTOINCREMENT used but column type is not INTEGER".to_string());
    }

    SchemaValidation {
        valid: issues.is_empty(),
        issues,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ============== is_sql_expression tests ==============
    #[test]
    fn test_sql_function_calls() {
        assert!(is_sql_expression_internal("datetime('now')"));
        assert!(is_sql_expression_internal("date('now')"));
        assert!(is_sql_expression_internal("time('now')"));
        assert!(is_sql_expression_internal("strftime('%s', 'now')"));
    }

    #[test]
    fn test_sql_keywords() {
        assert!(is_sql_expression_internal("CURRENT_TIMESTAMP"));
        assert!(is_sql_expression_internal("current_timestamp"));
        assert!(is_sql_expression_internal("CURRENT_DATE"));
        assert!(is_sql_expression_internal("NULL"));
        assert!(is_sql_expression_internal("TRUE"));
        assert!(is_sql_expression_internal("FALSE"));
    }

    #[test]
    fn test_parenthesized_expressions() {
        assert!(is_sql_expression_internal("(strftime('%s', 'now'))"));
        assert!(is_sql_expression_internal("(1 + 1)"));
    }

    #[test]
    fn test_non_expressions() {
        assert!(!is_sql_expression_internal("hello world"));
        assert!(!is_sql_expression_internal("some text"));
        assert!(!is_sql_expression_internal("123"));
    }

    // ============== SqliteType tests ==============
    #[test]
    fn test_parse_type_valid_types() {
        assert_eq!(SqliteType::parse_type("INTEGER"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("TEXT"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("REAL"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("BLOB"), Some(SqliteType::Blob));
        assert_eq!(SqliteType::parse_type("NULL"), Some(SqliteType::Null));
    }

    #[test]
    fn test_parse_type_case_insensitive() {
        assert_eq!(SqliteType::parse_type("integer"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("Integer"), Some(SqliteType::Integer));
    }

    #[test]
    fn test_parse_type_aliases() {
        assert_eq!(SqliteType::parse_type("INT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("TINYINT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("BIGINT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("DOUBLE"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("VARCHAR"), Some(SqliteType::Text));
    }

    #[test]
    fn test_parse_type_invalid() {
        assert_eq!(SqliteType::parse_type("INVALID"), None);
        assert_eq!(SqliteType::parse_type(""), None);
    }

    #[test]
    fn test_supported_types() {
        let types = SqliteType::supported_types();
        assert!(types.contains(&"INTEGER".to_string()));
        assert!(types.contains(&"TEXT".to_string()));
    }

    #[test]
    fn test_is_valid_type() {
        assert!(SqliteType::is_valid_type("INTEGER".to_string()));
        assert!(SqliteType::is_valid_type("TEXT".to_string()));
        assert!(!SqliteType::is_valid_type("INVALID".to_string()));
    }

    #[test]
    fn test_from_type_name_js_types() {
        let result = SqliteType::from_type_name("String".to_string());
        assert_eq!(result.sqlite_type, "TEXT");
        assert!(result.valid);

        let result = SqliteType::from_type_name("Number".to_string());
        assert_eq!(result.sqlite_type, "INTEGER");
        assert!(result.valid);

        let result = SqliteType::from_type_name("Boolean".to_string());
        assert_eq!(result.sqlite_type, "INTEGER");
        assert!(result.valid);

        let result = SqliteType::from_type_name("Date".to_string());
        assert_eq!(result.sqlite_type, "INTEGER");
        assert!(result.valid);

        let result = SqliteType::from_type_name("Buffer".to_string());
        assert_eq!(result.sqlite_type, "BLOB");
        assert!(result.valid);
    }

    // ============== get_sqlite_functions tests ==============
    #[test]
    fn test_returns_functions() {
        let funcs = get_sqlite_functions();
        assert!(funcs.contains(&"datetime".to_string()));
        assert!(funcs.contains(&"date".to_string()));
        assert!(funcs.contains(&"strftime".to_string()));
    }

    #[test]
    fn test_json_functions() {
        let funcs = get_sqlite_functions();
        assert!(funcs.contains(&"json".to_string()));
        assert!(funcs.contains(&"json_object".to_string()));
    }

    // ============== validate_column_definition tests ==============
    #[test]
    fn test_valid_column() {
        let result = validate_column_definition(
            "id".to_string(),
            "INTEGER".to_string(),
            true,
            true,
            false,
            None,
        );
        assert!(result.valid);
    }

    #[test]
    fn test_empty_column_name() {
        let result = validate_column_definition(
            "".to_string(),
            "INTEGER".to_string(),
            false,
            false,
            false,
            None,
        );
        assert!(!result.valid);
        assert!(result.issues.iter().any(|i: &String| i.contains("empty")));
    }

    #[test]
    fn test_column_name_with_spaces() {
        let result = validate_column_definition(
            "my column".to_string(),
            "INTEGER".to_string(),
            false,
            false,
            false,
            None,
        );
        assert!(!result.valid);
        assert!(result.issues.iter().any(|i: &String| i.contains("spaces")));
    }

    #[test]
    fn test_invalid_column_type() {
        let result = validate_column_definition(
            "col".to_string(),
            "NOT_A_TYPE".to_string(),
            false,
            false,
            false,
            None,
        );
        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|i: &String| i.contains("Unknown SQLite type")));
    }

    // ============== get_autoincrement_info tests ==============
    #[test]
    fn test_valid_autoincrement() {
        let result = get_autoincrement_info("INTEGER".to_string(), true);
        assert!(result.can_use_autoincrement);
        assert!(result.explanation.contains("sequential IDs"));
    }

    #[test]
    fn test_autoincrement_non_integer() {
        let result = get_autoincrement_info("TEXT".to_string(), true);
        assert!(!result.can_use_autoincrement);
    }

    #[test]
    fn test_autoincrement_non_primary_key() {
        let result = get_autoincrement_info("INTEGER".to_string(), false);
        assert!(!result.can_use_autoincrement);
    }

    // ============== validate_create_table tests ==============
    #[test]
    fn test_valid_create_table() {
        let sql = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);
    }

    #[test]
    fn test_missing_create_table() {
        let sql = "SELECT * FROM users";
        let result = validate_create_table(sql.to_string());
        assert!(!result.valid);
    }

    #[test]
    fn test_missing_primary_key_warning() {
        let sql = "CREATE TABLE users (id INTEGER, name TEXT)";
        let result = validate_create_table(sql.to_string());
        assert!(result
            .warnings
            .iter()
            .any(|w: &String| w.contains("PRIMARY KEY")));
    }

    #[test]
    fn test_autoincrement_without_integer() {
        let sql = "CREATE TABLE users (id TEXT PRIMARY KEY AUTOINCREMENT)";
        let result = validate_create_table(sql.to_string());
        assert!(!result.valid);
    }
}
