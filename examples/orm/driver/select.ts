import type { QueryResult } from "sqlite-napi";
import type { AnySQLiteTable, InferRow } from "../table";
import type { AnyColumn } from "../columns";
import { type SQLFragment, type OrderByFragment } from "../sql";
import type { Queryable, ColumnValue, PreparedQuery, ReverseColumnMap } from "./types";
import { buildReverseColumnMap, mapRowToJS } from "./types";
// ============================================
// Select Query Builder
// ============================================

export class SelectQueryBuilder<
    TTable extends AnySQLiteTable | undefined = undefined,
    TSelected = TTable extends AnySQLiteTable ? InferRow<TTable> : Record<string, unknown>
> {
    protected _fromTable: TTable | undefined;
    protected _columns: string = "*";
    protected _distinct: boolean = false;
    protected _joins: string[] = [];
    protected _joinParams: unknown[] = [];
    protected _whereConditions: string[] = [];
    protected _whereParams: unknown[] = [];
    protected _orderBys: string[] = [];
    protected _limit: number | null = null;
    protected _offset: number | null = null;
    protected _groupBys: string[] = [];
    protected _havingConditions: string[] = [];
    protected _havingParams: unknown[] = [];
    protected _reverseMap: ReverseColumnMap | null = null;
    protected _tableAlias: string | null = null;
    protected _selectParams: unknown[] = [];

    constructor(
        protected db: Queryable
    ) { }

    get reverseMap(): ReverseColumnMap | null {
        return this._reverseMap;
    }

    get whereParams(): unknown[] {
        return this._whereParams;
    }

    get joinParams(): unknown[] {
        return this._joinParams;
    }

    /**
     * Specify the table to select FROM (Drizzle-style)
     */
    from<T extends AnySQLiteTable>(table: T): SelectQueryBuilder<T, InferRow<T>> {
        const builder = new SelectQueryBuilder<T, InferRow<T>>(this.db);
        builder._fromTable = table;
        builder._columns = `"${table.tableName}".*`;
        builder._distinct = this._distinct;
        builder._buildReverseMap(table);
        return builder;
    }

    /**
     * Alias the table (Drizzle-style)
     */
    as(alias: string): SelectQueryBuilder<TTable, TSelected> {
        if (!this._fromTable) {
            throw new Error("SelectQueryBuilder: No table specified. Use .from(tableName) before .as()");
        }
        const builder = new SelectQueryBuilder<TTable, TSelected>(this.db);
        builder._fromTable = this._fromTable;
        builder._tableAlias = alias;

        // If columns are still the default table.*, update them to alias.*
        if (this._columns === `"${(this._fromTable as AnySQLiteTable).tableName}".*`) {
            builder._columns = `"${alias}".*`;
        } else {
            builder._columns = this._columns;
        }

        builder._distinct = this._distinct;
        builder._joins = [...this._joins];
        builder._joinParams = [...this._joinParams];
        builder._whereConditions = [...this._whereConditions];
        builder._whereParams = [...this._whereParams];
        builder._orderBys = [...this._orderBys];
        builder._limit = this._limit;
        builder._offset = this._offset;
        builder._groupBys = [...this._groupBys];
        builder._havingConditions = [...this._havingConditions];
        builder._havingParams = [...this._havingParams];
        builder._reverseMap = this._reverseMap;
        return builder;
    }

    private _buildReverseMap(table: AnySQLiteTable): void {
        const columnMap = table.columnMap;
        if (columnMap && typeof columnMap === "object") {
            this._reverseMap = buildReverseColumnMap(columnMap as Record<string, AnyColumn>);
        }
    }

    /**
          * Specify specific columns (Drizzle-style)
          */
    select<TCols extends Record<string, AnyColumn | SQLFragment>>(
        columns: TCols
    ): SelectQueryBuilder<TTable, { [K in keyof TCols]: TCols[K] extends AnyColumn ? ColumnValue<TCols[K]> : unknown }>;
    select(...columns: string[]): SelectQueryBuilder<TTable, Record<string, unknown>>;
    select(
        ...args: (string | AnyColumn | SQLFragment | Record<string, AnyColumn | SQLFragment>)[]
    ): SelectQueryBuilder<TTable, Record<string, unknown>> {
        const builder = new SelectQueryBuilder<TTable, Record<string, unknown>>(this.db);
        builder._fromTable = this._fromTable;
        builder._distinct = this._distinct;
        builder._reverseMap = this._reverseMap;
        builder._tableAlias = this._tableAlias;
        builder._joins = [...this._joins];
        builder._joinParams = [...this._joinParams];
        builder._whereConditions = [...this._whereConditions];
        builder._whereParams = [...this._whereParams];
        builder._orderBys = [...this._orderBys];
        builder._limit = this._limit;
        builder._offset = this._offset;
        builder._groupBys = [...this._groupBys];
        builder._havingConditions = [...this._havingConditions];
        builder._havingParams = [...this._havingParams];
        builder._selectParams = [...this._selectParams];

        if (args.length > 0) {
            const parts: string[] = [];

            const columns = args.length === 1 ? args[0] : args as (string | AnyColumn | SQLFragment)[];

            // Handle string or array of strings (e.g., "name" or ["name", "age"])
            if (typeof columns === "string") {
                parts.push(this._quoteIdentifier(columns));
            } else if (Array.isArray(columns)) {
                for (const col of columns) {
                    if (typeof col === "string") {
                        parts.push(this._quoteIdentifier(col));
                    } else if (typeof col === "object" && col !== null) {
                        if ("sql" in col && "params" in col) {
                            parts.push(`(${(col as SQLFragment).sql})`);
                            builder._selectParams.push(...((col as SQLFragment).params || []));
                        } else if ("name" in col) {
                            parts.push(this._resolveFullColumnName(col as AnyColumn));
                        }
                    }
                }
            }
            // Handle object format (e.g., { alias: column })
            else if (typeof columns === "object" && columns !== null) {
                for (const [alias, col] of Object.entries(columns)) {
                    if (typeof col === "object" && col !== null && "sql" in col && "params" in col) {
                        parts.push(`(${(col as SQLFragment).sql}) AS "${alias}"`);
                        builder._selectParams.push(...((col as SQLFragment).params || []));
                    } else if (typeof col === "object" && col !== null && "name" in col) {
                        parts.push(`${this._resolveFullColumnName(col as AnyColumn)} AS "${alias}"`);
                    }
                }
            }

            builder._columns = parts.join(", ");
        } else {
            builder._columns = this._fromTable
                ? `"${(this._fromTable as AnySQLiteTable).tableName}".*`
                : "*";
        }
        return builder;
    }

    private _quoteIdentifier(id: string): string {
        if (id === "*") return "*";
        if (id.includes("(")) return id; // Likely a function call or complex expression, don't quote blindly

        // Handle "table.column desc" by splitting space
        const trimmed = id.trim();
        const spaceIndex = trimmed.indexOf(' ');
        if (spaceIndex !== -1) {
            const col = trimmed.substring(0, spaceIndex);
            const dir = trimmed.substring(spaceIndex + 1);
            return `${this._quoteIdentifier(col)} ${dir}`;
        }

        return id.split('.').map(part => part === "*" ? "*" : `"${part}"`).join('.');
    }

    private _resolveFullColumnName(col: AnyColumn): string {
        if (col.table && 'tableName' in col.table) {
            return `"${col.table.tableName}"."${col.name}"`;
        }
        return `"${col.name}"`;
    }

    // ========== Query Modifiers ==========

    distinct(): this {
        this._distinct = true;
        return this;
    }

    private _resolveTableName(table: AnySQLiteTable | SQLFragment | string): string {
        if (typeof table === "string") return table;
        if (typeof table === "object" && table !== null && "tableName" in table) {
            return `"${(table as AnySQLiteTable).tableName}"`;
        }
        if (typeof table === "object" && table !== null && "sql" in table) {
            return `(${(table as SQLFragment).sql})`;
        }
        return "unknown_table";
    }

    join(table: AnySQLiteTable | SQLFragment | string, on: SQLFragment | string, params?: unknown[]): this {
        if (typeof on === "string") {
            this._joins.push(`JOIN ${this._resolveTableName(table)} ON ${on}`);
            if (params) this._joinParams.push(...params);
        } else {
            this._joins.push(`JOIN ${this._resolveTableName(table)} ON ${on.sql}`);
            this._joinParams.push(...(on.params ?? []));
        }
        return this;
    }

    leftJoin(table: AnySQLiteTable | SQLFragment | string, on: SQLFragment | string, params?: unknown[]): this {
        if (typeof on === "string") {
            this._joins.push(`LEFT JOIN ${this._resolveTableName(table)} ON ${on}`);
            if (params) this._joinParams.push(...params);
        } else {
            this._joins.push(`LEFT JOIN ${this._resolveTableName(table)} ON ${on.sql}`);
            this._joinParams.push(...(on.params ?? []));
        }
        return this;
    }

    rightJoin(table: AnySQLiteTable | SQLFragment | string, on: SQLFragment | string, params?: unknown[]): this {
        if (typeof on === "string") {
            this._joins.push(`RIGHT JOIN ${this._resolveTableName(table)} ON ${on}`);
            if (params) this._joinParams.push(...params);
        } else {
            this._joins.push(`RIGHT JOIN ${this._resolveTableName(table)} ON ${on.sql}`);
            this._joinParams.push(...(on.params ?? []));
        }
        return this;
    }

    fullJoin(table: AnySQLiteTable | SQLFragment | string, on: SQLFragment | string, params?: unknown[]): this {
        if (typeof on === "string") {
            this._joins.push(`FULL JOIN ${this._resolveTableName(table)} ON ${on}`);
            if (params) this._joinParams.push(...params);
        } else {
            this._joins.push(`FULL JOIN ${this._resolveTableName(table)} ON ${on.sql}`);
            this._joinParams.push(...(on.params ?? []));
        }
        return this;
    }

    where(condition: SQLFragment | string, params?: unknown[]): this {
        if (!condition) return this;
        if (typeof condition === "string") {
            this._whereConditions = [condition];
            this._whereParams = params || [];
        } else {
            this._whereConditions = [condition.sql];
            this._whereParams = [...(condition.params || [])];
        }
        return this;
    }

    andWhere(condition: SQLFragment | string, params?: unknown[]): this {
        if (!condition) return this;
        if (typeof condition === "string") {
            this._whereConditions.push(condition);
            if (params) this._whereParams.push(...params);
        } else {
            this._whereConditions.push(condition.sql);
            this._whereParams.push(...(condition.params || []));
        }
        return this;
    }

    private _resolveColumnName(col: AnyColumn | string | SQLFragment): string {
        if (typeof col === "string") return this._quoteIdentifier(col);
        if (typeof col === "object" && col !== null && "name" in col) return this._resolveFullColumnName(col as AnyColumn);
        if (typeof col === "object" && col !== null && "sql" in col) return (col as SQLFragment).sql;
        return "";
    }

    groupBy(...columns: (AnyColumn | string | SQLFragment)[]): this {
        for (const col of columns) {
            this._groupBys.push(this._resolveColumnName(col));
        }
        return this;
    }

    having(condition: SQLFragment): this {
        this._havingConditions = [condition.sql];
        this._havingParams = [...condition.params];
        return this;
    }

    orderBy(...args: (OrderByFragment | AnyColumn | string)[]): this {
        let i = 0;
        while (i < args.length) {
            const arg = args[i];
            if (typeof arg === "string") {
                // If the string contains a space, it might be "column desc"
                const parts = arg.trim().split(/\s+/);
                if (parts.length > 1) {
                    const col = parts[0];
                    const dir = parts[1]!.toLowerCase();
                    if (dir === "asc" || dir === "desc") {
                        this._orderBys.push(`${this._quoteIdentifier(col!)} ${dir}`);
                        i += 1;
                        continue;
                    }
                }

                // Check if the next argument is "asc" or "desc"
                if (i + 1 < args.length) {
                    const next = args[i + 1];
                    if (typeof next === "string" && (next.toLowerCase() === "asc" || next.toLowerCase() === "desc")) {
                        this._orderBys.push(`${this._quoteIdentifier(arg)} ${next}`);
                        i += 2;
                        continue;
                    }
                }
                // If no direction specified, default to asc (just the column)
                this._orderBys.push(this._quoteIdentifier(arg));
                i += 1;
            } else if (typeof arg === "object" && arg !== null) {
                if ("sql" in arg && !("params" in arg)) {
                    this._orderBys.push((arg as OrderByFragment).sql);
                } else if ("name" in arg) {
                    this._orderBys.push(this._resolveFullColumnName(arg as AnyColumn));
                }
                i += 1;
            } else {
                // Skip unknown
                i += 1;
            }
        }
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

    selectRaw(columns: string): this {
        this._columns = columns;
        this._reverseMap = null; // because we don't know the structure
        return this;
    }

    $dynamic(): this {
        return this;
    }

    // ========== SQL Generation ==========

    toSQL(): { sql: string; params: unknown[] } {
        if (!this._fromTable) {
            throw new Error("SelectQueryBuilder: No table specified. Use .from(tableName)");
        }

        const tableName = `"${(this._fromTable as AnySQLiteTable).tableName}"`;
        const tableExpr = this._tableAlias ? `${tableName} AS ${this._tableAlias}` : tableName;
        let sqlStr = `SELECT ${this._distinct ? "DISTINCT " : ""}${this._columns} FROM ${tableExpr}`;

        if (this._joins.length > 0) {
            sqlStr += ` ${this._joins.join(" ")}`;
        }
        if (this._whereConditions.length > 0) {
            sqlStr += ` WHERE ${this._whereConditions.join(" AND ")}`;
        }
        if (this._groupBys.length > 0) {
            sqlStr += ` GROUP BY ${this._groupBys.join(", ")}`;
        }
        if (this._havingConditions.length > 0) {
            sqlStr += ` HAVING ${this._havingConditions.join(" AND ")}`;
        }
        if (this._orderBys.length > 0) {
            sqlStr += ` ORDER BY ${this._orderBys.join(", ")}`;
        }
        if (this._limit !== null) {
            sqlStr += ` LIMIT ${this._limit}`;
        }
        if (this._offset !== null) {
            sqlStr += ` OFFSET ${this._offset}`;
        }

        const params = [...this._selectParams, ...this._joinParams, ...this._whereParams, ...this._havingParams];
        return { sql: sqlStr, params };
    }

    // ========== Execution Methods ==========

    all(params?: unknown[]): TSelected[] {
        const { sql: sqlStr, params: defaultParams } = this.toSQL();
        const finalParams = params ?? defaultParams;

        if (!this.db.query) {
            throw new Error("SELECT requires a Database with query() support");
        }

        try {
            const stmt = this.db.query(sqlStr);
            const rows = stmt.all(finalParams.length > 0 ? finalParams : undefined);
            return this._mapResults(rows);
        } catch (e) {
            throw new Error(`SQL Error: ${e instanceof Error ? e.message : String(e)}\nQuery: ${sqlStr}\nParams: ${JSON.stringify(finalParams)}`);
        }
    }

    get(params?: unknown[]): TSelected | undefined {
        const results = this.limit(1).all(params);
        return results.length > 0 ? results[0] : undefined;
    }

    run(params?: unknown[]): QueryResult {
        const { sql: sqlStr, params: defaultParams } = this.toSQL();
        const finalParams = params ?? defaultParams;
        return this.db.run(sqlStr, finalParams.length > 0 ? finalParams : undefined);
    }

    prepare(): PreparedQuery<TSelected> {
        const { sql: sqlStr } = this.toSQL();
        const stmt = this.db?.query!(sqlStr);

        return {
            all: (params?: unknown[]) => {
                const rows = stmt.all(params);
                return this._mapResults(rows);
            },
            get: (params?: unknown[]) => {
                const row = stmt.get(params);
                const results = this._mapResults(row ? [row] : []);
                return results[0] ?? undefined;
            },
            run: (params?: unknown[]) => {
                return stmt.run(params);
            },
        };
    }

    // ========== Internal Helpers ==========

    protected _mapResults(rows: unknown[]): TSelected[] {
        if (!this._reverseMap || rows.length === 0) return rows as TSelected[];

        return rows.map((row): TSelected => {
            if (!row || typeof row !== "object") return row as TSelected;
            return mapRowToJS<TSelected>(row as Record<string, unknown>, this._reverseMap!);
        });
    }
}
