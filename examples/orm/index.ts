/**
 * SQLite NAPI - Drizzle-style ORM
 *
 * Full featured ORM with chainable query builders,
 * schema synchronization, relations, and TypeScript type inference.
 *
 * @example
 *   import { Database } from "sqlite-napi";
 *   import { sqliteTable, integer, text, sqliteNapi } from "sqlite-napi/orm";
 *
 *   const users = sqliteTable("users", {
 *     id: integer("id").primaryKey().autoincrement(),
 *     name: text("name").notNull(),
 *   });
 *
 *   const db = new Database(":memory:");
 *   const orm = sqliteNapi(db);
 *   orm.sync([users]);
 *   orm.insert(users).values({ name: "Alice" }).run();
 *   const all = orm.select(users).all();
 */

export {
  sqliteNapi,
  getTableSQL,
  getTablesSQL,
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
} from "./driver/index";
export type {
  SqliteNapiAdapter,
  Queryable,
  PreparedQuery,
  TransactionLike,
  ColumnValue,
  QueryOptions,
  JoinOptions,
} from "./driver/index";

export {
  sql,
  eq,
  and,
  or,
  like,
  desc,
  asc,
  ne,
  gt,
  gte,
  lt,
  lte,
  notLike,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  between,
  not,
} from "./sql";
export type { SQLFragment, OrderByFragment, ColumnRef } from "./sql";

export {
  sqliteTable,
  SQLiteTable,
  Table,
  type InferRow,
  type AnySQLiteTable,
} from "./table";

export {
  integer,
  text,
  varchar,
  real,
  blob,
  boolean,
  numeric,
  date,
  timestamp,
  primaryKey,
  notNull,
  unique,
  index,
  uniqueIndex,
  default_ as defaultVal,
  references,
  type Column,
  type AnyColumn,
  type ColumnDef,
  type IndexConfig,
} from "./columns";

export {
  relations,
  one,
  many,
  RelationalQueryBuilder,
  type RelationBase,
  type OneRelation,
  type ManyRelation,
  type RelationsMap,
} from "./relations";
