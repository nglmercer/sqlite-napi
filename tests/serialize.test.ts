import { describe, expect, test } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Binary Serialization", () => {
  describe("serializeBinary", () => {
    test("serializes database with tables and data", () => {
      const db = new Database(":memory:");
      
      db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      db.run("INSERT INTO users (name) VALUES (?)", ["Bob"]);
      
      const buffer = db.serializeBinary();
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      
      // Verify header - SQLite database files start with "SQLite format 3\0"
      const header = buffer.subarray(0, 16).toString("ascii");
      expect(header).toBe("SQLite format 3\0");
    });

    test("serialized buffer can be used to restore database", () => {
      const sourceDb = new Database(":memory:");
      
      sourceDb.run("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      sourceDb.run("INSERT INTO test (value) VALUES (?)", ["original data"]);
      
      const buffer = sourceDb.serializeBinary();
      
      const targetDb = new Database(":memory:");
      targetDb.deserializeBinary(buffer);
      
      const stmt = targetDb.query("SELECT * FROM test");
      const rows = stmt.all();
      
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe("original data");
    });
  });

  describe("deserializeBinary", () => {
    test("restores database from binary buffer", () => {
      const sourceDb = new Database(":memory:");
      
      sourceDb.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL)");
      sourceDb.run("INSERT INTO items (name, price) VALUES (?, ?)", ["Widget", 9.99]);
      sourceDb.run("INSERT INTO items (name, price) VALUES (?, ?)", ["Gadget", 19.99]);
      
      const buffer = sourceDb.serializeBinary();
      
      const targetDb = new Database(":memory:");
      targetDb.deserializeBinary(buffer);
      
      const stmt = targetDb.query("SELECT * FROM items ORDER BY id");
      const rows = stmt.all();
      
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Widget");
      expect(rows[0].price).toBe(9.99);
      expect(rows[1].name).toBe("Gadget");
      expect(rows[1].price).toBe(19.99);
    });

    test("can modify restored database", () => {
      const sourceDb = new Database(":memory:");
      
      sourceDb.run("CREATE TABLE counter (value INTEGER)");
      sourceDb.run("INSERT INTO counter VALUES (0)");
      
      const buffer = sourceDb.serializeBinary();
      
      const targetDb = new Database(":memory:");
      targetDb.deserializeBinary(buffer);
      
      // Modify the restored database
      targetDb.run("UPDATE counter SET value = value + 1");
      
      const stmt = targetDb.query("SELECT value FROM counter");
      const row = stmt.get();
      
      expect(row?.value).toBe(1);
    });

    test("handles read-only flag", () => {
      const sourceDb = new Database(":memory:");
      
      sourceDb.run("CREATE TABLE data (value TEXT)");
      sourceDb.run("INSERT INTO data VALUES ('test')");
      
      const buffer = sourceDb.serializeBinary();
      
      const targetDb = new Database(":memory:");
      targetDb.deserializeBinary(buffer, true);
      
      // Verify data is accessible
      const stmt = targetDb.query("SELECT * FROM data");
      const rows = stmt.all();
      
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe("test");
    });
  });

  describe("round-trip serialization", () => {
    test("multiple round trips preserve data integrity", () => {
      const db1 = new Database(":memory:");
      
      db1.run("CREATE TABLE nested (id INTEGER PRIMARY KEY, json TEXT)");
      db1.run("INSERT INTO nested (json) VALUES (?)", ['{"key": "value"}']);
      
      const buffer1 = db1.serializeBinary();
      
      const db2 = new Database(":memory:");
      db2.deserializeBinary(buffer1);
      
      // Add more data
      db2.run("INSERT INTO nested (json) VALUES (?)", ['{"another": "entry"}']);
      
      const buffer2 = db2.serializeBinary();
      
      const db3 = new Database(":memory:");
      db3.deserializeBinary(buffer2);
      
      const stmt = db3.query("SELECT * FROM nested ORDER BY id");
      const rows = stmt.all();
      
      expect(rows).toHaveLength(2);
      expect(rows[0].json).toBe('{"key": "value"}');
      expect(rows[1].json).toBe('{"another": "entry"}');
    });

    test("preserves all SQLite data types", () => {
      const sourceDb = new Database(":memory:");
      
      sourceDb.run(`
        CREATE TABLE types (
          id INTEGER PRIMARY KEY,
          int_val INTEGER,
          real_val REAL,
          text_val TEXT,
          null_val TEXT
        )
      `);
      
      sourceDb.run(
        "INSERT INTO types (int_val, real_val, text_val, null_val) VALUES (?, ?, ?, ?)",
        [42, 3.14159, "Hello, SQLite!", null]
      );
      
      const buffer = sourceDb.serializeBinary();
      
      const targetDb = new Database(":memory:");
      targetDb.deserializeBinary(buffer);
      
      const stmt = targetDb.query("SELECT * FROM types");
      const row = stmt.get();
      
      expect(row?.int_val).toBe(42);
      expect(row?.real_val).toBeCloseTo(3.14159);
      expect(row?.text_val).toBe("Hello, SQLite!");
      expect(row?.null_val).toBeNull();
    });
  });
});
