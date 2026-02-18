/**
 * Rust Schema Utilities - TypeScript bindings
 * 
 * Provides native Rust functions for schema validation and type mapping
 * These functions are implemented in Rust for better performance
 * and to avoid magic strings/hardcoded values in TypeScript.
 */

import {
  isSqlExpression,
  checkSqlExpression,
  getSqliteFunctions,
  validateColumnDefinition,
  validateCreateTable,
  getAutoincrementInfo,
  SqliteType,
} from "../../index";

export { SqliteType };

/**
 * Check if a value is an SQL expression that should not be quoted
 * 
 * Examples that return true:
 *   - "datetime('now')"
 *   - "CURRENT_TIMESTAMP"
 *   - "(strftime('%s', 'now'))"
 *   - "NULL"
 * 
 * @param value - The value to check
 * @returns true if the value is an SQL expression
 */
export { isSqlExpression };
/**
 * Check if a value is an SQL expression with detailed information
 * 
 * @param value - The value to check
 * @returns Object with is_expression flag and expression_type
 */
export { checkSqlExpression };

/**
 * Get a list of known SQL function names that can be used in expressions
 * 
 * @returns Array of SQLite function names
 */
export { getSqliteFunctions };

/**
 * Validate a column definition for common issues
 * 
 * @param columnName - Name of the column
 * @param columnType - SQLite type (e.g., "INTEGER", "TEXT")
 * @param isPrimaryKey - Whether this is a primary key
 * @param isNotNull - Whether NOT NULL constraint is set
 * @param hasDefault - Whether a default value is provided
 * @param defaultValue - The default value (optional)
 * @returns Validation result with issues list
 */
export  {validateColumnDefinition}
/**
 * Validate a CREATE TABLE SQL statement
 * 
 * @param sql - The SQL statement to validate
 * @returns Validation result with issues and warnings
 */
export {validateCreateTable}

/**
 * Get information about SQLite's AUTOINCREMENT behavior
 * 
 * @param columnType - The SQLite column type
 * @param isPrimaryKey - Whether this column is a primary key
 * @returns Information about AUTOINCREMENT usage
 */
export {getAutoincrementInfo}
