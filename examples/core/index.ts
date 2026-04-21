/**
 * SQLite NAPI - Drizzle ORM Adapter
 * 
 * A Drizzle-compatible ORM layer for sqlite-napi
 * Provides Drizzle-style table definitions and a driver adapter
 * 
 * @example
 *   import { sqliteNapi } from "./core/drizzle";
 *   import { Database } from "sqlite-napi";
 *   
 *   const db = new Database(":memory:");
 *   const adapter = sqliteNapi(db);
 *   
 *   // Use with Drizzle
 *   const users = await adapter.select(usersTable).from(usersTable);
 * */

export { sqliteNapi, getTableSQL, getTablesSQL } from "./driver";
export { sqliteTable, type SQLiteTable, type InferRow } from "./table";
export {
    integer,
    text,
    real,
    blob,
    numeric,
    boolean,
    date,
    timestamp,
    varchar,
    primaryKey,
    unique,
    notNull,
    default_,
    references,
    index,
} from "./columns";
export type {
    AnyColumn,
    Column,
    SQLiteColumn,
    ColumnDef,
    ColumnBuilderConfig,
} from "./columns";
export type { AnySQLiteTable, TableConfig } from "./table";
