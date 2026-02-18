import { Database, getSqliteVersion } from "sqlite-napi";

async function main() {
  console.log("SQLite NAPI - Full API Demo\n");
  console.log("SQLite Version:", getSqliteVersion());

  // Create an in-memory database
  const db = new Database(":memory:");

  // ========================================
  // Basic Operations
  // ========================================
  console.log("\n--- Basic Operations ---");

  // Create tables
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, age INTEGER)");
  db.run("CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, content TEXT)");

  // Insert data using prepared statements
  const insertUser = db.query("INSERT INTO users (name, email, age) VALUES (?, ?, ?)");
  insertUser.run(["Alice", "alice@example.com", 25]);
  insertUser.run(["Bob", "bob@example.com", 30]);
  insertUser.run(["Charlie", "charlie@example.com", 35]);

  const insertPost = db.query("INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)");
  insertPost.run([1, "Hello World", "This is Alice's first post"]);
  insertPost.run([1, "Another Post", "Alice strikes again"]);
  insertPost.run([2, "Bob's Thoughts", "Hello from Bob"]);

  // Query all users
  const getAllUsers = db.query("SELECT * FROM users");
  const users = getAllUsers.all();
  console.log("All Users:", JSON.stringify(users, null, 2));

  // Query with parameters
  const getUserById = db.query("SELECT * FROM users WHERE id = ?");
  const user = getUserById.get([1]);
  console.log("User by ID:", user);

  // Query with named parameters
  const getUserByName = db.query("SELECT * FROM users WHERE name = $name");
  const alice = getUserByName.get({ $name: "Alice" });
  console.log("User by name:", alice);

  // Get values as arrays
  const getUserNames = db.query("SELECT name, age FROM users");
  const values = getUserNames.values();
  console.log("User names and ages (as arrays):", values);

  // ========================================
  // Iterators
  // ========================================
  console.log("\n--- Iterators ---");

  const iter = db.query("SELECT * FROM users").iter();
  console.log("Iterating through users:");
  while (iter.hasMore()) {
    const row = iter.next();
    console.log(" -", row);
  }

  // ========================================
  // Transactions
  // ========================================
  console.log("\n--- Transactions ---");

  const tx = db.transaction("deferred");
  try {
    tx.run("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", ["David", "david@example.com", 28]);
    tx.run("INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)", [4, " David's Post", "Hello from David"]);
    tx.commit();
    console.log("Transaction committed successfully");
  } catch (e) {
    tx.rollback();
    console.log("Transaction rolled back:", e);
  }

  // Nested transactions with savepoints
  const tx2 = db.transaction();
  try {
    tx2.run("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", ["Eve", "eve@example.com", 22]);
    
    const sp = tx2.savepoint("my_savepoint");
    try {
      sp.run("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", ["Frank", "frank@example.com", 27]);
      sp.commit();
      console.log("Savepoint committed");
    } catch (e) {
      sp.rollback();
      console.log("Savepoint rolled back");
    }
    
    tx2.commit();
    console.log("Outer transaction committed");
  } catch (e) {
    tx2.rollback();
  }

  // ========================================
  // Schema Introspection
  // ========================================
  console.log("\n--- Schema Introspection ---");

  const tables = db.getTables();
  console.log("Tables:", tables);

  const columns = db.getColumns("users");
  console.log("Users columns:", columns);

  const indexes = db.getIndexes("users");
  console.log("Users indexes:", indexes);

  const tableExists = db.tableExists("users");
  console.log("Users table exists:", tableExists);

  const metadata = db.getMetadata();
  console.log("Database metadata:", metadata);

  // ========================================
  // Serialization
  // ========================================
  console.log("\n--- Serialization ---");

  // Schema-only serialization
  const schema = db.serialize();
  console.log("Schema (first 200 chars):", schema.substring(0, 200) + "...");

  // Binary serialization (full backup)
  const binary = db.serializeBinary();
  console.log("Binary backup size:", binary.length, "bytes");

  // ========================================
  // Close database
  // ========================================
  console.log("\n--- Cleanup ---");

  db.close();
  console.log("Database closed. isClosed():", db.isClosed());

  console.log("\n✅ Demo completed successfully!");
}

main().catch(console.error);
