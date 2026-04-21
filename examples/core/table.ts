/**
 * Drizzle-style Table Definitions
 * 
 * Provides table creation that matches Drizzle ORM's API
 */

import type { Column, IndexConfig } from "./columns";

// ============================================
// Table Config
// ============================================

export interface TableConfig {
    name: string;
    columns: Column[];
    indexes?: IndexConfig[];
}

// ============================================
// Base Table
// ============================================

export class Table {
    readonly name: string;
    readonly columns: Column[] = [];
    readonly indexes: IndexConfig[] = [];
    readonly primaryKey: Column | null = null;

    constructor(config: TableConfig) {
        this.name = config.name;
        this.columns = config.columns;
        this.indexes = config.indexes ?? [];

        // Find primary key
        for (const col of this.columns) {
            if (col.isPrimaryKey) {
                this.primaryKey = col;
                break;
            }
        }
    }

    getColumn(columnName: string): Column | undefined {
        return this.columns.find(col => col.name === columnName);
    }

    getColumns(): Column[] {
        return this.columns;
    }

    getSQL(): string {
        const columnDefs = this.columns.map(col => col.toSQL()).join(",\n");
        // Use tableName if available (from SQLiteTable), otherwise fall back to name
        const tableName = (this as unknown as { tableName?: string }).tableName || this.name;
        
        let sql = `CREATE TABLE ${tableName} (\n${columnDefs}\n)`;
        
        if (this.indexes.length > 0) {
            const indexSql = this.indexes.map(idx => {
                const uniqueStr = idx.unique ? "UNIQUE " : "";
                const cols = idx.columns.join(", ");
                return `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${idx.name} ON ${tableName} (${cols})`;
            }).join(";\n");
            sql += ";\n" + indexSql;
        }
        
        return sql;
    }
}

// ============================================
// SQLite Table Factory
// ============================================

export type AnySQLiteTable = SQLiteTable<Record<string, Column>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class SQLiteTable<T extends Record<string, any>> extends Table {
    // Store table name in a separate property to avoid conflicts with column names
    readonly tableName: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: unknown;

    // Store column definitions for type inference
    readonly _columns!: T;

    constructor(name: string, columns: T, indexes?: IndexConfig[]) {
        // Store table name BEFORE calling super to avoid conflicts
        const tableName = name;

        super({
            name,
            columns: Object.values(columns) as Column[],
            indexes,
        });

        // Store table name separately after super
        this.tableName = tableName;

        // Create getters for each column (skip if property already exists as own property)
        for (const col of this.columns) {
            // Only define getter if it's not the tableName property
            if (col.name !== 'tableName' && !Object.prototype.hasOwnProperty.call(this, col.name)) {
                Object.defineProperty(this, col.name, {
                    get: () => col,
                    enumerable: true,
                    configurable: false,
                });
            }
        }
    }
}

// ============================================
// Table Builder (Drizzle-style)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sqliteTable<
    T extends string,
    C extends Record<string, Column>
>(
    name: T,
    columns: C,
    extraConfig?: (table: C) => Record<string, IndexConfig>
): SQLiteTable<C> & { name: T } {
    let indexes: IndexConfig[] | undefined;
    if (extraConfig) {
        const config = extraConfig(columns);
        indexes = Object.values(config);
    }

    const table = new SQLiteTable<C>(name, columns, indexes);
    return table as SQLiteTable<C> & { name: T };
}

// ============================================
// Type Inference Helpers
// ============================================

/**
 * Infer the row type from a table
 * Usage: InferRow<typeof usersTable>
 */
export type InferRow<T> = T extends SQLiteTable<infer C>
    ? {
        [K in keyof C]: C[K] extends Column<infer V> ? V : never;
    }
    : never;
