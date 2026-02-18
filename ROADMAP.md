# Bun-Compatible SQLite NAPI Roadmap

Goal: Build a high-performance SQLite library for Node.js/Bun that mirrors the `bun:sqlite` API as closely as possible.

## Phase 1: Core API Parity (Complete ✅)

- [x] Initial project structure with `napi-rs`
- [x] Basic `Database` class with connection management
- [x] Basic synchronous execution (via `execute`)
- [x] Implement `database.query(sql)` returning a `Statement` object
- [x] Implement named and positional parameter support (`$name`, `?1`, etc.)
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

## Phase 5: Developer Experience

- [x] TypeScript definitions (`index.d.ts`) that match `bun:sqlite` types
- [ ] Migration utilities for `better-sqlite3`
- [ ] Comprehensive documentation and usage examples

## API Comparison Goal

| Feature  | `bun:sqlite`                            | `sqlite-napi`                            |
| :------- | :-------------------------------------- | :--------------------------------------- |
| Import   | `import { Database } from "bun:sqlite"` | `import { Database } from "sqlite-napi"` |
| Instance | `new Database("path")`                  | `new Database("path")`                   |
| Query    | `db.query("...")` -> `Statement`        | `db.query("...")` -> `Statement`         |
| Result   | `stmt.all()`                            | `stmt.all()`                             |
| Meta     | `stmt.run()`                            | `stmt.run()`                             |
