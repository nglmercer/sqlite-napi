import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Statement Class", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, bio TEXT)", []);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Alice", "Loves Rust"]);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Bob", "Bun lover"]);
    db.run("INSERT INTO users (name, bio) VALUES (?, ?)", ["Charlie", "TypeScript fan"]);
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

  test("Statement.all with multiple results", () => {
    const stmt = db.query("SELECT name FROM users ORDER BY name");
    const rows = stmt.all([]);
    
    expect(rows.length).toBe(3);
    expect((rows[0] as any).name).toBe("Alice");
    expect((rows[1] as any).name).toBe("Bob");
    expect((rows[2] as any).name).toBe("Charlie");
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

  test("Statement.get returns first row only", () => {
    const stmt = db.query("SELECT * FROM users ORDER BY name");
    const row = stmt.get([]);
    
    expect((row as any).name).toBe("Alice");
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

  test("Statement.run executes UPDATE with no changes", () => {
    const stmt = db.query("UPDATE users SET bio = ? WHERE name = ?");
    const result = stmt.run(["Updated bio", "NonExistent"]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(0);
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

  test("Statement.run executes DELETE with no matches", () => {
    const stmt = db.query("DELETE FROM users WHERE name = ?");
    const result = stmt.run(["NonExistent"]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(0);
    
    // Verify no deletion
    const countStmt = db.query("SELECT COUNT(*) as count FROM users");
    const countRow = countStmt.get([]);
    expect((countRow as any).count).toBe(3);
  });

  test("Statement can be reused multiple times", () => {
    const stmt = db.query("INSERT INTO users (name, bio) VALUES (?, ?)");
    
    stmt.run(["Dave", "User 1"]);
    stmt.run(["Eve", "User 2"]);
    stmt.run(["Frank", "User 3"]);
    
    const countStmt = db.query("SELECT COUNT(*) as count FROM users");
    const countRow = countStmt.get([]);
    expect((countRow as any).count).toBe(6);
  });
});
