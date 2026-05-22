import type { QueryResult } from "sqlite-napi";
import type { AnySQLiteTable, InferRow } from "../table";
import type { AnyColumn } from "../columns";

// ============================================
// Type Utilities
// ============================================

/** Extract the value type from a Column definition */
export type ColumnValue<T> = T extends AnyColumn ? T["_type"] : never;

// ============================================
// Queryable Interface
// ============================================
export interface Queryable {
    run(sql: string, params?: unknown[]): QueryResult;
    query<T = unknown>(sql: string): PreparedQuery<T>;
}

// ============================================
// Prepared Query
// ============================================

export interface PreparedQuery<T = unknown> {
    all(params?: unknown[]): T[];
    get(params?: unknown[]): T | undefined;
    run(params?: unknown[]): QueryResult;
}

// ============================================
// Transaction Interface
// ============================================

export interface TransactionLike {
    run(sql: string, params?: unknown[]): QueryResult;
    query?<T = unknown>(sql: string): PreparedQuery<T>;
}

// ============================================
// Selected Fields
// ============================================

export type SelectedFields<T extends AnySQLiteTable> = {
    [K in keyof InferRow<T>]: InferRow<T>[K];
};

// ============================================
// Column Name Mapping Cache
// ============================================

export interface ReverseColumnMap {
    jsToDb: Map<string, string>;
    dbToJs: Map<string, string>;
}

export function buildReverseColumnMap(columnMap: Record<string, AnyColumn>): ReverseColumnMap {
    const jsToDb = new Map<string, string>();
    const dbToJs = new Map<string, string>();

    for (const [jsKey, col] of Object.entries(columnMap)) {
        jsToDb.set(jsKey, col.name);
        dbToJs.set(col.name, jsKey);
    }

    return { jsToDb, dbToJs };
}

export function mapRowToJS<T>(row: Record<string, unknown>, reverseMap: ReverseColumnMap): T {
    const mapped: Record<string, unknown> = {};
    for (const [dbName, value] of Object.entries(row)) {
        mapped[reverseMap.dbToJs.get(dbName) || dbName] = value;
    }
    return mapped as T;
}
