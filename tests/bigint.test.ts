import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

interface BigNumberRow {
  id: number;
  big_val: number | bigint;
  name: string;
}

interface DoubledRow {
  doubled: number | bigint;
}

interface TotalRow {
  total: number | bigint;
}

describe("SQLite NAPI - BigInt Support", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE big_numbers (id INTEGER PRIMARY KEY, big_val INTEGER, name TEXT)"
    );
  });

  describe("BigInt parameter binding", () => {
    test("inserts BigInt value", () => {
      const bigValue = BigInt("9007199254740992");

      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        bigValue,
        "test1",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["test1"]) as BigNumberRow | undefined;

      expect(row).toBeDefined();
      expect(row!.big_val).toBeDefined();
    });

    test("inserts large BigInt value", () => {
      const bigValue = BigInt("9223372036854775807");

      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        bigValue,
        "max_int64",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["max_int64"]) as BigNumberRow | undefined;

      expect(row).toBeDefined();
      expect(row!.big_val).toBeDefined();
    });

    test("inserts negative BigInt value", () => {
      const bigValue = BigInt("-9223372036854775808");

      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        bigValue,
        "min_int64",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["min_int64"]) as BigNumberRow | undefined;

      expect(row).toBeDefined();
      expect(row!.big_val).toBeDefined();
    });

    test("inserts BigInt zero", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt(0),
        "zero",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["zero"]) as BigNumberRow | undefined;

      expect(row!.big_val).toBe(0);
    });
  });

  describe("BigInt in WHERE clause", () => {
    test("queries with BigInt parameter", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("9007199254740992"),
        "big1",
      ]);
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("9007199254740993"),
        "big2",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE big_val = ?");
      const row = stmt.get([BigInt("9007199254740992")]) as BigNumberRow | undefined;

      expect(row!.name).toBe("big1");
    });

    test("queries with BigInt comparison", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("1000000000000"),
        "trillion",
      ]);
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("1000000000000000"),
        "quadrillion",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE big_val > ?");
      const rows = stmt.all([BigInt("500000000000")]) as BigNumberRow[];

      expect(rows.length).toBe(2);
    });
  });

  describe("BigInt with statement methods", () => {
    test("BigInt with statement.all()", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("123456789012345"),
        "test",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers");
      const rows = stmt.all() as BigNumberRow[];

      expect(rows.length).toBe(1);
      expect(rows[0].big_val).toBe(123456789012345);
    });

    test("BigInt with statement.get()", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("987654321098765"),
        "test",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["test"]) as BigNumberRow | undefined;

      expect(row!.big_val).toBe(987654321098765);
    });

    test("BigInt with statement.values()", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("111111111111111"),
        "test",
      ]);

      const stmt = db.query("SELECT big_val, name FROM big_numbers");
      const values = stmt.values() as unknown[][];

      expect(values.length).toBe(1);
      expect(values[0][0]).toBe(111111111111111);
    });

    test("BigInt with statement.run()", () => {
      const stmt = db.query("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)");
      const result = stmt.run([BigInt("222222222222222"), "test"]);

      expect(result.changes).toBe(1);
    });
  });

  describe("BigInt edge cases", () => {
    test("handles BigInt within MAX_SAFE_INTEGER", () => {
      const safeValue = BigInt(Number.MAX_SAFE_INTEGER);

      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        safeValue,
        "safe",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["safe"]) as BigNumberRow | undefined;

      expect(row!.big_val).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("handles BigInt larger than MAX_SAFE_INTEGER", () => {
      const bigValue = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);

      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        bigValue,
        "unsafe",
      ]);

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["unsafe"]) as BigNumberRow | undefined;

      expect(row).toBeDefined();
    });

    test("BigInt arithmetic in SQL", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("1000000000000"),
        "base",
      ]);

      const stmt = db.query(
        "SELECT big_val * 2 as doubled FROM big_numbers WHERE name = ?"
      );
      const row = stmt.get(["base"]) as DoubledRow | undefined;

      expect(row!.doubled).toBe(2000000000000);
    });

    test("BigInt in aggregation functions", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("1000000000000"),
        "a",
      ]);
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("2000000000000"),
        "b",
      ]);

      const stmt = db.query("SELECT SUM(big_val) as total FROM big_numbers");
      const row = stmt.get() as TotalRow | undefined;

      expect(row!.total).toBe(3000000000000);
    });
  });

  describe("BigInt with named parameters", () => {
    test("BigInt with $name parameter", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES ($val, $name)", {
        $val: BigInt("555555555555555"),
        $name: "named",
      });

      const stmt = db.query("SELECT * FROM big_numbers WHERE name = $name");
      const row = stmt.get({ $name: "named" }) as BigNumberRow | undefined;

      expect(row!.big_val).toBe(555555555555555);
    });
  });

  describe("BigInt with iterator", () => {
    test("BigInt values in iterator", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("777777777777777"),
        "iter_test",
      ]);

      const stmt = db.query("SELECT big_val, name FROM big_numbers");
      const iter = stmt.iter([]);

      const row = iter.next() as BigNumberRow | undefined;
      expect(row!.big_val).toBe(777777777777777);
    });
  });

  describe("BigInt serialization", () => {
    test("BigInt survives serialize/deserialize cycle", () => {
      db.run("INSERT INTO big_numbers (big_val, name) VALUES (?, ?)", [
        BigInt("888888888888888"),
        "serialize_test",
      ]);

      const buffer = db.serializeBinary();

      const db2 = new Database(":memory:");
      db2.deserializeBinary(buffer);

      const stmt = db2.query("SELECT * FROM big_numbers WHERE name = ?");
      const row = stmt.get(["serialize_test"]) as BigNumberRow | undefined;

      expect(row!.big_val).toBe(888888888888888);

      db2.close();
    });
  });
});
