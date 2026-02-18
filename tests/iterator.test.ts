import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Iterator Support", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
    db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);
    db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Bob", 25]);
    db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Charlie", 35]);
    db.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Diana", 28]);
  });

  describe("statement.iter", () => {
    test("creates an iterator from a statement", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      expect(iter).toBeDefined();
      expect(typeof iter.next).toBe("function");
      expect(typeof iter.nextValues).toBe("function");
      expect(typeof iter.hasMore).toBe("function");
      expect(typeof iter.all).toBe("function");
      expect(typeof iter.reset).toBe("function");
    });

    test("iterator has hasMore method that returns boolean", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      expect(iter.hasMore()).toBe(true);
    });
  });

  describe("iter.next", () => {
    test("returns first row as object", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const row = iter.next();

      expect(row).toBeDefined();
      expect(row).not.toBeNull();
      expect((row as any).name).toBe("Alice");
      expect((row as any).age).toBe(30);
    });

    test("returns subsequent rows on each call", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const row1 = iter.next();
      expect((row1 as any).name).toBe("Alice");

      const row2 = iter.next();
      expect((row2 as any).name).toBe("Bob");

      const row3 = iter.next();
      expect((row3 as any).name).toBe("Charlie");

      const row4 = iter.next();
      expect((row4 as any).name).toBe("Diana");
    });

    test("returns null when no more rows", () => {
      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const iter = stmt.iter(["NonExistent"]);

      const row = iter.next();
      expect(row).toBeNull();
    });

    test("returns null after iterating all rows", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id LIMIT 2");
      const iter = stmt.iter([]);

      iter.next(); // Alice
      iter.next(); // Bob
      const row3 = iter.next(); // Should be null

      expect(row3).toBeNull();
    });
  });

  describe("iter.nextValues", () => {
    test("returns row as array instead of object", () => {
      const stmt = db.query("SELECT name, age FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const row = iter.nextValues();

      expect(row).toBeDefined();
      expect(Array.isArray(row)).toBe(true);
      expect((row as any[])[0]).toEqual(["Alice", 30]);
    });

    test("returns subsequent rows as arrays", () => {
      const stmt = db.query("SELECT name, age FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const row1 = iter.nextValues();
      expect((row1 as any[])[0]).toEqual(["Alice", 30]);

      const row2 = iter.nextValues();
      expect((row2 as any[])[0]).toEqual(["Bob", 25]);
    });

    test("returns null when no more rows", () => {
      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const iter = stmt.iter(["NonExistent"]);

      const row = iter.nextValues();
      expect(row).toBeNull();
    });
  });

  describe("iter.hasMore", () => {
    test("returns true when rows remain", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      expect(iter.hasMore()).toBe(true);

      iter.next();
      expect(iter.hasMore()).toBe(true);

      iter.next();
      expect(iter.hasMore()).toBe(true);
    });

    test("returns false when no rows remain", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id LIMIT 1");
      const iter = stmt.iter([]);

      iter.next();
      expect(iter.hasMore()).toBe(false);
    });

    test("returns false for empty result set", () => {
      const stmt = db.query("SELECT * FROM users WHERE name = ?");
      const iter = stmt.iter(["NonExistent"]);

      expect(iter.hasMore()).toBe(false);
    });
  });

  describe("iter.all", () => {
    test("returns all remaining rows", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      iter.next(); // Skip first row

      const remaining = iter.all();

      expect(Array.isArray(remaining)).toBe(true);
      expect(remaining.length).toBe(3);
      expect((remaining as any[])[0].name).toBe("Bob");
      expect((remaining as any[])[1].name).toBe("Charlie");
      expect((remaining as any[])[2].name).toBe("Diana");
    });

    test("returns empty array when no rows remain", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id LIMIT 1");
      const iter = stmt.iter([]);

      iter.next();
      const remaining = iter.all();

      expect(Array.isArray(remaining)).toBe(true);
      expect(remaining.length).toBe(0);
    });

    test("returns all rows if called immediately", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const all = iter.all();

      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(4);
    });
  });

  describe("iter.reset", () => {
    test("resets iterator to beginning", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      iter.next(); // Alice
      iter.next(); // Bob
      iter.reset();

      expect(iter.hasMore()).toBe(true);

      const row = iter.next();
      expect((row as any).name).toBe("Alice"); // Back to first row
    });

    test("allows re-iterating after reset", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id LIMIT 2");
      const iter = stmt.iter([]);

      // First iteration
      const row1 = iter.next();
      const row2 = iter.next();
      expect((row1 as any).name).toBe("Alice");
      expect((row2 as any).name).toBe("Bob");

      // Reset and iterate again
      iter.reset();
      const row1Again = iter.next();
      expect((row1Again as any).name).toBe("Alice");
    });

    test("reset works after iter.all()", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      iter.all(); // Consume all rows
      expect(iter.hasMore()).toBe(false);

      iter.reset();
      expect(iter.hasMore()).toBe(true);

      const row = iter.next();
      expect((row as any).name).toBe("Alice");
    });
  });

  describe("iterator with parameters", () => {
    test("iterator works with positional parameters", () => {
      const stmt = db.query("SELECT * FROM users WHERE age > ? ORDER BY id");
      const iter = stmt.iter([28]);

      const rows = iter.all();
      expect(rows.length).toBe(2);
      expect((rows as any[])[0].name).toBe("Alice");
      expect((rows as any[])[1].name).toBe("Charlie");
    });

    test("iterator works with multiple parameters", () => {
      const stmt = db.query(
        "SELECT * FROM users WHERE age >= ? AND age <= ? ORDER BY id"
      );
      const iter = stmt.iter([25, 30]);

      const rows = iter.all();
      expect(rows.length).toBe(3);
    });
  });

  describe("iterator streaming pattern", () => {
    test("can iterate through large result set", () => {
      // Insert more data
      for (let i = 0; i < 100; i++) {
        db.run("INSERT INTO users (name, age) VALUES (?, ?)", [`User${i}`, 20 + i]);
      }

      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      let count = 0;
      while (iter.hasMore()) {
        iter.next();
        count++;
      }

      expect(count).toBe(104); // 4 original + 100 new
    });

    test("can process rows one at a time", () => {
      const stmt = db.query("SELECT * FROM users ORDER BY id");
      const iter = stmt.iter([]);

      const names: string[] = [];
      while (iter.hasMore()) {
        const row = iter.next();
        if (row) {
          names.push((row as any).name);
        }
      }

      expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana"]);
    });
  });
});
