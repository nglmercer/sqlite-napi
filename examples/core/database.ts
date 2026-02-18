/**
 * SQLiteSchema - Gestor de múltiples esquemas y migraciones
 * 
 * Uso:
 *   import { SQLiteSchema, Schema } from "./core";
 *   
 *   const db = new SQLiteSchema()
 *     .create("users", (s) => {
 *       s.text("name").notNull();
 *       s.text("email").unique();
 *     })
 *     .create("posts", (s) => {
 *       s.text("title").notNull();
 *       s.text("user_id").references("users", "id");
 *     });
 *   
 *   const migrations = db.toMigrations();
 */

import { Schema, SchemaDefinition } from "./schema.js";

/**
 * Check if a string is a SQL expression that should not be quoted
 * Examples: datetime('now'), CURRENT_TIMESTAMP, (strftime('%s', 'now')), etc.
 */
function isSqlExpression(value: string): boolean {
  // Starts with parenthesis (expression)
  if (value.startsWith("(")) return true;
  // SQL function calls like datetime('now'), strftime('%s', 'now')
  if (/^[a-z_]+\s*\(/i.test(value)) return true;
  // SQL keywords like CURRENT_TIMESTAMP, CURRENT_DATE, CURRENT_TIME, NULL
  if (/^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|NULL)$/i.test(value)) return true;
  return false;
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
  timestamp: number;
}

export class SQLiteSchema {
  private schemas: SchemaDefinition[] = [];
  private tableNames: string[] = [];

  /**
   * Crea una nueva tabla
   */
  create(tableName: string, builder: (schema: Schema) => void): this {
    const schema = new Schema(tableName);
    builder(schema);
    this.schemas.push({
      tableName,
      columns: schema.getColumns(),
      indexes: schema.getIndexes()
    });
    this.tableNames.push(tableName);
    return this;
  }

  /**
   * Genera migraciones para todas las tablas
   */
  toMigrations(): Migration[] {
    return this.schemas.map((schema, idx) => ({
      version: idx + 1,
      name: schema.tableName,
      sql: this.schemaToSQL(schema),
      timestamp: Date.now()
    }));
  }

  /**
   * Obtiene el SQL de todas las tablas
   */
  toSQL(): string[] {
    return this.schemas.map(schema => this.schemaToSQL(schema));
  }

  /**
   * Obtiene todas las tablas
   */
  getSchemas(): SchemaDefinition[] {
    return this.schemas;
  }

  /**
   * Obtiene una tabla por nombre
   */
  getSchema(tableName: string): SchemaDefinition | undefined {
    return this.schemas.find(s => s.tableName === tableName);
  }

  private schemaToSQL(schema: SchemaDefinition): string {
    const lines: string[] = [];

    for (const col of schema.columns) {
      let line = "";

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

    let sql = `CREATE TABLE ${schema.tableName} (\n${lines.join(",\n")}\n)`;

    if (schema.indexes && schema.indexes.length > 0) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? " UNIQUE" : "";
        sql += `;\nCREATE${uniqueStr} INDEX ${idx.name} ON ${schema.tableName} (${idx.columns.join(", ")})`;
      }
    }

    return sql;
  }
}
