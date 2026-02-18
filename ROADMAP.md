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

- [x] Implement `database.transaction(callback)` - returns Transaction object with commit/rollback
- [x] Support for nested transactions (Savepoints) - via `transaction.savepoint(name)`
- [x] Ensure `deferred`, `immediate`, and `exclusive` transaction modes

## Phase 3: Advanced Bun Features

- [ ] Implement `database.loadExtension(path)`
- [ ] Implement `database.serialize()` and `database.deserialize()` (In-memory back/restore)k
- [ ] BLOB support: Automatic conversion to/from `Uint8Array`
- [ ] `BigInt` support for 64-bit integers
- [ ] Implement `statement.finalize()` and automatic cleanup

## Phase 4: Performance & Optimization

- [ ] Statement caching (reuse prepared statements internally)
- [ ] Zero-copy serialization where possible
- [ ] Benchmarking against `bun:sqlite` and `better-sqlite3`
- [ ] Optimize parameter binding for high-frequency inserts

## Phase 5: Developer Experience

- [ ] Auto-generate TypeScript definitions that match `bun:sqlite` types
- [ ] Support for mapping query results directly to JS classes
- [ ] Comprehensive documentation and migration guide from `better-sqlite3`

## API Comparison Goal

| Feature  | `bun:sqlite`                            | `sqlite-napi`                            |
| :------- | :-------------------------------------- | :--------------------------------------- |
| Import   | `import { Database } from "bun:sqlite"` | `import { Database } from "sqlite-napi"` |
| Instance | `new Database("path")`                  | `new Database("path")`                   |
| Query    | `db.query("...")` -> `Statement`        | `db.query("...")` -> `Statement`         |
| Result   | `stmt.all()`                            | `stmt.all()`                             |
| Meta     | `stmt.run()`                            | `stmt.run()`                             |
