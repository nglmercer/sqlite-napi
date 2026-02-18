import { Database } from "../index";

async function main() {
  console.log("Starting Bun-compatible SQLite check...");

  const db = new Database(":memory:");
  
  // db.run (matches bun:sqlite for direct execution)
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, bio TEXT)", []);
  console.log("Table created.");

  // db.query returns a Statement (matches bun:sqlite)
  const insert = db.query("INSERT INTO users (name, bio) VALUES (?, ?)");
  
  // statement.run() returns metadata
  const res1 = insert.run(["Alice", "Loves Rust"]);
  console.log("Insert 1:", res1);
  
  const res2 = insert.run(["Bob", "Bun lover"]);
  console.log("Insert 2:", res2);

  // statement.all() returns all rows
  const queryAll = db.query("SELECT * FROM users");
  const allUsers = queryAll.all([]);
  console.log("All Users:", JSON.stringify(allUsers, null, 2));

  // statement.get() returns single row
  const queryOne = db.query("SELECT * FROM users WHERE name = ?");
  const alice = queryOne.get(["Alice"]);
  console.log("Single User (Alice):", alice);

  const nobody = queryOne.get(["Nobody"]);
  console.log("Single User (None):", nobody);

  console.log("API check completed successfully!");
}

main().catch(console.error);
