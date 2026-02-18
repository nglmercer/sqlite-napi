import { expect, test, describe, beforeEach } from "bun:test";
import { Database, getSqliteVersion } from "../index";

describe("SQLite NAPI - Core Functions", () => {
  test("getSqliteVersion returns version string", () => {
    const version = getSqliteVersion();
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });
});

describe("SQLite NAPI - Database Class", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  test("Database constructor creates in-memory database", () => {
    expect(db).toBeDefined();
    expect(db).toBeInstanceOf(Database);
  });

  test("Database.run creates table and returns metadata", () => {
    const result = db.run("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)", []);
    expect(result).toBeDefined();
    expect(result.changes).toBe(0);
    expect(result.lastInsertRowid).toBe(0);
  });

  test("Database.run executes SQL with parameters", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)", []);
    
    const result = db.run(
      "INSERT INTO users (name, age) VALUES (?, ?)",
      ["Alice", 30]
    );
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);
  });

  test("Database.run with multiple inserts", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    
    const result1 = db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    expect(result1.changes).toBe(1);
    expect(result1.lastInsertRowid).toBe(1);
    
    const result2 = db.run("INSERT INTO users (name) VALUES (?)", ["Bob"]);
    expect(result2.changes).toBe(1);
    expect(result2.lastInsertRowid).toBe(2);
  });
});

describe("SQLite NAPI - Statement Class", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, bio TEXT)", []);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Alice", "Loves Rust"]);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Bob", "Bun lover"]);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Charlie", "TypeScript fan"]);
  });

  test("Database.query returns Statement object", () => {
    const stmt = db.query("SELECT * FROM users");
    expect(stmt).toBeDefined();
  });

  test("Statement.all returns all rows", () => {
    const stmt = db.query("SELECT * FROM users");
    const rows = stmt.all([]);
    
    expect(rows).toBeDefined();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(3);
  });

  test("Statement.all returns correct data structure", () => {
    const stmt = db.query("SELECT name, bio FROM users WHERE name = ?");
    const rows = stmt.all(["Alice"]);
    
    expect(rows.length).toBe(1);
    expect(rows[0]).toHaveProperty("name");
    expect(rows[0]).toHaveProperty("bio");
    expect((rows[0] as any).name).toBe("Alice");
    expect((rows[0] as any).bio).toBe("Loves Rust");
  });

  test("Statement.get returns single row", () => {
    const stmt = db.query("SELECT * FROM users WHERE name = ?");
    const row = stmt.get(["Alice"]);
    
    expect(row).toBeDefined();
    expect(row).not.toBeNull();
    expect((row as any).name).toBe("Alice");
  });

  test("Statement.get returns null for no match", () => {
    const stmt = db.query("SELECT * FROM users WHERE name = ?");
    const row = stmt.get(["NonExistent"]);
    
    expect(row).toBeNull();
  });

  test("Statement.run executes INSERT", () => {
    const stmt = db.query("INSERT INTO users (name, bio) VALUES (?, ?)");
    const result = stmt.run(["Dave", "New user"]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(4);
  });

  test("Statement.run executes UPDATE", () => {
    const stmt = db.query("UPDATE users SET bio = ? WHERE name = ?");
    const result = stmt.run(["Updated bio", "Alice"]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(1);
  });

  test("Statement.run executes DELETE", () => {
    const stmt = db.query("DELETE FROM users WHERE name = ?");
    const result = stmt.run(["Charlie"]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(1);
    
    // Verify deletion
    const countStmt = db.query("SELECT COUNT(*) as count FROM users");
    const countRow = countStmt.get([]);
    expect((countRow as any).count).toBe(2);
  });
});

describe("SQLite NAPI - Data Types", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("CREATE TABLE types_test (id INTEGER PRIMARY KEY, int_val INTEGER, float_val REAL, text_val TEXT, null_val TEXT)", []);
  });

  test("handles INTEGER type", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [42]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(42);
  });

  test("handles REAL/float type", () => {
    db.run("INSERT INTO types_test (float_val) VALUES (?)", [3.14159]);
    const stmt = db.query("SELECT float_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).float_val).toBeCloseTo(3.14159);
  });

  test("handles TEXT type", () => {
    db.run("INSERT INTO types_test (text_val) VALUES (?)", ["Hello, World!"]);
    const stmt = db.query("SELECT text_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).text_val).toBe("Hello, World!");
  });

  test("handles NULL type", () => {
    db.run("INSERT INTO types_test (null_val) VALUES (?)", [null]);
    const stmt = db.query("SELECT null_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).null_val).toBeNull();
  });

  test("handles boolean as integer", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [true]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(1);
  });
});

describe("SQLite NAPI - Error Handling", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  test("throws on invalid SQL in run", () => {
    expect(() => {
      db.run("INVALID SQL SYNTAX", []);
    }).toThrow();
  });

  test("throws on invalid SQL in query", () => {
    expect(() => {
      db.query("SELECT FROM INVALID");
    }).toThrow();
  });

  test("throws on constraint violation", () => {
    db.run("CREATE TABLE unique_test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)", []);
    db.run("INSERT INTO unique_test (name) VALUES (?)", ["Alice"]);
    
    expect(() => {
      db.run("INSERT INTO unique_test (name) VALUES (?)", ["Alice"]);
    }).toThrow();
  });

  test("throws on table not found", () => {
    expect(() => {
      db.query("SELECT * FROM nonexistent_table");
    }).toThrow();
  });
});

describe("SQLite NAPI - Bun API Compatibility", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  test("matches bun:sqlite API - db.run for direct execution", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    const result = db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);
  });

  test("matches bun:sqlite API - db.query returns Statement", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    
    const stmt = db.query("SELECT * FROM users");
    expect(stmt).toBeDefined();
    expect(typeof stmt.all).toBe("function");
    expect(typeof stmt.get).toBe("function");
    expect(typeof stmt.run).toBe("function");
  });

  test("matches bun:sqlite API - statement.all()", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    db.run("INSERT INTO users (name) VALUES (?)", ["Bob"]);
    
    const stmt = db.query("SELECT * FROM users");
    const rows = stmt.all([]);
    
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
  });

  test("matches bun:sqlite API - statement.get()", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);
    
    const stmt = db.query("SELECT * FROM users WHERE name = ?");
    const row = stmt.get(["Alice"]);
    
    expect(row).toBeDefined();
    expect((row as any).name).toBe("Alice");
  });

  test("matches bun:sqlite API - statement.run() returns metadata", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    
    const stmt = db.query("INSERT INTO users (name) VALUES (?)");
    const result = stmt.run(["Alice"]);
    
    expect(result).toHaveProperty("changes");
    expect(result).toHaveProperty("lastInsertRowid");
    expect(result.changes).toBe(1);
  });
});
