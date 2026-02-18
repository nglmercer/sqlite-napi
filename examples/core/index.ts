/**
 * ORM (Prisma-like)
 */
interface ColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  notNull?: boolean;
  defaultValue?: any;
  references?: { table: string; column: string };
}

interface SchemaDefinition {
  tableName: string;
  columns: ColumnDefinition[];
  indexes?: { name: string; columns: string[]; unique?: boolean }[];
}

class Schema {
  private tableName: string;
  private columns: ColumnDefinition[] = [];
  private indexes: { name: string; columns: string[]; unique?: boolean }[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

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

  index(columns: string[], unique?: boolean): this {
    this.indexes.push({ 
      name: `idx_${this.tableName}_${columns.join("_")}`, 
      columns, 
      unique 
    });
    return this;
  }

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
        // Para datetime, usar paréntesis
        if (typeof col.defaultValue === "string" && col.defaultValue.includes("datetime")) {
          line += ` DEFAULT (${col.defaultValue})`;
        } else if (typeof col.defaultValue === "string") {
          line += ` DEFAULT '${col.defaultValue}'`;
        } else {
          line += ` DEFAULT ${col.defaultValue}`;
        }
      }
      if (col.references) {
        line += ` REFERENCES ${col.references.table}(${col.references.column})`;
      }
      
      lines.push(line);
    }

    let sql = `CREATE TABLE ${this.tableName} (\n${lines.join(",\n")}\n)`;

    if (this.indexes) {
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
}

class SQLiteSchema {
  private schemas: SchemaDefinition[] = [];

  create(tableName: string, builder: (schema: Schema) => void): this {
    const schema = new Schema(tableName);
    builder(schema);
    this.schemas.push({
      tableName,
      columns: (schema as any).columns,
      indexes: (schema as any).indexes
    });
    return this;
  }

  toMigrations(): { version: number; sql: string }[] {
    return this.schemas.map((schema, idx) => ({
      version: idx + 1,
      sql: this.schemaToSQL(schema)
    }));
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
        if (typeof col.defaultValue === "string" && col.defaultValue.includes("datetime")) {
          line += ` DEFAULT (${col.defaultValue})`;
        } else if (typeof col.defaultValue === "string") {
          line += ` DEFAULT '${col.defaultValue}'`;
        } else {
          line += ` DEFAULT ${col.defaultValue}`;
        }
      }
      if (col.references) {
        line += ` REFERENCES ${col.references.table}(${col.references.column})`;
      }
      
      lines.push(line);
    }

    let sql = `CREATE TABLE ${schema.tableName} (\n${lines.join(",\n")}\n)`;

    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? " UNIQUE" : "";
        sql += `;\nCREATE${uniqueStr} INDEX ${idx.name} ON ${schema.tableName} (${idx.columns.join(", ")})`;
      }
    }

    return sql;
  }
}
export {
  SQLiteSchema,
  Schema,
  ColumnDefinition,
  SchemaDefinition
}