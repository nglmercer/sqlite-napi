import { Database as SqliteNapiDatabase, type QueryResult } from "sqlite-napi";
import type { AnySQLiteTable, InferRow } from "../table";
import type { AnyColumn } from "../columns";
import {
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
  type SQLFragment,
} from "../sql";
import {
  RelationalQueryBuilder,
  type RelationBase,
  type RelationalQueries,
} from "../relations";
import type {
  Queryable,
  TransactionLike,
  PreparedQuery,
  ColumnValue,
} from "./types";
import { SelectQueryBuilder } from "./select";
import { InsertQueryBuilder } from "./insert";
import { UpdateQueryBuilder } from "./update";
import { DeleteQueryBuilder } from "./delete";
import {
  relations as relationsBuilder,
  one as _one,
  many as _many,
} from "../relations";
import type { OrderByFragment } from "../sql";

export interface JoinOptions {
  type: "left" | "inner" | "right" | "full";
  table: string | AnySQLiteTable;
  on: string | SQLFragment;
  params?: unknown[];
  as?: string;
}

export interface QueryOptions {
  select?: string;
  as?: string;
  where?: SQLFragment | string;
  params?: unknown[];
  joins?: JoinOptions[];
  orderBy?: OrderByFragment | string | (OrderByFragment | string)[];
  limit?: number;
  offset?: number;
}
// ============================================
// Main Adapter Interface
// ============================================

export interface SqliteNapiAdapter {
  select(): SelectQueryBuilder;

  select<T extends AnySQLiteTable>(
    table: T,
  ): SelectQueryBuilder<T, InferRow<T>>;

  select<TCols extends Record<string, AnyColumn | SQLFragment>>(
    columns: TCols,
  ): SelectQueryBuilder<
    undefined,
    {
      [K in keyof TCols]: TCols[K] extends AnyColumn
        ? ColumnValue<TCols[K]>
        : unknown;
    }
  >;

  select(
    ...args: (
      | string
      | AnyColumn
      | SQLFragment
      | Record<string, AnyColumn | SQLFragment>
    )[]
  ): SelectQueryBuilder;

  insert<T extends AnySQLiteTable>(table: T): InsertQueryBuilder<T>;
  update<T extends AnySQLiteTable>(table: T): UpdateQueryBuilder<T>;
  delete<T extends AnySQLiteTable>(table: T): DeleteQueryBuilder<T>;

  all<T extends AnySQLiteTable>(
    table: T,
    options?: QueryOptions | SQLFragment | string,
    params?: unknown[],
  ): InferRow<T>[];
  get<T extends AnySQLiteTable>(
    table: T,
    options?: QueryOptions | SQLFragment | string,
    params?: unknown[],
  ): InferRow<T> | undefined;

  query<T = unknown>(sql: string): PreparedQuery<T>;
  relationalQueries: RelationalQueries;
  transaction<TResult>(cb: (tx: SqliteNapiAdapter) => TResult): TResult;

  sync(tables: AnySQLiteTable[]): void;
  execute(sql: string, params?: unknown[]): QueryResult;
  run(sql: string, params?: unknown[]): QueryResult;
  queryRaw<T = unknown>(sql: string): PreparedQuery<T>;

  count(
    table: AnySQLiteTable,
    condition?:
      | SQLFragment
      | { where: string | undefined; params: unknown[] }
      | string,
    params?: unknown[],
  ): number;

  close(): void;
  isClosed(): boolean;

  sql: typeof sql;
  eq: typeof eq;
  and: typeof and;
  or: typeof or;
  like: typeof like;
  desc: typeof desc;
  asc: typeof asc;
  ne: typeof ne;
  gt: typeof gt;
  gte: typeof gte;
  lt: typeof lt;
  lte: typeof lte;
  notLike: typeof notLike;
  inArray: typeof inArray;
  notInArray: typeof notInArray;
  isNull: typeof isNull;
  isNotNull: typeof isNotNull;
  between: typeof between;
  not: typeof not;

  relations: typeof relationsBuilder;
  one: typeof _one;
  many: typeof _many;
}

// ============================================
// Main Driver Factory
// ============================================

export function sqliteNapi(
  db: SqliteNapiDatabase | TransactionLike,
): SqliteNapiAdapter {
  const registeredTables: AnySQLiteTable[] = [];

  // Build relational queries proxy
  const relationalQueries = new Proxy({} as RelationalQueries, {
    get: (target, prop: string) => {
      if (prop in target) {
        return target[prop];
      }

      const table = registeredTables.find(
        (t) =>
          t.tableName === prop || (t as Record<string, unknown>).name === prop,
      );

      if (!table) {
        throw new Error(
          `Table '${prop}' not found. Register it with sync() first.`,
        );
      }

      const rels: Record<string, RelationBase | RelationBase[]> = {};
      const builder = new RelationalQueryBuilder(
        table,
        rels,
        (sqlQuery: string, params?: unknown[]) => {
          if (!("query" in db) || !db.query) {
            throw new Error("Relational queries require query() support");
          }
          return db.query(sqlQuery).all(params || []);
        },
      );
      target[prop] = builder;
      return builder;
    },
  });

  const queryable: Queryable = {
    run(sqlStr: string, params?: unknown[]) {
      return db.run(sqlStr, params);
    },
    query<T = unknown>(sqlStr: string) {
      if (!db.query) {
        throw new Error("Query support is required for this operation");
      }
      const stmt = db.query(sqlStr) as unknown as PreparedQuery<T>;
      return {
        all(params?: unknown[]) {
          return stmt.all(params);
        },
        get(params?: unknown[]) {
          return stmt.get(params);
        },
        run(params?: unknown[]) {
          return stmt.run(params);
        },
      };
    },
  };

  const adapter: SqliteNapiAdapter = {
    // ========== SELECT ==========
    select(
      ...args: (
        | string
        | AnyColumn
        | SQLFragment
        | Record<string, AnyColumn | SQLFragment>
        | AnySQLiteTable
      )[]
    ): SelectQueryBuilder<any, any> {
      // Backward compat: adapter.select(table) => select().from(table)
      if (
        args.length === 1 &&
        args[0] &&
        typeof args[0] === "object" &&
        "columnMap" in args[0]
      ) {
        return new SelectQueryBuilder(queryable).from(
          args[0] as AnySQLiteTable,
        );
      }
      const builder = new SelectQueryBuilder(queryable);
      if (args.length > 0) {
        return (builder.select as (...args: any[]) => any)(...args);
      }
      return builder;
    },

    // ========== INSERT ==========
    insert<T extends AnySQLiteTable>(table: T): InsertQueryBuilder<T> {
      return new InsertQueryBuilder<T>(queryable, table);
    },

    // ========== UPDATE ==========
    update<T extends AnySQLiteTable>(table: T): UpdateQueryBuilder<T> {
      return new UpdateQueryBuilder<T>(queryable, table);
    },

    // ========== DELETE ==========
    delete<T extends AnySQLiteTable>(table: T): DeleteQueryBuilder<T> {
      return new DeleteQueryBuilder<T>(queryable, table);
    },

    // ========== CONVENIENCE ==========
    all<T extends AnySQLiteTable>(
      table: T,
      options?: QueryOptions | SQLFragment | string,
      params?: unknown[],
    ): InferRow<T>[] {
      let q = this.select(table);
      if (!options) return q.all();

      if (
        typeof options === "string" ||
        ("sql" in options && "params" in options)
      ) {
        q = q.where(options as any, params);
      } else {
        const opt = options as QueryOptions;
        if (opt.as) q = q.as(opt.as);
        if (opt.select) q = q.selectRaw(opt.select);

        if (opt.joins) {
          for (const join of opt.joins) {
            const tableRef =
              typeof join.table === "string"
                ? join.table
                : join.table.tableName;
            const joinTable = join.as ? `${tableRef} AS ${join.as}` : tableRef;

            if (join.type === "left")
              q = q.leftJoin(joinTable, join.on as any, join.params);
            else if (join.type === "inner")
              q = q.join(joinTable, join.on as any, join.params);
            else if (join.type === "right")
              q = q.rightJoin(joinTable, join.on as any, join.params);
            else if (join.type === "full")
              q = q.fullJoin(joinTable, join.on as any, join.params);
          }
        }

        if (opt.where) q = q.where(opt.where, opt.params);
        if (opt.orderBy) {
          const orders = Array.isArray(opt.orderBy)
            ? opt.orderBy
            : [opt.orderBy];
          q = q.orderBy(...orders);
        }
        if (opt.limit !== undefined) q = q.limit(opt.limit);
        if (opt.offset !== undefined) q = q.offset(opt.offset);
      }
      return q.all();
    },

    get<T extends AnySQLiteTable>(
      table: T,
      options?: QueryOptions | SQLFragment | string,
      params?: unknown[],
    ): InferRow<T> | undefined {
      let q = this.select(table);
      if (!options) return q.get();

      if (
        typeof options === "string" ||
        ("sql" in options && "params" in options)
      ) {
        q = q.where(options as any, params);
      } else {
        const opt = options as QueryOptions;
        if (opt.as) q = q.as(opt.as);
        if (opt.select) q = q.selectRaw(opt.select);

        if (opt.joins) {
          for (const join of opt.joins) {
            const tableRef =
              typeof join.table === "string"
                ? join.table
                : join.table.tableName;
            const joinTable = join.as ? `${tableRef} AS ${join.as}` : tableRef;

            if (join.type === "left")
              q = q.leftJoin(joinTable, join.on as any, join.params);
            else if (join.type === "inner")
              q = q.join(joinTable, join.on as any, join.params);
            else if (join.type === "right")
              q = q.rightJoin(joinTable, join.on as any, join.params);
            else if (join.type === "full")
              q = q.fullJoin(joinTable, join.on as any, join.params);
          }
        }

        if (opt.where) q = q.where(opt.where, opt.params);
        if (opt.orderBy) {
          const orders = Array.isArray(opt.orderBy)
            ? opt.orderBy
            : [opt.orderBy];
          q = q.orderBy(...orders);
        }
        if (opt.offset !== undefined) q = q.offset(opt.offset);
      }
      return q.get();
    },

    // ========== Relational Queries ==========
    query: queryable.query,
    relationalQueries: relationalQueries,
    // ========== Transactions ==========
    transaction<TResult>(cb: (tx: SqliteNapiAdapter) => TResult): TResult {
      if (!("transaction" in db)) {
        throw new Error("Transactions not supported by this database instance");
      }

      const tx = (db as SqliteNapiDatabase).transaction();

      // Create a simple queryable wrapper for the transaction
      const txQueryable: TransactionLike = {
        run(sqlStr: string, params?: unknown[]) {
          return tx.run(sqlStr, params);
        },
      };
      // Only add query() if tx supports it
      if ("query" in tx && typeof tx.query === "function") {
        txQueryable.query = (sqlStr: string) => (tx as any).query(sqlStr);
      }

      try {
        const txAdapter = sqliteNapi(txQueryable);

        const result = cb(txAdapter);
        tx.commit();
        return result;
      } catch (e) {
        tx.rollback();
        throw e;
      }
    },

    // ========== Schema Sync ==========
    sync(tables: AnySQLiteTable[]): void {
      for (const table of tables) {
        if (!registeredTables.find((t) => t.tableName === table.tableName)) {
          registeredTables.push(table);
        }

        const sql = table.getSQL();
        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          try {
            queryable.run(statement);
          } catch (e) {
            const errmsg = e instanceof Error ? e.message : String(e);
            console.error(statement, errmsg);
          }
        }

        if (queryable.query) {
          try {
            const tableInfo = queryable
              .query(`PRAGMA table_info("${table.tableName}")`)
              .all() as { name: string }[];
            const existingColumns = new Set(tableInfo.map((c) => c.name));

            for (const col of table.getColumns()) {
              if (col.isPrimaryKey || col.isAutoIncrement) continue;
              if (!existingColumns.has(col.name)) {
                try {
                  queryable.run(
                    `ALTER TABLE "${table.tableName}" ADD COLUMN ${col.getDefinitionSQL()}`,
                  );
                } catch (e) {
                  // Column may already exist
                }
              }
            }
          } catch (e) {
            // PRAGMA may not be available
          }
        }
      }
    },

    // ========== Raw Execution ==========
    execute(sqlStr: string, params?: unknown[]): QueryResult {
      return queryable.run(sqlStr, params);
    },

    run(sqlStr: string, params?: unknown[]): QueryResult {
      return queryable.run(sqlStr, params);
    },

    queryRaw<T = unknown>(sqlStr: string): PreparedQuery<T> {
      if (!queryable.query) {
        throw new Error("Query requires Database with query() support");
      }
      const stmt = queryable.query(sqlStr);
      return {
        all(params?: unknown[]) {
          return stmt.all(params) as T[];
        },
        get(params?: unknown[]) {
          return stmt.get(params) as T | undefined;
        },
        run(params?: unknown[]) {
          return stmt.run(params) as QueryResult;
        },
      };
    },

    // ========== Helpers ==========
    count(
      table: AnySQLiteTable,
      condition?: SQLFragment | { where: string; params: unknown[] } | string,
      params?: unknown[],
    ): number {
      if (!queryable.query) {
        throw new Error("Count requires Database with query() support");
      }

      let sqlStr = `SELECT COUNT(*) as count FROM "${table.tableName}"`;
      const finalParams: unknown[] = [];

      if (condition) {
        if (typeof condition === "string") {
          sqlStr += ` WHERE ${condition}`;
          if (params) finalParams.push(...params);
        } else if ("sql" in condition) {
          sqlStr += ` WHERE ${condition.sql}`;
          finalParams.push(...(condition.params || []));
        } else if ("where" in condition && condition.where) {
          sqlStr += ` WHERE ${condition.where}`;
          finalParams.push(...(condition.params || []));
        }
      }

      const res = queryable
        .query(sqlStr)
        .get(finalParams.length > 0 ? finalParams : undefined) as
        | { count: number }
        | undefined;
      return res?.count ?? 0;
    },

    // ========== Database State ==========
    close() {
      if ("close" in db) (db as SqliteNapiDatabase).close();
    },

    isClosed(): boolean {
      if ("isClosed" in db) return (db as SqliteNapiDatabase).isClosed();
      return false;
    },

    // ========== SQL Helpers ==========
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

    // ========== Relations ==========
    relations: relationsBuilder,
    one: _one,
    many: _many,
  };

  return adapter;
}

// ============================================
// Schema SQL Generators
// ============================================

export function getTableSQL(table: AnySQLiteTable): string {
  return table.getSQL();
}

export function getTablesSQL(tables: AnySQLiteTable[]): string {
  return tables.map((t) => t.getSQL()).join(";\n\n");
}

// Re-export everything from sub-modules
export { SelectQueryBuilder } from "./select";
export { InsertQueryBuilder } from "./insert";
export { UpdateQueryBuilder } from "./update";
export { DeleteQueryBuilder } from "./delete";
export type {
  Queryable,
  PreparedQuery,
  TransactionLike,
  ColumnValue,
} from "./types";
