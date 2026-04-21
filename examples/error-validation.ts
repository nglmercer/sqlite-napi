/**
 * ORM Error Validation Example
 * 
 * Verifies that the Drizzle-style ORM adapter correctly propagates 
 * and enhances errors for various failure scenarios.
 */

import { Database } from "../index";
import {
    sqliteTable,
    integer,
    text,
    primaryKey,
    notNull,
    unique,
    references,
    sqliteNapi
} from "./core/index";

// ANSI colors
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    gray: "\x1b[90m"
};

const logTitle = (title: string) => console.log(`${colors.bright}${colors.cyan}=== ${title} ===${colors.reset}\n`);
const logCase = (num: number, desc: string) => console.log(`${colors.bright}${colors.blue}Case ${num}: ${desc}${colors.reset}`);
const logError = (msg: string) => console.log(`${colors.red}${msg}${colors.reset}`);
const logSuccess = (msg: string) => console.log(`${colors.green}✔ ${msg}${colors.reset}`);

async function main() {
    logTitle("ORM Error Validation");

    const db = new Database(":memory:");
    const adapter = sqliteNapi(db);

    // Enable foreign keys
    db.pragma("foreign_keys", 1);

    // 1. Schema Sync Error (Invalid SQL in definition)
    // ========================================
    logCase(1, "Invalid Table Definition during Sync");
    const brokenTable = {
        name: "broken",
        getSQL: () => "CREATE TABLE broken (id INTEGER PRIMARY,)", // Syntax error
        getColumns: () => []
    };
    try {
        //@ts-expect-error
        adapter.sync([brokenTable]);
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 2. Select from Missing Table
    // ========================================
    logCase(2, "ORM Select from non-existent table");
    const ghostTable = sqliteTable("ghosts", { id: integer("id") });
    try {
        adapter.select(ghostTable).all();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 3. Unique Constraint Violation
    // ========================================
    logCase(3, "ORM Unique Constraint Violation");
    const items = sqliteTable("items", {
        name: notNull(unique(text("name")))
    });
    adapter.sync([items]);
    adapter.insert(items).values({ name: "apple" }).run();
    try {
        adapter.insert(items).values({ name: "apple" }).run(); // Duplicate
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 4. Foreign Key Violation
    // ========================================
    logCase(4, "ORM Foreign Key Violation");
    const categories = sqliteTable("categories", {
        id: primaryKey(integer("id"))
    });
    const products = sqliteTable("products", {
        id: primaryKey(integer("id")),
        category_id: references(integer("category_id"), { table: "categories", column: "id" })
    });
    adapter.sync([categories, products]);

    try {
        adapter.insert(products).values({ id: 1, category_id: 999 }).run();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 5. Update Validation (Empty Set)
    // ========================================
    logCase(5, "ORM Update with no data");
    try {
        adapter.update(items).set({}).where("name = ?", ["apple"]).run();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 6. Relational Search Error (Missing Column)
    // ========================================
    logCase(6, "ORM Select with non-existent column");
    try {
        // Use raw select to simulate a typo or schema mismatch
        adapter.select(products).selectRaw("non_existent_col").all();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 7. Join Error (Invalid reference)
    // ========================================
    logCase(7, "ORM Join with missing column");
    try {
        adapter.select(products)
            .join("categories", "products.category_id = categories.missing_id")
            .all();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 8. Delete Validation (Missing WHERE context)
    // ========================================
    logCase(8, "ORM Delete with invalid SQL in where");
    try {
        adapter.delete(items).where("invalid_syntax_here").run();
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    // 9. Sync Error (Invalid Column for Update)
    // ========================================
    logCase(9, "ORM Sync adding invalid column");
    const invalidUpdateTable = {
        name: "items",
        getSQL: () => "CREATE TABLE items (name TEXT)",
        getColumns: () => [{
            name: "new_col",
            primaryKey: false,
            getDefinitionSQL: () => "TEXT DEFAULT (" // Syntax error
        }]
    };
    try {
        //@ts-expect-error
        adapter.sync([invalidUpdateTable]);
    } catch (e) {
        logError((e as Error).message);
    }
    console.log();

    db.close();
    logSuccess("Verification finished.");
}

main().catch(console.error);
