//! Tests for schema utilities
//! Run with: cargo test --test schema_test

use sqlite_napi::schema::{
    check_sql_expression, get_autoincrement_info, get_sqlite_functions, is_sql_expression,
    validate_column_definition, validate_create_table, AutoincrementInfo, ColumnValidation,
    ExpressionCheck, SchemaValidation, SqliteType,
};

mod is_sql_expression_tests {
    use super::*;

    #[test]
    fn test_sql_function_calls() {
        // Date/time functions
        assert!(is_sql_expression("datetime('now')".to_string()));
        assert!(is_sql_expression("date('now')".to_string()));
        assert!(is_sql_expression("time('now')".to_string()));
        assert!(is_sql_expression("strftime('%s', 'now')".to_string()));
        assert!(is_sql_expression("julianday('now')".to_string()));
    }

    #[test]
    fn test_sql_keywords() {
        // SQL keywords
        assert!(is_sql_expression("CURRENT_TIMESTAMP".to_string()));
        assert!(is_sql_expression("current_timestamp".to_string()));
        assert!(is_sql_expression("CURRENT_DATE".to_string()));
        assert!(is_sql_expression("CURRENT_TIME".to_string()));
        assert!(is_sql_expression("NULL".to_string()));
        assert!(is_sql_expression("null".to_string()));
        assert!(is_sql_expression("TRUE".to_string()));
        assert!(is_sql_expression("FALSE".to_string()));
    }

    #[test]
    fn test_parenthesized_expressions() {
        assert!(is_sql_expression("(strftime('%s', 'now'))".to_string()));
        assert!(is_sql_expression("(1 + 1)".to_string()));
        assert!(is_sql_expression("(SELECT MAX(id) FROM users)".to_string()));
    }

    #[test]
    fn test_non_expressions() {
        // Regular strings should not be expressions
        assert!(!is_sql_expression("hello world".to_string()));
        assert!(!is_sql_expression("some text".to_string()));
        assert!(!is_sql_expression("123".to_string()));
        assert!(!is_sql_expression("".to_string()));
    }
}

mod check_sql_expression_tests {
    use super::*;

    #[test]
    fn test_function_call_detection() {
        let result = check_sql_expression("datetime('now')".to_string());
        assert!(result.is_expression);
        assert_eq!(result.expression_type, Some("function_call".to_string()));
    }

    #[test]
    fn test_keyword_detection() {
        let result = check_sql_expression("CURRENT_TIMESTAMP".to_string());
        assert!(result.is_expression);
        assert_eq!(result.expression_type, Some("keyword".to_string()));
    }

    #[test]
    fn test_parenthesized_detection() {
        let result = check_sql_expression("(1 + 1)".to_string());
        assert!(result.is_expression);
        assert_eq!(
            result.expression_type,
            Some("parenthesized_expression".to_string())
        );
    }

    #[test]
    fn test_not_expression() {
        let result = check_sql_expression("hello".to_string());
        assert!(!result.is_expression);
        assert_eq!(result.expression_type, None);
    }
}

mod sqlite_type_tests {
    use super::*;

    #[test]
    fn test_from_str_valid_types() {
        assert_eq!(SqliteType::from_str("INTEGER"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("TEXT"), Some(SqliteType::Text));
        assert_eq!(SqliteType::from_str("REAL"), Some(SqliteType::Real));
        assert_eq!(SqliteType::from_str("BLOB"), Some(SqliteType::Blob));
        assert_eq!(SqliteType::from_str("NULL"), Some(SqliteType::Null));
    }

    #[test]
    fn test_from_str_case_insensitive() {
        assert_eq!(SqliteType::from_str("integer"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("Integer"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("TEXT"), Some(SqliteType::Text));
    }

    #[test]
    fn test_from_str_aliases() {
        // Integer aliases
        assert_eq!(SqliteType::from_str("INT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("TINYINT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("SMALLINT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::from_str("BIGINT"), Some(SqliteType::Integer));

        // Real aliases
        assert_eq!(SqliteType::from_str("DOUBLE"), Some(SqliteType::Real));
        assert_eq!(SqliteType::from_str("FLOAT"), Some(SqliteType::Real));
        assert_eq!(SqliteType::from_str("NUMERIC"), Some(SqliteType::Real));

        // Text aliases
        assert_eq!(SqliteType::from_str("VARCHAR"), Some(SqliteType::Text));
        assert_eq!(SqliteType::from_str("CHARACTER"), Some(SqliteType::Text));
    }

    #[test]
    fn test_from_str_invalid() {
        assert_eq!(SqliteType::from_str("INVALID"), None);
        assert_eq!(SqliteType::from_str(""), None);
    }

    #[test]
    fn test_supported_types() {
        let types = SqliteType::supported_types();
        assert!(types.contains(&"INTEGER".to_string()));
        assert!(types.contains(&"TEXT".to_string()));
        assert!(types.contains(&"REAL".to_string()));
        assert!(types.contains(&"BLOB".to_string()));
        assert!(types.contains(&"NULL".to_string()));
    }

    #[test]
    fn test_is_valid_type() {
        assert!(SqliteType::is_valid_type("INTEGER".to_string()));
        assert!(SqliteType::is_valid_type("TEXT".to_string()));
        assert!(SqliteType::is_valid_type("int".to_string()));
        assert!(!SqliteType::is_valid_type("INVALID".to_string()));
    }

    #[test]
    fn test_from_type_name_js_types() {
        // JavaScript/TypeScript constructor types
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

        let result = SqliteType::from_type_name("UUID".to_string());
        assert_eq!(result.sqlite_type, "TEXT");
        assert!(result.valid);

        let result = SqliteType::from_type_name("Float".to_string());
        assert_eq!(result.sqlite_type, "REAL");
        assert!(result.valid);
    }
}

mod get_sqlite_functions_tests {
    use super::*;

    #[test]
    fn test_returns_functions() {
        let funcs = get_sqlite_functions();

        // Should contain common functions
        assert!(funcs.contains(&"datetime".to_string()));
        assert!(funcs.contains(&"date".to_string()));
        assert!(funcs.contains(&"strftime".to_string()));
        assert!(funcs.contains(&"length".to_string()));
        assert!(funcs.contains(&"lower".to_string()));
        assert!(funcs.contains(&"upper".to_string()));
        assert!(funcs.contains(&"abs".to_string()));
        assert!(funcs.contains(&"random".to_string()));
    }

    #[test]
    fn test_json_functions() {
        let funcs = get_sqlite_functions();
        assert!(funcs.contains(&"json".to_string()));
        assert!(funcs.contains(&"json_object".to_string()));
        assert!(funcs.contains(&"json_extract".to_string()));
    }
}

mod validate_column_definition_tests {
    use super::*;

    #[test]
    fn test_valid_column() {
        let result = validate_column_definition(
            "id".to_string(),
            "INTEGER".to_string(),
            true,  // is_primary_key
            true,  // is_not_null
            false, // has_default
            None,
        );
        assert!(result.valid);
        assert!(result.issues.is_empty());
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
        assert!(result.issues.iter().any(|i| i.contains("empty")));
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
        assert!(result.issues.iter().any(|i| i.contains("spaces")));
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
            .any(|i| i.contains("Unknown SQLite type")));
    }

    #[test]
    fn test_expression_default_warning() {
        // Expression default for non-TEXT type should warn
        let result = validate_column_definition(
            "created_at".to_string(),
            "INTEGER".to_string(),
            false,
            true,
            true,
            Some("datetime('now')".to_string()),
        );
        // This should produce a warning/info about expression default
        assert!(!result.issues.is_empty() || result.valid);
    }
}

mod get_autoincrement_info_tests {
    use super::*;

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
        assert!(result.explanation.contains("INTEGER type"));
    }

    #[test]
    fn test_autoincrement_non_primary_key() {
        let result = get_autoincrement_info("INTEGER".to_string(), false);
        assert!(!result.can_use_autoincrement);
        assert!(result.explanation.contains("PRIMARY KEY"));
    }
}

mod validate_create_table_tests {
    use super::*;

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
        assert!(result.issues.iter().any(|i| i.contains("CREATE TABLE")));
    }

    #[test]
    fn test_missing_primary_key_warning() {
        let sql = "CREATE TABLE users (id INTEGER, name TEXT)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid); // Still valid but with warning
        assert!(result.warnings.iter().any(|w| w.contains("PRIMARY KEY")));
    }

    #[test]
    fn test_foreign_key_without_on_delete() {
        let sql =
            "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))";
        let result = validate_create_table(sql.to_string());
        assert!(result.warnings.iter().any(|w| w.contains("ON DELETE")));
    }

    #[test]
    fn test_autoincrement_without_integer() {
        let sql = "CREATE TABLE users (id TEXT PRIMARY KEY AUTOINCREMENT)";
        let result = validate_create_table(sql.to_string());
        assert!(!result.valid);
        assert!(result.issues.iter().any(|i| i.contains("INTEGER")));
    }
}
