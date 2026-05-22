import type { QueryResult } from "sqlite-napi";
import type { AnySQLiteTable, InferRow } from "../table";
import type { AnyColumn } from "../columns";
import { type SQLFragment } from "../sql";
import type { Queryable } from "./types";
import { buildReverseColumnMap, mapRowToJS } from "./types";

export class InsertQueryBuilder<TTable extends AnySQLiteTable> {
    private _onConflict: { action: string; target?: string } | null = null;
    private _values: Partial<InferRow<TTable>>[] = [];
    private _returningColumns: string | null = null;

    constructor(
        private db: Queryable,
        private table: TTable,
    ) { }

    values(row: Partial<InferRow<TTable>>): this;
    values(rows: Partial<InferRow<TTable>>[]): this;
    values(data: Partial<InferRow<TTable>> | Partial<InferRow<TTable>>[]): this {
        if (Array.isArray(data)) {
            this._values = data;
        } else {
            this._values = [data];
        }
        return this;
    }

    onConflictDoNothing(config?: { target?: AnyColumn }): this {
        this._onConflict = { action: "DO NOTHING", target: config?.target?.name };
        return this;
    }

    onConflictDoUpdate(config: {
        target?: AnyColumn;
        set: Partial<InferRow<TTable>>;
        where?: SQLFragment;
    }): this {
        const setClauses = Object.entries(config.set)
            .map(([key, value]) => {
                const col = this.table.columnMap[key] as AnyColumn | undefined;
                const colName = col?.name || key;
                const isSQL = value !== null && value !== undefined && typeof value === "object" && "sql" in value;
                return `${colName} = ${isSQL ? (value as SQLFragment).sql : "?"}`;
            })
            .join(", ");

        this._onConflict = {
            action: `DO UPDATE SET ${setClauses}`,
            target: config.target?.name,
        };
        return this;
    }

    returning(): InsertQueryBuilder<TTable>;
    returning(columns: Record<string, AnyColumn>): InsertQueryBuilder<TTable>;
    returning(columns?: Record<string, AnyColumn>): InsertQueryBuilder<TTable> {
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
        return this._execute(false) as QueryResult;
    }

    all(): InferRow<TTable>[] {
        return this._execute(true) as InferRow<TTable>[];
    }

    get(): InferRow<TTable> | undefined {
        const results = this.all();
        return results[0];
    }

    private _execute(withReturning: boolean): QueryResult | InferRow<TTable>[] {
        if (this._values.length === 0) {
            throw new Error(`INSERT failed: No data provided for table '${this.table.tableName}'`);
        }

        const rows: QueryResult[] = [];
        const results: InferRow<TTable>[] = [];
        const reverseMap = this._getReverseMap();

        for (const rowData of this._values) {
            const keys = Object.keys(rowData as object);
            const dbColumns: string[] = [];
            const values: unknown[] = [];
            const fragments: string[] = [];

            for (const key of keys) {
                const col = this.table.columnMap[key] as AnyColumn | undefined;
                const value = (rowData as Record<string, unknown>)[key];
                if (col) {
                    dbColumns.push(`"${col.name}"`);
                    const isSQL = value !== null && value !== undefined && typeof value === "object" && "sql" in value && "params" in value;
                    if (isSQL) {
                        fragments.push((value as SQLFragment).sql);
                        values.push(...(value as SQLFragment).params);
                    } else {
                        fragments.push("?");
                        values.push(value);
                    }
                }
            }

            if (dbColumns.length === 0) {
                throw new Error(`INSERT failed: No valid columns for table '${this.table.tableName}'`);
            }

            let sqlStr = `INSERT INTO "${this.table.tableName}" (${dbColumns.join(", ")}) VALUES (${fragments.join(", ")})`;

            if (this._onConflict) {
                if (this._onConflict.target) {
                    sqlStr += ` ON CONFLICT("${this._onConflict.target}") ${this._onConflict.action}`;
                } else {
                    sqlStr += ` ON CONFLICT ${this._onConflict.action}`;
                }
            }

            if (withReturning || this._returningColumns) {
                sqlStr += ` RETURNING ${this._returningColumns || "*"}`;
            }

            try {
                if (withReturning || this._returningColumns) {
                    const stmt = this.db.query!(sqlStr);
                    const returned = stmt.all(values.length > 0 ? values : undefined) as InferRow<TTable>[];
                    const mapped = returned.map((r: InferRow<TTable>) => r && typeof r === "object" ? mapRowToJS<InferRow<TTable>>(r, reverseMap) : r);
                    results.push(...mapped);
                } else {
                    const result = this.db.run(sqlStr, values.length > 0 ? values : undefined);
                    rows.push(result);
                }
            } catch (e) {
                throw new Error(`[${this.table.tableName}] INSERT error: ${(e as Error).message}`);
            }
        }

        return withReturning || this._returningColumns ? results : rows[0] as QueryResult;
    }

    private _getReverseMap() {
        const columnMap = this.table.columnMap;
        if (columnMap && typeof columnMap === "object") {
            return buildReverseColumnMap(columnMap as Record<string, AnyColumn>);
        }
        return { jsToDb: new Map<string, string>(), dbToJs: new Map<string, string>() };
    }
}
