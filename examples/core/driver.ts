/**
 * SQLite NAPI - Drizzle Driver Adapter
 * 
 * Provides a Drizzle-compatible driver for sqlite-napi
 * Allows using sqlite-napi with Drizzle query builder patterns
 */

import { Database as SqliteNapiDatabase, type QueryResult } from "../../index";
import type { AnySQLiteTable, InferRow } from "./table";

// ============================================
// Query Builder Types
// ============================================

export interface SelectQuery {
    table: string;
    columns?: string[];
    whereClause?: string;
    whereParams?: unknown[];
    orderByClause?: string;
    limitCount?: number;
    offsetCount?: number;
}

// ============================================
// SQLite NAPI Driver
// ============================================

export interface SqliteNapiAdapter {
    // Query execution - now properly typed with table's row type
    select<T extends AnySQLiteTable>(table: T): SelectBuilder<InferRow<T>>;

    // Table operations
    insert<T extends AnySQLiteTable>(table: T): InsertBuilder<InferRow<T>>;
    update<T extends AnySQLiteTable>(table: T): UpdateBuilder<InferRow<T>>;
    delete<T extends AnySQLiteTable>(table: T): DeleteBuilder<InferRow<T>>;

    // Count rows in a table
    count(table: AnySQLiteTable, condition?: { where: string; params: unknown[] }): number;

    // Raw SQL
    execute(sql: string, params?: unknown[]): QueryResult;
    query<T>(sql: string): PreparedQuery<T>;

    // Schema sync
    sync(tables: AnySQLiteTable[]): void;
}

export interface PreparedQuery<T> {
    all(params?: unknown[]): T[];
    get(params?: unknown[]): T | undefined;
    run(params?: unknown[]): QueryResult;
}

// ============================================
// Query Builders
// ============================================

class SelectBuilder<T> {
    private _columns: string = "*";
    private _distinct: boolean = false;
    private _joins: string[] = [];
    private _joinParams: unknown[] = [];
    private _whereConditions: string[] = [];
    private _whereParams: unknown[] = [];
    private _orderBys: string[] = [];
    private _limit: number | null = null;
    private _offset: number | null = null;

    constructor(
        private db: SqliteNapiDatabase,
        private tableName: string
    ) { }

    as(alias: string): this {
        this.tableName += ` ${alias}`;
        return this;
    }

    from(tableName: string): this {
        this.tableName = tableName;
        return this;
    }

    distinct(): this {
        this._distinct = true;
        return this;
    }

    select<K extends keyof T>(...columns: K[]): SelectBuilder<Pick<T, K>> {
        this._columns = columns.join(", ");
        return this as unknown as SelectBuilder<Pick<T, K>>;
    }

    selectRaw(sql: string): this {
        this._columns = sql;
        return this;
    }

    join(tableContent: string, condition: string, params?: unknown[]): this {
        this._joins.push(`JOIN ${tableContent} ON ${condition}`);
        if (params) this._joinParams.push(...params);
        return this;
    }

    leftJoin(tableContent: string, condition: string, params?: unknown[]): this {
        this._joins.push(`LEFT JOIN ${tableContent} ON ${condition}`);
        if (params) this._joinParams.push(...params);
        return this;
    }

    where(condition: string, params?: unknown[]): this {
        this._whereConditions = [condition];
        this._whereParams = params || [];
        return this;
    }

    andWhere(condition: string, params?: unknown[]): this {
        this._whereConditions.push(condition);
        if (params) this._whereParams.push(...params);
        return this;
    }

    orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
        this._orderBys.push(`${column} ${direction.toUpperCase()}`);
        return this;
    }

    limit(count: number): this {
        this._limit = count;
        return this;
    }

    offset(count: number): this {
        this._offset = count;
        return this;
    }

    private build(): string {
        let sql = `SELECT ${this._distinct ? "DISTINCT " : ""}${this._columns} FROM ${this.tableName}`;

        if (this._joins.length > 0) {
            sql += ` ${this._joins.join(" ")}`;
        }

        if (this._whereConditions.length > 0) {
            sql += ` WHERE ${this._whereConditions.join(" AND ")}`;
        }

        if (this._orderBys.length > 0) {
            sql += ` ORDER BY ${this._orderBys.join(", ")}`;
        }

        if (this._limit !== null) {
            sql += ` LIMIT ${this._limit}`;
        }

        if (this._offset !== null) {
            sql += ` OFFSET ${this._offset}`;
        }

        return sql;
    }

    private getFinalParams(extra?: unknown[]): unknown[] {
        return [...this._joinParams, ...this._whereParams, ...(extra || [])];
    }

    all(params?: unknown[]): T[] {
        return this.db.query(this.build()).all(this.getFinalParams(params)) as T[];
    }

    get(params?: unknown[]): T | undefined {
        return this.db.query(this.build()).get(this.getFinalParams(params)) as T | undefined;
    }

    run(params?: unknown[]): QueryResult {
        return this.db.run(this.build(), this.getFinalParams(params));
    }
}

class InsertBuilder<T> {
    constructor(
        private db: SqliteNapiDatabase,
        private tableName: string
    ) { }

    values(v: Partial<T>): InsertBuilder<T> {
        this.rowData = v;
        return this;
    }

    private rowData: Partial<T> = {} as T;

    run(): QueryResult {
        const keys = Object.keys(this.rowData) as (keyof T)[];
        if (keys.length === 0) {
            throw new Error(`Insert failed: No data provided for table '${this.tableName}'`);
        }
        const insertValues = keys.map(k => this.rowData[k]);
        const placeholders = keys.map(() => "?").join(", ");
        const columns = keys.join(", ");

        const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
        try {
            return this.db.run(sql, insertValues);
        } catch (e) {
            throw new Error(`[${this.tableName}] INSERT error: ${(e as Error).message}`);
        }
    }
}

class UpdateBuilder<T> {
    constructor(
        private db: SqliteNapiDatabase,
        private tableName: string
    ) { }

    set(v: Partial<T>): UpdateBuilder<T> {
        this.updateData = v;
        return this;
    }

    private updateData: Partial<T> = {} as T;

    where(condition: string, params?: unknown[]): UpdateBuilder<T> {
        this._whereCondition = condition;
        this._whereParams = params || [];
        return this;
    }

    private _whereCondition: string = "";
    private _whereParams: unknown[] = [];

    run(): QueryResult {
        const keys = Object.keys(this.updateData) as (keyof T)[];
        if (keys.length === 0) {
            throw new Error(`Update failed: No data provided to 'set' for table '${this.tableName}'`);
        }
        const updateValues = keys.map(k => this.updateData[k]);
        const setClause = keys.map(k => `${String(k)} = ?`).join(", ");

        let sql = `UPDATE ${this.tableName} SET ${setClause}`;
        const params: unknown[] = [...updateValues];

        if (this._whereCondition) {
            sql += ` WHERE ${this._whereCondition}`;
            params.push(...this._whereParams);
        }

        try {
            return this.db.run(sql, params);
        } catch (e) {
            throw new Error(`ORM Update for '${this.tableName}' failed: ${(e as Error).message}`);
        }
    }
}

class DeleteBuilder<T> {
    constructor(
        private db: SqliteNapiDatabase,
        private tableName: string
    ) { }

    where(condition: string, params?: unknown[]): DeleteBuilder<T> {
        this._whereCondition = condition;
        this._whereParams = params || [];
        return this;
    }

    private _whereCondition: string = "";
    private _whereParams: unknown[] = [];

    run(): QueryResult {
        let sql = `DELETE FROM ${this.tableName}`;
        const params: unknown[] = [];

        if (this._whereCondition) {
            sql += ` WHERE ${this._whereCondition}`;
            params.push(...this._whereParams);
        }

        try {
            return this.db.run(sql, params);
        } catch (e) {
            throw new Error(`ORM Delete from '${this.tableName}' failed: ${(e as Error).message}`);
        }
    }
}

// ============================================
// Main Driver Factory
// ============================================

/**
 * Create a Drizzle-compatible adapter for sqlite-napi
 * 
 * @example
 *   import { sqliteNapi } from "./core/drizzle";
 *   import { Database } from "sqlite-napi";
 *   
 *   const db = new Database(":memory:");
 *   const adapter = sqliteNapi(db);
 *   
 *   // Select all users
 *   const users = adapter.select(usersTable).all();
 *   
 *   // Insert a user
 *   adapter.insert(usersTable).values({ name: "Alice", email: "alice@example.com" }).run();
 * */
export function sqliteNapi(db: SqliteNapiDatabase): SqliteNapiAdapter {
    return {
        select<T extends AnySQLiteTable>(table?: T): SelectBuilder<InferRow<T>> {
            return new SelectBuilder<InferRow<T>>(db, table ? table.name : "");
        },

        insert<T extends AnySQLiteTable>(table: T): InsertBuilder<InferRow<T>> {
            return new InsertBuilder<InferRow<T>>(db, table.name);
        },

        update<T extends AnySQLiteTable>(table: T): UpdateBuilder<InferRow<T>> {
            return new UpdateBuilder<InferRow<T>>(db, table.name);
        },

        delete<T extends AnySQLiteTable>(table: T): DeleteBuilder<InferRow<T>> {
            return new DeleteBuilder<InferRow<T>>(db, table.name);
        },

        count(table: AnySQLiteTable, condition?: { where: string; params: unknown[] }): number {
            let sql = `SELECT COUNT(*) as count FROM ${table.name}`;
            const params: unknown[] = condition?.params ?? [];
            if (condition?.where) {
                sql += ` WHERE ${condition.where}`;
            }
            return db.query(sql).get(params)?.count as number ?? 0;
        },

        execute(sql: string, params?: unknown[]): QueryResult {
            return db.run(sql, params);
        },

        query<T>(sql: string): PreparedQuery<T> {
            const stmt = db.query(sql);
            return {
                all(params?: unknown[]) {
                    return stmt.all(params) as T[];
                },
                get(params?: unknown[]) {
                    return stmt.get(params) as T | undefined;
                },
                run(params?: unknown[]) {
                    return stmt.run(params);
                },
            };
        },

        sync(tables: AnySQLiteTable[]): void {
            for (const table of tables) {
                // 1. Create table if not exists
                db.createTableIfNotExists(table.getSQL());

                // 2. Check for missing columns and add them
                for (const col of table.getColumns()) {
                    // Skip primary keys as they must be created with the table
                    if (col.primaryKey) continue;

                    db.addColumnIfNotExists(
                        table.name,
                        col.name,
                        col.getDefinitionSQL()
                    );
                }
            }
        },
    };
}

// ============================================
// Schema Migration Helper
// ============================================

/**
 * Generate SQL CREATE TABLE statements from Drizzle tables
 * 
 * @example
 *   import { sqliteNapi, sqliteTable, integer, text } from "./core/drizzle";
 *   
 *   const usersTable = sqliteTable("users", {
 *     id: integer("id").$primaryKey(),
 *     name: text("name"),
 *     email: text("email"),
 *   });
 *   
 *   const sql = getTableSQL(usersTable);
 *   console.log(sql);
 * */
export function getTableSQL(table: AnySQLiteTable): string {
    return table.getSQL();
}

/**
 * Generate SQL for all tables in an array
 * 
 * @example
 *   import { getTablesSQL } from "./core/drizzle";
 *   
 *   const sql = getTablesSQL([usersTable, postsTable]);
 * */
export function getTablesSQL(tables: AnySQLiteTable[]): string {
    return tables.map(t => t.getSQL()).join(";\n\n");
}
