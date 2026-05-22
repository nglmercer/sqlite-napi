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
    expect(row && (row as Record<string, unknown>).count).toBe(3);
  });

  test("Transaction.rollback reverts changes", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    tx.rollback();
    
    const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    const row = stmt.get([]);
    expect(row && (row as Record<string, unknown>).count).toBe(2);
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
    expect(row && (row as Record<string, unknown>).count).toBe(4);
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
    expect(row && (row as Record<string, unknown>).count).toBe(2);
  });

  test("Transaction.savepoint creates nested transaction", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
    
    const savepoint = tx.savepoint("sp1");
    db.run("INSERT INTO accounts (balance) VALUES (?)", [300]);
    
    // Check we have 4 rows before rollback
    let stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    let row = stmt.get([]);
    expect(row && (row as Record<string, unknown>).count).toBe(4);
    
    savepoint.rollback();
    
    // After savepoint rollback, should have 3 rows
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect(row && (row as Record<string, unknown>).count).toBe(3);
    
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
    expect(row && (row as Record<string, unknown>).count).toBe(5);
    
    sp2.rollback();
    
    // Should have 4 rows after sp2 rollback
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect(row && (row as Record<string, unknown>).count).toBe(4);
    
    sp1.commit();
    tx.commit();
    
    // Final count should be 4
    stmt = db.query("SELECT COUNT(*) as count FROM accounts");
    row = stmt.get([]);
    expect(row && (row as Record<string, unknown>).count).toBe(4);
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
    expect(row && (row as Record<string, unknown>).name).toBe("test_table");
  });

  // ========================================
  // Transaction Query Methods
  // ========================================

  test("Transaction.query returns a Statement bound to the transaction", () => {
    const tx = db.transaction(null);
    const stmt = tx.query("SELECT * FROM accounts");
    expect(stmt).toBeDefined();
    const rows = stmt.all([]);
    expect(rows.length).toBe(2);
    tx.commit();
  });

  test("Transaction.all returns all rows within transaction", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [999]);
    const rows = tx.all("SELECT * FROM accounts");
    expect(rows.length).toBe(3);
    tx.rollback();
  });

  test("Transaction.get returns first row within transaction", () => {
    const tx = db.transaction(null);
    const row = tx.get("SELECT * FROM accounts WHERE id = ?", [1]);
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).balance).toBe(100);
    tx.commit();
  });

  test("Transaction.get returns null when no rows", () => {
    const tx = db.transaction(null);
    const row = tx.get("SELECT * FROM accounts WHERE id = ?", [999]);
    expect(row).toBeNull();
    tx.commit();
  });

  test("Transaction.values returns rows as arrays within transaction", () => {
    const tx = db.transaction(null);
    const rows = tx.values("SELECT id, balance FROM accounts ORDER BY id");
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual([1, 100]);
    expect(rows[1]).toEqual([2, 100]);
    tx.commit();
  });

  test("Transaction.iter returns iterator within transaction", () => {
    const tx = db.transaction(null);
    const iter = tx.iter("SELECT * FROM accounts ORDER BY id");
    let count = 0;
    while (iter.hasMore()) {
      const row = iter.next();
      expect(row).not.toBeNull();
      expect((row as Record<string, unknown>).id).toBeDefined();
      count++;
    }
    expect(count).toBe(2);
    tx.commit();
  });

  test("Transaction.exec executes SQL directly within transaction", () => {
    const tx = db.transaction(null);
    const result = tx.exec("INSERT INTO accounts (balance) VALUES (777)");
    expect(result.changes).toBe(1);
    const row = tx.get("SELECT balance FROM accounts WHERE balance = 777");
    expect((row as Record<string, unknown>).balance).toBe(777);
    tx.rollback();
  });

  test("Transaction.all with named params within transaction", () => {
    const tx = db.transaction(null);
    db.run("INSERT INTO accounts (balance) VALUES (?)", [500]);
    const row = tx.get("SELECT * FROM accounts WHERE balance = $bal", { $bal: 500 });
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).balance).toBe(500);
    tx.rollback();
  });

  test("Transaction.query + run within savepoint", () => {
    const tx = db.transaction(null);
    tx.run("INSERT INTO accounts (balance) VALUES (?)", [200]);

    const sp = tx.savepoint("sp_test");
    const spStmt = sp.query("INSERT INTO accounts (balance) VALUES (?)");
    spStmt.run([300]);
    spStmt.run([400]);

    const count = sp.get("SELECT COUNT(*) as cnt FROM accounts");
    expect((count as Record<string, unknown>).cnt).toBe(5);

    sp.rollback();

    const afterRollback = tx.get("SELECT COUNT(*) as cnt FROM accounts");
    expect((afterRollback as Record<string, unknown>).cnt).toBe(3);

    tx.commit();
  });
});
