/**
 * SQLite NAPI - Drizzle ORM Adapter
 *
 * Full Drizzle ORM-compatible adapter for sqlite-napi
 *
 * This file re-exports from the modular src/core/driver/ structure.
 * See src/core/driver/ for individual implementations.
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

// Re-export SQL helpers for convenience
export { sql, eq, and, or, like, desc, asc, ne, gt, gte, lt, lte, notLike, inArray, notInArray, isNull, isNotNull, between, not } from "./sql";
export type { SQLFragment, OrderByFragment, ColumnRef } from "./sql";