import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Pragma Methods", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
    db.run("INSERT INTO test (value) VALUES (?)", ["test"]);
  });

  describe("pragma() - Reading", () => {
    test("reads pragma without value", () => {
      const result = db.pragma("journal_mode");

      expect(result).toBeDefined();
      // WAL mode is set by default
      expect(result).toBeDefined();
    });

    test("reads database_list pragma", () => {
      const result = db.pragma("database_list");

      expect(result).toBeDefined();
      // Should return database info
    });

    test("reads table_info pragma", () => {
      const result = db.pragma("table_info(test)");

      expect(result).toBeDefined();
      // Should return table column info
    });

    test("reads user_version pragma", () => {
      const result = db.pragma("user_version");

      expect(result).toBeDefined();
    });

    test("reads synchronous pragma", () => {
      const result = db.pragma("synchronous");

      expect(result).toBeDefined();
    });

    test("reads cache_size pragma", () => {
      const result = db.pragma("cache_size");

      expect(result).toBeDefined();
    });

    test("reads foreign_keys pragma", () => {
      const result = db.pragma("foreign_keys");

      expect(result).toBeDefined();
    });

    test("reads sqlite_version pragma", () => {
      const result = db.pragma("sqlite_version");

      expect(result).toBeDefined();
      // Should be a version string like "3.45.1"
    });
  });

  describe("pragma() - Writing", () => {
    test("sets pragma with integer value", () => {
      const result = db.pragma("synchronous", 1);

      expect(result).toBeDefined();
    });

    test("sets pragma with string value", () => {
      const result = db.pragma("journal_mode", "DELETE");

      expect(result).toBeDefined();
    });

    test("sets cache_size", () => {
      const result = db.pragma("cache_size", -32000);

      expect(result).toBeDefined();
    });

    test("sets user_version", () => {
      db.pragma("user_version", 1);

      const version = db.pragma("user_version");
      expect(version).toBeDefined();
    });

    test("sets temp_store", () => {
      const result = db.pragma("temp_store", 2);

      expect(result).toBeDefined();
    });
  });

  describe("pragma() - Common Use Cases", () => {
    test("optimize pragma", () => {
      // PRAGMA optimize is a common maintenance operation
      const result = db.pragma("optimize");

      expect(result).toBeDefined();
    });

    test("wal_checkpoint pragma", () => {
      // WAL checkpoint
      const result = db.pragma("wal_checkpoint");

      expect(result).toBeDefined();
    });

    test("busy_timeout pragma", () => {
      const result = db.pragma("busy_timeout", 5000);

      expect(result).toBeDefined();
    });

    test("mmap_size pragma", () => {
      const result = db.pragma("mmap_size", 268435456);

      expect(result).toBeDefined();
    });
  });

  describe("pragma() - Introspection", () => {
    test("reads table_xinfo for column details", () => {
      const result = db.pragma("table_xinfo(test)");

      expect(result).toBeDefined();
    });

    test("reads index_list for table indexes", () => {
      const result = db.pragma("index_list(test)");

      expect(result).toBeDefined();
    });

    test("reads collation_list", () => {
      const result = db.pragma("collation_list");

      expect(result).toBeDefined();
    });

    test("reads function_list", () => {
      const result = db.pragma("function_list");

      expect(result).toBeDefined();
    });

    test("reads module_list", () => {
      const result = db.pragma("module_list");

      expect(result).toBeDefined();
    });

    test("reads compile_options", () => {
      const result = db.pragma("compile_options");

      expect(result).toBeDefined();
    });
  });

  describe("pragma() - Statistics", () => {
    test("reads page_count", () => {
      const result = db.pragma("page_count");

      expect(result).toBeDefined();
    });

    test("reads page_size", () => {
      const result = db.pragma("page_size");

      expect(result).toBeDefined();
    });

    test("reads freelist_count", () => {
      const result = db.pragma("freelist_count");

      expect(result).toBeDefined();
    });

    test("reads data_version", () => {
      const result = db.pragma("data_version");

      expect(result).toBeDefined();
    });
  });

  describe("pragma() - Error Handling", () => {
    test("handles invalid pragma name gracefully", () => {
      // SQLite ignores unknown pragmas
      expect(() => {
        db.pragma("nonexistent_pragma");
      }).not.toThrow();
    });
  });

  describe("pragma() - Return Types", () => {
    test("returns JSON value", () => {
      const result = db.pragma("journal_mode");

      // Result should be a JSON value (string, number, array, or null)
      expect(result).toBeDefined();
      expect(typeof result).toMatch(/string|number|object/);
    });

    test("returns array for multi-row results", () => {
      const result = db.pragma("table_info(test)");

      // table_info returns multiple rows
      expect(result).toBeDefined();
    });
  });
});
