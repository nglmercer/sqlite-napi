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

  test("Database.query returns Statement object", () => {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []);
    const stmt = db.query("SELECT * FROM users");
    expect(stmt).toBeDefined();
  });
});
