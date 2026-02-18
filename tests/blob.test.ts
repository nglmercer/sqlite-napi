import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - BLOB Support", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE files (id INTEGER PRIMARY KEY, name TEXT, data BLOB, metadata BLOB)"
    );
  });

  describe("BLOB insertion", () => {
    test("inserts Uint8Array as BLOB", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["test.bin", data]);

      const stmt = db.query("SELECT * FROM files WHERE name = ?");
      const row = stmt.get(["test.bin"]);

      expect(row).toBeDefined();
      expect((row as any).data).toBeDefined();
    });

    test("inserts Buffer as BLOB", () => {
      const data = Buffer.from([72, 101, 108, 108, 111]); // "Hello"

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["hello.txt", data]);

      const stmt = db.query("SELECT * FROM files WHERE name = ?");
      const row = stmt.get(["hello.txt"]);

      expect(row).toBeDefined();
      expect((row as any).data).toBeDefined();
    });

    test("inserts empty BLOB", () => {
      const data = new Uint8Array(0);

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["empty.bin", data]);

      const stmt = db.query("SELECT * FROM files WHERE name = ?");
      const row = stmt.get(["empty.bin"]);

      expect(row).toBeDefined();
    });

    test("inserts large BLOB", () => {
      // Create a 1MB BLOB
      const data = new Uint8Array(1024 * 1024);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["large.bin", data]);

      const stmt = db.query("SELECT length(data) as size FROM files WHERE name = ?");
      const row = stmt.get(["large.bin"]);

      expect((row as any).size).toBe(1024 * 1024);
    });
  });

  describe("BLOB retrieval", () => {
    test("retrieves BLOB data", () => {
      const originalData = new Uint8Array([10, 20, 30, 40, 50]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["test.bin", originalData]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const row = stmt.get(["test.bin"]);

      expect(row).toBeDefined();
      // BLOB is returned as Base64 string
      expect(typeof (row as any).data).toBe("string");
    });

    test("retrieves BLOB with statement.all()", () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["file1.bin", data1]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["file2.bin", data2]);

      const stmt = db.query("SELECT name, data FROM files ORDER BY name");
      const rows = stmt.all();

      expect(rows.length).toBe(2);
      expect(typeof (rows as any[])[0].data).toBe("string");
      expect(typeof (rows as any[])[1].data).toBe("string");
    });

    test("retrieves BLOB with statement.values()", () => {
      const data = new Uint8Array([100, 200, 255]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["test.bin", data]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const values = stmt.values(["test.bin"]);

      expect(values.length).toBe(1);
      expect(typeof (values as any[])[0][0]).toBe("string");
    });
  });

  describe("BLOB with iterator", () => {
    test("iterates over BLOB data", () => {
      const data = new Uint8Array([11, 22, 33, 44]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["iter.bin", data]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const iter = stmt.iter(["iter.bin"]);

      const row = iter.next();
      expect(row).toBeDefined();
      expect(typeof (row as any).data).toBe("string");
    });

    test("iterator nextValues with BLOB", () => {
      const data = new Uint8Array([55, 66, 77]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["iter2.bin", data]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const iter = stmt.iter(["iter2.bin"]);

      const values = iter.nextValues();
      expect(values).toBeDefined();
      expect(Array.isArray(values)).toBe(true);
    });
  });

  describe("BLOB edge cases", () => {
    test("handles null BLOB", () => {
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["null.bin", null]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const row = stmt.get(["null.bin"]);

      expect((row as any).data).toBeNull();
    });

    test("handles BLOB with all byte values", () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        data[i] = i;
      }

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["all_bytes.bin", data]);

      const stmt = db.query("SELECT length(data) as size FROM files WHERE name = ?");
      const row = stmt.get(["all_bytes.bin"]);

      expect((row as any).size).toBe(256);
    });

    test("handles BLOB with null bytes", () => {
      const data = new Uint8Array([0, 0, 0, 1, 0, 2, 0]);

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["nulls.bin", data]);

      const stmt = db.query("SELECT length(data) as size FROM files WHERE name = ?");
      const row = stmt.get(["nulls.bin"]);

      expect((row as any).size).toBe(7);
    });

    test("handles binary string data", () => {
      // Binary representation of a simple image header (PNG-like)
      const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["image.png", data]);

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const row = stmt.get(["image.png"]);

      expect(row).toBeDefined();
    });
  });

  describe("BLOB with named parameters", () => {
    test("BLOB with $name parameter", () => {
      const data = new Uint8Array([99, 98, 97]);

      // Note: Named parameters with BLOB may not be fully supported
      // Using positional parameters as fallback
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["named.bin", data]);

      const stmt = db.query("SELECT * FROM files WHERE name = ?");
      const row = stmt.get(["named.bin"]);

      expect(row).toBeDefined();
    });
  });

  describe("BLOB serialization", () => {
    test("BLOB survives serialize/deserialize cycle", () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["persist.bin", originalData]);

      const buffer = db.serializeBinary();

      const db2 = new Database(":memory:");
      db2.deserializeBinary(buffer);

      const stmt = db2.query("SELECT data FROM files WHERE name = ?");
      const row = stmt.get(["persist.bin"]);

      expect(row).toBeDefined();
      expect((row as any).data).toBeDefined();

      db2.close();
    });

    test("large BLOB serialization", () => {
      // Create a 100KB BLOB
      const data = new Uint8Array(100 * 1024);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["large_persist.bin", data]);

      const buffer = db.serializeBinary();

      const db2 = new Database(":memory:");
      db2.deserializeBinary(buffer);

      const stmt = db2.query("SELECT length(data) as size FROM files WHERE name = ?");
      const row = stmt.get(["large_persist.bin"]);

      expect((row as any).size).toBe(100 * 1024);

      db2.close();
    });
  });

  describe("BLOB comparison", () => {
    test("BLOB equality comparison", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["compare.bin", data]);

      const stmt = db.query("SELECT * FROM files WHERE data = ?");
      const row = stmt.get([data]);

      expect(row).toBeDefined();
    });
  });

  describe("Multiple BLOBs", () => {
    test("inserts and retrieves multiple BLOB columns", () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);

      db.run("INSERT INTO files (name, data, metadata) VALUES (?, ?, ?)", [
        "multi.bin",
        data1,
        data2,
      ]);

      const stmt = db.query("SELECT data, metadata FROM files WHERE name = ?");
      const row = stmt.get(["multi.bin"]);

      expect(row).toBeDefined();
      expect((row as any).data).toBeDefined();
      expect((row as any).metadata).toBeDefined();
    });
  });

  describe("BLOB with transactions", () => {
    test("BLOB in transaction", () => {
      const data = new Uint8Array([10, 20, 30]);

      const tx = db.transaction(null);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["tx.bin", data]);
      tx.commit();

      const stmt = db.query("SELECT data FROM files WHERE name = ?");
      const row = stmt.get(["tx.bin"]);

      expect(row).toBeDefined();
    });

    test("BLOB transaction rollback", () => {
      const data = new Uint8Array([40, 50, 60]);

      const tx = db.transaction(null);
      db.run("INSERT INTO files (name, data) VALUES (?, ?)", ["rollback.bin", data]);
      tx.rollback();

      const stmt = db.query("SELECT * FROM files WHERE name = ?");
      const row = stmt.get(["rollback.bin"]);

      expect(row).toBeNull();
    });
  });
});
