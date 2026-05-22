import type { QueryResult } from "sqlite-napi";
import type { AnySQLiteTable, InferRow } from "../table";
import type { AnyColumn } from "../columns";
import { type SQLFragment, type OrderByFragment } from "../sql";
import type { Queryable } from "./types";
import { buildReverseColumnMap, mapRowToJS } from "./types";

export class UpdateQueryBuilder<TTable extends AnySQLiteTable> {
    private _setValues: Partial<InferRow<TTable>> = {};
    private _whereConditions: string[] = [];
    private _whereParams: unknown[] = [];
    private _returningColumns: string | null = null;
    private _orderBys: string[] = [];
    private _limit: number | null = null;

    constructor(
        private db: Queryable,
        private table: TTable
    ) { }

    set(values: Partial<InferRow<TTable>>): this {
        this._setValues = values;
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

    orderBy(...columns: (OrderByFragment | AnyColumn)[]): this {
        for (const col of columns) {
            if (typeof col === "object" && "sql" in col && !("params" in col)) {
                this._orderBys.push((col as OrderByFragment).sql);
            } else if (typeof col === "object" && "name" in col) {
                this._orderBys.push(`"${(col as AnyColumn).name}"`);
            }
        }
        return this;
    }

    limit(count: number): this {
        this._limit = count;
        return this;
    }

    returning(): UpdateQueryBuilder<TTable>;
    returning(columns: Record<string, AnyColumn>): UpdateQueryBuilder<TTable>;
    returning(columns?: Record<string, AnyColumn>): UpdateQueryBuilder<TTable> {
        if (columns) {
            const parts: string[] = [];
            for (const [alias, col] of Object.entries(columns)) {
                parts.push(`"${col.name}" AS "${alias}"`);
            }
            this._returningColumns = parts.join(", ");
        } else {
            this._returningColumns = "*";
        }
        return this;
    }

    run(): QueryResult {
        return this._execute() as QueryResult;
    }

    all(): InferRow<TTable>[] {
        return this._execute(true) as InferRow<TTable>[];
    }

    get(): InferRow<TTable> | undefined {
        const results = this.all();
        return results[0];
    }

    private _execute(withReturning: boolean = false): QueryResult | InferRow<TTable>[] {
        const keys = Object.keys(this._setValues);
        if (keys.length === 0) {
            throw new Error(`UPDATE failed: No data provided to 'set' for table '${this.table.tableName}'`);
        }

        const setClauses: string[] = [];
        const params: unknown[] = [];

        for (const key of keys) {
            const col = this.table.columnMap[key] as AnyColumn | undefined;
            const dbCol = col ? `"${col.name}"` : key;
            const value = (this._setValues as Record<string, unknown>)[key];

            if (value !== null && value !== undefined && typeof value === "object" && "sql" in value && "params" in value) {
                setClauses.push(`${dbCol} = ${(value as SQLFragment).sql}`);
                params.push(...(value as SQLFragment).params);
            } else {
                setClauses.push(`${dbCol} = ?`);
                params.push(value);
            }
        }

        let sqlStr = `UPDATE "${this.table.tableName}" SET ${setClauses.join(", ")}`;

        if (this._whereConditions.length > 0) {
            sqlStr += ` WHERE ${this._whereConditions.join(" AND ")}`;
            params.push(...this._whereParams);
        }

        if (this._orderBys.length > 0) {
            sqlStr += ` ORDER BY ${this._orderBys.join(", ")}`;
        }

        if (this._limit !== null) {
            sqlStr += ` LIMIT ${this._limit}`;
        }

        if (withReturning || this._returningColumns) {
            sqlStr += ` RETURNING ${this._returningColumns || "*"}`;
        }

        try {
            if (withReturning || this._returningColumns) {
                const stmt = this.db.query!(sqlStr);
                const returned = stmt.all(params.length > 0 ? params : undefined) as InferRow<TTable>[];
                const reverseMap = this._getReverseMap();
                return returned.map((r: InferRow<TTable>) => r && typeof r === "object" ? mapRowToJS<InferRow<TTable>>(r, reverseMap) : r);
            }

            return this.db.run(sqlStr, params.length > 0 ? params : undefined);
        } catch (e) {
            throw new Error(`UPDATE '${this.table.tableName}' failed: ${(e as Error).message}`);
        }
    }

    private _getReverseMap() {
        const columnMap = this.table.columnMap;
        if (columnMap && typeof columnMap === "object") {
            return buildReverseColumnMap(columnMap as Record<string, AnyColumn>);
        }
        return { jsToDb: new Map<string, string>(), dbToJs: new Map<string, string>() };
    }
}
