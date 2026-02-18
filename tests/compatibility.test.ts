import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

/**
 * These tests verify that sqlite-napi matches the bun:sqlite API
 * as specified in the ROADMAP.md
 */

describe("SQLite NAPI - Bun API Compatibility", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  describe("Import and Instance", () => {
    test("matches bun:sqlite - import Database class", () => {
      expect(Database).toBeDefined();
      expect(typeof Database).toBe("function");
    });

    test("matches bun:sqlite - new Database(path) creates instance", () => {
      const memoryDb = new Database(":memory:");
      expect(memoryDb).toBeDefined();
      expect(memoryDb).toBeInstanceOf(Database);
    });

    test("matches bun:sqlite - new Database(':memory:') for in-memory database", () => {
      const memoryDb = new Database(":memory:");
      memoryDb.exec("CREATE TABLE test (id INTEGER)");
      const stmt = memoryDb.query("SELECT COUNT(*) as count FROM test");
      const row = stmt.get([]);
      expect((row as any).count).toBe(0);
    });
  });

  describe("Query API", () => {
    test("matches bun:sqlite - db.query(sql) returns Statement", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      const stmt = db.query("SELECT * FROM users");
      
      expect(stmt).toBeDefined();
      expect(typeof stmt.all).toBe("function");
      expect(typeof stmt.get).toBe("function");
      expect(typeof stmt.run).toBe("function");
      expect(typeof stmt.values).toBe("function");
    });

    test("matches bun:sqlite - db.run(sql, params) for direct execution", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      const result = db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      
      expect(result).toHaveProperty("changes");
      expect(result).toHaveProperty("lastInsertRowid");
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });
  });

  describe("Statement Methods", () => {
    beforeEach(() => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, bio TEXT)");
      db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Alice", "Loves Rust"]);
      db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Bob", "Bun lover"]);
    });

    test("matches bun:sqlite - statement.all(params) returns all rows", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY name");
      const rows = stmt.all([]);
      
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(2);
      expect((rows[0] as any).name).toBe("Alice");
      expect((rows[1] as any).name).toBe("Bob");
    });

    test("matches bun:sqlite - statement.get(params) returns first row", () => {
      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get(["Alice"]);
      
      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
      expect((row as any).bio).toBe("Loves Rust");
    });

    test("matches bun:sqlite - statement.get(params) returns null if not found", () => {
      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get(["NonExistent"]);
      
      expect(row).toBeNull();
    });

    test("matches bun:sqlite - statement.run(params) returns metadata", () => {
      const stmt = db.query("INSERT INTO users (name, bio) VALUES (?, ?)");
      const result = stmt.run(["Charlie", "New user"]);
      
      expect(result).toHaveProperty("changes");
      expect(result).toHaveProperty("lastInsertRowid");
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(3);
    });

    test("matches bun:sqlite - statement.values(params) returns rows as arrays", () => {
      const stmt = db.query("SELECT name, bio FROM users ORDER BY name");
      const values = stmt.values([]);
      
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(2);
      expect(values[0]).toEqual(["Alice", "Loves Rust"]);
      expect(values[1]).toEqual(["Bob", "Bun lover"]);
    });
  });

  describe("Parameter Binding", () => {
    beforeEach(() => {
      db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL, active INTEGER)");
    });

    test("matches bun:sqlite - positional parameters with ?", () => {
      db.run("INSERT INTO items (name, price) VALUES (?, ?)", ["Widget", 9.99]);
      
      const stmt = db.query("SELECT * FROM items WHERE name = ?");
      const row = stmt.get(["Widget"]);
      
      expect((row as any).name).toBe("Widget");
      expect((row as any).price).toBeCloseTo(9.99);
    });

    test("matches bun:sqlite - multiple positional parameters", () => {
      db.run("INSERT INTO items (name, price, active) VALUES (?, ?, ?)", ["Gadget", 19.99, 1]);
      
      const stmt = db.query("SELECT * FROM items WHERE name = ? AND active = ?");
      const row = stmt.get(["Gadget", 1]);
      
      expect((row as any).name).toBe("Gadget");
      expect((row as any).active).toBe(1);
    });
  });

  describe("Result Structure", () => {
    test("matches bun:sqlite - QueryResult has changes and lastInsertRowid", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      
      const result = db.run("INSERT INTO test (value) VALUES (?)", ["test"]);
      
      expect(result).toEqual({
        changes: expect.any(Number),
        lastInsertRowid: expect.any(Number),
      });
    });

    test("matches bun:sqlite - changes reflects affected rows", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      db.run("INSERT INTO test (value) VALUES (?)", ["a"]);
      db.run("INSERT INTO test (value) VALUES (?)", ["b"]);
      db.run("INSERT INTO test (value) VALUES (?)", ["c"]);
      
      const result = db.run("UPDATE test SET value = 'updated'", []);
      
      expect(result.changes).toBe(3);
    });

    test("matches bun:sqlite - lastInsertRowid returns last inserted id", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      
      const r1 = db.run("INSERT INTO test (value) VALUES (?)", ["a"]);
      expect(r1.lastInsertRowid).toBe(1);
      
      const r2 = db.run("INSERT INTO test (value) VALUES (?)", ["b"]);
      expect(r2.lastInsertRowid).toBe(2);
      
      const r3 = db.run("INSERT INTO test (value) VALUES (?)", ["c"]);
      expect(r3.lastInsertRowid).toBe(3);
    });
  });

  describe("Transaction Support", () => {
    beforeEach(() => {
      db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)");
      db.run("INSERT INTO accounts (balance) VALUES (?)", [100]);
    });

    test("matches bun:sqlite - transaction() creates transaction", () => {
      const tx = db.transaction(null);
      expect(tx).toBeDefined();
      expect(typeof tx.commit).toBe("function");
      expect(typeof tx.rollback).toBe("function");
    });

    test("matches bun:sqlite - commit() persists changes", () => {
      const tx = db.transaction(null);
      db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
      tx.commit();
      
      const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
      const row = stmt.get([]);
      expect((row as any).count).toBe(2);
    });

    test("matches bun:sqlite - rollback() reverts changes", () => {
      const tx = db.transaction(null);
      db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
      tx.rollback();
      
      const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
      const row = stmt.get([]);
      expect((row as any).count).toBe(1);
    });
  });
});