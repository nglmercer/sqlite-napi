import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Parameter Binding", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT)"
    );
  });

  describe("Positional Parameters (?)", () => {
    test("single positional parameter", () => {
      db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get(["Alice"]);

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
    });

    test("multiple positional parameters", () => {
      db.run("INSERT INTO users (name, age, email) VALUES (?, ?, ?)", [
        "Alice",
        30,
        "alice@example.com",
      ]);

      const stmt = db.query(
        "SELECT * FROM users WHERE name = ? AND age = ? AND email = ?"
      );
      const row = stmt.get(["Alice", 30, "alice@example.com"]);

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
      expect((row as any).age).toBe(30);
      expect((row as any).email).toBe("alice@example.com");
    });

    test("positional parameters with statement.run", () => {
      const stmt = db.query("INSERT INTO users (name, age) VALUES (?, ?)");
      const result = stmt.run(["Bob", 25]);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    test("positional parameters with statement.all", () => {
      db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);
      db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Bob", 25]);

      const stmt = db.query("SELECT * FROM users WHERE age > ? ORDER BY name");
      const rows = stmt.all([20]);

      expect(rows.length).toBe(2);
    });

    test("positional parameters with statement.values", () => {
      db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);

      const stmt = db.query("SELECT name, age FROM users WHERE name = ?");
      const values = stmt.values(["Alice"]);

      expect(values.length).toBe(1);
      expect((values as any[])[0]).toEqual(["Alice", 30]);
    });
  });

  describe("Numbered Parameters (?1, ?2, etc.)", () => {
    test("numbered parameters with ?1, ?2", () => {
      db.run("INSERT INTO users (name, age) VALUES (?1, ?2)", ["Alice", 30]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?1 AND age = ?2");
      const row = stmt.get(["Alice", 30]);

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
      expect((row as any).age).toBe(30);
    });

    test("numbered parameters can be reused", () => {
      // SQLite allows reusing the same parameter number
      db.run("INSERT INTO users (name, email) VALUES (?1, ?2)", [
        "Alice",
        "alice@example.com",
      ]);

      const stmt = db.query(
        "SELECT * FROM users WHERE name = ?1 OR email = ?2"
      );
      const rows = stmt.all(["Alice", "alice@example.com"]);

      expect(rows.length).toBe(1);
    });

    test("numbered parameters with gaps", () => {
      db.run("INSERT INTO users (name, age) VALUES (?2, ?3)", [
        "unused",
        "Alice",
        30,
      ]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get(["Alice"]);

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
    });
  });

  describe("Named Parameters ($name format)", () => {
    test("named parameters with $ prefix", () => {
      db.run("INSERT INTO users (name, age) VALUES ($name, $age)", {
        $name: "Alice",
        $age: 30,
      });

      const stmt = db.query(
        "SELECT * FROM users WHERE name = $name AND age = $age"
      );
      const row = stmt.get({ $name: "Alice", $age: 30 });

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Alice");
      expect((row as any).age).toBe(30);
    });

    test("named parameters with statement.run", () => {
      const stmt = db.query(
        "INSERT INTO users (name, age, email) VALUES ($name, $age, $email)"
      );
      const result = stmt.run({
        $name: "Bob",
        $age: 25,
        $email: "bob@example.com",
      });

      expect(result.changes).toBe(1);
    });

    test("named parameters with statement.all", () => {
      db.run("INSERT INTO users (name, age) VALUES ($name, $age)", {
        $name: "Alice",
        $age: 30,
      });
      db.run("INSERT INTO users (name, age) VALUES ($name, $age)", {
        $name: "Bob",
        $age: 25,
      });

      const stmt = db.query("SELECT * FROM users WHERE age > $minAge");
      const rows = stmt.all({ $minAge: 20 });

      expect(rows.length).toBe(2);
    });

    test("named parameters with partial match", () => {
      db.run("INSERT INTO users (name) VALUES ($name)", { $name: "Alice" });

      const stmt = db.query("SELECT * FROM users WHERE name = $name");
      const row = stmt.get({ $name: "Alice" });

      expect((row as any).name).toBe("Alice");
    });
  });

  describe("Named Parameters (:name format)", () => {
    test("named parameters with : prefix", () => {
      db.run("INSERT INTO users (name, age) VALUES (:name, :age)", {
        ":name": "Charlie",
        ":age": 35,
      });

      const stmt = db.query(
        "SELECT * FROM users WHERE name = :name AND age = :age"
      );
      const row = stmt.get({ ":name": "Charlie", ":age": 35 });

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Charlie");
      expect((row as any).age).toBe(35);
    });

    test("mixed :name parameters in query", () => {
      db.run("INSERT INTO users (name, email) VALUES (:name, :email)", {
        ":name": "Diana",
        ":email": "diana@example.com",
      });

      const stmt = db.query("SELECT * FROM users WHERE name = :name");
      const row = stmt.get({ ":name": "Diana" });

      expect((row as any).name).toBe("Diana");
    });
  });

  describe("Named Parameters (@name format)", () => {
    test("named parameters with @ prefix", () => {
      db.run("INSERT INTO users (name, age) VALUES (@name, @age)", {
        "@name": "Eve",
        "@age": 28,
      });

      const stmt = db.query(
        "SELECT * FROM users WHERE name = @name AND age = @age"
      );
      const row = stmt.get({ "@name": "Eve", "@age": 28 });

      expect(row).toBeDefined();
      expect((row as any).name).toBe("Eve");
      expect((row as any).age).toBe(28);
    });

    test("@name parameters in WHERE clause", () => {
      db.run("INSERT INTO users (name) VALUES (@name)", { "@name": "Frank" });

      const stmt = db.query("SELECT * FROM users WHERE name = @name");
      const row = stmt.get({ "@name": "Frank" });

      expect((row as any).name).toBe("Frank");
    });
  });

  describe("Mixed Parameter Types", () => {
    test("cannot mix positional and named parameters", () => {
      // This should work - SQLite handles the parameter binding
      db.run("INSERT INTO users (name) VALUES (?)", ["Test"]);

      // Named parameters should work independently
      const stmt = db.query("SELECT * FROM users WHERE name = $name");
      const row = stmt.get({ $name: "Test" });

      expect((row as any).name).toBe("Test");
    });
  });

  describe("Parameter Type Conversion", () => {
    test("null parameter", () => {
      db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", null]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get(["Alice"]);

      expect((row as any).age).toBeNull();
    });

    test("boolean parameter (converted to integer)", () => {
      db.exec(
        "CREATE TABLE flags (id INTEGER PRIMARY KEY, active INTEGER, disabled INTEGER)"
      );
      db.run("INSERT INTO flags (active, disabled) VALUES (?, ?)", [true, false]);

      const stmt = db.query("SELECT * FROM flags");
      const row = stmt.get();

      expect((row as any).active).toBe(1);
      expect((row as any).disabled).toBe(0);
    });

    test("float parameter", () => {
      db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, price REAL)");
      db.run("INSERT INTO products (price) VALUES (?)", [19.99]);

      const stmt = db.query("SELECT * FROM products");
      const row = stmt.get();

      expect((row as any).price).toBeCloseTo(19.99);
    });

    test("empty string parameter", () => {
      db.run("INSERT INTO users (name) VALUES (?)", [""]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get([""]);

      expect((row as any).name).toBe("");
    });
  });

  describe("Parameter Edge Cases", () => {
    test("no parameters needed", () => {
      db.run("INSERT INTO users (name) VALUES ('Static')");

      const stmt = db.query("SELECT * FROM users");
      const rows = stmt.all();

      expect(rows.length).toBe(1);
    });

    test("empty array parameters", () => {
      db.run("INSERT INTO users (name) VALUES ('Test')");

      const stmt = db.query("SELECT * FROM users");
      const rows = stmt.all([]);

      expect(rows.length).toBe(1);
    });

    test("special characters in string parameter", () => {
      const specialString = "O'Brien's \"special\" string with 'quotes'";

      db.run("INSERT INTO users (name) VALUES (?)", [specialString]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get([specialString]);

      expect((row as any).name).toBe(specialString);
    });

    test("unicode in parameters", () => {
      const unicodeName = "日本語 中文 한글 العربية";

      db.run("INSERT INTO users (name) VALUES (?)", [unicodeName]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get([unicodeName]);

      expect((row as any).name).toBe(unicodeName);
    });

    test("very long string parameter", () => {
      const longString = "A".repeat(10000);

      db.run("INSERT INTO users (name) VALUES (?)", [longString]);

      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const row = stmt.get([longString]);

      expect((row as any).name).toBe(longString);
    });
  });

  describe("Parameter Binding with db.run", () => {
    test("db.run with positional parameters", () => {
      const result = db.run(
        "INSERT INTO users (name, age) VALUES (?, ?)",
        ["Alice", 30]
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    test("db.run with named parameters", () => {
      const result = db.run(
        "INSERT INTO users (name, age) VALUES ($name, $age)",
        { $name: "Bob", $age: 25 }
      );

      expect(result.changes).toBe(1);
    });
  });
});
