import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

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
    // Error occurs at execution time, not at query creation
    const stmt = db.query("SELECT FROM INVALID");
    expect(() => {
      stmt.all();
    }).toThrow();
  });

  test("throws on invalid SQL in exec", () => {
    expect(() => {
      db.exec("INVALID SQL SYNTAX");
    }).toThrow();
  });

  test("throws on constraint violation - UNIQUE", () => {
    db.exec("CREATE TABLE unique_test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)");
    db.run("INSERT INTO unique_test (name) VALUES (?)", ["Alice"]);
    
    expect(() => {
      db.run("INSERT INTO unique_test (name) VALUES (?)", ["Alice"]);
    }).toThrow();
  });

  test("throws on constraint violation - NOT NULL", () => {
    db.exec("CREATE TABLE not_null_test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    
    expect(() => {
      db.run("INSERT INTO not_null_test (name) VALUES (?)", [null]);
    }).toThrow();
  });

  test("throws on constraint violation - PRIMARY KEY", () => {
    db.exec("CREATE TABLE pk_test (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO pk_test (id, name) VALUES (?, ?)", [1, "Alice"]);
    
    expect(() => {
      db.run("INSERT INTO pk_test (id, name) VALUES (?, ?)", [1, "Bob"]);
    }).toThrow();
  });

  test("throws on table not found", () => {
    // Error occurs at execution time, not at query creation
    const stmt = db.query("SELECT * FROM nonexistent_table");
    expect(() => {
      stmt.all();
    }).toThrow();
  });

  test("throws on column not found", () => {
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
    
    // Error occurs at execution time, not at query creation
    const stmt = db.query("SELECT nonexistent_column FROM test");
    expect(() => {
      stmt.all();
    }).toThrow();
  });

  test("throws on syntax error near keyword", () => {
    expect(() => {
      db.exec("SELECT SELECT FROM");
    }).toThrow();
  });

  test("throws on mismatched parentheses", () => {
    expect(() => {
      db.exec("SELECT (1 + 2 FROM test");
    }).toThrow();
  });

  test("throws on invalid transaction mode gracefully handled", () => {
    // Invalid mode should default to DEFERRED, not throw
    const tx = db.transaction("invalid_mode");
    expect(tx).toBeDefined();
    tx.rollback();
  });

  test("throws on foreign key violation", () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);
    
    // Enable foreign key enforcement
    db.exec("PRAGMA foreign_keys = ON");
    
    expect(() => {
      db.run("INSERT INTO child (parent_id) VALUES (?)", [999]);
    }).toThrow();
  });

  test("throws on check constraint violation", () => {
    db.exec("CREATE TABLE check_test (id INTEGER PRIMARY KEY, age INTEGER CHECK(age >= 0))");
    
    expect(() => {
      db.run("INSERT INTO check_test (age) VALUES (?)", [-1]);
    }).toThrow();
  });

  test("error message contains useful information", () => {
    let errorMessage = "";
    try {
      db.exec("SELECT * FROM nonexistent");
    } catch (e: any) {
      errorMessage = e.message || String(e);
    }
    
    expect(errorMessage.length).toBeGreaterThan(0);
    expect(errorMessage.toLowerCase()).toContain("no such table");
  });
});
