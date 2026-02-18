# SQLite NAPI

A high-performance SQLite library for Node.js and Bun that mirrors the `bun:sqlite` API as closely as possible. Built with Rust using NAPI-RS for native performance.

## Features

- 🚀 **High Performance** - Built with Rust for native speed
- 📦 **Zero Dependencies** - Bundled SQLite, no external dependencies
- 🔄 **Bun-Compatible** - Drop-in replacement for `bun:sqlite`
- 💾 **Full Transaction Support** - Including nested savepoints
- 🔍 **Schema Introspection** - Get tables, columns, indexes, and more
- 📊 **Binary Serialization** - Full database backup/restore
- 🛡️ **TypeScript Support** - Full type definitions included
- 🌐 **Cross-Platform** - Windows, macOS, and Linux support

## Installation

```bash
npm install sqlite-napi
# or
bun add sqlite-napi
```

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

// Get single row
const getUser = db.query("SELECT * FROM users WHERE id = ?");
const user = getUser.get([1]);

console.log(users);
// Output: [{ id: 1, name: "Alice", email: "alice@example.com" }, { id: 2, name: "Bob", email: "bob@example.com" }]

console.log(user);
// Output: { id: 1, name: "Alice", email: "alice@example.com" }
```

## API Reference

### Database Class

#### `new Database(path)`

Create a new database connection.

```typescript
// In-memory database
const db = new Database(":memory:");

// File-based database
const db = new Database("./myapp.db");

// Read-only database
const db = new Database("./readonly.db", { readonly: true });
```

#### `database.query(sql)` → `Statement`

Prepare a SQL statement for execution. Returns a `Statement` object.

```typescript
const stmt = db.query("SELECT * FROM users WHERE name = ?");
```

#### `database.run(sql, params?)` → `QueryResult`

Execute a SQL statement directly without preparing. Returns metadata.

```typescript
const result = db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
console.log(result.changes);    // Number of rows affected
console.log(result.lastInsertRowid); // ID of last inserted row
```

#### `database.exec(sql)` → `QueryResult`

Execute multiple SQL statements. Useful for DDL operations.

```typescript
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
`);
```

#### `database.transaction(mode?)` → `Transaction`

Begin a transaction with optional mode (`"deferred"`, `"immediate"`, `"exclusive"`).

```typescript
const tx = db.transaction("immediate");
try {
  tx.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
  tx.run("INSERT INTO posts (title) VALUES (?)", ["Hello World"]);
  tx.commit();
} catch (e) {
  tx.rollback();
  throw e;
}
```

#### `database.transactionFn(mode, statements)` → `QueryResult`

Execute multiple statements atomically.

```typescript
const result = db.transactionFn("deferred", [
  "INSERT INTO users (name) VALUES ('Alice')",
  "INSERT INTO posts (title) VALUES ('Hello')",
]);
```

### Statement Class

#### `statement.all(params?)` → `Array<Object>`

Execute query and return all rows as objects.

```typescript
const stmt = db.query("SELECT * FROM users WHERE age > ?");
const users = stmt.all([18]);
// [{ id: 1, name: "Alice", age: 25 }, { id: 2, name: "Bob", age: 30 }]
```

#### `statement.get(params?)` → `Object | null`

Execute query and return first row.

```typescript
const stmt = db.query("SELECT * FROM users WHERE id = ?");
const user = stmt.get([1]);
// { id: 1, name: "Alice", age: 25 }
```

#### `statement.run(params?)` → `QueryResult`

Execute statement (INSERT/UPDATE/DELETE) and return metadata.

```typescript
const stmt = db.query("UPDATE users SET name = ? WHERE id = ?");
const result = stmt.run(["Alice Updated", 1]);
console.log(result.changes); // 1
```

#### `statement.values(params?)` → `Array<Array>`

Execute query and return all rows as arrays.

```typescript
const stmt = db.query("SELECT name, age FROM users");
const values = stmt.values();
// [["Alice", 25], ["Bob", 30]]
```

#### `statement.iter(params?)` → `Iter`

Create an iterator for streaming results.

```typescript
const stmt = db.query("SELECT * FROM users");
const iter = stmt.iter();

while (iter.hasMore()) {
  const row = iter.next();
  console.log(row);
}
```

### Iter Class

#### `iter.next()` → `Object | null`

Get next row as object.

#### `iter.nextValues()` → `Array | null`

Get next row as array.

#### `iter.hasMore()` → `boolean`

Check if more rows available.

#### `iter.all()` → `Array<Object>`

Get all remaining rows.

#### `iter.reset()` → `void`

Reset iterator to beginning.

### Transaction Class

#### `transaction.commit()` → `TransactionResult`

Commit the transaction.

#### `transaction.rollback()` → `TransactionResult`

Rollback the transaction.

#### `transaction.savepoint(name)` → `Transaction`

Create a nested savepoint.

```typescript
const tx = db.transaction();
try {
  tx.run("INSERT INTO users (name) VALUES ('Alice')");
  
  const sp = tx.savepoint("my_savepoint");
  try {
    sp.run("INSERT INTO users (name) VALUES ('Bob')");
    sp.commit();
  } catch (e) {
    sp.rollback(); // Rolls back to savepoint
  }
  
  tx.commit();
} catch (e) {
  tx.rollback();
}
```

### Schema Initialization and Migration

#### `database.getSchemaVersion()` → `number`

Get the current schema version. The version is stored in a special `_schema_version` table.

```typescript
const version = db.getSchemaVersion();
// 0 (if never initialized) or 1, 2, 3, etc.
```

#### `database.setSchemaVersion(version)` → `void`

Manually set the schema version. Usually, you would use `migrate()` instead.

```typescript
db.setSchemaVersion(1);
```

#### `database.initSchema(sql, version?, description?)` → `number`

Initialize the database with a schema. Executes the provided SQL and sets the schema version atomically.

```typescript
// Initialize with version 1
const version = db.initSchema(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
`, 1, "Initial schema");

console.log(version); // 1
```

#### `database.migrate(migrations, targetVersion?)` → `number`

Run migrations to bring the database schema up to the target version. Migrations are executed in order and each migration is recorded in the `_schema_version` table.

```typescript
const migrations = [
  { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
  { version: 2, sql: "ALTER TABLE users ADD COLUMN email TEXT" },
  { version: 3, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)" },
];

// Migrate to latest version
const newVersion = db.migrate(migrations);
console.log(newVersion); // 3

// Or migrate to a specific version
const v2 = db.migrate(migrations, 2);
console.log(v2); // 2
```

The migration system:
- Automatically tracks which migrations have been applied
- Only runs migrations that haven't been applied yet
- Runs all migrations in a transaction (rolls back on failure)
- Records each applied migration with timestamp and description

### Schema Introspection

#### `database.getTables()` → `Array<string>`

Get list of all tables.

```typescript
const tables = db.getTables();
// ["users", "posts", "comments"]
```

#### `database.getColumns(tableName)` → `Array<ColumnInfo>`

Get column information for a table.

```typescript
const columns = db.getColumns("users");
// [{ cid: 0, name: "id", type: "INTEGER", notnull: true, dflt_value: null, pk: 1 }, ...]
```

#### `database.getIndexes(tableName)` → `Array<IndexInfo>`

Get index information for a table.

```typescript
const indexes = db.getIndexes("users");
// [{ name: "users_email_idx", unique: true, origin: "c", partial: false, columns: ["email"] }]
```

#### `database.getTableSql(tableName)` → `string | null`

Get the CREATE TABLE statement.

```typescript
const sql = db.getTableSql("users");
// "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
```

#### `database.tableExists(tableName)` → `boolean`

Check if a table exists.

```typescript
const exists = db.tableExists("users"); // true
```

#### `database.getMetadata()` → `Metadata`

Get database metadata.

```typescript
const meta = db.getMetadata();
// { table_count: 5, index_count: 3, page_count: 100, page_size: 4096, db_size_bytes: 409600, sqlite_version: "3.45.1" }
```

#### `database.exportSchema()` → `string`

Export complete schema as SQL.

```typescript
const schema = db.exportSchema();
// Full schema with all CREATE statements
```

### Serialization

#### `database.serialize()` → `string`

Serialize schema to SQL text (for backup).

```typescript
const sql = db.serialize();
// Returns: "CREATE TABLE users ...; CREATE TABLE posts ...;"
```

#### `database.deserialize(sql)` → `void`

Restore schema from SQL text.

```typescript
db.deserialize(sqlBackup);
```

#### `database.serializeBinary()` → `Buffer`

Serialize entire database to binary (includes data).

```typescript
const backup = db.serializeBinary();
// Returns Buffer with full database backup
```

#### `database.deserializeBinary(data, readOnly?)` → `void`

Restore database from binary backup.

```typescript
db.deserializeBinary(backupBuffer, false);
```

### Other Methods

#### `database.loadExtension(path)` → `void`

Load a SQLite extension.

```typescript
db.loadExtension("./my_extension.so");
```

#### `database.close()` → `void`

Close the database connection.

```typescript
db.close();
```

#### `database.isClosed()` → `boolean`

Check if database is closed.

```typescript
db.isClosed(); // false
```

## Parameter Binding

The library supports multiple parameter styles:

### Positional Parameters (`?`)

```typescript
const stmt = db.query("SELECT * FROM users WHERE name = ? AND age > ?");
stmt.all(["Alice", 18]);
```

### Numbered Parameters (`?1`, `?2`, etc.)

```typescript
const stmt = db.query("SELECT * FROM users WHERE name = ?1 AND age > ?2");
stmt.all(["Alice", 18]);
```

### Named Parameters (`$name`, `:name`, `@name`)

```typescript
const stmt = db.query("SELECT * FROM users WHERE name = $name AND age > $age");
stmt.all({ $name: "Alice", $age: 18 });
```

## Data Types

The library automatically converts SQLite types:

| SQLite Type | JavaScript Type |
|------------|-----------------|
| INTEGER    | number          |
| REAL       | number          |
| TEXT       | string          |
| BLOB       | Buffer (Base64) |
| NULL       | null            |

BigInt is supported for 64-bit integers.

## Performance

The library includes several performance optimizations:

- **Statement Caching** - Prepared statements are cached
- **WAL Mode** - Write-Ahead Logging enabled by default
- **Memory-Mapped I/O** - 256MB mmap size
- **Optimized Cache** - 64MB cache size

## Compatibility with bun:sqlite

This library is designed to be a drop-in replacement for `bun:sqlite`:

```typescript
// bun:sqlite
import { Database } from "bun:sqlite";

// sqlite-napi (same API!)
import { Database } from "sqlite-napi";
```

### API Comparison

| Feature | bun:sqlite | sqlite-napi |
|---------|-----------|-------------|
| Import | `import { Database } from "bun:sqlite"` | `import { Database } from "sqlite-napi"` |
| Instance | `new Database("path")` | `new Database("path")` |
| Query | `db.query("...")` → Statement | `db.query("...")` → Statement |
| Result | `stmt.all()` | `stmt.all()` |
| Meta | `stmt.run()` | `stmt.run()` |

## Development

### Prerequisites

- Node.js >= 18.0.0
- Bun >= 1.0.0
- Rust toolchain (stable)

### Build

```bash
# Install dependencies
bun install

# Build release
bun run build

# Build debug
bun run build:debug
```

### Test

```bash
bun test
```

### Development Mode

```bash
bun run dev
```

## License

MIT
