/**
 * Drizzle-style Relations Support
 * 
 * Defines relationships between tables with one() and many()
 * and provides a relational query builder
 * 
 * @example
 *   const usersRelations = relations(users, ({ one, many }) => ({
 *     posts: many(posts),
 *     profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
 *   }));
 */

import type { AnySQLiteTable, SQLiteTable } from "./table";
import type { AnyColumn } from "./columns";
import type { SQLFragment, OrderByFragment } from "./sql";

// ============================================
// Relation Types
// ============================================

export type RelationType = "one" | "many";

export interface RelationBase {
    type: RelationType;
    table: AnySQLiteTable;
    fields?: AnyColumn[];
    references?: AnyColumn[];
}

export interface OneRelation extends RelationBase {
    type: "one";
}

export interface ManyRelation extends RelationBase {
    type: "many";
}

export type RelationsMap = Record<string, RelationBase | RelationBase[]>;

// ============================================
// Relation Helpers
// ============================================

export function one(
    table: AnySQLiteTable,
    config?: { fields?: AnyColumn[]; references?: AnyColumn[] }
): OneRelation {
    return {
        type: "one",
        table,
        fields: config?.fields,
        references: config?.references,
    };
}

export function many(
    table: AnySQLiteTable,
    config?: { fields?: AnyColumn[]; references?: AnyColumn[] }
): ManyRelation {
    return {
        type: "many",
        table,
        fields: config?.fields,
        references: config?.references,
    };
}

// ============================================
// Relations Builder
// ============================================

export interface RelationsHelpers {
    one: typeof one;
    many: typeof many;
}

export function relations<T extends AnySQLiteTable>(
    table: T,
    builder: (helpers: RelationsHelpers) => Record<string, RelationBase | RelationBase[]>
): { table: T; relations: Record<string, RelationBase | RelationBase[]> } {
    return {
        table,
        relations: builder({ one, many }),
    };
}

// ============================================
// Relational Query Builder
// ============================================

export interface RelationalQueryConfig {
    where?: SQLFragment;
    orderBy?: OrderByFragment[];
    limit?: number;
    offset?: number;
    columns?: Record<string, boolean>;
    with?: Record<string, RelationalQueryConfig>;
}

export class RelationalQueryBuilder<T extends AnySQLiteTable> {
    constructor(
        private table: T,
        private relations: Record<string, RelationBase | RelationBase[]>,
        private executeQuery: (sql: string, params?: unknown[]) => unknown[]
    ) { }

    findMany(config?: RelationalQueryConfig): InferRelationalRow<T>[] {
        // Build the query with joins for relations
        // For simplicity, start with basic select then add joins for 'with' relations
        let selectSQL = `SELECT "${this.table.tableName}".*`;
        const fromSQL = `FROM "${this.table.tableName}"`;
        const joins: string[] = [];
        const params: unknown[] = [];
        let whereClause = "";
        let orderByClause = "";
        let limitClause = "";
        let offsetClause = "";

        // Handle 'with' relations as joins
        if (config?.with) {
            for (const [relName, relConfig] of Object.entries(config.with)) {
                const relation = this.relations[relName];
                if (!relation) continue;

                const rels = Array.isArray(relation) ? relation : [relation];
                for (const rel of rels) {
                    const alias = `${this.table.tableName}_${rel.table.tableName}`;
                    selectSQL += `, "${alias}".*`;

                    // Build join condition from fields/references
                    if (rel.fields && rel.references && rel.fields.length === rel.references.length) {
                        const conditions = rel.fields.map((f, i) => {
                            const ref = rel.references![i];
                            return `"${this.table.tableName}"."${f.name}" = "${alias}"."${ref!.name}"`;
                        });
                        joins.push(`LEFT JOIN "${rel.table.tableName}" AS "${alias}" ON ${conditions.join(" AND ")}`);
                    } else {
                        // Try to infer from foreign keys
                        const pk = this.table.primaryKey;
                        const relPk = rel.table.primaryKey;
                        if (pk && relPk) {
                            joins.push(`LEFT JOIN "${rel.table.tableName}" AS "${alias}" ON "${alias}"."${relPk.name}" = "${this.table.tableName}"."${pk.name}"`);
                        }
                    }

                    // Apply sub-filters on relation
                    if (relConfig?.where) {
                        if (whereClause) whereClause += " AND ";
                        const relWhere = relConfig.where as SQLFragment;
                        whereClause += `(${relWhere.sql})`;
                        params.push(...relWhere.params);
                    }
                }
            }
        }

        // Main where clause
        if (config?.where) {
            if (whereClause) whereClause += " AND ";
            whereClause += `(${(config.where as SQLFragment).sql})`;
            params.push(...(config.where as SQLFragment).params);
        }
        if (whereClause) whereClause = `WHERE ${whereClause}`;

        // Order by
        if (config?.orderBy && config.orderBy.length > 0) {
            orderByClause = `ORDER BY ${config.orderBy.map(o => o.sql).join(", ")}`;
        }

        // Limit / offset
        if (config?.limit !== undefined) {
            limitClause = `LIMIT ${config.limit}`;
        }
        if (config?.offset !== undefined) {
            offsetClause = `OFFSET ${config.offset}`;
        }

        const finalSQL = `${selectSQL} ${fromSQL} ${joins.join(" ")} ${whereClause} ${orderByClause} ${limitClause} ${offsetClause}`;
        return this.executeQuery(finalSQL, params.length > 0 ? params : undefined) as InferRelationalRow<T>[];
    }

    findFirst(config?: RelationalQueryConfig): InferRelationalRow<T> | undefined {
        const queryConfig: RelationalQueryConfig = {
            ...config,
            limit: 1,
        };
        const results = this.findMany(queryConfig);
        return results[0];
    }
}

export type InferRelationalRow<T> = T extends SQLiteTable<infer _C> ? Record<string, unknown> : never;

// ============================================
// Relational Query Interface
// ============================================

export interface RelationalQueries {
    [tableName: string]: RelationalQueryBuilder<any>;
}

export function buildRelationalQueries(
    tables: AnySQLiteTable[],
    relationsMap: Map<string, Record<string, RelationBase | RelationBase[]>>,
    executeQuery: (sql: string, params?: unknown[]) => unknown[]
): RelationalQueries {
    const queries: RelationalQueries = {};

    for (const table of tables) {
        const rels = relationsMap.get(table.tableName) || {};
        queries[table.tableName] = new RelationalQueryBuilder(table, rels, executeQuery);
    }

    return queries;
}
