import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Schema Migration", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  describe("getSchemaVersion", () => {
    test("returns 0 for new database", () => {
      const version = db.getSchemaVersion();
      expect(version).toBe(0);
    });

    test("returns version after initSchema", () => {
      db.initSchema("CREATE TABLE users (id INTEGER PRIMARY KEY)", 1, "Initial");
      const version = db.getSchemaVersion();
      expect(version).toBe(1);
    });

    test("returns version after setSchemaVersion", () => {
      db.setSchemaVersion(5);
      const version = db.getSchemaVersion();
      expect(version).toBe(5);
    });
  });

  describe("setSchemaVersion", () => {
    test("creates schema_version table", () => {
      db.setSchemaVersion(1);
      expect(db.tableExists("_schema_version")).toBe(true);
    });

    test("can set different versions", () => {
      db.setSchemaVersion(1);
      db.setSchemaVersion(2);
      expect(db.getSchemaVersion()).toBe(2);
    });
  });

  describe("initSchema", () => {
    test("initializes database with schema", () => {
      const version = db.initSchema(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        1,
        "Initial schema"
      );

      expect(version).toBe(1);
      expect(db.tableExists("users")).toBe(true);
      const columns = db.getColumns("users");
      expect(columns.length).toBe(2);
    });

    test("creates schema_version table", () => {
      db.initSchema("CREATE TABLE users (id INTEGER PRIMARY KEY)", 1);
      expect(db.tableExists("_schema_version")).toBe(true);
    });

    test("executes multiple statements", () => {
      db.initSchema(
        `
        CREATE TABLE users (id INTEGER PRIMARY KEY);
        CREATE TABLE posts (id INTEGER PRIMARY KEY);
        `,
        1
      );

      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);
    });

    test("uses default version when not provided", () => {
      db.initSchema("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      expect(db.getSchemaVersion()).toBe(1);
    });

    test("rolls back on error", () => {
      try {
        db.initSchema("CREATE TABLE users (id INTEGER PRIMARY KEY); INVALID SQL", 1);
      } catch (e) {
        // Expected to throw
      }
      expect(db.tableExists("users")).toBe(false);
      expect(db.getSchemaVersion()).toBe(0);
    });
  });

  describe("migrate", () => {
    test("runs migrations from scratch", () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
        { version: 3, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY)" },
      ];

      const newVersion = db.migrate(migrations);
      expect(newVersion).toBe(3);
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);
    });

    test("only runs pending migrations", () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
      ];

      db.migrate(migrations);
      expect(db.getSchemaVersion()).toBe(2);

      const moreMigrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
        { version: 3, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY)" },
      ];

      const newVersion = db.migrate(moreMigrations);
      expect(newVersion).toBe(3);
      expect(db.tableExists("posts")).toBe(true);
    });

    test("migrates to specific version", () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
        { version: 3, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY)" },
      ];

      const version = db.migrate(migrations, 2);
      expect(version).toBe(2);
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(false);
    });

    test("does nothing if already at target version", () => {
      db.initSchema("CREATE TABLE users (id INTEGER PRIMARY KEY)", 2);

      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
      ];

      const version = db.migrate(migrations);
      expect(version).toBe(2);
    });

    test("rolls back on migration failure", () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "INVALID SQL" },
      ];

      try {
        db.migrate(migrations);
      } catch (e) {
        // Expected to throw
      }

      expect(db.tableExists("users")).toBe(false);
      expect(db.getSchemaVersion()).toBe(0);
    });

    test("handles unsorted migrations", () => {
      const migrations = [
        { version: 3, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY)" },
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
      ];

      const version = db.migrate(migrations);
      expect(version).toBe(3);
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);
    });

    test("works with empty migrations array", () => {
      const version = db.migrate([]);
      expect(version).toBe(0);
    });
  });

  describe("createTableIfNotExists", () => {
    test("creates table when it doesn't exist", () => {
      const created = db.createTableIfNotExists(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
      );
      
      expect(created).toBe(true);
      expect(db.tableExists("users")).toBe(true);
    });

    test("returns false when table already exists", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const created = db.createTableIfNotExists(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
      );
      
      expect(created).toBe(false);
    });

    test("handles IF NOT EXISTS syntax", () => {
      const created = db.createTableIfNotExists(
        "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)"
      );
      
      expect(created).toBe(true);
      expect(db.tableExists("users")).toBe(true);
    });

    test("preserves existing data when table exists", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      db.exec("INSERT INTO users (id, name) VALUES (1, 'Alice')");
      
      db.createTableIfNotExists(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"
      );
      
      const users = db.query("SELECT * FROM users").all();
      expect(users.length).toBe(1);
      expect((users[0] as any).name).toBe("Alice");
    });

    test("extracts table name correctly from various SQL formats", () => {
      db.createTableIfNotExists('CREATE TABLE "my-users" (id INTEGER PRIMARY KEY)');
      expect(db.tableExists("my-users")).toBe(true);

      db.createTableIfNotExists('CREATE TABLE `other-users` (id INTEGER PRIMARY KEY)');
      expect(db.tableExists("other-users")).toBe(true);
    });
  });

  describe("addColumnIfNotExists", () => {
    test("adds column when it doesn't exist", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const added = db.addColumnIfNotExists("users", "email", "TEXT");
      
      expect(added).toBe(true);
      const columns = db.getColumns("users");
      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain("email");
    });

    test("returns false when column already exists", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)");
      
      const added = db.addColumnIfNotExists("users", "email", "TEXT");
      
      expect(added).toBe(false);
    });

    test("adds column with default value", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      db.addColumnIfNotExists("users", "active", "INTEGER DEFAULT 1");
      
      const columns = db.getColumns("users");
      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain("active");
    });

    test("adds multiple columns sequentially", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const added1 = db.addColumnIfNotExists("users", "email", "TEXT");
      const added2 = db.addColumnIfNotExists("users", "name", "TEXT");
      const added3 = db.addColumnIfNotExists("users", "age", "INTEGER");
      
      expect(added1).toBe(true);
      expect(added2).toBe(true);
      expect(added3).toBe(true);
      
      const columns = db.getColumns("users");
      expect(columns.length).toBe(4);
    });

    test("does not duplicate columns on multiple calls", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      db.addColumnIfNotExists("users", "email", "TEXT");
      db.addColumnIfNotExists("users", "email", "TEXT");
      db.addColumnIfNotExists("users", "email", "TEXT");
      
      const columns = db.getColumns("users");
      const emailColumns = columns.filter((c: any) => c.name === "email");
      expect(emailColumns.length).toBe(1);
    });

    test("throws error for non-existent table", () => {
      expect(() => {
        db.addColumnIfNotExists("non_existent", "email", "TEXT");
      }).toThrow();
    });
  });

  describe("runSafe", () => {
    test("executes SQL successfully when no errors", () => {
      const success = db.runSafe("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      expect(success).toBe(true);
      expect(db.tableExists("users")).toBe(true);
    });

    test("ignores 'already exists' error", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const success = db.runSafe(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        ["already exists"]
      );
      
      expect(success).toBe(false);
      const columns = db.getColumns("users");
      expect(columns.length).toBe(1);
    });

    test("ignores 'duplicate column name' error", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)");
      
      const success = db.runSafe(
        "ALTER TABLE users ADD COLUMN email TEXT",
        ["duplicate column name"]
      );
      
      expect(success).toBe(false);
    });

    test("throws error for non-ignored errors", () => {
      expect(() => {
        db.runSafe("INVALID SQL", ["nonexistent error"]);
      }).toThrow();
    });

    test("works with multiple ignore patterns", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const success = db.runSafe(
        "CREATE TABLE users (id INTEGER PRIMARY KEY)",
        ["already exists", "duplicate table"]
      );
      
      expect(success).toBe(false);
    });

    test("executes ALTER TABLE safely", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const success = db.runSafe(
        "ALTER TABLE users ADD COLUMN email TEXT",
        ["duplicate column name"]
      );
      
      expect(success).toBe(true);
      expect(db.tableExists("users")).toBe(true);
    });
  });

  describe("integration - idempotent migrations", () => {
    test("full idempotent migration workflow", () => {
      db.createTableIfNotExists(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE NOT NULL
        )
      `);
      
      db.addColumnIfNotExists("users", "name", "TEXT");
      db.addColumnIfNotExists("users", "bio", "TEXT");
      db.addColumnIfNotExists("users", "avatar_url", "TEXT");
      
      db.createTableIfNotExists(`
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);
      
      const userColumns = db.getColumns("users");
      const userColumnNames = userColumns.map((c: any) => c.name);
      expect(userColumnNames).toContain("email");
      expect(userColumnNames).toContain("name");
      expect(userColumnNames).toContain("bio");
      expect(userColumnNames).toContain("avatar_url");
      
      db.run("INSERT INTO users (email, name) VALUES (?, ?)", ["alice@example.com", "Alice"]);
      db.run("INSERT INTO posts (user_id, title) VALUES (?, ?)", [1, "Hello World"]);
      
      db.createTableIfNotExists("CREATE TABLE users (id INTEGER PRIMARY KEY, extra TEXT)");
      db.addColumnIfNotExists("users", "name", "TEXT");
      
      const users = db.query("SELECT * FROM users").all();
      expect(users.length).toBe(1);
      expect((users[0] as any).email).toBe("alice@example.com");
    });

    test("safe migration with runSafe - separate runs", () => {
      // First run
      const result1 = db.runSafe(`
        CREATE TABLE users (id INTEGER PRIMARY KEY);
        CREATE TABLE posts (id INTEGER PRIMARY KEY);
      `, ["already exists"]);
      
      expect(result1).toBe(true);
      
      // Second run - only new tables (no conflicts)
      const result2 = db.runSafe(`
        CREATE TABLE comments (id INTEGER PRIMARY KEY);
      `, ["already exists"]);
      
      expect(result2).toBe(true);
      
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);
      expect(db.tableExists("comments")).toBe(true);
    });

    test("combined approach: createTable + addColumn", () => {
      db.createTableIfNotExists(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          price REAL NOT NULL
        )
      `);
      
      // Note: SQLite doesn't support adding UNIQUE columns via ALTER TABLE
      // so we use non-UNIQUE columns
      db.addColumnIfNotExists("products", "description", "TEXT");
      db.addColumnIfNotExists("products", "category", "TEXT");
      db.addColumnIfNotExists("products", "stock", "INTEGER DEFAULT 0");
      db.addColumnIfNotExists("products", "sku", "TEXT");
      db.addColumnIfNotExists("products", "featured", "INTEGER DEFAULT 0");
      
      const columns = db.getColumns("products");
      const columnNames = columns.map((c: any) => c.name);
      
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("price");
      expect(columnNames).toContain("description");
      expect(columnNames).toContain("category");
      expect(columnNames).toContain("stock");
      expect(columnNames).toContain("sku");
      expect(columnNames).toContain("featured");
      
      db.run("INSERT INTO products (name, price, description, stock) VALUES (?, ?, ?, ?)", [
        "Test Product",
        9.99,
        "A test product",
        100
      ]);
      
      const products = db.query("SELECT * FROM products").all();
      expect(products.length).toBe(1);
      expect((products[0] as any).name).toBe("Test Product");
    });
  });

  describe("integration - full migration workflow with versioning", () => {
    test("complete application lifecycle simulation", () => {
      const v1Migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)" },
      ];
      db.migrate(v1Migrations);
      
      db.run("INSERT INTO users (email) VALUES (?)", ["user1@example.com"]);
      
      const v2Migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)" },
        { version: 2, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)" },
      ];
      db.migrate(v2Migrations);
      
      db.run("INSERT INTO posts (user_id, title) VALUES (?, ?)", [1, "First Post"]);
      
      const v3Migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)" },
        { version: 2, sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)" },
        { version: 3, sql: "ALTER TABLE users ADD COLUMN bio TEXT" },
      ];
      db.migrate(v3Migrations);
      
      expect(db.getSchemaVersion()).toBe(3);
      
      const users = db.query("SELECT * FROM users").all();
      expect(users.length).toBe(1);
      expect((users[0]).email).toBe("user1@example.com");
      
      const posts = db.query("SELECT * FROM posts").all();
      expect(posts.length).toBe(1);
      expect((posts[0]).title).toBe("First Post");
      
      // Test idempotent update
      db.createTableIfNotExists("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, bio TEXT)");
      db.addColumnIfNotExists("users", "bio", "TEXT");
      
      const usersAfter = db.query("SELECT * FROM users").all();
      expect(usersAfter.length).toBe(1);
      expect((usersAfter[0]).email).toBe("user1@example.com");
    });
  });
});
