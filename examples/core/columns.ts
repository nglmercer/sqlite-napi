/**
 * Drizzle-style Column Definitions
 * 
 * Provides column builders that match Drizzle ORM's API
 */

import type { Table } from "./table";

// ============================================
// Column Builder Config
// ============================================

export interface ColumnBuilderConfig {
    name: string;
    table?: Table;
    notNull?: boolean;
    primaryKey?: boolean;
    unique?: boolean;
    references?: { table: string; column: string };
    autoIncrement?: boolean;
    default?: unknown;
}

// ============================================
// Base Column
// ============================================

export abstract class Column<T = unknown> {
    readonly name: string;
    readonly table?: Table;
    readonly _notNull: boolean = false;
    readonly _primaryKey: boolean = false;
    readonly _unique: boolean = false;
    readonly _references?: { table: string; column: string };
    readonly _autoIncrement: boolean = false;
    readonly _default: T | undefined = undefined;

    // Added for type inference
    readonly _type!: T;

    constructor(config: ColumnBuilderConfig) {
        this.name = config.name;
        this.table = config.table;
        this._notNull = config.notNull ?? false;
        this._primaryKey = config.primaryKey ?? false;
        this._unique = config.unique ?? false;
        this._references = config.references;
        this._autoIncrement = config.autoIncrement ?? false;
        this._default = config.default as T;
    }

    // Public getters for internal state (renamed to avoid conflict with methods)
    get isNotNull() { return this._notNull; }
    get isPrimaryKey() { return this._primaryKey; }
    get isUnique() { return this._unique; }
    get isAutoIncrement() { return this._autoIncrement; }
    get defaultValue() { return this._default; }

    abstract getSQLType(): string;

    // Chainable methods
    primaryKey(): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), primaryKey: true });
    }

    notNull(): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), notNull: true });
    }

    unique(): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), unique: true });
    }

    default(value: T): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), default: value });
    }

    references(table: string, column: string): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), references: { table, column } });
    }

    autoincrement(): this {
        const Constructor = this.constructor as new (config: ColumnBuilderConfig) => this;
        return new Constructor({ ...this.getConfig(), autoIncrement: true });
    }

    protected getConfig(): ColumnBuilderConfig {
        return {
            name: this.name,
            table: this.table,
            notNull: this._notNull,
            primaryKey: this._primaryKey,
            unique: this._unique,
            references: this._references,
            autoIncrement: this._autoIncrement,
            default: this._default,
        };
    }

    toString(): string {
        return this.name;
    }

    toSQL(): string {
        return `${this.getQuotedName()} ${this.getDefinitionSQL()}`;
    }

    getQuotedName(): string {
        const needsQuoting = /^(order|group|limit|offset|where|select|from|as|on|and|or|not|is|in|like|between|having|distinct|all|any|exists|case|when|then|else|end|join|left|right|inner|outer|cross|natural|using|collate|escape|recurse|with|without|row|replaced)$/i.test(this.name);
        return needsQuoting ? `"${this.name}"` : this.name;
    }

    getDefinitionSQL(): string {
        if (this._primaryKey && this._autoIncrement) {
            return `INTEGER PRIMARY KEY AUTOINCREMENT`;
        }

        let sql = this.getSQLType();

        if (this._primaryKey) sql += " PRIMARY KEY";
        if (this._notNull && !this._primaryKey) sql += " NOT NULL";
        if (this._unique && !this._primaryKey) sql += " UNIQUE";

        if (this._default !== undefined) {
            const defaultVal = this._default;
            if (typeof defaultVal === "string" && (
                defaultVal.startsWith("(") ||
                defaultVal.toUpperCase().startsWith("DATETIME") ||
                defaultVal.toUpperCase().startsWith("CURRENT_") ||
                defaultVal.toUpperCase().startsWith("STRFTIME") ||
                defaultVal.toUpperCase().startsWith("DATE(") ||
                defaultVal.toUpperCase().startsWith("TIME(") ||
                defaultVal.includes("(")
            )) {
                sql += ` DEFAULT ${defaultVal}`;
            } else if (typeof defaultVal === "string") {
                sql += ` DEFAULT '${defaultVal}'`;
            } else if (defaultVal === null) {
                sql += ` DEFAULT NULL`;
            } else {
                sql += ` DEFAULT ${defaultVal}`;
            }
        }

        if (this._references) {
            sql += ` REFERENCES ${this._references.table}(${this._references.column})`;
        }

        return sql;
    }
}

export type AnyColumn = Column<any>;

// ============================================
// Column Types
// ============================================

export class IntegerColumn extends Column<number> {
    getSQLType(): string {
        return "INTEGER";
    }
}

export class TextColumn extends Column<string> {
    getSQLType(): string {
        return "TEXT";
    }
}

export class RealColumn extends Column<number> {
    getSQLType(): string {
        return "REAL";
    }
}

export class BlobColumn extends Column<Uint8Array> {
    getSQLType(): string {
        return "BLOB";
    }
}

export class BooleanColumn extends Column<number> {
    getSQLType(): string {
        return "INTEGER";
    }
}

export class NumericColumn extends Column<number> {
    getSQLType(): string {
        return "NUMERIC";
    }
}

// ============================================
// SQLiteColumn type (alias for compatibility)
// ============================================

export type SQLiteColumn = Column;

// ============================================
// Column Builders - Simple Functions
// ============================================

export const integer = (name: string): IntegerColumn => {
    return new IntegerColumn({ name });
};

export const text = (name: string): TextColumn => {
    return new TextColumn({ name });
};

export const varchar = (name: string, _length?: number): TextColumn => {
    return new TextColumn({ name });
};

export const real = (name: string): RealColumn => {
    return new RealColumn({ name });
};

export const blob = (name: string): BlobColumn => {
    return new BlobColumn({ name });
};

export const boolean = (name: string): BooleanColumn => {
    return new BooleanColumn({ name });
};

export const numeric = (name: string): NumericColumn => {
    return new NumericColumn({ name });
};

export const date = (name: string): TextColumn => {
    return new TextColumn({ name });
};

export const timestamp = (name: string): TextColumn => {
    return new TextColumn({ name });
};

// ============================================
// Column Modifiers (for backward compatibility and helper)
// ============================================

export const primaryKey = <T extends Column>(col: T): T => {
    return col.primaryKey();
};

export const notNull = <T extends Column>(col: T): T => {
    return col.notNull();
};

export const unique = <T extends Column>(col: T): T => {
    return col.unique();
};

export const default_ = <T extends Column, V>(col: T, value: V): T => {
    return col.default(value);
};

export const references = <T extends Column>(col: T, config: { table: string; column: string }): T => {
    return col.references(config.table, config.column);
};

// ============================================
// Index Definitions
// ============================================

export interface IndexConfig {
    name: string;
    columns: string[];
    unique?: boolean;
}

export const index = (name: string, columns: string[], unique?: boolean): IndexConfig => {
    return { name, columns, unique };
};

export const uniqueIndex = (name: string, columns: string[]): IndexConfig => {
    return { name, columns, unique: true };
};

// Type for column definition
export interface ColumnDef {
    name: string;
    type: string;
    notNull?: boolean;
    default?: unknown;
    primaryKey?: boolean;
    unique?: boolean;
    references?: { table: string; column: string };
}
