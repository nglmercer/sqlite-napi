import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Data Types", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE types_test (id INTEGER PRIMARY KEY, int_val INTEGER, float_val REAL, text_val TEXT, null_val TEXT, blob_val BLOB)");
  });

  test("handles INTEGER type", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [42]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(42);
  });

  test("handles negative INTEGER type", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [-12345]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(-12345);
  });

  test("handles large INTEGER type", () => {
    const largeInt = 9007199254740991; // MAX_SAFE_INTEGER
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [largeInt]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(largeInt);
  });

  test("handles REAL/float type", () => {
    db.run("INSERT INTO types_test (float_val) VALUES (?)", [3.14159]);
    const stmt = db.query("SELECT float_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).float_val).toBeCloseTo(3.14159);
  });

  test("handles REAL with negative value", () => {
    db.run("INSERT INTO types_test (float_val) VALUES (?)", [-2.71828]);
    const stmt = db.query("SELECT float_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).float_val).toBeCloseTo(-2.71828);
  });

  test("handles REAL with very small value", () => {
    db.run("INSERT INTO types_test (float_val) VALUES (?)", [0.000001]);
    const stmt = db.query("SELECT float_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).float_val).toBeCloseTo(0.000001);
  });

  test("handles TEXT type", () => {
    db.run("INSERT INTO types_test (text_val) VALUES (?)", ["Hello, World!"]);
    const stmt = db.query("SELECT text_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).text_val).toBe("Hello, World!");
  });

  test("handles TEXT with unicode", () => {
    db.run("INSERT INTO types_test (text_val) VALUES (?)", ["Hello 世界 🌍"]);
    const stmt = db.query("SELECT text_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).text_val).toBe("Hello 世界 🌍");
  });

  test("handles TEXT with empty string", () => {
    db.run("INSERT INTO types_test (text_val) VALUES (?)", [""]);
    const stmt = db.query("SELECT text_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).text_val).toBe("");
  });

  test("handles NULL type", () => {
    db.run("INSERT INTO types_test (null_val) VALUES (?)", [null]);
    const stmt = db.query("SELECT null_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).null_val).toBeNull();
  });

  test("handles boolean true as integer", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [true]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(1);
  });

  test("handles boolean false as integer", () => {
    db.run("INSERT INTO types_test (int_val) VALUES (?)", [false]);
    const stmt = db.query("SELECT int_val FROM types_test");
    const row = stmt.get([]);
    expect((row as any).int_val).toBe(0);
  });

  test("handles multiple columns with different types", () => {
    db.run(
      "INSERT INTO types_test (int_val, float_val, text_val, null_val) VALUES (?, ?, ?, ?)",
      [42, 3.14, "test", null]
    );
    const stmt = db.query("SELECT int_val, float_val, text_val, null_val FROM types_test");
    const row = stmt.get([]);
    
    expect((row as any).int_val).toBe(42);
    expect((row as any).float_val).toBeCloseTo(3.14);
    expect((row as any).text_val).toBe("test");
    expect((row as any).null_val).toBeNull();
  });

  test("Statement.values returns rows as arrays", () => {
    db.run("INSERT INTO types_test (int_val, text_val) VALUES (?, ?)", [1, "a"]);
    db.run("INSERT INTO types_test (int_val, text_val) VALUES (?, ?)", [2, "b"]);
    
    const stmt = db.query("SELECT int_val, text_val FROM types_test ORDER BY int_val");
    const values = stmt.values([]);
    
    expect(values).toBeDefined();
    expect(Array.isArray(values)).toBe(true);
    expect(values.length).toBe(2);
    expect(values[0]).toEqual([1, "a"]);
    expect(values[1]).toEqual([2, "b"]);
  });

  test("Statement.values with single column", () => {
    db.run("INSERT INTO types_test (text_val) VALUES (?)", ["single"]);
    
    const stmt = db.query("SELECT text_val FROM types_test");
    const values = stmt.values([]);
    
    expect(values.length).toBe(1);
    expect(values[0]).toEqual(["single"]);
  });

  test("Statement.values with no results", () => {
    const stmt = db.query("SELECT * FROM types_test WHERE id = 999");
    const values = stmt.values([]);
    
    expect(values).toBeDefined();
    expect(values.length).toBe(0);
  });
});
