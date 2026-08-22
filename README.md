# SQLite NAPI

A high-performance SQLite library for Node.js and Bun that mirrors the `bun:sqlite` API as closely as possible. Built with Rust using NAPI-RS for native performance.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Database](#database)
  - [Creating a Database](#creating-a-database)
  - [DatabaseOptions](#databaseoptions)
- [Statement](#statement)
  - [Preparing Statements](#preparing-statements)
  - [Statement.all()](#statementall)
  - [Statement.get()](#statementget)
  - [Statement.run()](#statementrun)
  - [Statement.values()](#statementvalues)
  - [Statement.iter()](#statementiter)
  - [Statement.columns()](#statementcolumns)
  - [Statement.source() / toString()](#statementsource--tostring)
  - [Statement.finalize()](#statementfinalize)
- [Iter](#iter)
  - [Iter.next()](#iternext)
  - [Iter.nextValues()](#iternextvalues)
  - [Iter.hasMore()](#iterhasmore)
  - [Iter.all()](#iterall)
  - [Iter.reset()](#iterreset)
- [Transaction](#transaction)
  - [Database.transaction()](#databasetransaction)
  - [Database.transactionFn()](#databasetransactionfn)
  - [Transaction.run()](#transactionrun)
  - [Transaction.commit()](#transactioncommit)
  - [Transaction.rollback()](#transactionrollback)
  - [Transaction.savepoint()](#transactionsavepoint)
  - [Transaction.query()](#transactionquery)
  - [Transaction.all() / get() / values() / iter() / exec()](#transactionall--get--values--iter--exec)
- [Result Types](#result-types)
  - [QueryResult](#queryresult)
  - [TransactionResult](#transactionresult)
- [Parameters](#parameters)
  - [Positional Parameters](#positional-parameters)
  - [Named Parameters](#named-parameters)
  - [Supported Parameter Types](#supported-parameter-types)
- [Schema Introspection](#schema-introspection)
  - [Database.getTables()](#databasesgettables)
  - [Database.getColumns()](#databasegetcolumns)
  - [Database.getIndexes()](#databasegetindexes)
  - [Database.getTableSql()](#databasegettablesql)
  - [Database.exportSchema()](#databaseexportschema)
  - [Database.tableExists()](#databasetableexists)
  - [Database.getMetadata()](#databasegetmetadata)
- [Schema Management](#schema-management)
  - [Database.createTableIfNotExists()](#databasecreatetableifnotexists)
  - [Database.addColumnIfNotExists()](#databaseaddcolumnifnotexists)
  - [Database.runSafe()](#databaserunsafe)
  - [Migrations](#migrations)
    - [Migration Interface](#migration-interface)
    - [Database.getSchemaVersion()](#databasegetschemaversion)
    - [Database.setSchemaVersion()](#databasesetschemaversion)
    - [Database.initSchema()](#databaseinitschema)
    - [Database.migrate()](#databasemigrate)
- [Custom Functions & Collations](#custom-functions--collations)
  - [Database.createFunction()](#databasecreatefunction)
  - [Database.createCollation()](#databasecreatecollation)
- [Pragmas](#pragmas)
  - [Database.pragma()](#databasepragma)
- [Serialization](#serialization)
  - [Database.serializeBinary() / deserializeBinary()](#databaseserializebinary--deserializebinary)
  - [Database.serialize() / deserialize()](#databaseserialize--deserialize)
- [Extensions](#extensions)
  - [Database.loadExtension()](#databaseloadextension)
- [Schema Utilities](#schema-utilities)
  - [getSqliteFunctions()](#getsqlitefunctions)
  - [getAutoincrementInfo()](#getautoincrementinfo)
  - [validateColumnDefinition()](#validatecolumndefinition)
  - [validateCreateTable()](#validatecreatetable)
  - [checkSqlExpression()](#checksqlexpression)
  - [SqliteType](#sqlitetype)
  - [TypeMapping](#typemapping)
- [Other Utilities](#other-utilities)
  - [getSqliteVersion()](#getsqliteversion)
- [Connection Lifecycle](#connection-lifecycle)
  - [Database.close()](#databaseclose)
  - [Database.isClosed()](#databaseisclosed)
  - [Database.inTransaction()](#databaseintransaction)
  - [Database.filename()](#databasefilename)
- [Error Handling](#error-handling)
- [Bun Compatibility](#bun-compatibility)
- [TypeScript Support](#typescript-support)
- [Engine Support](#engine-support)

---

## Installation

```bash
npm install sqlite-napi
# or
bun add sqlite-napi
```

**Requirements:**

- **Node.js**: `>= 18.0.0`
- **Bun**: `>= 1.0.0`

Prebuilt binaries are provided for all major platforms via NAPI-RS. No native toolchain required.

---

## Quick Start

```typescript
import { Database } from "sqlite-napi";

// Create an in-memory database
const db = new Database(":memory:");

// Or open a file
// const db = new Database("myapp.db");

// Create a table
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

// Insert data using prepared statement
const insert = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
insert.run(["Alice", "alice@example.com"]);
insert.run(["Bob", "bob@example.com"]);

// Query data
const getAll = db.query("SELECT * FROM users");
const users = getAll.all();
// => [{ id: 1, name: "Alice", email: "alice@example.com" }, { id: 2, name: "Bob", email: "bob@example.com" }]

// Get single row (or null)
const getUser = db.query("SELECT * FROM users WHERE id = ?");
const user = getUser.get([1]);
// => { id: 1, name: "Alice", email: "alice@example.com" }

console.log(user);
```

---

## Database

### Creating a Database

```typescript
import { Database } from "sqlite-napi";

// In-memory database (ephemeral)
const db = new Database(":memory:");

// File-based database
const db = new Database("./myapp.db");

// Read-only mode
const roDb = new Database("./readonly.db", { readonly: true });

// Read-write, no-create
const rwDb = new Database("./shared.db", {
  readonly: false,
  readwrite: true,
  create: false,
});
```

---

### DatabaseOptions

```typescript
interface DatabaseOptions {
  /** Open database in read-only mode (default: false) */
  readonly?: boolean;

  /** Create database file if it does not exist (default: true) */
  create?: boolean;

  /** Open database in read-write mode (default: true) */
  readwrite?: boolean;
}
```

---

## Statement

A `Statement` is a prepared SQL statement. Obtain one via `db.query(sql)`.

```typescript
// Prepare a statement
const stmt = db.query("SELECT * FROM users WHERE id = ?");

// Accepts arrays, BigInt, Buffer, Uint8Array, strings and numbers
stmt.get([1]);
stmt.all([1]);
stmt.run([1]);
stmt.values([1]);
```

### Preparing Statements

```typescript
// Create a statement — compilation is deferred until first execution
const stmt = db.query("SELECT * FROM users WHERE active = ?");

// Execution and error reporting happens at .get()/.all()/.run()/.values()/.iter() time
const user = stmt.get([1]);
```

### Statement.all(params?)

Returns **all** matching rows as an array of objects keyed by column name.

```typescript
const stmt = db.query("SELECT * FROM users");

// No parameters
const users = stmt.all();
// => [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]

// With positional parameters
const stmt = db.query("SELECT * FROM users WHERE role = ?");
const admins = stmt.all(["admin"]);

// With named parameters
const stmt = db.query("SELECT * FROM users WHERE role = $role AND active = $active");
const users = stmt.all({ $role: "admin", $active: 1 });
// or
const users = stmt.all({ role: "admin", active: 1 });
```

### Statement.get(params?)

Returns the **first** matching row as an object, or `null` if no rows match.

```typescript
const stmt = db.query("SELECT * FROM users WHERE id = ?");
const user = stmt.get([1]);

if (user) {
  console.log(user.name); // "Alice"
}

// Returns null when no row is found
const missing = stmt.get([999]);
// => null
```

### Statement.run(params?)

Executes the statement and returns a `QueryResult` with metadata — useful for `INSERT`, `UPDATE`, `DELETE`.

```typescript
// Insert
const stmt = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
const result = stmt.run(["Charlie", "charlie@example.com"]);

console.log(result.changes);         // 1 (rows affected)
console.log(result.lastInsertRowid);  // 3 (auto-generated id)

// Update
const update = db.query("UPDATE users SET email = ? WHERE id = ?");
const result = update.run(["new@example.com", 1]);
console.log(result.changes); // 1

// Delete
const del = db.query("DELETE FROM users WHERE id = ?");
const result = del.run([1]);
console.log(result.changes); // 1
```

### Statement.values(params?)

Returns **all** matching rows as an array of arrays (column-order values), rather than objects.

```typescript
const stmt = db.query("SELECT id, name FROM users ORDER BY id");
const rows = stmt.values([[]]);
// => [[1, "Alice"], [2, "Bob"], [3, "Charlie"]]
```

### Statement.iter(params?)

Materialises all rows and returns an `Iter` for row-by-row access without recomputing the query.

```typescript
const stmt = db.query("SELECT * FROM users WHERE role = ?");
const iter = stmt.iter(["admin"]);

// Iterate row by row
while (iter.hasMore()) {
  const row = iter.next();
  console.log(row);
}
```

### Statement.columns()

Returns column metadata as an array of `ColumnInfo`.

```typescript
const stmt = db.query("SELECT id, name, email FROM users");
const columns = stmt.columns();
// => [{ name: "id", type: "" }, { name: "name", type: "" }, { name: "email", type: "" }]
```

Note: The driver does not currently surface per-column SQLite type information; the `type` field will be an empty string.

### Statement.source() / toString()

Returns the original SQL string for the statement.

```typescript
const stmt = db.query("SELECT * FROM users WHERE id = ?");
stmt.source();          // "SELECT * FROM users WHERE id = ?"
stmt.toString();        // "SELECT * FROM users WHERE id = ?"
```

### Statement.finalize()

Releases the prepared statement. No-op for the current implementation (connection is held by shared reference), but available for explicit resource management when migrating from `bun:sqlite`.

```typescript
const stmt = db.query("SELECT * FROM users");
stmt.finalize();
```

---

## Iter

An `Iter` provides row-by-row access over a result set that has been pre-fetched from the database.

```typescript
const iter = stmt.iter(["admin"]);

// Fetch the next row as an object (keyed by column name)
const row = iter.next();       // { id: 1, name: "Alice", role: "admin" } | null

// Fetch the next row as an array (column-order values)
const values = iter.nextValues(); // [1, "Alice", "admin"] | null

// Check whether more rows are available
const more = iter.hasMore();    // true / false

// Retrieve all remaining rows as an array
const remaining = iter.all();   // [{ ... }, { ... }]

// Reset the iterator back to the first row
iter.reset();
```

### Iter.next()

Returns the next row as a plain object, or `null` when exhausted.

```typescript
const iter = stmt.iter([]);
const row = iter.next(); // { id: 1, name: "Alice" } | null
```

### Iter.nextValues()

Returns the next row as an array of column values, or `null` when exhausted.

```typescript
const iter = stmt.iter([]);
const values = iter.nextValues(); // [1, "Alice"] | null
```

### Iter.hasMore()

Returns `true` if there are unread rows remaining.

```typescript
const iter = stmt.iter([]);
iter.hasMore();  // true
iter.next();
iter.hasMore();  // true  (depends on total row count)
```

### Iter.all()

Returns all remaining unread rows as an array.

```typescript
const iter = stmt.iter([]);
iter.next();
const rest = iter.all(); // [{ id: 2, name: "Bob" }]
```

### Iter.reset()

Resets the internal pointer so that `next()` / `nextValues()` start from the beginning again.

```typescript
const iter = stmt.iter([]);
iter.next();
iter.reset();
iter.next(); // Returns the first row again
```

---

## Transaction

### Database.transaction(mode?)

Begins a transaction and returns a `Transaction` object.

```typescript
// DEFERRED (default — no locks held until first read/write)
const tx = db.transaction();

// IMMEDIATE — acquires write lock immediately
const tx = db.transaction("immediate");

// EXCLUSIVE — acquires exclusive lock immediately
const tx = db.transaction("exclusive");

try {
  tx.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
  tx.run("INSERT INTO users (name) VALUES (?)", ["Bob"]);
  tx.commit();
} catch (err) {
  tx.rollback();
  throw err;
}
```

`Transaction` also exposes convenience methods that accept a raw SQL string:

```typescript
const tx = db.transaction();

tx.all("SELECT * FROM users WHERE role = ?", ["admin"]);
tx.get("SELECT * FROM users WHERE id = ?", [1]);
tx.run("INSERT INTO posts (title) VALUES (?)", ["Hello"]);
tx.values("SELECT id, title FROM posts");
tx.iter("SELECT * FROM logs");
tx.exec("PRAGMA foreign_keys = ON");
```

### Database.transactionFn(mode, statements)

Executes a batch of SQL statements atomically in a single transaction. If any statement fails, the entire batch is rolled back.

```typescript
const statements = [
  "INSERT INTO users (name) VALUES ('Alice')",
  "INSERT INTO users (name) VALUES ('Bob')",
  "UPDATE counters SET total = total + 2",
];

const result = db.transactionFn("immediate", statements);
console.log(result.changes);        // total rows changed across all statements
console.log(result.lastInsertRowid); // lastInsertRowid from the batch
```

### Transaction.run(sql, params?)

Execute a SQL statement within the transaction.

```typescript
const tx = db.transaction();
tx.run("INSERT INTO users (name, email) VALUES (?, ?)", ["Alice", "alice@example.com"]);
```

### Transaction.commit()

Commits the transaction and return a `TransactionResult`.

```typescript
const tx = db.transaction();
tx.run("INSERT INTO posts (title) VALUES (?)", ["Hello"]);
const result = tx.commit();
// { changes: 1, lastInsertRowid: 1 }
```

### Transaction.rollback()

Rolls back the transaction and returns a `TransactionResult`. If the transaction was created via a savepoint, rolls back to that savepoint instead.

```typescript
const tx = db.transaction();
tx.run("INSERT INTO posts (title) VALUES (?)", ["Hello"]);
tx.rollback();
// Changes are discarded
```

### Transaction.savepoint(name)

Creates a nested savepoint within the transaction. Returns a new `Transaction` scoped to the savepoint. Calling `commit()` on the savepoint releases it; calling `rollback()` rolls back to it.

```typescript
const tx = db.transaction();
tx.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);

const sp1 = tx.savepoint("after_users");
tx.run("INSERT INTO posts (user_id, title) VALUES (?, ?)", [1, "Hello"]);

// Commit the savepoint — releases it and keeps outer tx open
sp1.commit();

// Outer transaction still open — can create more savepoints
const sp2 = tx.savepoint("after_posts");

tx.rollback(); // rolls back and releases sp2

// Later: tx.commit() commits the outer transaction
```

### Transaction.query(sql)

Returns a `Statement` bound to the transaction's connection.

```typescript
const tx = db.transaction();
const stmt = tx.query("SELECT * FROM users WHERE role = ?");
const users = stmt.all(["admin"]);
tx.commit();
```

### Transaction.all(sql, params?) / get(sql, params?) / values(sql, params?) / iter(sql, params?) / exec(sql)

Shortcut methods that prepare, execute, and return results in one call — all within the same transaction.

```typescript
const tx = db.transaction();

// Select all rows
const users = tx.all("SELECT * FROM users WHERE role = ?", ["admin"]);

// Select single row
const user = tx.get("SELECT * FROM users WHERE id = ?", [1]); // object | null

// Array of values
const values = tx.values("SELECT id, name FROM users");

// Streaming iterator
const iter = tx.iter("SELECT * FROM users");

// Execute batch SQL
tx.exec("PRAGMA foreign_keys = ON");
```

---

## Result Types

### QueryResult

Returned by `Statement.run()` and `Database.run()` and `Database.exec()`.

```typescript
interface QueryResult {
  /** Number of rows changed by the statement */
  changes: number;

  /** The ROWID of the last inserted row */
  lastInsertRowid: number;
}
```

### TransactionResult

Returned by `Transaction.commit()` and `Transaction.rollback()`.

```typescript
interface TransactionResult {
  /** Total rows changed since the transaction or savepoint was created */
  changes: number;

  /** The ROWID of the last inserted row in the transaction */
  lastInsertRowid: number;
}
```

---

## Parameters

### Positional Parameters

Pass an array to bind values by position using `?` or `?N` placeholders.

```typescript
const stmt = db.query("SELECT * FROM users WHERE id = ? AND active = ?");
const row = stmt.get([1, true]);

const insert = db.query("INSERT INTO users (name, email, age) VALUES (?, ?, ?)");
insert.run(["Alice", "alice@example.com", 30]);
```

### Named Parameters

Pass a plain object to bind values by name using `$name`, `:name`, or `@name` placeholders. Object keys are automatically normalised (prefix `$` is added if missing).

```typescript
const stmt = db.query("SELECT * FROM users WHERE role = $role AND active = $active");
const admins = stmt.all({ role: "admin", active: 1 });

// :name and @name are also supported in the SQL
const stmt2 = db.query("SELECT * FROM users WHERE id = :id");
stmt2.get({ id: 1 });
```

### Supported Parameter Types

| JavaScript / TypeScript type | SQLite binding       |
|-------------------------------|----------------------|
| `string`                      | TEXT                 |
| `number` (integer)            | INTEGER              |
| `number` (float)              | REAL                 |
| `boolean`                     | INTEGER (0 / 1)      |
| `null` / `undefined`          | NULL                 |
| `bigint`                      | INTEGER              |
| `Date`                        | REAL (Unix timestamp)|
| `Uint8Array` / `Buffer`       | BLOB                 |

---

## Schema Introspection

### Database.getTables()

Returns a list of all user-defined table names in the database.

```typescript
const tables = db.getTables();
// => ["users", "posts", "comments"]
```

### Database.getColumns(tableName)

Returns column metadata for a given table.

```typescript
const columns = db.getColumns("users");
// => [
//      { cid: 0, name: "id",    type: "INTEGER", notnull: true, dflt_value: null, pk: true  },
//      { cid: 1, name: "name",  type: "TEXT",    notnull: false, dflt_value: null, pk: false },
//      { cid: 2, name: "email", type: "TEXT",    notnull: false, dflt_value: null, pk: false },
//    ]
```

| Field       | Description                                  |
|-------------|----------------------------------------------|
| `cid`       | Column index (0-based)                       |
| `name`      | Column name                                  |
| `type`      | Declared SQLite type (e.g. `"TEXT"`, `"INTEGER"`) |
| `notnull`   | `true` if `NOT NULL` constraint is set       |
| `dflt_value`| Default value string, or `null`              |
| `pk`        | `true` if column is part of `PRIMARY KEY`    |

### Database.getIndexes(tableName)

Returns index metadata for a given table.

```typescript
const indexes = db.getIndexes("users");
// => [
//      {
//        name: "users_email_unique",
//        unique: true,
//        origin: "c",   // 'c' = created by CREATE INDEX, 'u' = UNIQUE constraint, 'pk' = PRIMARY KEY
//        partial: false,
//        columns: ["email"]
//      }
//    ]
```

### Database.getTableSql(tableName)

Returns the `CREATE TABLE …` SQL string for a table, or `null` if the table does not exist.

```typescript
const sql = db.getTableSql("users");
// => "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"

const missing = db.getTableSql("nonexistent"); // null
```

### Database.exportSchema()

Returns all non-internal schema objects as a single SQL string (tables, indexes, triggers, views).

```typescript
const sql = db.exportSchema();
```

### Database.tableExists(tableName)

Returns `true` if the named user table exists.

```typescript
const exists = db.tableExists("users");   // true / false
```

### Database.getMetadata()

Returns high-level database metadata as a JSON object.

```typescript
const meta = db.getMetadata();
// => {
//      table_count:       3,
//      index_count:       2,
//      page_count:        42,
//      page_size:         4096,
//      db_size_bytes:     172032,    // page_count * page_size
//      sqlite_version:    "3.45.0"
//    }
```

---

## Schema Management

### Database.createTableIfNotExists(sql)

Creates a table only if it does not already exist. Returns `true` if the table was created, `false` if it already existed.

```typescript
const created = db.createTableIfNotExists(
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
);

if (created) {
  console.log("Table created");
} else {
  console.log("Table already existed");
}
```

### Database.addColumnIfNotExists(tableName, columnName, columnDef)

Adds a column to a table only if it does not already exist. Returns `true` if the column was added, `false` if it already existed.

```typescript
const added = db.addColumnIfNotExists("users", "email", "TEXT NOT NULL DEFAULT ''");

if (added) {
  console.log("Column added");
} else {
  console.log("Column already existed");
}
```

### Database.runSafe(sql, ignoreErrors?)

Executes SQL and swallows matching errors. Returns `true` on success, `false` if a matching error occurred. Non-matching errors are still thrown.

```typescript
// Silently ignore "already exists" errors
const ok = db.runSafe(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)",
  ["already exists", "duplicate column name"]
);
```

### Migrations

#### Migration Interface

```typescript
interface Migration {
  /** Sequential version number (must be > current version) */
  version: number;

  /** SQL statements to run for this migration */
  sql: string;

  /** Optional human-readable description */
  description?: string;
}
```

#### Database.getSchemaVersion()

Returns the current schema version. Returns `0` if no `_schema_version` table exists yet.

```typescript
const version = db.getSchemaVersion(); // 0
```

#### Database.setSchemaVersion(version)

Manually set (or upsert) a schema version row.

```typescript
db.setSchemaVersion(2);
```

#### Database.initSchema(schema, version?, description?)

Initialises the database with a full schema SQL string inside a transaction. Creates the `_schema_version` table automatically.

```typescript
const schema = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  );
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL
  );
`;

const version = db.initSchema(schema, 1, "Initial schema");
console.log(version); // 1
```

#### Database.migrate(migrations, targetVersion?)

Applies pending migrations in order up to `targetVersion`, or up to the latest migration if `targetVersion` is omitted. All migrations run inside a single transaction and roll back if any single migration fails.

```typescript
const migrations = [
  {
    version: 1,
    sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
    description: "Create users table",
  },
  {
    version: 2,
    sql: "ALTER TABLE users ADD COLUMN email TEXT",
    description: "Add email column to users",
  },

  {
    version: 3,
    sql: "CREATE INDEX users_email_idx ON users(email)",
    description: "Add email index",
  },
];

const newVersion = db.migrate(migrations);
console.log(newVersion); // 3

// Migrate up to a specific version
const v2 = db.migrate(migrations, 2);
```

**Important:** Migrations are applied sequentially and must not be applied twice (the `_schema_version` table prevents re-application).

---

## Custom Functions & Collations

### Database.createFunction(name, fn)

Registers a custom SQL scalar function.

```typescript
import { Database } from "sqlite-napi";

const db = new Database(":memory:");
db.run("CREATE TABLE items (name TEXT, price REAL)");

// Register a custom function called "double"
db.createFunction("double", (value) => {
  // The callback currently returns NULL as a placeholder.
  // Full JavaScript-callback wiring is under active development.
  return null;
});
```

> Note: The current implementation registers a stub function with SQLite. Full JavaScript-to-SQLite callback support (`db.createFunction`) is a work in progress and returns `NULL` for now.

### Database.createCollation(name, compareFn)

Registers a custom collation (sorting) function.

> **Experimental stub:** the JavaScript comparator is currently ignored. The
> collation uses Rust's normal lexicographic string ordering, so JavaScript
> case-insensitive or locale-aware comparison is not available yet.

```typescript
// The comparator is reserved for future callback support.
db.createCollation("NOCASE", (a, b) => {
  return a.toLowerCase().localeCompare(b.toLowerCase());
});

db.run(`CREATE TABLE users (name TEXT COLLATE NOCASE)`);
```

---

## Pragmas

### Database.pragma(name, value?)

Read or write SQLite PRAGMA values. Returns the PRAGMA result value, or `null` if the PRAGMA produced no output.

```typescript
// Read a PRAGMA
const cacheSize = db.pragma("cache_size");

// Set a PRAGMA (pass the value as the second argument)
db.pragma("journal_mode", "WAL");

// Read journal mode after setting it
const currentMode = db.pragma("journal_mode");
// => "wal"

// Integer PRAGMA
db.pragma("page_size", 4096);
const pageSize = db.pragma("page_size");

// Other common PRAGMAs
db.pragma("foreign_keys", "ON");
db.pragma("synchronous", "NORMAL");
```

---

## Serialization

### Database.serializeBinary() / deserializeBinary(data, readOnly?)

`serializeBinary()` returns the entire database as a `Buffer` in SQLite's native serialised format.

`deserializeBinary(data, readOnly?)` loads a serialised database into the current connection. The optional `readOnly` flag (default `false`) opens the deserialised content as read-only.

```typescript
// Serialise to binary
const buffer = db.serializeBinary();

// Deserialise into another connection (or the same one after opening :memory:)
const db2 = new Database(":memory:");
db2.deserializeBinary(buffer);

// Read-only deserialisation
db2.deserializeBinary(buffer, true);
```

### Database.serialize() / deserialize(sql)

`serialize()` returns a SQL text dump of all user-defined schema objects (tables, indexes, triggers, views).

`deserialize(sql)` executes the dump as a batch of SQL statements against the current connection.

```typescript
// Export schema as SQL
const dump = db.serialize();
// => "CREATE TABLE users (...); CREATE TABLE posts (...); CREATE INDEX ...;"

// Import schema into another database
const db2 = new Database(":memory:");
db2.deserialize(dump);
```

---

## Extensions

### Database.loadExtension(path)

Loads a SQLite extension shared library during the current session. The SQLite process must have been compiled with `SQLITE_ENABLE_LOAD_EXTENSION`.

```typescript
db.loadExtension("./my-extension.so");
```

---

## Schema Utilities

### getSqliteFunctions()

Returns an array of known SQLite built-in function names that can be used inside expressions (e.g. in `DEFAULT` clauses).

```typescript
import { getSqliteFunctions } from "sqlite-napi";

const fnNames = getSqliteFunctions();
// [
//   "date", "time", "datetime", "julianday", "strftime",
//   "length", "lower", "upper", "trim", "substr", "replace",
//   "instr", "printf", "quote", "glob", "like",
//   "abs", "round", "random", "randomblob", "zeroblob",
//   "cast", "typeof", "coalesce", "ifnull", "nullif",
//   "count", "sum", "avg", "total", "group_concat",
//   "json", "json_array", "json_object", "json_extract", "json_valid",
//   "hex", "quote", "zeroblob", "unicode", "char",
// ]
```

### getAutoincrementInfo(columnType, isPrimaryKey)

Returns information about whether a column can use SQLite's `AUTOINCREMENT` keyword.

```typescript
import { getAutoincrementInfo } from "sqlite-napi";

const info = getAutoincrementInfo("INTEGER", true);
// { requiresIntegerPrimaryKey: true, canUseAutoincrement: true, explanation: "INTEGER PRIMARY KEY AUTOINCREMENT will generate sequential IDs." }

const bad = getAutoincrementInfo("TEXT", true);
// { requiresIntegerPrimaryKey: true, canUseAutoincrement: false, explanation: "AUTOINCREMENT only works with INTEGER type (not TEXT, REAL, or BLOB)." }
```

### validateColumnDefinition(columnName, columnType, isPrimaryKey, isNotNull, hasDefault, defaultValue?)

Validates a single column definition and returns a `ColumnValidation` result.

```typescript
import { validateColumnDefinition } from "sqlite-napi";

const result = validateColumnDefinition("name", "TEXT", false, true, false, null);
// { valid: true, issues: [] }

const bad = validateColumnDefinition("", "INVALID", false, false, false, null);
// { valid: false, issues: ["Column name cannot be empty", "Unknown SQLite type: INVALID"] }
```

### validateCreateTable(sql)

Validates a `CREATE TABLE` SQL string and returns a `SchemaValidation` result.

```typescript
import { validateCreateTable } from "sqlite-napi";

const result = validateCreateTable("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
// { valid: true, issues: [], warnings: [] }

const loose = validateCreateTable("CREATE TABLE users (id INTEGER, name TEXT)");
// { valid: true, issues: [], warnings: ["Table has no PRIMARY KEY defined"] }

const bad = validateCreateTable("CREATE TABLE users (id TEXT PRIMARY KEY AUTOINCREMENT)");
// { valid: false, issues: ["AUTOINCREMENT used but column type is not INTEGER"], warnings: [] }
```

### checkSqlExpression(value)

Detects whether a string is a SQL expression (function call, parenthesised expression, or SQL keyword) and classifies the expression type.

```typescript
import { checkSqlExpression } from "sqlite-napi";

checkSqlExpression("datetime('now')");
// { isExpression: true, expressionType: "function_call" }

checkSqlExpression("(1 + 1)");
// { isExpression: true, expressionType: "parenthesized_expression" }

checkSqlExpression("CURRENT_TIMESTAMP");
// { isExpression: true, expressionType: "keyword" }

checkSqlExpression("hello");
// { isExpression: false, expressionType: undefined }
```

### SqliteType

An enum representing the five core SQLite storage classes.

```typescript
import { SqliteType } from "sqlite-napi";

SqliteType.Null;   // 0
SqliteType.Integer; // 1
SqliteType.Real;    // 2
SqliteType.Text;    // 3
SqliteType.Blob;    // 4

// Static methods
SqliteType.supported_types();        // ["NULL", "INTEGER", "REAL", "TEXT", "BLOB"]
SqliteType.is_valid_type("INTEGER"); // true
SqliteType.is_valid_type("FOO");     // false

SqliteType.from_type_name("Number"); // { sqliteType: "INTEGER", valid: true }
SqliteType.from_type_name("String"); // { sqliteType: "TEXT",    valid: true }
SqliteType.from_type_name("UUID");   // { sqliteType: "TEXT",    valid: true }
SqliteType.from_type_name("Buffer"); // { sqliteType: "BLOB",    valid: true }
SqliteType.from_type_name("FOO");    // { sqliteType: "TEXT",    valid: false }
```

Type aliases recognised by `from_type_name`:

| JS / TS type | SQLite type |
|---|---|
| `String` / `string` | `TEXT` |
| `Number` / `number` / `Int` / `int` | `INTEGER` |
| `Boolean` / `boolean` / `Bool` / `bool` | `INTEGER` |
| `Date` / `date` | `INTEGER` (Unix timestamp) |
| `Buffer` / `Uint8Array` | `BLOB` |
| `UUID` / `uuid` | `TEXT` |
| `Float` / `float` / `Double` / `double` | `REAL` |

### TypeMapping

Returned by `SqliteType.from_type_name()`.

```typescript
interface TypeMapping {
  sqliteType: string;  // The SQLite type name string
  valid: boolean;      // Whether the mapping was recognised
}
```

---

## Other Utilities

### getSqliteVersion()

Returns the full linked SQLite version string.

```typescript
import { getSqliteVersion } from "sqlite-napi";

const version = getSqliteVersion();
// e.g. "3.45.0"
```

---

## Connection Lifecycle

### Database.close()

Closes the database connection, flushes the WAL, and releases resources.

```typescript
const db = new Database("./myapp.db");
db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
db.close();

const closed = db.isClosed(); // true

// Any database operation after close() throws.
// db.run("SELECT 1");
```

### Database.isClosed()

Returns `true` if the connection has been closed.

```typescript
const db = new Database(":memory:");
db.isClosed(); // false

db.close();
db.isClosed(); // true
```

### Database.inTransaction()

Returns `true` if the connection currently has an active transaction.

```typescript
const db = new Database(":memory:");
db.inTransaction(); // false

const tx = db.transaction();
db.inTransaction(); // true

tx.commit();
db.inTransaction(); // false
```

### Database.filename()

Returns the path or identifier used to open the database.

```typescript
const db = new Database(":memory:");
db.filename(); // ":memory:"

const db2 = new Database("./myapp.db");
db2.filename(); // "./myapp.db"
```

---

## Error Handling

All SQLite errors are surfaced as JavaScript `Error` objects with context including the extended SQLite error code and a description.

```typescript
try {
  db.run("INVALID SQL SYNTAX", []);
} catch (err) {
  console.error(err.message);
  // SQLite Error [Extended Code 1]: Query failed: INVALID SQL SYNTAX — near "SQL": syntax error
}
```

Common error scenarios:

| Scenario | Error thrown |
|---|---|
| Invalid SQL syntax | `Error` with `"syntax error"` |
| Table not found | `Error` with `"no such table"` |
| Column not found | `Error` with `"no such column"` |
| UNIQUE constraint violation | `Error` with `"UNIQUE constraint failed"`  |
| NOT NULL constraint violation | `Error` with `"NOT NULL constraint failed"` |
| FOREIGN KEY violation | `Error` with `"FOREIGN KEY constraint failed"` |
| CHECK constraint violation | `Error` with `"CHECK constraint failed"` |
| Duplicate function name | `Error` with `"Function 'X' already exists"` |

Use `Database.runSafe()` when you want to suppress known errors instead of throwing.

```typescript
// Returns false instead of throwing when "already exists" error occurs
const ok = db.runSafe("CREATE TABLE IF NOT EXISTS t (x)", ["already exists"]);
```

---

## Bun Compatibility

`sqlite-napi` is designed as a drop-in replacement for `bun:sqlite`. The following table summarises the compatibility status:

| Feature | `bun:sqlite` | `sqlite-napi` |
|---|---|---|
| `new Database(path)` | ✅ | ✅ |
| `new Database(path, { readonly })` | ✅ | ✅ |
| `db.run(sql, params?)` | ✅ | ✅ |
| `db.query(sql)` → `Statement` | ✅ | ✅ |
| `stmt.get(params?)` | ✅ | ✅ |
| `stmt.all(params?)` | ✅ | ✅ |
| `stmt.run(params?)` | ✅ | ✅ |
| `stmt.values(params?)` | ✅ | ✅ |
| `stmt.iter(params?)` → `Iter` | ✅ | ✅ |
| `stmt.columns` | ✅ | ✅ |
| `stmt.source` | ✅ | ✅ |
| `db.transaction(mode)` | ✅ | ✅ |
| `tx.savepoint(name)` | ✅ | ✅ |
| `db.pragma(name, value?)` | ✅ | ✅ |
| `db.transactionFn(mode, stmts)` | ✅ | ✅ |
| `db.close()` | ✅ | ✅ |
| `db.isClosed()` | ✅ | ✅ |
| `db.inTransaction()` | ✅ | ✅ |
| `db.filename` | ✅ | ✅ |
| `db.loadExtension(path)` | ✅ | ✅ |
| `db.serializeBinary()` / `deserializeBinary()` | ✅ | ✅ |
| `db.serialize()` / `deserialize()` | ✅ | ✅ |
| `db.createFunction(name, fn)` | ✅ | ✅ ⚠️ stub |
| `db.createCollation(name, fn)` | ✅ | ✅ ⚠️ stub |
| Native `return null` in JS `fn` | ✅ | ✅ |
| Async `await return` in SQL function | ✅ | ❌ planned |

```

## TypeScript Support

Full TypeScript definitions are included in `index.d.ts`. All public classes, interfaces, enums, and utility functions are typed.

```typescript
import type {
  Database,
  Statement,
  Transaction,
  Iter,
  QueryResult,
  TransactionResult,
  DatabaseOptions,
  Migration,
  ColumnInfo,
  SqliteType,
  ExpressionCheck,
  ColumnValidation,
  SchemaValidation,
  TypeMapping,
  AutoincrementInfo,
} from "sqlite-napi";
```

---

## Engine Support

| Runtime | Supported |
|---|---|
| Node.js `>= 18.0.0` | ✅ |
| Bun `>= 1.0.0` | ✅ |

Prebuilt binaries ship for the following targets:

| Platform | Architecture |
|---|---|
| Linux (GNU) | `x86_64`, `aarch64` |
| macOS (Apple) | `x86_64`, `aarch64` |
| Windows (MSVC) | `x86_64`, `aarch64` |

### Build Scripts

```bash
npm run build        # Build native binary for current platform
npm run build:all    # Build for all platforms
npm run build:debug  # Build in debug mode
npm run clean        # Clean build artifacts
npm test             # Run test suite
npm run bench        # Run benchmarks
```
