/**
 * Standard Fields - Reusable schema patterns
 * Provides common fields used across all tables
 * 
 * Usage:
 *   import { Schema, StandardFields } from "./core";
 *   
 *   const userSchema = new Schema("users")
 *     .apply(StandardFields.UUID)        // id TEXT PRIMARY KEY
 *     .text("name").notNull()
 *     .text("email").unique()
 *     .apply(StandardFields.Timestamps)  // created_at, updated_at
 *     .apply(StandardFields.Active)       // is_active
 */

// UUID: Universally unique identifier with automatic generation
const UUID = {
  name: "id",
  type: "TEXT",
  primaryKey: true,
  notNull: true,
  defaultValue: "(lower(hex(randomblob(16))))",
} as const;

// Timestamps: created_at and updated_at with auto-update
const Timestamps = {
  created_at: { type: "INTEGER", notNull: true, defaultValue: "(strftime('%s', 'now'))" },
  updated_at: { type: "INTEGER", notNull: true, defaultValue: "(strftime('%s', 'now'))" },
} as const;

// CreatedAt: Creation date only
const CreatedAt = {
  created_at: { type: "INTEGER", notNull: true, defaultValue: "(strftime('%s', 'now'))" },
} as const;

// Active: Boolean state with default value
const Active = {
  is_active: { type: "INTEGER", notNull: true, defaultValue: 1 },
} as const;

// DeletedAt: Soft delete
const DeletedAt = {
  deleted_at: { type: "INTEGER", defaultValue: null },
} as const;

// StandardFields: Complete combination of standard fields
const StandardFields = {
  UUID,
  Timestamps,
  CreatedAt,
  Active,
  DeletedAt,
} as const;

// Export types
export type StandardField = typeof UUID | typeof Timestamps | typeof CreatedAt | typeof Active | typeof DeletedAt;

// ============================================
// Prisma-like Model Definition Types
// ============================================

/**
 * Field type mapping for model definitions (accepts both string literals and constructors)
 */
export type FieldType = "String" | "Number" | "Boolean" | "Date" | "Buffer" | "UUID" | StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | BufferConstructor;

/**
 * Prisma-like field configuration
 */
export interface ModelFieldConfig {
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  default?: any;
  primaryKey?: boolean;
  references?: { model: string; field: string };
  autoIncrement?: boolean;
}

/**
 * Model field definition (can be StandardField, ModelFieldConfig, or constructor function)
 */
export type ModelField = StandardField | ModelFieldConfig | StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | BufferConstructor;

/**
 * Model definition object
 */
export interface ModelDefinition {
  [fieldName: string]: ModelField;
}

/**
 * Schema options for model definition
 */
export interface SchemaOptions {
  timestamps?: boolean;
  softDelete?: boolean;
  active?: boolean;
}

// SQLite type mapping
const SQLITE_TYPE_MAP: Record<string, string> = {
  String: "TEXT",
  Number: "INTEGER",
  Boolean: "INTEGER",
  Date: "INTEGER",
  Buffer: "BLOB",
  UUID: "TEXT",
};

/**
 * Get SQLite type from field type (supports both string literals and constructors)
 */
export function getSqliteType(fieldType: FieldType): string {
  // Handle constructor functions (String, Number, Boolean, Date, Buffer)
  if (typeof fieldType === "function") {
    const fnName = fieldType.name;
    if (fnName === "String") return "TEXT";
    if (fnName === "Number") return "INTEGER";
    if (fnName === "Boolean") return "INTEGER";
    if (fnName === "Date") return "INTEGER";
    if (fnName === "Buffer") return "BLOB";
  }
  // Handle string literals
  return SQLITE_TYPE_MAP[fieldType as string] || "TEXT";
}

export {
  StandardFields,
  UUID,
  Timestamps,
  CreatedAt,
  Active,
  DeletedAt,
};
