import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "../index";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("SQLite NAPI - Database Properties", () => {
  const testDir = join(tmpdir(), "sqlite-napi-property-tests");
  let testDbPath: string;

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    testDbPath = join(testDir, `test-${Date.now()}.db`);
  });

  afterEach(() => {
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("filename property", () => {
    test("returns :memory: for in-memory database", () => {
      const db = new Database(":memory:");
      expect(db.filename()).toBe(":memory:");
      db.close();
    });

    test("returns file path for file database", () => {
      const db = new Database(testDbPath);
      expect(db.filename()).toBe(testDbPath);
      db.close();
    });

    test("returns correct path after operations", () => {
      const db = new Database(testDbPath);
      db.exec("CREATE TABLE test (id INTEGER)");
      db.run("INSERT INTO test (id) VALUES (1)");

      expect(db.filename()).toBe(testDbPath);
      db.close();
    });

    test("filename remains consistent after close", () => {
      const db = new Database(testDbPath);
      const filename = db.filename();
      db.close();

      // Filename should still be accessible after close
      expect(db.filename()).toBe(filename);
    });
  });

  describe("isClosed property", () => {
    test("returns false for newly opened database", () => {
      const db = new Database(":memory:");
      expect(db.isClosed()).toBe(false);
      db.close();
    });

    test("returns false during normal operations", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      expect(db.isClosed()).toBe(false);

      db.run("INSERT INTO test (id) VALUES (1)");
      expect(db.isClosed()).toBe(false);

      const stmt = db.query("SELECT * FROM test");
      stmt.all();
      expect(db.isClosed()).toBe(false);

      db.close();
    });

    test("returns true after close", () => {
      const db = new Database(":memory:");
      db.close();

      expect(db.isClosed()).toBe(true);
    });

    test("returns true after multiple close calls", () => {
      const db = new Database(":memory:");
      db.close();
      db.close(); // Second close should be safe

      expect(db.isClosed()).toBe(true);
    });
  });

  describe("inTransaction property", () => {
    test("returns false initially", () => {
      const db = new Database(":memory:");
      expect(db.inTransaction()).toBe(false);
      db.close();
    });

    test("returns false when no transaction active", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");
      db.run("INSERT INTO test (id) VALUES (1)");

      expect(db.inTransaction()).toBe(false);
      db.close();
    });

    test("returns true during deferred transaction", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction("deferred");
      expect(db.inTransaction()).toBe(true);

      tx.rollback();
      db.close();
    });

    test("returns true during immediate transaction", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction("immediate");
      expect(db.inTransaction()).toBe(true);

      tx.rollback();
      db.close();
    });

    test("returns true during exclusive transaction", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction("exclusive");
      expect(db.inTransaction()).toBe(true);

      tx.rollback();
      db.close();
    });

    test("returns false after commit", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      db.run("INSERT INTO test (id) VALUES (1)");
      tx.commit();

      expect(db.inTransaction()).toBe(false);
      db.close();
    });

    test("returns false after rollback", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      db.run("INSERT INTO test (id) VALUES (1)");
      tx.rollback();

      expect(db.inTransaction()).toBe(false);
      db.close();
    });

    test("tracks nested transactions (savepoints)", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      expect(db.inTransaction()).toBe(true);

      const sp = tx.savepoint("sp1");
      expect(db.inTransaction()).toBe(true);

      sp.commit();
      expect(db.inTransaction()).toBe(true);

      tx.commit();
      expect(db.inTransaction()).toBe(false);

      db.close();
    });

    test("tracks transaction after savepoint rollback", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      const tx = db.transaction(null);
      const sp = tx.savepoint("sp1");

      sp.rollback();
      expect(db.inTransaction()).toBe(true);

      tx.commit();
      expect(db.inTransaction()).toBe(false);

      db.close();
    });
  });

  describe("property combinations", () => {
    test("isClosed and inTransaction interaction", () => {
      const db = new Database(":memory:");
      db.exec("CREATE TABLE test (id INTEGER)");

      expect(db.isClosed()).toBe(false);
      expect(db.inTransaction()).toBe(false);

      const tx = db.transaction(null);
      expect(db.isClosed()).toBe(false);
      expect(db.inTransaction()).toBe(true);

      tx.commit();
      expect(db.isClosed()).toBe(false);
      expect(db.inTransaction()).toBe(false);

      db.close();
      expect(db.isClosed()).toBe(true);
      // inTransaction state after close is undefined behavior
    });

    test("filename accessible after close", () => {
      const db = new Database(testDbPath);
      const filename = db.filename();

      db.close();

      // Filename should still be accessible
      expect(db.filename()).toBe(filename);
    });
  });

  describe("property consistency", () => {
    test("multiple calls return same value", () => {
      const db = new Database(":memory:");

      expect(db.filename()).toBe(db.filename());
      expect(db.isClosed()).toBe(db.isClosed());
      expect(db.inTransaction()).toBe(db.inTransaction());

      db.close();
    });

    test("properties work with multiple databases", () => {
      const db1 = new Database(":memory:");
      const db2 = new Database(testDbPath);

      expect(db1.filename()).toBe(":memory:");
      expect(db2.filename()).toBe(testDbPath);

      expect(db1.isClosed()).toBe(false);
      expect(db2.isClosed()).toBe(false);

      db1.close();
      expect(db1.isClosed()).toBe(true);
      expect(db2.isClosed()).toBe(false);

      db2.close();
      expect(db1.isClosed()).toBe(true);
      expect(db2.isClosed()).toBe(true);
    });
  });
});
