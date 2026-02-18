import { Database } from ".";

const db = new Database(":memory:");
db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)");
db.run("INSERT INTO accounts (balance) VALUES (?)", [100]);
db.run("INSERT INTO accounts (balance) VALUES (?)", [100]);

// Test transaction commit
const tx = db.transaction(null);
db.run("INSERT INTO accounts (balance) VALUES (?)", [200]);
tx.commit();

const stmt = db.query("SELECT COUNT(*) as count FROM accounts");
const row = stmt.get([]);
console.log("Count after commit:", (row as any).count);

// Test transaction rollback
const tx2 = db.transaction(null);
db.run("INSERT INTO accounts (balance) VALUES (?)", [300]);
tx2.rollback();

const stmt2 = db.query("SELECT COUNT(*) as count FROM accounts");
const row2 = stmt2.get([]);
console.log("Count after rollback:", (row2 as any).count);

// Test transaction_fn
const result = db.transactionFn(null, [
  "INSERT INTO accounts (balance) VALUES (400)",
  "INSERT INTO accounts (balance) VALUES (500)",
]);

const stmt3 = db.query("SELECT COUNT(*) as count FROM accounts");
const row3 = stmt3.get([]);
console.log("Count after transaction_fn:", (row3 as any).count);

console.log("All transaction tests passed!");
