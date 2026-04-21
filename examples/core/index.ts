/**
 * SQLite NAPI - Drizzle ORM Adapter
 * 
 * A Drizzle-compatible ORM layer for sqlite-napi
 * Provides Drizzle-style table definitions and a driver adapter
 * 
 * @example
 *   import { Database } from "sqlite-napi";
 *   import { sqliteNapi, sqliteTable, integer, text } from "./core/index";
 *   
 *   const db = new Database(":memory:");
 *   const adapter = sqliteNapi(db);
 *   
 *   const usersTable = sqliteTable("users", {
 *     id: integer("id").primaryKey(),
 *     name: text("name")
 *   });
 *
 *   adapter.sync([usersTable]);
 *   adapter.insert(usersTable).values({ name: "Alice" }).run();
 * */

export { sqliteNapi, getTableSQL, getTablesSQL } from "./driver";
export type { SqliteNapiAdapter, PreparedQuery } from "./driver";
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
    uniqueIndex,
} from "./columns";
export type {
    AnyColumn,
    Column,
    SQLiteColumn,
    ColumnDef,
    ColumnBuilderConfig,
    IndexConfig,
} from "./columns";
export type { AnySQLiteTable, TableConfig } from "./table";
