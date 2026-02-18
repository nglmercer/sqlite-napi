import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Transaction Support", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)");
    db.run("INSERT INTO accounts (balance) VALUES (?)", [100]);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [100]);
  });

  test("Database.transaction creates transaction with default mode", () => {
    const tx = db.transaction(null);
    expect(tx).toBeDefined();
  });

  test("Database.transaction with deferred mode", () => {
    const tx = db.transaction("deferred");
    expect(tx).toBeDefined();
  });

  test("Database.transaction with immediate mode", () => {
    const tx = db.transaction("immediate");
    expect(tx).toBeDefined();
  });

  test("Database.transaction with exclusive mode", () => {
    const tx = db.transaction("exclusive");
    expect(tx).toBeDefined();
  });

  test("Transaction.commit commits changes", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    tx.commit();
    
    const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    const row = stmt.get([]);
    expect((row as any).count).toBe(3);
  });

  test("Transaction.rollback reverts changes", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    tx.rollback();
    
    const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    const row = stmt.get([]);
    expect((row as any).count).toBe(2);
  });

  test("Database.transactionFn executes multiple statements atomically", () => {
    const result = db.transactionFn(null, [
      "INSERT INTO accounts (balance) VALUES (300)",
      "INSERT INTO accounts (balance) VALUES (400)",
    ]);
    
    expect(result).toBeDefined();
    expect(result.changes).toBe(1);
    
    const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    const row = stmt.get([]);
    expect((row as any).count).toBe(4);
  });

  test("Database.transactionFn rolls back on error", () => {
    // This should fail on the second statement due to invalid SQL
    expect(() => {
      db.transactionFn(null, [
        "INSERT INTO accounts (balance) VALUES (300)",
        "INVALID SQL STATEMENT",
      ]);
    }).toThrow();
    
    // Verify no changes were committed
    const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    const row = stmt.get([]);
    expect((row as any).count).toBe(2);
  });

  test("Transaction.savepoint creates nested transaction", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    
    const savepoint = tx.savepoint("sp1");
    db.run("INSERT INTO accounts (balance) VALUES (?)", [300]);
    
    // Check we have 4 rows before rollback
    let stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    let row = stmt.get([]);
    expect((row as any).count).toBe(4);
    
    savepoint.rollback();
    
    // After savepoint rollback, should have 3 rows
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect((row as any).count).toBe(3);
    
    tx.commit();
  });

  test("Multiple savepoints work correctly", () => {
    const tx = db.transaction(null);
    
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    
    const sp1 = tx.savepoint("sp1");
    db.run("INSERT INTO accounts (balance) VALUES (?)", [300]);
    
    const sp2 = sp1.savepoint("sp2");
    db.run("INSERT INTO accounts (balance) VALUES (?)", [400]);
    
    // Should have 5 rows
    let stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    let row = stmt.get([]);
    expect((row as any).count).toBe(5);
    
    sp2.rollback();
    
    // Should have 4 rows after sp2 rollback
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect((row as any).count).toBe(4);
    
    sp1.commit();
    tx.commit();
    
    // Final count should be 4
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect((row as any).count).toBe(4);
  });

  test("Database.exec executes SQL directly", () => {
    const result = db.exec("INSERT INTO accounts (balance) VALUES (500)");
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(3);
  });

  test("Database.exec for DDL operations", () => {
    const result = db.exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY)");
    expect(result).toBeDefined();
    
    // Verify table was created
    const stmt = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'");
    const row = stmt.get([]);
    expect((row as any).name).toBe("test_table");
  });
});
