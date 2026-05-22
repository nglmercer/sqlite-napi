/**
 * Drizzle-style SQL Template Helpers
 *
 * Provides helper functions inspired by drizzle-orm for building
 * SQL expressions with parameterized queries.
 *
 * @example
 *   import { eq, and, or, like, desc, sql } from "./core/sql";
 *
 *   // Instead of:
 *   .where("name = ?", ["Alice"])
 *   .orderBy("id", "desc")
 *
 *   // You can write:
 *   .where(eq(usersTable.name, "Alice"))
 *   .orderBy(desc(usersTable.id))
 */

import type { AnyColumn } from "./columns";

// ============================================
// SQL Fragment Types
// ============================================

/**
 * A fragment of SQL with parameterized values
 */
export interface SQLFragment {
    sql: string;
    params: unknown[];
}

/**
 * An order-by expression
 */
export interface OrderByFragment {
    sql: string;
}

/**
 * A column reference - can be a column name string or a Column object
 */
export type ColumnRef = string | AnyColumn;

// ============================================
// Column Name Resolution
// ============================================

/**
 * Resolve a column reference to its database column name
 */
function resolveColumn(ref: ColumnRef): string {
    if (typeof ref === "string") {
        if (ref === "*") return "*";
        if (ref.includes("(")) return ref;
        
        // Handle "table.column desc" by splitting space
        const trimmed = ref.trim();
        const spaceIndex = trimmed.indexOf(' ');
        if (spaceIndex !== -1) {
            const col = trimmed.substring(0, spaceIndex);
            const dir = trimmed.substring(spaceIndex + 1);
            return `${resolveColumn(col)} ${dir}`;
        }

        return ref.split('.').map(part => part === "*" ? "*" : `"${part}"`).join('.');
    }
    if ('table' in ref && ref.table && 'tableName' in ref.table) {
        return `"${ref.table.tableName}"."${ref.name}"`;
    }
    return `"${ref.name}"`;
}

// ============================================
// SQL Template Tag
// ============================================

/**
 * Template literal tag for creating SQL fragments with parameterized values
 *
 * @example
 *   sql`SELECT * FROM users WHERE id = ${userId}`
 *   // => { sql: "SELECT * FROM users WHERE id = ?", params: [userId] }
 *
 *   .where(sql`name = ${name} AND age > ${minAge}`)
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SQLFragment {
    const sqlParts: string[] = [];
    const params: unknown[] = [];

    strings.forEach((str, i) => {
        sqlParts.push(str);
        if (i < values.length) {
            const val = values[i];
            if (val instanceof SQLFragmentImpl) {
                sqlParts.push(val.sql);
                params.push(...val.params);
            } else if (Array.isArray(val) && val.length > 0) {
                // Handle arrays for IN clauses
                sqlParts.push(`(${val.map(() => "?").join(", ")})`);
                params.push(...val);
            } else {
                sqlParts.push("?");
                params.push(val);
            }
        }
    });

    return new SQLFragmentImpl(sqlParts.join(""), params);
}

// ============================================
// SQL Fragment Implementation
// ============================================

class SQLFragmentImpl implements SQLFragment {
    constructor(
        public readonly sql: string,
        public readonly params: unknown[],
    ) { }
}

// ============================================
// Condition Builders
// ============================================

/**
 * Equality condition: column = value
 *
 * @example
 *   .where(eq(usersTable.name, "Alice"))
 *   .where(eq("name", "Alice"))
 */
export function eq(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} = ?`, [value]);
}

/**
 * Not equal condition: column != value
 *
 * @example
 *   .where(ne(usersTable.status, "deleted"))
 */
export function ne(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} != ?`, [value]);
}

/**
 * Greater than condition: column > value
 *
 * @example
 *   .where(gt(usersTable.age, 18))
 */
export function gt(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} > ?`, [value]);
}

/**
 * Greater than or equal condition: column >= value
 *
 * @example
 *   .where(gte(usersTable.age, 18))
 */
export function gte(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} >= ?`, [value]);
}

/**
 * Less than condition: column < value
 *
 * @example
 *   .where(lt(usersTable.createdAt, "2024-01-01"))
 */
export function lt(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} < ?`, [value]);
}

/**
 * Less than or equal condition: column <= value
 *
 * @example
 *   .where(lte(usersTable.createdAt, "2024-01-01"))
 */
export function lte(column: ColumnRef, value: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} <= ?`, [value]);
}

/**
 * LIKE condition: column LIKE pattern
 *
 * @example
 *   .where(like(usersTable.name, "%Alice%"))
 */
export function like(column: ColumnRef, pattern: string): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} LIKE ?`, [pattern]);
}

/**
 * NOT LIKE condition: column NOT LIKE pattern
 *
 * @example
 *   .where(notLike(usersTable.name, "%test%"))
 */
export function notLike(column: ColumnRef, pattern: string): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} NOT LIKE ?`, [pattern]);
}

/**
 * IN condition: column IN (values)
 *
 * @example
 *   .where(inArray(usersTable.id, [1, 2, 3]))
 */
export function inArray(column: ColumnRef, values: unknown[]): SQLFragment {
    if (values.length === 0) {
        return new SQLFragmentImpl("1 = 0", []);
    }
    const placeholders = values.map(() => "?").join(", ");
    return new SQLFragmentImpl(`${resolveColumn(column)} IN (${placeholders})`, values);
}

/**
 * NOT IN condition: column NOT IN (values)
 *
 * @example
 *   .where(notInArray(usersTable.id, [1, 2, 3]))
 */
export function notInArray(column: ColumnRef, values: unknown[]): SQLFragment {
    if (values.length === 0) {
        return new SQLFragmentImpl("1 = 1", []);
    }
    const placeholders = values.map(() => "?").join(", ");
    return new SQLFragmentImpl(`${resolveColumn(column)} NOT IN (${placeholders})`, values);
}

/**
 * IS NULL condition: column IS NULL
 *
 * @example
 *   .where(isNull(usersTable.deletedAt))
 */
export function isNull(column: ColumnRef): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} IS NULL`, []);
}

/**
 * IS NOT NULL condition: column IS NOT NULL
 *
 * @example
 *   .where(isNotNull(usersTable.deletedAt))
 */
export function isNotNull(column: ColumnRef): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} IS NOT NULL`, []);
}

/**
 * BETWEEN condition: column BETWEEN value1 AND value2
 *
 * @example
 *   .where(between(usersTable.age, 18, 65))
 */
export function between(column: ColumnRef, min: unknown, max: unknown): SQLFragment {
    return new SQLFragmentImpl(`${resolveColumn(column)} BETWEEN ? AND ?`, [min, max]);
}

/**
 * Combine multiple conditions with AND
 *
 * @example
 *   .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, 1)))
 *   // => (role = ?) AND (is_active = ?)
 */
export function and(...conditions: (SQLFragment | undefined | false | null)[]): SQLFragment | undefined {
    const validConditions = conditions.filter((c): c is SQLFragment => c != null && c !== false);
    if (validConditions.length === 0) return undefined;
    if (validConditions.length === 1) return validConditions[0];
    return new SQLFragmentImpl(
        validConditions.map(c => `(${c.sql})`).join(" AND "),
        validConditions.flatMap(c => c.params),
    );
}

/**
 * Combine multiple conditions with OR
 *
 * @example
 *   .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "moderator")))
 *   // => (role = ?) OR (role = ?)
 */
export function or(...conditions: (SQLFragment | undefined | false | null)[]): SQLFragment | undefined {
    const validConditions = conditions.filter((c): c is SQLFragment => c != null && c !== false);
    if (validConditions.length === 0) return undefined;
    if (validConditions.length === 1) return validConditions[0];
    return new SQLFragmentImpl(
        validConditions.map(c => `(${c.sql})`).join(" OR "),
        validConditions.flatMap(c => c.params),
    );
}

/**
 * NOT condition: negates a condition
 *
 * @example
 *   .where(not(eq(usersTable.status, "deleted")))
 */
export function not(condition: SQLFragment): SQLFragment {
    return new SQLFragmentImpl(`NOT (${condition.sql})`, condition.params);
}

/**
 * ORDER BY condition builder
 */

/**
 * Ascending order
 *
 * @example
 *   .orderBy(asc(usersTable.name))
 */
export function asc(column: ColumnRef): OrderByFragment {
    return { sql: `${resolveColumn(column)} ASC` };
}

/**
 * Descending order
 *
 * @example
 *   .orderBy(desc(usersTable.createdAt))
 */
export function desc(column: ColumnRef): OrderByFragment {
    return { sql: `${resolveColumn(column)} DESC` };
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if a value is a SQLFragment
 */
export function isSQLFragment(value: unknown): value is SQLFragment {
    return value instanceof SQLFragmentImpl;
}

/**
 * Check if a value is an OrderByFragment
 */
export function isOrderByFragment(value: unknown): value is OrderByFragment {
    return typeof value === "object" && value !== null && "sql" in value && !("params" in value);
}