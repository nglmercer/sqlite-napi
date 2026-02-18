/**
 * Rust Schema Utilities - TypeScript bindings
 * 
 * Provides native Rust functions for schema validation and type mapping
 * These functions are implemented in Rust for better performance
 * and to avoid magic strings/hardcoded values in TypeScript.
 * 
 * Usage:
 *   import { isSqlExpression, getSqliteType, SqliteType } from "./schema-rust";
 *   
 *   // Check if a value is an SQL expression
 *   if (isSqlExpression("datetime('now')")) {
 *     console.log("This is an SQL expression!");
 *   }
 *   
 *   // Get SQLite type from TypeScript type
 *   const typeInfo = SqliteType.fromTypeName("String");
 *   console.log(typeInfo.sqlite_type); // "TEXT"
 *   console.log(typeInfo.valid); // true
 */

import {
  is_sql_expression,
  check_sql_expression,
  get_sqlite_functions,
  validate_column_definition,
  validate_create_table,
  get_autoincrement_info,
  SqliteType,
} from "../index";

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
export function isSqlExpression(value: string): boolean {
  return is_sql_expression(value);
}

/**
 * Check if a value is an SQL expression with detailed information
 * 
 * @param value - The value to check
 * @returns Object with is_expression flag and expression_type
 */
export function checkSqlExpression(value: string): {
  is_expression: boolean;
  expression_type: string | null;
} {
  return check_sql_expression(value);
}

/**
 * Get a list of known SQL function names that can be used in expressions
 * 
 * @returns Array of SQLite function names
 */
export function getSqliteFunctions(): string[] {
  return get_sqlite_functions();
}

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
export function validateColumnDefinition(
  columnName: string,
  columnType: string,
  isPrimaryKey: boolean,
  isNotNull: boolean,
  hasDefault: boolean,
  defaultValue?: string
): {
  valid: boolean;
  issues: string[];
} {
  return validate_column_definition(
    columnName,
    columnType,
    isPrimaryKey,
    isNotNull,
    hasDefault,
    defaultValue ?? null
  );
}

/**
 * Validate a CREATE TABLE SQL statement
 * 
 * @param sql - The SQL statement to validate
 * @returns Validation result with issues and warnings
 */
export function validateCreateTable(
  sql: string
): {
  valid: boolean;
  issues: string[];
  warnings: string[];
} {
  return validate_create_table(sql);
}

/**
 * Get information about SQLite's AUTOINCREMENT behavior
 * 
 * @param columnType - The SQLite column type
 * @param isPrimaryKey - Whether this column is a primary key
 * @returns Information about AUTOINCREMENT usage
 */
export function getAutoincrementInfo(
  columnType: string,
  isPrimaryKey: boolean
): {
  requires_integer_primary_key: boolean;
  can_use_autoincrement: boolean;
  explanation: string;
} {
  return get_autoincrement_info(columnType, isPrimaryKey);
}

/**
 * Get SQLite type from a TypeScript/JavaScript type name
 * 
 * @param typeName - Type name (e.g., "String", "Number", "Boolean", "Date", "Buffer", "UUID")
 * @returns Object with sqlite_type and valid flag
 */
export function getSqliteTypeFromTs(
  typeName: string
): {
  sqlite_type: string;
  valid: boolean;
} {
  return SqliteType.fromTypeName(typeName);
}

/**
 * Check if a type name is a valid SQLite type
 * 
 * @param typeName - The type name to check
 * @returns true if it's a valid SQLite type
 */
export function isValidSqliteType(typeName: string): boolean {
  return SqliteType.isValidType(typeName);
}

/**
 * Get all supported SQLite type names
 * 
 * @returns Array of supported SQLite types
 */
export function getSupportedSqliteTypes(): string[] {
  return SqliteType.supportedTypes;
}
