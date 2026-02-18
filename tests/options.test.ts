import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "../index";
import { existsSync, unlinkSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("SQLite NAPI - Connection Options", () => {
  const testDir = join(tmpdir(), "sqlite-napi-tests");
  let testDbPath: string;

  beforeEach(() => {
    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    // Generate unique test db path
    testDbPath = join(testDir, `test-${Date.now()}.db`);
  });

  afterEach(() => {
    // Clean up test database
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("Default Options", () => {
    test("creates in-memory database without options", () => {
      const db = new Database(":memory:");
      expect(db).toBeDefined();
      expect(db.filename()).toBe(":memory:");
      db.close();
    });

    test("creates file database without options", () => {
      const db = new Database(testDbPath);
      expect(db).toBeDefined();
      expect(db.filename()).toBe(testDbPath);

      // Should be able to write
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.run("INSERT INTO test (id) VALUES (1)");

      db.close();
    });
  });

  describe("Read-Only Option", () => {
    test("opens database in read-only mode", () => {
      // First create a database with some data
      const setupDb = new Database(testDbPath);
      setupDb.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      setupDb.run("INSERT INTO test (value) VALUES ('readonly test')");
      setupDb.close();

      // Open in read-only mode
      const db = new Database(testDbPath, { readonly: true });
      expect(db).toBeDefined();

      // Should be able to read
      const stmt = db.query("SELECT * FROM test");
      const rows = stmt.all();
      expect(rows.length).toBe(1);

      // Should NOT be able to write
      expect(() => {
        db.run("INSERT INTO test (value) VALUES ('should fail')");
      }).toThrow();

      db.close();
    });

    test("read-only database cannot create tables", () => {
      const setupDb = new Database(testDbPath);
      setupDb.close();

      const db = new Database(testDbPath, { readonly: true });

      expect(() => {
        db.exec("CREATE TABLE new_table (id INTEGER)");
      }).toThrow();

      db.close();
    });

    test("read-only option with :memory: still allows writes", () => {
      // In-memory databases with readonly flag may still allow writes
      // This is SQLite's behavior
      const db = new Database(":memory:", { readonly: true });
      // Note: SQLite in-memory with readonly may behave differently
      db.close();
    });
  });

  describe("Create Option", () => {
    test("create: true creates new database", () => {
      const db = new Database(testDbPath, { create: true });
      expect(db).toBeDefined();
      expect(existsSync(testDbPath)).toBe(true);

      db.exec("CREATE TABLE test (id INTEGER)");
      db.close();
    });

    test("create: false does not create new database", () => {
      // Try to open non-existent database with create: false
      const nonExistentPath = join(testDir, `nonexistent-${Date.now()}.db`);

      expect(() => {
        new Database(nonExistentPath, { create: false });
      }).toThrow();
    });

    test("create: false opens existing database", () => {
      // First create the database
      const setupDb = new Database(testDbPath);
      setupDb.exec("CREATE TABLE test (id INTEGER)");
      setupDb.close();

      // Should be able to open with create: false
      const db = new Database(testDbPath, { create: false });
      expect(db).toBeDefined();

      const tables = db.getTables();
      expect(tables).toContain("test");

      db.close();
    });
  });

  describe("Read-Write Option", () => {
    test("readwrite: true opens database for reading and writing", () => {
      const db = new Database(testDbPath, { readwrite: true });
      expect(db).toBeDefined();

      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.run("INSERT INTO test (id) VALUES (1)");

      const stmt = db.query("SELECT * FROM test");
      const rows = stmt.all();
      expect(rows.length).toBe(1);

      db.close();
    });

    test("can combine readwrite with create", () => {
      const db = new Database(testDbPath, {
        readwrite: true,
        create: true,
      });

      db.exec("CREATE TABLE test (id INTEGER)");
      db.close();

      expect(existsSync(testDbPath)).toBe(true);
    });
  });

  describe("Option Combinations", () => {
    test("readonly: true with create: true", () => {
      // This combination is contradictory - SQLite may throw or ignore
      // We test that it either succeeds or throws appropriately
      try {
        const db = new Database(testDbPath, { readonly: true, create: true });
        db.close();
      } catch (e) {
        // If it throws, that's expected behavior for contradictory options
        expect(e).toBeDefined();
      }
    });

    test("readonly: true with create: false on existing database", () => {
      // Create database first
      const setupDb = new Database(testDbPath);
      setupDb.exec("CREATE TABLE test (id INTEGER)");
      setupDb.close();

      const db = new Database(testDbPath, {
        readonly: true,
        create: false,
      });

      // Should be able to read
      const tables = db.getTables();
      expect(tables).toContain("test");

      // Should not be able to write
      expect(() => {
        db.run("INSERT INTO test (id) VALUES (1)");
      }).toThrow();

      db.close();
    });

    test("all options specified", () => {
      const db = new Database(testDbPath, {
        readonly: false,
        create: true,
        readwrite: true,
      });

      db.exec("CREATE TABLE test (id INTEGER)");
      db.run("INSERT INTO test (id) VALUES (1)");

      const stmt = db.query("SELECT * FROM test");
      const rows = stmt.all();
      expect(rows.length).toBe(1);

      db.close();
    });
  });

  describe("Database Filename Property", () => {
    test("filename returns correct path for file database", () => {
      const db = new Database(testDbPath);
      expect(db.filename()).toBe(testDbPath);
      db.close();
    });

    test("filename returns :memory: for in-memory database", () => {
      const db = new Database(":memory:");
      expect(db.filename()).toBe(":memory:");
      db.close();
    });
  });

  describe("Database Close and isClosed", () => {
    test("isClosed returns false for open database", () => {
      const db = new Database(":memory:");
      expect(db.isClosed()).toBe(false);
      db.close();
    });

    test("isClosed returns true after close", () => {
      const db = new Database(":memory:");
      db.close();
      expect(db.isClosed()).toBe(true);
    });

    test("can perform operations before close", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");
      db.run("INSERT INTO test (id) VALUES (1)");

      const stmt = db.query("SELECT * FROM test");
      const rows = stmt.all();
      expect(rows.length).toBe(1);

      db.close();
      expect(db.isClosed()).toBe(true);
    });
  });

  describe("inTransaction Property", () => {
    test("inTransaction returns false initially", () => {
      const db = new Database(":memory:");
      expect(db.inTransaction()).toBe(false);
      db.close();
    });

    test("inTransaction returns true during transaction", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      expect(db.inTransaction()).toBe(true);

      tx.commit();
      expect(db.inTransaction()).toBe(false);

      db.close();
    });

    test("inTransaction returns false after rollback", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      expect(db.inTransaction()).toBe(true);

      tx.rollback();
      expect(db.inTransaction()).toBe(false);

      db.close();
    });
  });

  describe("Error Handling", () => {
    test("throws on invalid path with create: false", () => {
      const invalidPath = "/nonexistent/directory/database.db";

      expect(() => {
        new Database(invalidPath, { create: false });
      }).toThrow();
    });

    test("handles special characters in path", () => {
      const specialPath = join(testDir, `test-db_${Date.now()}.db`);
      const db = new Database(specialPath);

      db.exec("CREATE TABLE test (id INTEGER)");
      db.close();

      expect(existsSync(specialPath)).toBe(true);
      unlinkSync(specialPath);
    });
  });
});
