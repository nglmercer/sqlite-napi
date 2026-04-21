import { Database } from "../index";
import { sqliteTable, text, integer, sqliteNapi, primaryKey } from "./core/index";

const db = new Database("test_sync.db");
const adapter = sqliteNapi(db);

// Initial schema
const usersV1 = sqliteTable("users", {
    id: primaryKey(integer("id")),
    name: text("name")
});

console.log("Syncing V1...");
adapter.sync([usersV1]);
console.log("Columns after V1:", db.getColumns("users").map(c => c.name));

// Updated schema
const usersV2 = sqliteTable("users", {
    id: primaryKey(integer("id")),
    name: text("name"),
    email: text("email") // Added column
});

console.log("\nSyncing V2...");
adapter.sync([usersV2]);
console.log("Columns after V2:", db.getColumns("users").map(c => c.name));

db.close();
import { unlinkSync } from "fs";
try { unlinkSync("test_sync.db"); } catch { }
