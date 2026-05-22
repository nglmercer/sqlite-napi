import { Database as NapiDatabase } from "../index";
import { Database as BunDatabase } from "bun:sqlite";
import { runGroup } from "./harness";

const ROWS_BULK = 10_000;
const ROWS_SMALL = 500;
const LOOKUP_ITER = 5_000;
const ITER_COUNT = 100;
const MIXED_TX = 200;

// ── helpers ────────────────────────────────────────────────────────────
function napiOpen(): NapiDatabase {
  const db = new NapiDatabase(":memory:");
  db.exec(
    "CREATE TABLE bench (id INTEGER PRIMARY KEY, val INTEGER, label TEXT, created TEXT)"
  );
  return db;
}

function bunOpen(): BunDatabase {
  const db = new BunDatabase(":memory:");
  db.exec(
    "CREATE TABLE bench (id INTEGER PRIMARY KEY, val INTEGER, label TEXT, created TEXT)"
  );
  return db;
}

function napiSeed(db: NapiDatabase, n: number): void {
  const tx = db.transaction("deferred");
  for (let i = 0; i < n; i++) {
    tx.run(
      "INSERT INTO bench (val, label, created) VALUES (?, ?, datetime('now'))",
      [i, `row-${i}`],
    );
  }
  tx.commit();
}

function bunSeed(db: BunDatabase, n: number): void {
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      db.run(
        "INSERT INTO bench (val, label, created) VALUES (?, ?, datetime('now'))",
        [i, `row-${i}`],
      );
    }
  });
  tx();
}

// ═══════════════════════════════════════════════════════════════════════
//  1. Connection open / close
// ═══════════════════════════════════════════════════════════════════════
runGroup("1. Connection open / close", [
  {
    label: "open/close empty DB",
    napi: () => {
      const db = new NapiDatabase(":memory:");
      db.close();
    },
    bun: () => {
      const db = new BunDatabase(":memory:");
      db.close();
    },
  },
  {
    label: "open/close DB with schema",
    napi: () => {
      const db = napiOpen();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  2. exec() / DDL
// ═══════════════════════════════════════════════════════════════════════
runGroup("2. exec() — DDL", [
  {
    label: "CREATE TABLE",
    napi: () => {
      const db = new NapiDatabase(":memory:");
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a INT, b TEXT, c REAL)");
      db.close();
    },
    bun: () => {
      const db = new BunDatabase(":memory:");
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a INT, b TEXT, c REAL)");
      db.close();
    },
  },
  {
    label: "multiple statements",
    napi: () => {
      const db = new NapiDatabase(":memory:");
      db.exec(
        "CREATE TABLE t1 (id INT); CREATE TABLE t2 (id INT); CREATE TABLE t3 (id INT);"
      );
      db.close();
    },
    bun: () => {
      const db = new BunDatabase(":memory:");
      db.exec(
        "CREATE TABLE t1 (id INT); CREATE TABLE t2 (id INT); CREATE TABLE t3 (id INT);"
      );
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  3. Statement run() — single row INSERT
// ═══════════════════════════════════════════════════════════════════════
runGroup("3. Statement.run() — INSERT", [
  {
    label: "single INSERT",
    napi: () => {
      const db = napiOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      stmt.run([1, "one"]);
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      stmt.run(1, "one");
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  4. Statement.all() — SELECT all rows
// ═══════════════════════════════════════════════════════════════════════
runGroup("4. Statement.all() — SELECT", [
  {
    label: "all rows (500 rows)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      db.query("SELECT * FROM bench").all([]);
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      db.query("SELECT * FROM bench").all();
      db.close();
    },
  },
  {
    label: "all rows (10k rows)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_BULK);
      db.query("SELECT * FROM bench").all([]);
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_BULK);
      db.query("SELECT * FROM bench").all();
      db.close();
    },
  },
  {
    label: "filtered WHERE",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      db.query("SELECT * FROM bench WHERE val > ?").all([250]);
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      db.query("SELECT * FROM bench WHERE val > ?").all(250);
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  5. Statement.get() — single row lookup
// ═══════════════════════════════════════════════════════════════════════
runGroup("5. Statement.get() — lookup", [
  {
    label: "get by PK (5000 lookups)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      const stmt = db.query("SELECT * FROM bench WHERE id = ?");
      for (let i = 0; i < LOOKUP_ITER; i++) {
        stmt.get([(i % ROWS_SMALL) + 1]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      const stmt = db.query("SELECT * FROM bench WHERE id = ?");
      for (let i = 0; i < LOOKUP_ITER; i++) {
        stmt.get((i % ROWS_SMALL) + 1);
      }
      db.close();
    },
    iterations: 5,
  },
  {
    label: "get not found (null)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      const stmt = db.query("SELECT * FROM bench WHERE id = ?");
      for (let i = 0; i < LOOKUP_ITER; i++) {
        stmt.get([-1]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      const stmt = db.query("SELECT * FROM bench WHERE id = ?");
      for (let i = 0; i < LOOKUP_ITER; i++) {
        stmt.get(-1);
      }
      db.close();
    },
    iterations: 5,
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  6. Statement.values() — rows as arrays
// ═══════════════════════════════════════════════════════════════════════
runGroup("6. Statement.values() — arrays", [
  {
    label: "values (500 rows)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      db.query("SELECT id, val, label FROM bench").values([]);
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      db.query("SELECT id, val, label FROM bench").values();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  7. Statement.iter() — iteration
// ═══════════════════════════════════════════════════════════════════════
runGroup("7. Statement.iter() — iteration", [
  {
    label: "iterate all rows x100",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ITER_COUNT);
      const stmt = db.query("SELECT * FROM bench");
      for (let pass = 0; pass < 100; pass++) {
        const iter = stmt.iter([]);
        while (iter.hasMore()) {
          iter.next();
        }
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ITER_COUNT);
      const stmt = db.query("SELECT * FROM bench");
      for (let pass = 0; pass < 100; pass++) {
        const iter = stmt.iterate();
        for (const _ of iter) {
          // drain
        }
      }
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  8. Statement.run() — UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════════
runGroup("8. Statement.run() — UPDATE / DELETE", [
  {
    label: "UPDATE (500 rows)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      const stmt = db.query("UPDATE bench SET val = val + 1 WHERE id = ?");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run([i + 1]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      const stmt = db.query("UPDATE bench SET val = val + 1 WHERE id = ?");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run(i + 1);
      }
      db.close();
    },
  },
  {
    label: "DELETE (500 rows)",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      const stmt = db.query("DELETE FROM bench WHERE id = ?");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run([i + 1]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      const stmt = db.query("DELETE FROM bench WHERE id = ?");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run(i + 1);
      }
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  9. Named vs positional params
// ═══════════════════════════════════════════════════════════════════════
runGroup("9. Parameter binding styles", [
  {
    label: "positional params (500x)",
    napi: () => {
      const db = napiOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run([i, `p${i}`]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run(i, `p${i}`);
      }
      db.close();
    },
  },
  {
    label: "named params (500x)",
    napi: () => {
      const db = napiOpen();
      const stmt = db.query(
        "INSERT INTO bench (val, label) VALUES ($val, $label)",
      );
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run({ $val: i, $label: `n${i}` });
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      const stmt = db.query(
        "INSERT INTO bench (val, label) VALUES ($val, $label)",
      );
      for (let i = 0; i < ROWS_SMALL; i++) {
        stmt.run({ $val: i, $label: `n${i}` });
      }
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  10. Bulk insert — no transaction vs in transaction
// ═══════════════════════════════════════════════════════════════════════
runGroup("10. Bulk insert", [
  {
    label: "auto-commit (10k rows)",
    napi: () => {
      const db = napiOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      for (let i = 0; i < ROWS_BULK; i++) {
        stmt.run([i, `auto-${i}`]);
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      const stmt = db.query("INSERT INTO bench (val, label) VALUES (?, ?)");
      for (let i = 0; i < ROWS_BULK; i++) {
        stmt.run(i, `auto-${i}`);
      }
      db.close();
    },
    iterations: 3,
  },
  {
    label: "in transaction (10k rows)",
    napi: () => {
      const db = napiOpen();
      const tx = db.transaction("deferred");
      for (let i = 0; i < ROWS_BULK; i++) {
        tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [
          i,
          `tx-${i}`,
        ]);
      }
      tx.commit();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      const tx = db.transaction(() => {
        for (let i = 0; i < ROWS_BULK; i++) {
          db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [
            i,
            `tx-${i}`,
          ]);
        }
      });
      tx();
      db.close();
    },
    iterations: 3,
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  11. Transaction operations
// ═══════════════════════════════════════════════════════════════════════
runGroup("11. Transaction create / commit / rollback", [
  {
    label: "create + commit (500x)",
    napi: () => {
      const db = napiOpen();
      for (let i = 0; i < 500; i++) {
        const tx = db.transaction("deferred");
        tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [i, `c${i}`]);
        tx.commit();
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      for (let i = 0; i < 500; i++) {
        const tx = db.transaction(() => {
          db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [i, `c${i}`]);
        });
        tx();
      }
      db.close();
    },
  },
  {
    label: "create + rollback (500x)",
    napi: () => {
      const db = napiOpen();
      for (let i = 0; i < 500; i++) {
        const tx = db.transaction("deferred");
        tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [i, `r${i}`]);
        tx.rollback();
      }
      db.close();
    },
    bun: () => {
      // bun:sqlite rollback simulation: use a savepoint and rollback
      const db = bunOpen();
      for (let i = 0; i < 500; i++) {
        db.exec("SAVEPOINT sp_roll");
        db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [i, `r${i}`]);
        db.exec("ROLLBACK TO SAVEPOINT sp_roll");
      }
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  12. Transaction query methods (tx.all, tx.get, tx.values)
// ═══════════════════════════════════════════════════════════════════════
runGroup("12. Transaction query methods", [
  {
    label: "tx.all + tx.get",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      const tx = db.transaction("deferred");
      tx.all("SELECT * FROM bench WHERE val > ?", [250]);
      tx.get("SELECT * FROM bench WHERE id = ?", [1]);
      tx.commit();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      const tx = db.transaction(() => {
        db.query("SELECT * FROM bench WHERE val > ?").all(250);
        db.query("SELECT * FROM bench WHERE id = ?").get(1);
      });
      tx();
      db.close();
    },
  },
  {
    label: "tx.values + tx.iter",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ITER_COUNT);
      const tx = db.transaction("deferred");
      tx.values("SELECT id, val FROM bench");
      const iter = tx.iter("SELECT * FROM bench");
      while (iter.hasMore()) {
        iter.next();
      }
      tx.commit();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ITER_COUNT);
      const tx = db.transaction(() => {
        db.query("SELECT id, val FROM bench").values();
        const iter = db.query("SELECT * FROM bench").iterate();
        for (const _ of iter) {
          // drain
        }
      });
      tx();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  13. Savepoints (nested transactions)
// ═══════════════════════════════════════════════════════════════════════
runGroup("13. Savepoints", [
  {
    label: "savepoint commit",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, 10);
      const tx = db.transaction("deferred");
      tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [999, "before"]);
      const sp = tx.savepoint("sp1");
      sp.run("INSERT INTO bench (val, label) VALUES (?, ?)", [888, "inside"]);
      sp.commit();
      tx.commit();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, 10);
      const tx = db.transaction(() => {
        db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [999, "before"]);
        db.exec("SAVEPOINT sp1");
        db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [888, "inside"]);
        db.exec("RELEASE SAVEPOINT sp1");
      });
      tx();
      db.close();
    },
  },
  {
    label: "savepoint rollback",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, 10);
      const tx = db.transaction("deferred");
      tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [999, "before"]);
      const sp = tx.savepoint("sp1");
      sp.run("INSERT INTO bench (val, label) VALUES (?, ?)", [888, "inside"]);
      sp.rollback();
      tx.commit();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, 10);
      const tx = db.transaction(() => {
        db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [999, "before"]);
        db.exec("SAVEPOINT sp1");
        db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [888, "inside"]);
        db.exec("ROLLBACK TO SAVEPOINT sp1");
      });
      tx();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  14. Mixed workload (real-world simulation)
// ═══════════════════════════════════════════════════════════════════════
runGroup("14. Mixed workload", [
  {
    label: "10 inserts + 20 selects + 5 updates (200x)",
    napi: () => {
      const db = napiOpen();
      for (let iter = 0; iter < MIXED_TX; iter++) {
        const tx = db.transaction("deferred");
        for (let i = 0; i < 10; i++) {
          tx.run("INSERT INTO bench (val, label) VALUES (?, ?)", [
            i,
            `row-${iter}-${i}`,
          ]);
        }
        for (let i = 0; i < 20; i++) {
          tx.all("SELECT * FROM bench WHERE val = ?", [i % 10]);
        }
        for (let i = 0; i < 5; i++) {
          tx.run("UPDATE bench SET val = ? WHERE id = ?", [999, i + 1]);
        }
        tx.commit();
      }
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      for (let iter = 0; iter < MIXED_TX; iter++) {
        const tx = db.transaction(() => {
          for (let i = 0; i < 10; i++) {
            db.run("INSERT INTO bench (val, label) VALUES (?, ?)", [
              i,
              `row-${iter}-${i}`,
            ]);
          }
          for (let i = 0; i < 20; i++) {
            db.query("SELECT * FROM bench WHERE val = ?").all(i % 10);
          }
          for (let i = 0; i < 5; i++) {
            db.run("UPDATE bench SET val = ? WHERE id = ?", [999, i + 1]);
          }
        });
        tx();
      }
      db.close();
    },
    iterations: 3,
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  15. Schema introspection
// ═══════════════════════════════════════════════════════════════════════
runGroup("15. Schema introspection", [
  {
    label: "getTables + getColumns",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, 10);
      db.getTables();
      db.getColumns("bench");
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, 10);
      // bun:sqlite uses PRAGMA directly
      db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
      db.query("PRAGMA table_info(bench)").all();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  16. Serialization
// ═══════════════════════════════════════════════════════════════════════
runGroup("16. Serialization", [
  {
    label: "serialize schema",
    napi: () => {
      const db = napiOpen();
      napiSeed(db, ROWS_SMALL);
      db.serialize();
      db.close();
    },
    bun: () => {
      const db = bunOpen();
      bunSeed(db, ROWS_SMALL);
      db.query(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
      ).all();
      db.close();
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════
//  Summary footer
// ═══════════════════════════════════════════════════════════════════════
console.log();
console.log("═".repeat(72));
console.log("  Done — all benchmarks complete");
console.log("═".repeat(72));
