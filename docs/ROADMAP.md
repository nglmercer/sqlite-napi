# Bun-Compatible SQLite NAPI Roadmap

Goal: Build a high-performance SQLite library for Node.js/Bun that mirrors the `bun:sqlite` API as closely as possible.

## Phase 1: Core API Parity (Complete ✅)

- [x] Initial project structure with `napi-rs`
- [x] Basic `Database` class with connection management
- [x] Basic synchronous execution (via `execute`)
- [x] Implement `database.query(sql)` returning a `Statement` object
- [x] Implement positional parameter support (`?`, `?1`, etc.)
- [x] Implement `statement.all(params)` (returns all rows)
- [x] Implement `statement.get(params)` (returns first row)
- [x] Implement `statement.run(params)` (returns metadata like `changes`)
- [x] Implement `statement.values(params)` (returns rows as arrays)

## Phase 2: Transaction Support (Complete ✅)

- [x] Implement `database.transaction(mode)` - returns Transaction object with commit/rollback
- [x] Implement `database.transactionFn(mode, statements)` - atomic batch execution
- [x] Support for nested transactions (Savepoints) - via `transaction.savepoint(name)`
- [x] Ensure `deferred`, `immediate`, and `exclusive` transaction modes

## Phase 3: Advanced Features (Complete ✅)

- [x] Implement `database.loadExtension(path)`
- [x] Schema introspection (`getTables`, `getColumns`, `getMetadata`, `exportSchema`)
- [x] `BigInt` support for 64-bit integer parameters
- [x] Support for SQLite parameters in `$name`, `:name`, `@name` format
- [x] Binary `database.serializeBinary()` and `database.deserializeBinary()` using SQLite native serialization
- [x] Schema-only `database.serialize()` and `database.deserialize()` for SQL text backup
- [x] BLOB support: Input via `Uint8Array`/`Buffer`, Output as Base64 strings
- [x] Implement `database.close()` - close database connection and release resources
- [x] Implement `database.is_closed()` - check if database connection is closed
- [x] Implement `statement.iter(params)` - create iterator for streaming results
- [x] Implement `iter.next()` - get next row from iterator
- [x] Implement `iter.next_values()` - get next row as array
- [x] Implement `iter.has_more()` - check if more rows available
- [x] Implement `iter.all()` - get all remaining rows
- [x] Implement `iter.reset()` - reset iterator to beginning

## Phase 4: Performance & Optimization (Complete ✅)

- [x] Statement caching (using `prepare_cached` for all internal queries)
- [x] Performance PRAGMAs (WAL mode, optimized cache, synchronous=NORMAL, mmap)
- [x] Optimized parameter binding (direct Rust conversion avoiding intermediate JSON)
- [x] Multi-platform builds (Linux, macOS, Windows)
- [ ] Zero-copy serialization for query results (Future investigation)

## Phase 5: Developer Experience (In Progress 🔄)

- [x] TypeScript definitions (`index.d.ts`) that match `bun:sqlite` types
- [x] Comprehensive documentation and usage examples

## Phase 6: Bug Fixes & Improvements (Complete ✅)

### Transaction State

- [x] Implement `database.inTransaction` - check if currently in a transaction
- [x] Fix `database.is_closed()` - use `AtomicBool` for proper state tracking

### Named Parameters Fix

- [x] Fix named parameter binding - currently only positional parameters work correctly
- [x] Support object-based parameters: `{ $name: "value", :age: 25 }`
- [x] Add tests for named parameter binding

### Connection Options

- [x] Add `Database` constructor options: `new Database(path, options)`
- [x] Support `readonly` option - open database in read-only mode
- [x] Support `create` option - create database if it doesn't exist
- [x] Support `readwrite` option - explicit read-write mode

### Statement Metadata

- [x] Implement `statement.columns` - return column metadata array
- [x] Implement `statement.source` or `statement.toString()` - return original SQL

## Phase 7: Extended bun:sqlite Compatibility (Complete ✅)

### Custom SQL Functions

- [ ] Implement `database.createFunction(name, fn)` - JavaScript callback bridge (currently a NULL-returning stub)
- [ ] Support scalar functions with JavaScript callbacks (basic SQLite stub exists)
- [ ] Support aggregate functions (multiple rows to single value) - requires async callback support
- [ ] Support window functions - requires async callback support

### Custom Collations

- [ ] Implement `database.createCollation(name, compareFn)` - JavaScript callback bridge (currently Rust ordering stub)

### Additional Features

- [x] Implement `database.pragma(name, value)` - convenience method for PRAGMA statements
- [x] Add database file path accessor: `database.filename`

### Implementation Notes

- `createFunction`: Registers function with SQLite but returns NULL as placeholder. Full JavaScript callback support requires complex async/await handling between SQLite's C thread and JavaScript.
- `createCollation`: Uses default Rust string comparison. Full JavaScript callback support requires complex async/await handling.
- Aggregate and window functions require async callback support which is planned for a future version.

## API Comparison Goal

| Feature            | `bun:sqlite`                            | `sqlite-napi`                            | Status |
| :----------------- | :-------------------------------------- | :--------------------------------------- | :----- |
| Import             | `import { Database } from "bun:sqlite"` | `import { Database } from "sqlite-napi"` | ✅     |
| Instance           | `new Database("path")`                  | `new Database("path")`                   | ✅     |
| Instance with opts | `new Database("path", { readonly })`    | `new Database("path", { readonly })`     | ✅     |
| Query              | `db.query("...")` -> `Statement`        | `db.query("...")` -> `Statement`         | ✅     |
| Result             | `stmt.all()`                            | `stmt.all()`                             | ✅     |
| Meta               | `stmt.run()`                            | `stmt.run()`                             | ✅     |
| Named params       | `stmt.all({ $name: val })`              | `stmt.all({ $name: val })`               | ✅     |
| Column metadata    | `stmt.columns`                          | `stmt.columns`                           | ✅     |
| Statement source   | `stmt.source`                           | `stmt.source`                            | ✅     |
| Transaction state  | `db.inTransaction`                      | `db.inTransaction()`                     | ✅     |
| Custom functions   | `db.createFunction()`                   | `db.createFunction()`                    | ⚠️ stub |
| Custom collations  | `db.createCollation()`                  | `db.createCollation()`                   | ⚠️ stub |
| Pragma             | `db.pragma()`                           | `db.pragma()`                            | ✅     |
| Database path      | `db.filename`                           | `db.filename`                            | ✅     |
| Close connection   | `db.close()`                            | `db.close()`                             | ✅     |
| Check closed       | `db.closed`                             | `db.isClosed()`                          | ✅     |

## Legend

- ✅ Complete and working
- ⚠️ Implemented but may have issues
- ❌ Not implemented
- 🔄 In progress
