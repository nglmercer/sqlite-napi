import { expect, test, describe } from "bun:test";
import { Database, getSqliteVersion } from "../index";

describe("Legacy NAPI Module Tests", () => {
  // Test that the module exports are correct
  test("module exports Database class", () => {
    expect(Database).toBeDefined();
    expect(typeof Database).toBe("function");
  });

  test("module exports getSqliteVersion function", () => {
    expect(getSqliteVersion).toBeDefined();
    expect(typeof getSqliteVersion).toBe("function");
  });

  test("getSqliteVersion returns a valid version string", () => {
    const version = getSqliteVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    // SQLite version format: X.Y.Z
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("Database can be instantiated with :memory:", () => {
    const db = new Database(":memory:");
    expect(db).toBeDefined();
    expect(db).toBeInstanceOf(Database);
  });

  test("Database has expected methods", () => {
    const db = new Database(":memory:");
    expect(typeof db.query).toBe("function");
    expect(typeof db.run).toBe("function");
  });
});
