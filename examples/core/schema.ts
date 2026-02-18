import { 
  getSqliteType, 
  type FieldType,
  type ModelDefinition, 
  type ModelFieldConfig 
} from "./constants.js";
import { isSqlExpression } from "index.js";
/**
 * Schema - ORM-style database schema builder
 * 
 * Usage:
 *   import { Schema } from "./core";
 *   
 *   const userSchema = new Schema("users")
 *     .text("name").notNull()
 *     .text("email").unique()
 *     .integer("age")
 *     .index(["email"], true)
 * 
 * @example
 * // Prisma-like model definition
 *   const schema = new Schema("oauth_tokens")
 *     .model({
 *       id: StandardFields.UUID,
 *       token: { type: String, required: true, unique: true },
 *       client_id: { type: String, required: true },
 *       user_id: { type: String, required: true },
 *       scope: { type: String, default: "" },
 *       expires_at: { type: Date, required: true },
 *       is_revoked: { type: Boolean, default: false },
 *       revoked_at: Date,
 *       rotation_count: { type: Number, default: 0 },
 *       created_at: StandardFields.CreatedAt,
 *     });
 */

export interface ColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  notNull?: boolean;
  defaultValue?: any;
  references?: { table: string; column: string };
}

export interface SchemaDefinition {
  tableName: string;
  columns: ColumnDefinition[];
  indexes?: { name: string; columns: string[]; unique?: boolean }[];
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

// For JSON serialization
export interface SerializedSchema {
  tableName: string;
  columns: {
    name: string;
    type: string;
    primaryKey?: boolean;
    autoIncrement?: boolean;
    unique?: boolean;
    notNull?: boolean;
    defaultValue?: any;
    references?: { table: string; column: string };
  }[];
  indexes: {
    name: string;
    columns: string[];
    unique?: boolean;
  }[];
}

export class Schema {
  private tableName: string;
  private columns: ColumnDefinition[] = [];
  private indexes: IndexDefinition[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  // ============================================
  // Métodos de tipo de columna
  // ============================================

  integer(name: string): this {
    this.columns.push({ name, type: "INTEGER" });
    return this;
  }

  text(name: string): this {
    this.columns.push({ name, type: "TEXT" });
    return this;
  }

  real(name: string): this {
    this.columns.push({ name, type: "REAL" });
    return this;
  }

  boolean(name: string): this {
    this.columns.push({ name, type: "INTEGER" });
    return this;
  }

  blob(name: string): this {
    this.columns.push({ name, type: "BLOB" });
    return this;
  }

  // ============================================
  // Métodos de restricciones
  // ============================================

  primaryKey(): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.primaryKey = true;
    return this;
  }

  autoIncrement(): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.autoIncrement = true;
    return this;
  }

  notNull(): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.notNull = true;
    return this;
  }

  default(value: any): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.defaultValue = value;
    return this;
  }

  unique(): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.unique = true;
    return this;
  }

  references(table: string, column: string): this {
    const col = this.columns[this.columns.length - 1];
    if (col) col.references = { table, column };
    return this;
  }

  // ============================================
  // Índices
  // ============================================

  index(columns: string[], unique?: boolean): this {
    this.indexes.push({
      name: `idx_${this.tableName}_${columns.join("_")}`,
      columns,
      unique
    });
    return this;
  }

  // ============================================
  // Standard Fields
  // ============================================

  /**
   * Apply a StandardField (UUID, Timestamps, Active, etc.)
   * Example: schema.apply(StandardFields.UUID).apply(StandardFields.Timestamps)
   */
  apply(field: {
    name?: string;
    type?: string;
    primaryKey?: boolean;
    notNull?: boolean;
    unique?: boolean;
    defaultValue?: any;
    [key: string]: any;
  }): this {
    // If it's an object with properties (like Timestamps, Active)
    for (const [key, value] of Object.entries(field)) {
      if (key === "name" || key === "type" || key === "primaryKey") continue;
      if (typeof value === "object" && value !== null) {
        // It's a field like { created_at: {...} }
        this.addColumn(key, value);
      }
    }
    // If it has direct name and type (like UUID)
    if (field.name && field.type) {
      this.addColumn(field.name, field);
    }
    return this;
  }

  // ============================================
  // Prisma-like Model Definition
  // ============================================

  /**
   * Define schema using Prisma-like model definition
   * 
   * @example
   *   const schema = new Schema("oauth_tokens")
   *     .model({
   *       id: StandardFields.UUID,
   *       token: { type: String, required: true, unique: true },
   *       client_id: { type: String, required: true },
   *       user_id: { type: String, required: true },
   *       scope: { type: String, default: "" },
   *       expires_at: { type: Date, required: true },
   *       is_revoked: { type: Boolean, default: false },
   *       revoked_at: Date,
   *       rotation_count: { type: Number, default: 0 },
   *       created_at: StandardFields.CreatedAt,
   *     });
   */
  model(definition: ModelDefinition): this {
    for (const [fieldName, field] of Object.entries(definition)) {
      // Check if it's a StandardField (has name and type properties)
      if (this.isStandardField(field)) {
        // It's a StandardField - need to handle different structures
        // UUID has direct name/type properties
        if ("name" in field && "type" in field && typeof field.name === "string" && typeof field.type === "string") {
          const sf = field as { name: string; type: string; primaryKey?: boolean; notNull?: boolean; unique?: boolean; defaultValue?: any };
          // Use fieldName from model definition, not sf.name from StandardField
          this.addColumn(fieldName, {
            type: sf.type,
            primaryKey: sf.primaryKey,
            notNull: sf.notNull,
            unique: sf.unique,
            defaultValue: sf.defaultValue,
          });
        } else {
          // Compound field like { created_at: { type: "INTEGER", ... } } or { is_active: {...} }
          for (const [subName, subConfig] of Object.entries(field)) {
            if (subName === "name" || subName === "type" || subName === "primaryKey") continue;
            if (typeof subConfig === "object" && subConfig !== null && "type" in subConfig) {
              const config = subConfig as { type: string; primaryKey?: boolean; notNull?: boolean; unique?: boolean; defaultValue?: any };
              this.addColumn(subName, {
                type: config.type,
                primaryKey: config.primaryKey,
                notNull: config.notNull,
                unique: config.unique,
                defaultValue: config.defaultValue,
              });
            }
          }
        }
      } else if (this.isModelFieldConfig(field)) {
        // It's a ModelFieldConfig like { type: String, required: true }
        const config = field as ModelFieldConfig;
        const sqliteType = getSqliteType(config.type);
        
        this.columns.push({
          name: fieldName,
          type: sqliteType,
          primaryKey: config.primaryKey,
          autoIncrement: config.autoIncrement,
          unique: config.unique,
          notNull: config.required ?? config.primaryKey ?? false,
          defaultValue: config.default,
          references: config.references 
            ? { table: config.references.model, column: config.references.field }
            : undefined,
        });
      } else if (typeof field === "function") {
        // It's a constructor function like String, Number, Boolean, Date
        const fieldType = this.getFieldTypeFromConstructor(field);
        if (fieldType) {
          this.columns.push({
            name: fieldName,
            type: getSqliteType(fieldType),
          });
        }
      }
    }
    return this;
  }

  private isStandardField(field: any): boolean {
    if (field === null || typeof field !== "object") return false;
    // Check for direct name/type (UUID style)
    if ("name" in field && "type" in field && typeof field.name === "string" && typeof field.type === "string") {
      return true;
    }
    // Check for nested fields (Timestamps, Active, DeletedAt style)
    const nestedKeys = ["created_at", "updated_at", "is_active", "deleted_at"];
    return nestedKeys.some(key => key in field);
  }

  private isModelFieldConfig(field: any): boolean {
    return field !== null && typeof field === "object" && "type" in field;
  }

  private getFieldTypeFromConstructor(fn: Function): FieldType | null {
    const fnName = fn.name;
    if (fnName === "String") return "String";
    if (fnName === "Number") return "Number";
    if (fnName === "Boolean") return "Boolean";
    if (fnName === "Date") return "Date";
    if (fnName === "Buffer") return "Buffer";
    return null;
  }

  private addColumn(
    name: string,
    config: { type?: string; primaryKey?: boolean; notNull?: boolean; unique?: boolean; defaultValue?: any }
  ): void {
    if (!config.type) {
      throw new Error(`Column "${name}" requires a type`);
    }
    this.columns.push({
      name,
      type: config.type,
      primaryKey: config.primaryKey,
      notNull: config.notNull,
      unique: config.unique,
      defaultValue: config.defaultValue,
    });
  }

  // ============================================
  // Métodos de generación SQL
  // ============================================


  toSQL(): string {
    const lines: string[] = [];

    for (const col of this.columns) {
      let line = "";

      // SQLite: PRIMARY KEY AUTOINCREMENT debe ser INTEGER PRIMARY KEY
      if (col.primaryKey && col.autoIncrement) {
        line = `  ${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
        lines.push(line);
        continue;
      }

      line = `  ${col.name} ${col.type}`;

      if (col.primaryKey) {
        line += " PRIMARY KEY";
      }
      if (col.notNull && !col.primaryKey) {
        line += " NOT NULL";
      }
      if (col.unique) {
        line += " UNIQUE";
      }
      if (col.defaultValue !== undefined) {
        const defaultVal = col.defaultValue;
        // Si es una expresión SQL (función o expresión entre paréntesis), no usar comillas
        // SQLite requiere paréntesis alrededor de expresiones en DEFAULT
        if (typeof defaultVal === "string" && isSqlExpression(defaultVal)) {
          // Si ya tiene paréntesis externos, usarlo tal cual; si no, agregar paréntesis
          const expr = defaultVal.startsWith("(") ? defaultVal : `(${defaultVal})`;
          line += ` DEFAULT ${expr}`;
        } else if (typeof defaultVal === "string") {
          line += ` DEFAULT '${defaultVal}'`;
        } else {
          line += ` DEFAULT ${defaultVal}`;
        }
      }
      if (col.references) {
        line += ` REFERENCES ${col.references.table}(${col.references.column})`;
      }

      lines.push(line);
    }

    let sql = `CREATE TABLE ${this.tableName} (\n${lines.join(",\n")}\n)`;

    if (this.indexes.length > 0) {
      for (const idx of this.indexes) {
        const uniqueStr = idx.unique ? " UNIQUE" : "";
        sql += `;\nCREATE${uniqueStr} INDEX ${idx.name} ON ${this.tableName} (${idx.columns.join(", ")})`;
      }
    }

    return sql;
  }

  getTableName(): string {
    return this.tableName;
  }

  getColumns(): ColumnDefinition[] {
    return this.columns;
  }

  getIndexes(): IndexDefinition[] {
    return this.indexes;
  }

  // ============================================
  // JSON Serialization
  // ============================================

  /**
   * Serialize schema to JSON object
   * 
   * @example
   *   const schema = new Schema("users").text("name").notNull();
   *   const json = schema.toJSON();
   *   console.log(JSON.stringify(json, null, 2));
   */
  toJSON(): SerializedSchema {
    return {
      tableName: this.tableName,
      columns: this.columns.map(col => ({
        name: col.name,
        type: col.type,
        primaryKey: col.primaryKey,
        autoIncrement: col.autoIncrement,
        unique: col.unique,
        notNull: col.notNull,
        defaultValue: col.defaultValue,
        references: col.references,
      })),
      indexes: this.indexes.map(idx => ({
        name: idx.name,
        columns: idx.columns,
        unique: idx.unique,
      })),
    };
  }

  /**
   * Serialize schema to JSON string
   * 
   * @example
   *   const schema = new Schema("users").text("name").notNull();
   *   const jsonString = schema.toJsonString();
   *   console.log(jsonString);
   */
  toJsonString(space?: number): string {
    return JSON.stringify(this.toJSON(), null, space);
  }
}
