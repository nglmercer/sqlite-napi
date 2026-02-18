import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Statement Metadata", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT)"
    );
    db.exec(
      "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)"
    );
    db.run("INSERT INTO users (name, age, email) VALUES (?, ?, ?)", [
      "Alice",
      30,
      "alice@example.com",
    ]);
  });

  describe("statement.columns", () => {
    test("returns column metadata array", () => {
      const stmt = db.query("SELECT * FROM users");
      const columns = stmt.columns();

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBe(4);
    });

    test("columns have name property", () => {
      const stmt = db.query("SELECT * FROM users");
      const columns = stmt.columns();

      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("age");
      expect(columnNames).toContain("email");
    });

    test("columns have type property", () => {
      const stmt = db.query("SELECT * FROM users");
      const columns = stmt.columns();

      // Each column should have a type property (may be empty)
      columns.forEach((col: any) => {
        expect(col).toHaveProperty("type");
      });
    });

    test("returns correct columns for specific SELECT", () => {
      const stmt = db.query("SELECT name, age FROM users");
      const columns = stmt.columns();

      expect(columns.length).toBe(2);
      expect((columns[0] as any).name).toBe("name");
      expect((columns[1] as any).name).toBe("age");
    });

    test("returns columns for aliased columns", () => {
      const stmt = db.query(
        "SELECT name AS user_name, age AS user_age FROM users"
      );
      const columns = stmt.columns();

      expect(columns.length).toBe(2);
      expect((columns[0] as any).name).toBe("user_name");
      expect((columns[1] as any).name).toBe("user_age");
    });

    test("returns columns for expressions", () => {
      const stmt = db.query("SELECT COUNT(*) as count FROM users");
      const columns = stmt.columns();

      expect(columns.length).toBe(1);
      expect((columns[0] as any).name).toBe("count");
    });

    test("returns columns for JOIN query", () => {
      db.run("INSERT INTO posts (user_id, title) VALUES (?, ?)", [1, "Hello"]);

      const stmt = db.query(
        "SELECT users.name, posts.title FROM users JOIN posts ON users.id = posts.user_id"
      );
      const columns = stmt.columns();

      expect(columns.length).toBe(2);
      expect((columns[0] as any).name).toBe("name");
      expect((columns[1] as any).name).toBe("title");
    });

    test("returns empty array for non-SELECT statement", () => {
      const stmt = db.query("INSERT INTO users (name) VALUES ('test')");
      const columns = stmt.columns();

      // INSERT statements don't return columns
      expect(columns.length).toBe(0);
    });
  });

  describe("statement.source", () => {
    test("returns original SQL string", () => {
      const sql = "SELECT * FROM users WHERE id = ?";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });

    test("preserves SQL formatting", () => {
      const sql = "SELECT   name,   age   FROM   users";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });

    test("preserves complex SQL", () => {
      const sql =
        "SELECT u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.user_id WHERE u.age > ? GROUP BY u.id ORDER BY post_count DESC";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });

    test("returns SQL for INSERT statement", () => {
      const sql = "INSERT INTO users (name, age) VALUES (?, ?)";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });

    test("returns SQL for UPDATE statement", () => {
      const sql = "UPDATE users SET name = ? WHERE id = ?";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });

    test("returns SQL for DELETE statement", () => {
      const sql = "DELETE FROM users WHERE id = ?";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
    });
  });

  describe("statement.toString()", () => {
    test("returns SQL string (alias for source)", () => {
      const sql = "SELECT * FROM users";
      const stmt = db.query(sql);

      expect(stmt.toString()).toBe(sql);
      expect(stmt.toString()).toBe(stmt.source());
    });

    test("toString works for complex queries", () => {
      const sql =
        "SELECT * FROM users WHERE name LIKE ? AND age > ? ORDER BY name";
      const stmt = db.query(sql);

      expect(stmt.toString()).toBe(sql);
    });
  });

  describe("statement reuse after metadata calls", () => {
    test("can execute after columns()", () => {
      const stmt = db.query("SELECT * FROM users");

      const columns = stmt.columns();
      expect(columns.length).toBe(4);

      const rows = stmt.all();
      expect(rows.length).toBe(1);
    });

    test("can execute after source()", () => {
      const stmt = db.query("SELECT * FROM users");

      const source = stmt.source();
      expect(source).toBeDefined();

      const rows = stmt.all();
      expect(rows.length).toBe(1);
    });

    test("columns() returns same result after execution", () => {
      const stmt = db.query("SELECT name, age FROM users");

      const columnsBefore = stmt.columns();
      stmt.all();
      const columnsAfter = stmt.columns();

      expect(columnsBefore.length).toBe(columnsAfter.length);
      expect((columnsBefore[0] as any).name).toBe(
        (columnsAfter[0] as any).name
      );
    });
  });

  describe("edge cases", () => {
    test("columns for query with no FROM clause", () => {
      const stmt = db.query("SELECT 1 as one, 2 as two");
      const columns = stmt.columns();

      expect(columns.length).toBe(2);
      expect((columns[0] as any).name).toBe("one");
      expect((columns[1] as any).name).toBe("two");
    });

    test("columns for subquery", () => {
      const stmt = db.query(
        "SELECT * FROM (SELECT name, age FROM users) AS sub"
      );
      const columns = stmt.columns();

      expect(columns.length).toBe(2);
    });

    test("source preserves parameters", () => {
      const sql = "SELECT * FROM users WHERE id = ? AND name = ?";
      const stmt = db.query(sql);

      expect(stmt.source()).toBe(sql);
      expect(stmt.source()).toContain("?");
      expect(stmt.source().split("?").length - 1).toBe(2);
    });
  });
});
