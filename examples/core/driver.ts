/**
 * SQLite NAPI - Drizzle Driver Adapter
 * 
 * Provides a Drizzle-compatible driver for sqlite-napi
 * Allows using sqlite-napi with Drizzle query builder patterns
 */

import { Database as SqliteNapiDatabase, type QueryResult, type Statement, type Transaction } from "../../index";
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

/**
 * Interface for database-like objects that can execute queries
 */
export interface Queryable {
    run(sql: string, params?: unknown): QueryResult;
    query?(sql: string): Statement;
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

    // Transactions
    transaction<T>(cb: (tx: SqliteNapiAdapter) => T, mode?: string): T;

    // Helpers
    count(table: AnySQLiteTable, condition?: { where: string; params: unknown[] }): number;
    pragma(name: string, value?: unknown): any;
    
    // Raw SQL
    execute(sql: string, params?: unknown[]): QueryResult;
    query<T>(sql: string): PreparedQuery<T>;

    // Schema sync
    sync(tables: AnySQLiteTable[]): void;

    // Database state
    close(): void;
    isClosed(): boolean;
    getTables(): string[];
    getMetadata(): any;
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
        private db: Queryable,
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
        const sql = this.build();
        const p = this.getFinalParams(params);
        
        if (this.db.query) {
            return this.db.query(sql).all(p) as T[];
        } else {
            throw new Error("SELECT is not yet supported inside Transaction. Use Database directly or raw SQL.");
        }
    }

    get(params?: unknown[]): T | undefined {
        if (this.db.query) {
            return this.db.query(this.build()).get(this.getFinalParams(params)) as T | undefined;
        }
        throw new Error("SELECT is not yet supported inside Transaction.");
    }

    run(params?: unknown[]): QueryResult {
        return this.db.run(this.build(), this.getFinalParams(params));
    }
}

class InsertBuilder<T> {
    constructor(
        private db: Queryable,
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
        private db: Queryable,
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
        private db: Queryable,
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
 */
export function sqliteNapi(db: SqliteNapiDatabase | Transaction): SqliteNapiAdapter {
    const adapter: SqliteNapiAdapter = {
        select<T extends AnySQLiteTable>(table?: T): SelectBuilder<InferRow<T>> {
            return new SelectBuilder<InferRow<T>>(db as Queryable, table ? table.name : "");
        },

        insert<T extends AnySQLiteTable>(table: T): InsertBuilder<InferRow<T>> {
            return new InsertBuilder<InferRow<T>>(db as Queryable, table.name);
        },

        update<T extends AnySQLiteTable>(table: T): UpdateBuilder<InferRow<T>> {
            return new UpdateBuilder<InferRow<T>>(db as Queryable, table.name);
        },

        delete<T extends AnySQLiteTable>(table: T): DeleteBuilder<InferRow<T>> {
            return new DeleteBuilder<InferRow<T>>(db as Queryable, table.name);
        },

        transaction<T>(cb: (tx: SqliteNapiAdapter) => T, mode?: string): T {
            if (!('transaction' in db)) {
                throw new Error("Nested transactions are only supported via savepoints in raw SQL currently.");
            }
            const tx = (db as SqliteNapiDatabase).transaction(mode);
            try {
                // Wrap the transaction object in a new adapter
                const txAdapter = sqliteNapi(tx);
                const result = cb(txAdapter);
                tx.commit();
                return result;
            } catch (e) {
                tx.rollback();
                throw e;
            }
        },

        count(table: AnySQLiteTable, condition?: { where: string; params: unknown[] }): number {
            if (!('query' in db)) throw new Error("Count requires Database object (query support)");
            
            let sql = `SELECT COUNT(*) as count FROM ${table.name}`;
            const params: unknown[] = condition?.params ?? [];
            if (condition?.where) {
                sql += ` WHERE ${condition.where}`;
            }
            const res = (db as SqliteNapiDatabase).query(sql).get(params) as { count: number } | undefined;
            return res?.count ?? 0;
        },

        pragma(name: string, value?: unknown): any {
            if (!('pragma' in db)) throw new Error("Pragma requires Database object");
            return (db as SqliteNapiDatabase).pragma(name, value);
        },

        execute(sql: string, params?: unknown[]): QueryResult {
            return db.run(sql, params);
        },

        query<T>(sql: string): PreparedQuery<T> {
            if (!('query' in db)) throw new Error("Query requires Database object");
            const stmt = (db as SqliteNapiDatabase).query(sql);
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
                // 1. Create table and indexes
                if ('exec' in db) {
                    (db as SqliteNapiDatabase).exec(table.getSQL());
                } else {
                    db.run(table.getSQL());
                }

                // 2. Check for missing columns and add them (for migrations)
                if ('addColumnIfNotExists' in db) {
                    for (const col of table.getColumns()) {
                        if (col.isPrimaryKey) continue;
                        (db as SqliteNapiDatabase).addColumnIfNotExists(table.name, col.name, col.getDefinitionSQL());
                    }
                }
            }
        },

        close(): void {
            if ('close' in db) (db as SqliteNapiDatabase).close();
        },

        isClosed(): boolean {
            if ('isClosed' in db) return (db as SqliteNapiDatabase).isClosed();
            return false;
        },

        getTables(): string[] {
            if ('getTables' in db) return (db as SqliteNapiDatabase).getTables();
            return [];
        },

        getMetadata(): any {
            if ('getMetadata' in db) return (db as SqliteNapiDatabase).getMetadata();
            return {};
        }
    };

    return adapter;
}

// ============================================
// Schema Migration Helper
// ============================================

export function getTableSQL(table: AnySQLiteTable): string {
    return table.getSQL();
}

export function getTablesSQL(tables: AnySQLiteTable[]): string {
    return tables.map(t => t.getSQL()).join(";\n\n");
}
