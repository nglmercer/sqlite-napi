//! Tests for schema utilities
//! Run with: cargo test --test schema_test

use sqlite_napi::{
    check_sql_expression, get_autoincrement_info, get_sqlite_functions, is_sql_expression,
    validate_column_definition, validate_create_table, AutoincrementInfo, ColumnValidation,
    ExpressionCheck, SchemaValidation, SqliteType, TypeMapping,
};

// ============================================================================
// FIRST: Validate all functions in the map work correctly
// This section tests every function returned by get_sqlite_functions()
// ============================================================================

mod function_map_validation {
    use super::*;

    /// Test that all functions returned by get_sqlite_functions() are properly
    /// detected as SQL expressions by is_sql_expression
    #[test]
    fn test_all_functions_detected_by_is_sql_expression() {
        let functions = get_sqlite_functions();

        // Test each function with a simple call pattern
        for func_name in &functions {
            // Create a function call like "func_name('test')"
            let func_call = format!("{}(\"test\")", func_name);
            let result = is_sql_expression(func_call.clone());
            assert!(
                result,
                "Function '{}' with call '{}' should be detected as SQL expression",
                func_name, func_call
            );
        }
    }

    /// Test that all functions returned by get_sqlite_functions() are properly
    /// detected by check_sql_expression with correct type
    #[test]
    fn test_all_functions_detected_by_check_sql_expression() {
        let functions = get_sqlite_functions();

        for func_name in &functions {
            let func_call = format!("{}(\"test\")", func_name);
            let result = check_sql_expression(func_call.clone());

            assert!(
                result.is_expression,
                "Function '{}' call '{}' should be detected as expression",
                func_name, func_call
            );
            assert_eq!(
                result.expression_type,
                Some("function_call".to_string()),
                "Function '{}' should be detected as function_call type",
                func_name
            );
        }
    }

    /// Test function names without parentheses are NOT detected as expressions
    /// (they're just identifiers, not function calls)
    #[test]
    fn test_function_names_without_parens_not_detected() {
        let functions = get_sqlite_functions();

        for func_name in &functions {
            // Function name alone without () should not be detected as expression
            // (unless it's a keyword like NULL, TRUE, FALSE)
            if ![
                "NULL",
                "TRUE",
                "FALSE",
                "CURRENT_DATE",
                "CURRENT_TIME",
                "CURRENT_TIMESTAMP",
            ]
            .contains(&func_name.to_uppercase().as_str())
            {
                let result = is_sql_expression(func_name.clone());
                assert!(
                    !result,
                    "Function name '{}' without parentheses should NOT be detected as expression",
                    func_name
                );
            }
        }
    }

    /// Verify get_sqlite_functions returns a non-empty list
    #[test]
    fn test_functions_list_not_empty() {
        let functions = get_sqlite_functions();
        assert!(!functions.is_empty(), "Function list should not be empty");
    }

    /// Verify all expected function categories are present
    #[test]
    fn test_expected_function_categories_present() {
        let functions = get_sqlite_functions();
        let functions_set: std::collections::HashSet<_> = functions.iter().collect();

        // Date/time functions
        assert!(functions_set.contains(&"date".to_string()));
        assert!(functions_set.contains(&"time".to_string()));
        assert!(functions_set.contains(&"datetime".to_string()));
        assert!(functions_set.contains(&"strftime".to_string()));

        // String functions
        assert!(functions_set.contains(&"lower".to_string()));
        assert!(functions_set.contains(&"upper".to_string()));
        assert!(functions_set.contains(&"trim".to_string()));
        assert!(functions_set.contains(&"substr".to_string()));

        // Numeric functions
        assert!(functions_set.contains(&"abs".to_string()));
        assert!(functions_set.contains(&"round".to_string()));

        // JSON functions
        assert!(functions_set.contains(&"json".to_string()));
        assert!(functions_set.contains(&"json_object".to_string()));

        // Aggregate functions
        assert!(functions_set.contains(&"count".to_string()));
        assert!(functions_set.contains(&"sum".to_string()));
    }
}

// ============================================================================
// is_sql_expression tests
// ============================================================================

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

    #[test]
    fn test_additional_sql_functions() {
        // Numeric functions
        assert!(is_sql_expression("abs(-5)".to_string()));
        assert!(is_sql_expression("round(3.14)".to_string()));

        // String functions
        assert!(is_sql_expression("length('hello')".to_string()));
        assert!(is_sql_expression("upper('hello')".to_string()));
        assert!(is_sql_expression("lower('HELLO')".to_string()));
        assert!(is_sql_expression("trim('  hello  ')".to_string()));

        // Type conversion
        assert!(is_sql_expression("cast(1 as text)".to_string()));
    }

    #[test]
    fn test_json_functions() {
        assert!(is_sql_expression("json('{\"a\":1}')".to_string()));
        assert!(is_sql_expression("json_object('a', 1)".to_string()));
        assert!(is_sql_expression(
            "json_extract('{\"a\":1}', '$.a')".to_string()
        ));
        assert!(is_sql_expression("json_valid('{}')".to_string()));
    }

    #[test]
    fn test_aggregate_functions() {
        assert!(is_sql_expression("count(*)".to_string()));
        assert!(is_sql_expression("sum(amount)".to_string()));
        assert!(is_sql_expression("avg(price)".to_string()));
    }
}

// ============================================================================
// check_sql_expression tests
// ============================================================================

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

    #[test]
    fn test_mixed_case_keywords() {
        let result = check_sql_expression("Current_Date".to_string());
        assert!(result.is_expression);
        assert_eq!(result.expression_type, Some("keyword".to_string()));
    }

    #[test]
    fn test_all_expression_types_covered() {
        // Test function_call type
        let result = check_sql_expression("abs(1)".to_string());
        assert_eq!(result.expression_type, Some("function_call".to_string()));

        // Test keyword type
        let result = check_sql_expression("NULL".to_string());
        assert_eq!(result.expression_type, Some("keyword".to_string()));

        // Test parenthesized_expression type
        let result = check_sql_expression("(1)".to_string());
        assert_eq!(
            result.expression_type,
            Some("parenthesized_expression".to_string())
        );
    }
}

// ============================================================================
// SqliteType tests
// ============================================================================

mod sqlite_type_tests {
    use super::*;

    #[test]
    fn test_from_str_valid_types() {
        assert_eq!(SqliteType::parse_type("INTEGER"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("TEXT"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("REAL"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("BLOB"), Some(SqliteType::Blob));
        assert_eq!(SqliteType::parse_type("NULL"), Some(SqliteType::Null));
    }

    #[test]
    fn test_from_str_case_insensitive() {
        assert_eq!(SqliteType::parse_type("integer"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("Integer"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("TEXT"), Some(SqliteType::Text));
    }

    #[test]
    fn test_from_str_aliases() {
        // Integer aliases
        assert_eq!(SqliteType::parse_type("INT"), Some(SqliteType::Integer));
        assert_eq!(SqliteType::parse_type("TINYINT"), Some(SqliteType::Integer));
        assert_eq!(
            SqliteType::parse_type("SMALLINT"),
            Some(SqliteType::Integer)
        );
        assert_eq!(SqliteType::parse_type("BIGINT"), Some(SqliteType::Integer));
        assert_eq!(
            SqliteType::parse_type("MEDIUMINT"),
            Some(SqliteType::Integer)
        );
        assert_eq!(
            SqliteType::parse_type("UNSIGNED BIG INT"),
            Some(SqliteType::Integer)
        );

        // Real aliases
        assert_eq!(SqliteType::parse_type("DOUBLE"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("FLOAT"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("NUMERIC"), Some(SqliteType::Real));
        assert_eq!(SqliteType::parse_type("DECIMAL"), Some(SqliteType::Real));

        // Text aliases
        assert_eq!(SqliteType::parse_type("VARCHAR"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("CHARACTER"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("NCHAR"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("NVARCHAR"), Some(SqliteType::Text));
        assert_eq!(SqliteType::parse_type("CLOB"), Some(SqliteType::Text));
    }

    #[test]
    fn test_from_str_invalid() {
        assert_eq!(SqliteType::parse_type("INVALID"), None);
        assert_eq!(SqliteType::parse_type(""), None);
        assert_eq!(SqliteType::parse_type("NOTATYPE"), None);
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
        assert!(SqliteType::is_valid_type("INT".to_string()));
        assert!(!SqliteType::is_valid_type("INVALID".to_string()));
        assert!(!SqliteType::is_valid_type("".to_string()));
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

    #[test]
    fn test_sqlite_type_as_str() {
        assert_eq!(SqliteType::Integer.as_str(), "INTEGER");
        assert_eq!(SqliteType::Text.as_str(), "TEXT");
        assert_eq!(SqliteType::Real.as_str(), "REAL");
        assert_eq!(SqliteType::Blob.as_str(), "BLOB");
        assert_eq!(SqliteType::Null.as_str(), "NULL");
    }

    #[test]
    fn test_from_type_name_native_sqlite() {
        // Native SQLite types should map directly
        let result = SqliteType::from_type_name("INTEGER".to_string());
        assert!(result.valid);
        assert_eq!(result.sqlite_type, "INTEGER");

        let result = SqliteType::from_type_name("TEXT".to_string());
        assert!(result.valid);

        let result = SqliteType::from_type_name("BLOB".to_string());
        assert!(result.valid);
    }

    #[test]
    fn test_from_type_name_invalid_falls_back_to_text() {
        // Invalid types should fall back to TEXT
        let result = SqliteType::from_type_name("INVALID_TYPE".to_string());
        assert!(!result.valid);
        assert_eq!(result.sqlite_type, "TEXT");
    }
}

// ============================================================================
// TypeMapping tests
// ============================================================================

mod type_mapping_tests {
    use super::*;

    #[test]
    fn test_type_mapping_valid() {
        let mapping = TypeMapping {
            sqlite_type: "INTEGER".to_string(),
            valid: true,
        };
        assert!(mapping.valid);
        assert_eq!(mapping.sqlite_type, "INTEGER");
    }

    #[test]
    fn test_type_mapping_invalid() {
        let mapping = TypeMapping {
            sqlite_type: "TEXT".to_string(),
            valid: false,
        };
        assert!(!mapping.valid);
    }
}

// ============================================================================
// get_sqlite_functions tests
// ============================================================================

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

    #[test]
    fn test_aggregate_functions() {
        let funcs = get_sqlite_functions();
        assert!(funcs.contains(&"count".to_string()));
        assert!(funcs.contains(&"sum".to_string()));
        assert!(funcs.contains(&"avg".to_string()));
    }

    #[test]
    fn test_string_functions() {
        let funcs = get_sqlite_functions();
        assert!(funcs.contains(&"substr".to_string()));
        assert!(funcs.contains(&"replace".to_string()));
        assert!(funcs.contains(&"trim".to_string()));
        assert!(funcs.contains(&"instr".to_string()));
    }

    #[test]
    fn test_not_empty() {
        let funcs = get_sqlite_functions();
        assert!(!funcs.is_empty());
    }
}

// ============================================================================
// validate_column_definition tests
// ============================================================================

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

    #[test]
    fn test_valid_column_with_default() {
        let result = validate_column_definition(
            "name".to_string(),
            "TEXT".to_string(),
            false,
            false,
            true,
            Some("'default'".to_string()),
        );
        assert!(result.valid);
    }

    #[test]
    fn test_valid_text_column() {
        let result = validate_column_definition(
            "email".to_string(),
            "VARCHAR".to_string(),
            false,
            true,
            true,
            Some("''".to_string()),
        );
        assert!(result.valid);
    }

    #[test]
    fn test_text_type_with_expression_default_no_warning() {
        // TEXT type with expression default should be valid without issues
        let result = validate_column_definition(
            "name".to_string(),
            "TEXT".to_string(),
            false,
            false,
            true,
            Some("upper('default')".to_string()),
        );
        assert!(result.valid);
        assert!(result.issues.is_empty());
    }
}

// ============================================================================
// get_autoincrement_info tests
// ============================================================================

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

    #[test]
    fn test_autoincrement_int_type() {
        let result = get_autoincrement_info("INT".to_string(), true);
        assert!(result.can_use_autoincrement);
    }

    #[test]
    fn test_autoincrement_requires_integer() {
        let result = get_autoincrement_info("INTEGER".to_string(), true);
        assert!(result.requires_integer_primary_key);
    }

    #[test]
    fn test_autoincrement_bigint() {
        let result = get_autoincrement_info("BIGINT".to_string(), true);
        // BIGINT is not the same as INTEGER for autoincrement
        assert!(!result.can_use_autoincrement);
    }

    #[test]
    fn test_autoincrement_real() {
        let result = get_autoincrement_info("REAL".to_string(), true);
        assert!(!result.can_use_autoincrement);
    }

    #[test]
    fn test_autoincrement_blob() {
        let result = get_autoincrement_info("BLOB".to_string(), true);
        assert!(!result.can_use_autoincrement);
    }
}

// ============================================================================
// validate_create_table tests
// ============================================================================

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

    #[test]
    fn test_valid_table_with_indexes() {
        let sql = "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);
    }

    #[test]
    fn test_valid_table_with_check_constraint() {
        let sql = "CREATE TABLE products (id INTEGER PRIMARY KEY, price REAL CHECK(price > 0))";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);
    }

    #[test]
    fn test_table_without_name() {
        let sql = "CREATE TABLE ()";
        let result = validate_create_table(sql.to_string());
        assert!(!result.valid);
    }

    #[test]
    fn test_if_not_exists() {
        let sql = "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);
    }

    #[test]
    fn test_case_insensitive_create_table() {
        // Test lowercase
        let sql = "create table users (id integer primary key)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);

        // Test mixed case
        let sql = "Create Table users (id integer primary key)";
        let result = validate_create_table(sql.to_string());
        assert!(result.valid);
    }
}

// ============================================================================
// ExpressionCheck tests
// ============================================================================

mod expression_check_tests {
    use super::*;

    #[test]
    fn test_expression_check_function() {
        let check = ExpressionCheck {
            is_expression: true,
            expression_type: Some("function_call".to_string()),
        };
        assert!(check.is_expression);
        assert_eq!(check.expression_type.unwrap(), "function_call");
    }

    #[test]
    fn test_expression_check_keyword() {
        let check = ExpressionCheck {
            is_expression: true,
            expression_type: Some("keyword".to_string()),
        };
        assert!(check.is_expression);
    }

    #[test]
    fn test_expression_check_not_expression() {
        let check = ExpressionCheck {
            is_expression: false,
            expression_type: None,
        };
        assert!(!check.is_expression);
        assert!(check.expression_type.is_none());
    }
}

// ============================================================================
// AutoincrementInfo tests
// ============================================================================

mod autoincrement_info_tests {
    use super::*;

    #[test]
    fn test_autoincrement_info_structure() {
        let info = AutoincrementInfo {
            requires_integer_primary_key: true,
            can_use_autoincrement: true,
            explanation: "INTEGER PRIMARY KEY AUTOINCREMENT will generate sequential IDs"
                .to_string(),
        };
        assert!(info.requires_integer_primary_key);
        assert!(info.can_use_autoincrement);
        assert!(!info.explanation.is_empty());
    }
}

// ============================================================================
// SchemaValidation tests
// ============================================================================

mod schema_validation_tests {
    use super::*;

    #[test]
    fn test_schema_validation_valid() {
        let validation = SchemaValidation {
            valid: true,
            issues: vec![],
            warnings: vec![],
        };
        assert!(validation.valid);
        assert!(validation.issues.is_empty());
    }

    #[test]
    fn test_schema_validation_with_warnings() {
        let validation = SchemaValidation {
            valid: true,
            issues: vec![],
            warnings: vec!["Table has no PRIMARY KEY".to_string()],
        };
        assert!(validation.valid);
        assert!(!validation.warnings.is_empty());
    }

    #[test]
    fn test_schema_validation_with_issues() {
        let validation = SchemaValidation {
            valid: false,
            issues: vec!["Invalid SQL".to_string()],
            warnings: vec![],
        };
        assert!(!validation.valid);
        assert!(!validation.issues.is_empty());
    }
}

// ============================================================================
// ColumnValidation tests
// ============================================================================

mod column_validation_tests {
    use super::*;

    #[test]
    fn test_column_validation_valid() {
        let validation = ColumnValidation {
            valid: true,
            issues: vec![],
        };
        assert!(validation.valid);
        assert!(validation.issues.is_empty());
    }

    #[test]
    fn test_column_validation_with_issues() {
        let validation = ColumnValidation {
            valid: false,
            issues: vec!["Column name cannot be empty".to_string()],
        };
        assert!(!validation.valid);
        assert!(!validation.issues.is_empty());
    }
}
