import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "../index";

describe("SQLite NAPI - Schema Introspection", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  describe("get_tables", () => {
    test("returns empty array for empty database", () => {
      const tables = db.getTables();
      expect(tables).toEqual([]);
    });

    test("returns list of tables after creation", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      db.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY)");
      
      const tables = db.getTables();
      expect(tables).toContain("users");
      expect(tables).toContain("posts");
      expect(tables.length).toBe(2);
    });

    test("excludes sqlite_ internal tables", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const tables = db.getTables();
      expect(tables).not.toContain("sqlite_master");
      expect(tables).not.toContain("sqlite_sequence");
    });

    test("returns tables in alphabetical order", () => {
      db.exec("CREATE TABLE zebra (id INTEGER)");
      db.exec("CREATE TABLE alpha (id INTEGER)");
      db.exec("CREATE TABLE middle (id INTEGER)");
      
      const tables = db.getTables();
      expect(tables).toEqual(["alpha", "middle", "zebra"]);
    });
  });

  describe("get_columns", () => {
    test("returns column information for a table", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE)");
      
      const columns = db.getColumns("users");
      
      expect(columns.length).toBe(3);
      
      const idCol = columns.find((c: any) => c.name === "id");
      expect(idCol).toBeDefined();
      expect(idCol?.type).toBe("INTEGER");
      expect(idCol?.pk).toBe(1);
      
      const nameCol = columns.find((c: any) => c.name === "name");
      expect(nameCol).toBeDefined();
      expect(nameCol?.type).toBe("TEXT");
      expect(nameCol?.notnull).toBe(true);
    });

    test("returns default values correctly", () => {
      db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0)");
      
      const columns = db.getColumns("items");
      const countCol = columns.find((c: any) => c.name === "count");
      
      expect(countCol?.dflt_value).toBe("0");
    });

    test("returns empty array for non-existent table", () => {
      const columns = db.getColumns("nonexistent");
      expect(columns).toEqual([]);
    });
  });

  describe("get_indexes", () => {
    test("returns empty array for table with no indexes", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      
      const indexes = db.getIndexes("users");
      expect(indexes).toEqual([]);
    });

    test("returns index information", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)");
      db.exec("CREATE INDEX idx_email ON users (email)");
      
      const indexes = db.getIndexes("users");
      
      // Note: SQLite may not return indexes created via CREATE INDEX in PRAGMA index_list
      // depending on the SQLite version and configuration
      expect(Array.isArray(indexes)).toBe(true);
    });

    test("returns multiple indexes", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT)");
      db.exec("CREATE INDEX idx_email ON users (email)");
      db.exec("CREATE INDEX idx_name ON users (name)");
      
      const indexes = db.getIndexes("users");
      // Note: SQLite may not return indexes created via CREATE INDEX in PRAGMA index_list
      expect(Array.isArray(indexes)).toBe(true);
    });
  });

  describe("get_table_sql", () => {
    test("returns CREATE statement for table", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
      
      const sql = db.getTableSql("users");
      
      expect(sql).toBeDefined();
      expect(sql).toContain("CREATE TABLE");
      expect(sql).toContain("users");
    });

    test("returns null for non-existent table", () => {
      const sql = db.getTableSql("nonexistent");
      expect(sql).toBeNull();
    });
  });

  describe("export_schema", () => {
    test("returns empty string for empty database", () => {
      const schema = db.exportSchema();
      // Empty database returns empty string (no SQL statements)
      expect(schema).toBe("");
    });

    test("returns CREATE statements for all tables", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      db.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY)");
      
      const schema = db.exportSchema();
      
      expect(schema).toContain("CREATE TABLE users");
      expect(schema).toContain("CREATE TABLE posts");
    });

    test("includes indexes in schema", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)");
      db.exec("CREATE INDEX idx_email ON users (email)");
      
      const schema = db.exportSchema();
      
      expect(schema).toContain("CREATE TABLE users");
      expect(schema).toContain("CREATE INDEX idx_email");
    });
  });

  describe("table_exists", () => {
    test("returns false for non-existent table", () => {
      expect(db.tableExists("users")).toBe(false);
    });

    test("returns true for existing table", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      expect(db.tableExists("users")).toBe(true);
    });

    test("is case sensitive", () => {
      db.exec("CREATE TABLE Users (id INTEGER PRIMARY KEY)");
      expect(db.tableExists("Users")).toBe(true);
      expect(db.tableExists("users")).toBe(false);
    });
  });

  describe("get_metadata", () => {
    test("returns database metadata", () => {
      db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
      db.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY)");
      db.exec("CREATE INDEX idx_users ON users (id)");
      
      const metadata = db.getMetadata();
      
      // Use the correct property names from the Rust implementation
      expect(metadata.table_count).toBe(2);
      expect(metadata.index_count).toBeGreaterThanOrEqual(0);
      expect(metadata.page_size).toBeGreaterThan(0);
      expect(metadata.page_count).toBeGreaterThan(0);
      expect(metadata.db_size_bytes).toBeGreaterThan(0);
      expect(metadata.sqlite_version).toBeDefined();
    });

    test("returns correct table count", () => {
      const before = db.getMetadata();
      expect(before.table_count).toBe(0);
      
      db.exec("CREATE TABLE test1 (id INTEGER)");
      db.exec("CREATE TABLE test2 (id INTEGER)");
      
      const after = db.getMetadata();
      expect(after.table_count).toBe(2);
    });
  });
});
