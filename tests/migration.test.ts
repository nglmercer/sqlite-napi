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
      // First migration
      const migrations = [
        { version: 1, sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "ALTER TABLE users ADD COLUMN name TEXT" },
      ];

      db.migrate(migrations);
      expect(db.getSchemaVersion()).toBe(2);

      // Add more migrations
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

  describe("integration", () => {
    test("full migration workflow", () => {
      // Simulate a real-world migration scenario
      const migrations = [
        {
          version: 1,
          sql: `
            CREATE TABLE users (
              id INTEGER PRIMARY KEY,
              email TEXT UNIQUE NOT NULL
            );
            CREATE INDEX idx_users_email ON users(email);
          `,
          description: "Create users table",
        },
        {
          version: 2,
          sql: `
            CREATE TABLE posts (
              id INTEGER PRIMARY KEY,
              user_id INTEGER NOT NULL,
              title TEXT NOT NULL,
              content TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (user_id) REFERENCES users(id)
            );
          `,
          description: "Create posts table",
        },
        {
          version: 3,
          sql: `
            ALTER TABLE posts ADD COLUMN published INTEGER DEFAULT 0;
          `,
          description: "Add published column",
        },
      ];

      // First run - should apply all migrations
      let version = db.migrate(migrations);
      expect(version).toBe(3);

      // Verify tables
      expect(db.tableExists("users")).toBe(true);
      expect(db.tableExists("posts")).toBe(true);

      // Verify columns
      const postColumns = db.getColumns("posts");
      const columnNames = postColumns.map((c: any) => c.name);
      expect(columnNames).toContain("published");

      // Insert some data
      db.run("INSERT INTO users (email) VALUES (?)", ["test@example.com"]);
      db.run("INSERT INTO posts (user_id, title, published) VALUES (?, ?, ?)", [
        1,
        "Hello World",
        1,
      ]);

      // Second run - should not apply any migrations
      version = db.migrate(migrations);
      expect(version).toBe(3);

      // Data should still be there
      const users = db.query("SELECT * FROM users").all();
      expect(users.length).toBe(1);
    });
  });
});
