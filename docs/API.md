# API Reference

This document provides a structured, exhaustively detailed reference for every public type, method, and utility exported by `sqlite-napi`.

---

## Exports Overview

```
// Core classes
Database       - Node.js entry point; opens and manages a SQLite connection
Statement      - Pre-compiled SQL statement with get / all / run / values / iter / columns / source / finalize
Transaction    - Transaction handle with commit / rollback / savepoint and inline query methods
Iter           - Row-by-row iterator over a pre-fetched result set

// Result types
QueryResult         - Changes + lastInsertRowid from a statement or exec
TransactionResult   - Changes + lastInsertRowid from commit or rollback

// Interfaces
DatabaseOptions  - Connection options (readonly / create / readwrite)
Migration        - Migration definition for schema versioning
ColumnInfo       - Column metadata returned by Statement.columns()
QueryResult      - { changes, lastInsertRowid }
TransactionResult- { changes, lastInsertRowid }

// Enums / classes
SqliteType     - SqliteType enum (Null / Integer / Real / Text / Blob) with static helpers

// Intermediate classes
AutoincrementInfo   - AUTOINCREMENT feasibility info
ColumnValidation    - Column definition validation result
SchemaValidation    - CREATE TABLE validation result
TypeMapping         - JS-to-SQLite type mapping result
ExpressionCheck     - SQL expression detection result

// Standalone utility functions
getSqliteVersion()                - Returns the linked SQLite version string
getSqliteFunctions()              - Returns array of known SQLite built-in function names
getAutoincrementInfo(type, pk)    - Returns information about AUTOINCREMENT feasibility
validateColumnDefinition(name, type, pk, notnull, has_default, default_val) - Column validation
validateCreateTable(sql)          - CREATE TABLE SQL validation
checkSqlExpression(value)         - SQL expression classification
```

---

## class Database

Represents an active SQLite connection.

**Constructor:**

```ts
new Database(path: string, options?: DatabaseOptions): Database
```

`path` must be a filesystem path or `":memory:"`.

```ts
const db = new Database(":memory:");
const db2 = new Database("./data.db", { readonly: false, create: true, readwrite: true });
```

### Connection Options

```ts
interface DatabaseOptions {
  readonly?: boolean;   // Open in read-only mode
  create?: boolean;     // Create file if it does not exist (default: true)
  readwrite?: boolean;  // Open in read-write mode (default: true)
}
```

If `readonly: true`, the database is opened read-only. `create` and `readwrite` are ignored in that mode.

If both `readonly` and `readwrite` are false, a sensible default of `read-write | create` is used.

---

### query(sql: string): Statement

Prepares and returns a `Statement`. No network round-trip occurs at this point; compilation is deferred until the statement is first executed.

```ts
const stmt: Statement = db.query("SELECT * FROM users WHERE id = $id");
```

Errors from the original SQL are thrown at execution time (`.all()`, `.get()`, `.run()`, `.values()`, `.iter()`), not at `.query()` time. This lets you store the SQL and inspect it later.

---

### run(sql: string, params?: unknown): QueryResult

Executes a one-shot SQL statement and returns a `QueryResult`. Equivalent to `db.query(sql).run(params)`.

```ts
const result: QueryResult = db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
console.log(result.changes);        // 1
console.log(result.lastInsertRowid); // 1

// No parameters
const result2 = db.run("DELETE FROM users WHERE 0");
console.log(result2.changes);   // 0
```

---

### exec(sql: string): QueryResult

Executes one or more SQL statements in a single call using `sqlite3_exec`. Returns a `QueryResult` summarising the last completed statement.

```ts
const result = db.exec(`
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
  CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER, body TEXT);
  INSERT INTO posts (title) VALUES ('Hello');
`);
console.log(result.changes); // 1
```

---

### transaction(mode?: string): Transaction

Begins a transaction and returns a handle.

```ts
const tx = db.transaction();           // DEFERRED
const tx = db.transaction("immediate"); // IMMEDIATE
const tx = db.transaction("exclusive"); // EXCLUSIVE
```

| Mode | Behaviour |
|---|---|
| omitted / `"deferred"` | Defers lock acquisition until the first read or write |
| `"immediate"` | Acquires a write lock immediately |
| `"exclusive"` | Acquires an exclusive lock immediately |
| any other string | Falls back to `DEFERRED` |

---

### transactionFn(mode?: string | null, statements: string[]): QueryResult

Executes a batch of SQL strings inside a single atomic transaction. If any statement fails, the entire batch is rolled back and the error is thrown.

```ts
const result = db.transactionFn("immediate", [
  "INSERT INTO users (name) VALUES ('Alice')",
  "INSERT INTO posts (title) VALUES ('Hello', 1)",
]);
console.log(result.changes); // 2
```

`changes` is the total number of rows changed by all statements in the
transaction, not only by the final statement.

---

### loadExtension(path: string): void

Loads a SQLite extension DLL / shared library. Requires the SQLite library to be compiled with `SQLITE_ENABLE_LOAD_EXTENSION`.

```ts
db.loadExtension("./mod_spatialite.so");
```

---

### serializeBinary(): Buffer

Serialises the entire database (all pages) to a `Buffer` using SQLite's native `sqlite3_serialize()` API.

```ts
const buffer: Buffer = db.serializeBinary(); // Buffer of raw bytes

// Persist to disk or transfer over the network
fs.writeFileSync("backup.bin", buffer);

// Restore in another connection
const db2 = new Database(":memory:");
db2.deserializeBinary(fs.readFileSync("backup.bin"));
```

---

### deserializeBinary(data: Buffer, readOnly?: boolean): void

Loads a serialised database buffer into the current connection's `main` schema. The `readOnly` flag, when `true`, opens the deserialised content as read-only.

```ts
const data = fs.readFileSync("backup.bin");
const db2 = new Database(":memory:");
db2.deserializeBinary(data, false);
```

---

### serialize(): string

Serialises the database schema (DDL only: CREATE TABLE, CREATE INDEX, etc.) to a semicolon-separated SQL string.

```ts
const sql: string = db.serialize();
// => "CREATE TABLE users (...);\nCREATE TABLE posts (...);\nCREATE INDEX ...;"
```

---

### deserialize(sql: string): void

Executes a schema SQL dump against the current connection using `sqlite3_exec`.

```ts
const db2 = new Database(":memory:");
const sql = db.serialize();
db2.deserialize(sql); // Recreates the schema in db2
```

---

### getTables(): string[]

Returns an alphabetically-sorted array of user-defined table names (excludes `sqlite_` internal tables).

```ts
const tables: string[] = db.getTables();
// ["comments", "posts", "users"]
```

Equivalent SQL: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`.

---

### getColumns(tableName: string): unknown[]

Returns column metadata for `tableName`. Each entry is a plain object with:

| Property | Type | Description |
|---|---|---|
| `cid` | `number` | Zero-based column ordinal |
| `name` | `string` | Column name |
| `type` | `string` | Declared SQLite type name (e.g. `"INTEGER"`, `"TEXT"`) |
| `notnull` | `boolean` | `true` if column has `NOT NULL` |
| `dflt_value` | `string \| null` | Default value as stored in the schema, or `null` |
| `pk` | `number` | 0 = not part of PRIMARY KEY; 1+ = position in composite key |

```ts
const columns = db.getColumns("users");
```

Equivalent SQL: `PRAGMA table_info(users)`.

---

### getIndexes(tableName: string): unknown[]

Returns index metadata for `tableName`.

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Index name |
| `unique` | `boolean` | `true` if the index enforces uniqueness |
| `origin` | `string` | `"c"` = `CREATE INDEX`, `"u"` = implicit UNIQUE constraint, `"pk"` = PRIMARY KEY |
| `partial` | `boolean` | `true` if it is a partial index |
| `columns` | `string[]` | Ordered list of indexed column names |

```ts
const indexes = db.getIndexes("users");
```

Equivalent SQL: `PRAGMA index_list(users)` + `PRAGMA index_info(index_name)`.

---

### getTableSql(tableName: string): string | null

Returns the exact `CREATE TABLE …` SQL string for `tableName`, or `null` if the table does not exist.

```ts
const sql = db.getTableSql("users");
// => "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"

const missing = db.getTableSql("ghosts"); // null
```

---

### exportSchema(): string

Returns all schema objects (CREATE TABLE, CREATE INDEX, CREATE TRIGGER, CREATE VIEW) for the database as a single semicolon-delimited SQL string.

```ts
const sql: string = db.exportSchema();
```

Equivalent SQL: `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY ...`.

---

### tableExists(tableName: string): boolean

Returns `true` if `tableName` exists in the database.

```ts
const ok: boolean = db.tableExists("users");   // true
const miss: boolean = db.tableExists("nope");   // false
```

---

### getMetadata(): unknown

Returns a JSON snapshot of the database.

```ts
const meta = db.getMetadata();
// {
//   table_count: 3,
//   index_count: 2,
//   page_count: 42,
//   page_size: 4096,
//   db_size_bytes: 172032,
//   sqlite_version: "3.45.0"
// }
```

| Property | Type | Description |
|---|---|---|
| `table_count` | `number` | Number of user tables |
| `index_count` | `number` | Number of user indexes |
| `page_count` | `number` | SQLite page count of the file |
| `page_size` | `number` | Page size in bytes |
| `db_size_bytes` | `number` | `page_count × page_size` |
| `sqlite_version` | `string` | Linked SQLite version |

Equivalent SQL: `PRAGMA page_count`, `PRAGMA page_size`, `SELECT sqlite_version()`.

---

### createTableIfNotExists(sql: string): boolean

Parses the table name from the provided `CREATE TABLE …` SQL, checks whether it already exists, and executes the statement only if it does not.

```ts
const created: boolean = db.createTableIfNotExists(
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
);
// true  → table was created
// false → table already existed; SQL was not executed
```

---

### addColumnIfNotExists(tableName: string, columnName: string, columnDef: string): boolean

Adds a column via `ALTER TABLE … ADD COLUMN` only if the column is not already present.

```ts
const added: boolean = db.addColumnIfNotExists("users", "email", "TEXT NOT NULL DEFAULT ''");
// true  → column was added
// false → column already existed
```

---

### runSafe(sql: string, ignoreErrors?: string[]): boolean

Executes SQL and swallows matching errors.

- Returns `true` on success.
- Returns `false` if the error message contains any `ignoreErrors` string.
- Throws if the error message does not match any entry in `ignoreErrors`.

```ts
// Return false instead of throwing on "already exists"
const ok: boolean = db.runSafe(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)",
  ["already exists"]
);
// => true
```

---

### getSchemaVersion(): number

Returns the current schema version stored in the `_schema_version` table. Returns `0` if the table has not been created yet.

```ts
const version: number = db.getSchemaVersion();
```

---

### setSchemaVersion(version: number): void

Upserts a version row in the `_schema_version` table, creating the table if necessary.

```ts
db.setSchemaVersion(2);
```

---

### initSchema(schema: string, version?: number, description?: string): number

Executes the full schema SQL inside an atomic transaction, then records the version in `_schema_version`. Never throws on re-runs if the schema already exists.

```ts
const schema = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
`;
const version: number = db.initSchema(schema, 1, "Initial schema");
// => 1
```

---

### migrate(migrations: Migration[], targetVersion?: number): number

Applies pending migrations sequentially, up to `targetVersion` or the last migration if omitted. All migration SQL runs inside a single transaction.

```ts
const migrations = [
  { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", description: "Users table" },
  { version: 2, sql: "ALTER TABLE users ADD COLUMN email TEXT", description: "Email column" },
  { version: 3, sql: "CREATE INDEX users_email_idx ON users(email)", description: "Email index" },
];

const newVersion: number = db.migrate(migrations);
// => 3

const toV2 = db.migrate(migrations, 2);
// => 2
```

### interface Migration

```ts
interface Migration {
  version: number;          // Sequential version number; must be > current version
  sql: string;              // SQL statements for this migration
  description?: string;     // Optional human-readable description
}
```

---

### createFunction(name: string, func: Function): void

Registers a custom SQL scalar function with the given `name`. The supplied JavaScript callback is currently ignored; the registered native stub always returns `NULL`. JavaScript callbacks are a planned enhancement.

```ts
db.createFunction("double", (val: unknown) => null);
```

> Warning: The function body returns `NULL` until async callback backpressure handling is implemented. Use for migration / stub scaffolding only today.

---

### createCollation(name: string, compareFn: Function): void

Registers a custom collation for sorting text values. The comparison function is a stub that delegates to default Rust string comparison. JavaScript callbacks with locale-aware comparison are a planned enhancement.

> Warning: the JavaScript comparator is currently ignored. The registered
> collation uses Rust's normal lexicographic string comparison until a safe
> JavaScript callback bridge is implemented.

```ts
// The comparator is reserved for future callback support.
db.createCollation("nocase_ci", (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

// Use it in a table definition
db.run(`CREATE TABLE users (name TEXT COLLATE nocase_ci)`);
```

---

### pragma(name: string, value?: unknown): unknown

Read or write SQLite PRAGMA values.

```ts
// Read
const cacheSize: unknown = db.pragma("cache_size");
// => "-64000"

// Write (value passed at call time)
db.pragma("journal_mode", "WAL");
const mode = db.pragma("journal_mode");
// => "wal"

// Write integer PRAGMAs
db.pragma("page_size", 4096);

// Write boolean flags
db.pragma("foreign_keys", "ON");

// Read other PRAGMAs
const mmapSize = db.pragma("mmap_size");
const busyTimeout = db.pragma("busy_timeout");
```

For PRAGMAs where the "get" call returns multiple rows, the result is an `unknown` (often an array). For single-value PRAGMAs, the scalar is returned as-is.

---

### close(): void

Flushes the WAL, closes the connection, and marks the object as closed. No-op if called more than once.
All database operations, including statements created before closing, throw
after the connection has been closed.

```ts
const db = new Database("./app.db");
db.close();
db.isClosed(); // true
```

---

### isClosed(): boolean

Returns `true` after `close()` has been called.

```ts
db.isClosed(); // false
db.close();
db.isClosed(); // true
```

---

### inTransaction(): boolean

Returns `true` if the connection currently holds an open transaction (i.e. the last `BEGIN` was not followed by `COMMIT` / `ROLLBACK`).

```ts
db.inTransaction();          // false
const tx = db.transaction();
db.inTransaction();          // true
tx.commit();
db.inTransaction();          // false
```

---

### filename(): string

Returns the path or special identifier (`":memory:"`) used to open the database.

```ts
db.filename(); // ":memory:"
```

---

## class Statement

Returned by `Database.query()`. All methods that execute the SQL are async-safe; `source()` and `toString()` return the cached SQL string without touching the connection.

### all(params?: unknown): any

Returns all matching rows as a JSON array of objects keyed by column name.

```ts
const stmt: Statement = db.query("SELECT * FROM users WHERE role = ?");

// No parameters
const rows: any = stmt.all();
// => [{ id: 1, name: "Alice", role: "admin" }, { id: 2, name: "Bob", role: "admin" }]

// Positional parameters
const admins = stmt.all(["admin"]);

// Named parameters (key is normalised to $key internally)
const result = stmt.all({ role: "admin", active: 1 });
```

### get(params?: unknown): any

Returns the first matching row as an object, or `null` if no rows match.

```ts
const stmt: Statement = db.query("SELECT * FROM users WHERE id = ?");
const user: any | null = stmt.get([1]);

if (user !== null) {
  console.log(user.name); // "Alice"
}

// null when no row matches
const missing: null = stmt.get([9999]);
```

### run(params?: unknown): QueryResult

Executes the statement and returns a `QueryResult` without returning any rows.

```ts
const stmt: Statement = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
const result: QueryResult = stmt.run(["Alice", "alice@example.com"]);

console.log(result.changes);        // 1
console.log(result.lastInsertRowid); // 1
```

### values(params?: unknown): any

Returns all matching rows as an array of arrays (column-order values).

```ts
const stmt: Statement = db.query("SELECT id, name FROM users ORDER BY id");
const rows: any = stmt.values([[]]);
// => [[1, "Alice"], [2, "Bob"], [3, "Charlie"]]
```

### finalize(): void

Releases the prepared statement. In the current implementation the connection is held by shared reference, so this is a no-op. Provided for API compatibility with `bun:sqlite`.

```ts
const stmt: Statement = db.query("SELECT * FROM users");
stmt.finalize();
```

### iter(params?: unknown): Iter

Materialises all rows up front and returns an `Iter` for row-by-row consumption.

```ts
const stmt: Statement = db.query("SELECT * FROM users WHERE role = ?");
const iter: Iter = stmt.iter(["admin"]);
```

### columns(): ColumnInfo[]

Returns column metadata for the prepared statement. Each entry has a `name` (column name) and `type` (empty string — the driver does not currently return per-column SQLite type metadata from `sqlite3_column_origin_name` / `sqlite3_column_decltype`).

```ts
const stmt: Statement = db.query("SELECT id, name, email FROM users");
const cols: ColumnInfo[] = stmt.columns();
// => [{ name: "id",    type: "" },
//      { name: "name",  type: "" },
//      { name: "email", type: "" }]
```

### source(): string

Returns the original SQL string of the statement.

```ts
const sql: string = stmt.source();
// => "SELECT * FROM users WHERE id = ?"
```

### toString(): string

Alias for `source()`.

```ts
console.log(stmt.toString()); // "SELECT * FROM users WHERE id = ?"
```

---

## class Iter

Returned by `Statement.iter()`. Rows are pre-fetched; `next()` / `nextValues()` / `hasMore()` / `all()` / `reset()` operate on the in-memory buffer without re-querying.

### next(): any | null

Returns the next row as an object, or `null` when there are no more rows.

```ts
const iter: Iter = stmt.iter([]);
while (iter.hasMore()) {
  const row: any = iter.next();
  console.log(row.name);
}
```

### nextValues(): any | null

Returns the next row as an array ordered by column position, or `null` when exhausted.

```ts
const values: any | null = iter.nextValues();
// => [1, "Alice", "admin"]
```

### hasMore(): boolean

Returns `true` while unread rows remain in the buffer.

```ts
iter.hasMore(); // true  (rows remain)
iter.next();
// iter.hasMore(); // false
```

### all(): any

Returns all remaining rows as a JSON array.

```ts
const rest: any = iter.all();
// [{ id: 2, ... }, { id: 3, ... }]
iter.hasMore(); // false
```

### reset(): void

Resets the internal pointer to the first row. Subsequent calls to `next()` re-read from the beginning.

```ts
const iter: Iter = stmt.iter([]);
iter.next();      // first row
iter.reset();
iter.next();      // first row again
```

---

## class Transaction

Returned by `Database.transaction()`. Tracks whether it is a top-level transaction or a savepoint.

### run(sql: string, params?: unknown): QueryResult

Executes a single SQL statement inside the transaction scope. Only supports positional parameters.

```ts
const tx: Transaction = db.transaction();
tx.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
```

### commit(): TransactionResult

Commits the transaction (or releases the savepoint if this `Transaction` was created via `savepoint()`).

```ts
const result: TransactionResult = tx.commit();
// { changes: 1, lastInsertRowid: 1 }
```

`changes` is the total number of rows changed since this transaction or
savepoint was created.

### rollback(): TransactionResult

Rolls back the active transaction (or rolls back to the savepoint if this `Transaction` was created via `savepoint()`).

```ts
const result: TransactionResult = tx.rollback();
// { changes: 0, lastInsertRowid: 0 }
```

For a rollback, `changes` is measured immediately before the rollback and
describes the rows that were changed and then discarded.

### savepoint(name: string): Transaction

Creates a named savepoint inside the current transaction. Returns a child `Transaction` scoped to the savepoint.

```ts
const tx: Transaction = db.transaction();

const sp: Transaction = tx.savepoint("after_users");
// Call sp.commit() to release the savepoint
// Call sp.rollback() to roll back TO the savepoint and release it
```

### query(sql: string): Statement

Returns a `Statement` bound to this transaction's connection.

```ts
const tx: Transaction = db.transaction();
const stmt: Statement = tx.query("SELECT * FROM users WHERE id = ?");
```

### all(sql: string, params?: unknown): any

Shortcut — prepare, execute, and return all rows as objects, all within the transaction.

```ts
const tx: Transaction = db.transaction();
const users = tx.all("SELECT * FROM users WHERE role = ?", ["admin"]);
tx.commit();
```

Return type: positional params only, returning `any[]`.

### get(sql: string, params?: unknown): any | null

Shortcut — prepare, execute, and return the first row as an object, or `null`.

```ts
const tx: Transaction = db.transaction();
const user = tx.get("SELECT * FROM users WHERE id = ?", [1]); // object | null
```

### values(sql: string, params?: unknown): any

Shortcut — prepare, execute, and return all rows as arrays.

```ts
const tx: Transaction = db.transaction();
const rows = tx.values("SELECT id, name FROM users");
```

### iter(sql: string, params?: unknown): Iter

Shortcut — prepare, execute, and return an `Iter`.

```ts
const tx: Transaction = db.transaction();
const iter: Iter = tx.iter("SELECT * FROM users WHERE role = ?", ["admin"]);
```

### exec(sql: string): QueryResult

Execute a batch of SQL statements inside the transaction scope without returning rows.

```ts
const tx: Transaction = db.transaction();
tx.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL");
```

---

## Parameter Binding

Every method that accepts `params` follows the same pattern.

### Positional parameters

Pass an array: `stmt.run(["Alice", 30])`, `stmt.get([1])`.

```ts
db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);
```

### Named parameters

Pass a plain object. Keys are normalised to `$key` / `:key` / `@key` format if they do not already have a prefix.

```ts
// All three are equivalent
stmt.all({ $role: "admin", active: 1 });
stmt.all({ role: "admin", active: 1 });
stmt.all({ ":role": "admin", "@active": 1 });
```

SQL matching:

```ts
const stmt = db.query("SELECT * FROM users WHERE role = $role AND active = $active");
stmt.all({ role: "admin", active: 1 });
```

---

## Type System

Results are returned as plain JavaScript objects keyed by column name. The internal conversion layer maps native SQLite types to JSON values:

| SQLite Type | JavaScript type |
|---|---|
| NULL | `null` |
| INTEGER | `number` |
| REAL | `number` |
| TEXT | `string` |
| BLOB | `string` (base64-encoded) |

Boolean values are stored as `0` / `1` integers in SQLite. You can coerce them to `boolean` in application code:

```ts
const row = stmt.get([1]);
const isActive = Boolean(row.active); // or row.active === 1
```

---

## enum SqliteType

The five core SQLite storage classes.

```ts
enum SqliteType {
  Null,    // 0 — NULL
  Integer, // 1 — INTEGER
  Real,    // 2 — REAL
  Text,    // 3 — TEXT
  Blob,    // 4 — BLOB
}
```

### SqliteType.supported_types(): string[]

Returns `["NULL", "INTEGER", "REAL", "TEXT", "BLOB"]`.

```ts
SqliteType.supported_types(); // ["NULL", "INTEGER", "REAL", "TEXT", "BLOB"]
```

### SqliteType.is_valid_type(name: string): boolean

Returns `true` for any SQLite-recognised type name (including aliases).

```ts
SqliteType.is_valid_type("INTEGER");   // true
SqliteType.is_valid_type("VARCHAR");   // true  ← VARCHAR is a TEXT alias
SqliteType.is_valid_type("FOO");       // false
```

### SqliteType.from_type_name(name: string): TypeMapping

Maps a JS/TS type constructor name or a native SQLite type name to a `TypeMapping`.

```ts
SqliteType.from_type_name("String");  // { sqliteType: "TEXT",    valid: true }
SqliteType.from_type_name("Number");  // { sqliteType: "INTEGER", valid: true }
SqliteType.from_type_name("Boolean"); // { sqliteType: "INTEGER", valid: true }
SqliteType.from_type_name("Date");    // { sqliteType: "INTEGER", valid: true }
SqliteType.from_type_name("Buffer");  // { sqliteType: "BLOB",    valid: true }
SqliteType.from_type_name("UUID");    // { sqliteType: "TEXT",    valid: true }
SqliteType.from_type_name("VARCHAR"); // { sqliteType: "VARCHAR", valid: true }  ← SQLite alias
SqliteType.from_type_name("FOO");     // { sqliteType: "TEXT",    valid: false }
```

### interface TypeMapping

```ts
interface TypeMapping {
  sqliteType: string;  // Mapped SQLite type name
  valid: boolean;      // Whether the input was a recognised type
}
```

---

## class ColumnInfo

Returned by `Statement.columns()`.

```ts
class ColumnInfo {
  name: string;
  type: string;
}
```

| Property | Description |
|---|---|
| `.name` | Column name as reported by SQLite |
| `.type` | Declared type name — currently an empty string |

---

## interface ColumnValidation

Returned by `validateColumnDefinition()`.

```ts
interface ColumnValidation {
  valid: boolean;
  issues: string[];
}
```

---

## interface SchemaValidation

Returned by `validateCreateTable()`.

```ts
interface SchemaValidation {
  valid: boolean;
  issues: string[];
  warnings: string[];
}
```

---

## class ExpressionCheck

Returned by `checkSqlExpression()`.

```ts
class ExpressionCheck {
  isExpression: boolean;
  expressionType?: string;  // "function_call" | "parenthesized_expression" | "keyword"
}
```

---

## class AutoincrementInfo

Returned by `getAutoincrementInfo()`.

```ts
class AutoincrementInfo {
  requiresIntegerPrimaryKey: boolean;
  canUseAutoincrement: boolean;
  explanation: string;
}
```

---

## Standalone Function Reference

### getSqliteVersion(): string

Returns the full linked SQLite version string.

```ts
const version: string = getSqliteVersion();
// e.g. "3.45.2"
```

---

### getSqliteFunctions(): string[]

Returns every known SQLite built-in function name, across date/time, string, numeric, type-conversion, aggregate, and JSON categories.

```ts
const names: string[] = getSqliteFunctions();
// [
//   date, time, datetime, julianday, strftime,
//   length, lower, upper, trim, ltrim, rtrim, substr, replace,
//   instr, printf, quote, glob, like,
//   abs, round, random, randomblob, zeroblob,
//   cast, typeof, coalesce, ifnull, nullif,
//   count, sum, avg, total, group_concat,
//   json, json_array, json_object, json_extract, json_valid,
//   hex, quote, zeroblob, unicode, char,
// ]
```

The category breakdown:

| Category | Functions |
|---|---|
| Date / Time | `date`, `time`, `datetime`, `julianday`, `strftime` |
| String | `length`, `lower`, `upper`, `trim`, `ltrim`, `rtrim`, `substr`, `replace`, `instr`, `printf`, `quote`, `glob`, `like`, `printf` |
| Numeric | `abs`, `round`, `random`, `randomblob`, `zeroblob` |
| Type conversion | `cast`, `typeof`, `coalesce`, `ifnull`, `nullif` |
| Aggregate | `count`, `sum`, `avg`, `total`, `group_concat` |
| JSON | `json`, `json_array`, `json_object`, `json_extract`, `json_valid` |
| Other | `hex`, `quote`, `zeroblob`, `unicode`, `char` |

---

### getAutoincrementInfo(columnType: string, isPrimaryKey: boolean): AutoincrementInfo

Determines whether `AUTOINCREMENT` can be used and returns a human-readable explanation.

```ts
const ok = getAutoincrementInfo("INTEGER", true);
// { requiresIntegerPrimaryKey: true, canUseAutoincrement: true,
//   explanation: "INTEGER PRIMARY KEY AUTOINCREMENT will generate sequential IDs." }

const badType = getAutoincrementInfo("TEXT", true);
// { requiresIntegerPrimaryKey: true, canUseAutoincrement: false,
//   explanation: "AUTOINCREMENT only works with INTEGER type (not TEXT, REAL, or BLOB)." }

const notPk = getAutoincrementInfo("INTEGER", false);
// { requiresIntegerPrimaryKey: true, canUseAutoincrement: false,
//   explanation: "AUTOINCREMENT can only be used on PRIMARY KEY columns" }
```

---

### validateColumnDefinition(name, type, isPrimaryKey, isNotNull, hasDefault, defaultValue?): ColumnValidation

Validates a column definition and returns any issues. Checks for: empty names, names containing spaces, unknown SQLite types, and expression defaults on non-TEXT columns.

```ts
const ok = validateColumnDefinition("name", "TEXT", false, true, true, null);
// { valid: true, issues: [] }

const bad = validateColumnDefinition("", "INVALID", false, false, false, null);
// { valid: false, issues: ["Column name cannot be empty", "Unknown SQLite type: INVALID"] }
```

---

### validateCreateTable(sql: string): SchemaValidation

Validates a `CREATE TABLE` SQL statement. Checks for: creation target type, table name presence, PRIMARY KEY presence, FOREIGN KEY ON DELETE absence, and AUTOINCREMENT + non-INTEGER mismatches.

```ts
const ok = validateCreateTable(
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
);
// { valid: true, issues: [], warnings: [] }

const missingPk = validateCreateTable(
  "CREATE TABLE users (id INTEGER, name TEXT)"
);
// { valid: true, issues: [], warnings: ["Table has no PRIMARY KEY defined"] }

const badAi = validateCreateTable(
  "CREATE TABLE users (id TEXT PRIMARY KEY AUTOINCREMENT)"
);
// { valid: false, issues: ["AUTOINCREMENT used but column type is not INTEGER"], warnings: [] }
```

---

### checkSqlExpression(value: string): ExpressionCheck

Detects and classifies whether a string represents a SQL expression: a parenthesised expression, a function call, or a recognised SQL keyword.

```ts
checkSqlExpression("datetime('now')");
// { isExpression: true, expressionType: "function_call" }

checkSqlExpression("(1 + 1)");
// { isExpression: true, expressionType: "parenthesized_expression" }

checkSqlExpression("CURRENT_TIMESTAMP");
// { isExpression: true, expressionType: "keyword" }

checkSqlExpression("hello world");
// { isExpression: false, expressionType: undefined }
```

Recognised keywords: `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `NULL`, `TRUE`, `FALSE`.

---

## Interfaces

### interface ColumnInfo

```ts
interface ColumnInfo {
  name: string;
  type: string;
}
```

---

### interface DatabaseOptions

```ts
interface DatabaseOptions {
  readonly?: boolean;
  create?: boolean;
  readwrite?: boolean;
}
```

---

### interface Migration

```ts
interface Migration {
  version: number;
  sql: string;
  description?: string;
}
```

---

### interface QueryResult

```ts
interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}
```

---

### interface TransactionResult

```ts
interface TransactionResult {
  changes: number;
  lastInsertRowid: number;
}
```

---

## Error Reference

All runtime SQLite errors are thrown as JavaScript `Error` objects. The `message` property is extended with the SQLite extended error code and a human-readable description.

```ts
try {
  db.run("INVALID SQL SYNTAX", []);
} catch (err) {
  console.error(err.message);
  // SQLite Error [Extended Code 1]: Query failed: INVALID SQL SYNTAX — near "SQL": syntax error
}
```

| SQLite extended code | Common scenario |
|---|---|
| `SQLITE_ERROR` / `1` | General query / execution error, e.g. syntax error |
| `SQLITE_INTERNAL` / `2` | Internal SQLite logic error |
| `SQLITE_PERM` / `3` | Permission denied |
| `SQLITE_ABORT` / `4` | Callback requested an abort |
| `SQLITE_BUSY` / `5` | Database file is locked |
| `SQLITE_LOCKED` / `6` | A table in the database is locked |
| `SQLITE_NOMEM` / `7` | Out-of-memory |
| `SQLITE_READONLY` / `8` | Attempt to write a readonly database |
| `SQLITE_IOERR` / `10` | Disk I/O error |
| `SQLITE_CORRUPT` / `11` | Database disk image is malformed |
| `SQLITE_NOTFOUND` / `14` | Unknown opcode in SQLite vdbe |
| `SQLITE_FULL` / `13` | Insertion failed because database is full |
| `SQLITE_CANTOPEN` / `14` | Unable to open the database file |
| `SQLITE_CONSTRAINT` / `19` | Abort due to constraint violation (e.g. UNIQUE, NOT NULL, CHECK, FK) |
| `SQLITE_MISUSE` / `21` | Library used incorrectly by the caller |

Use `Database.runSafe(sql, ignoreErrors?)` to suppress known violation strings instead of catching:

```ts
db.runSafe("CREATE TABLE users (id INTEGER PRIMARY KEY)", ["already exists", "duplicate column"])
// => false  (table already existed)
```
