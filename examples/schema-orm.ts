/**
 * Modern ORM Example (Drizzle-style)
 * 
 * Demonstrates the full capabilities of the sqlite-napi ORM adapter,
 * including chainable builders, indexes, and transactions.
 */

import { Database } from "sqlite-napi";
import {
    sqliteTable,
    integer,
    text,
    boolean,
    index,
    uniqueIndex,
    sqliteNapi,
    type InferRow,
} from "sqlite-napi/orm";

// ============================================
// 1. Schema Definition (Modern Fluent API)
// ============================================

// Users table with constraints and indexes
const users = sqliteTable("users", {
    id: integer("id").primaryKey().autoincrement(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(1),
    role: text("role").notNull().default("user"),
    createdAt: text("created_at").notNull().default("(CURRENT_TIMESTAMP)"),
}, (table) => ({
    emailIdx: uniqueIndex("email_idx", [table.email.name]),
    roleIdx: index("role_idx", [table.role.name]),
}));

// Posts table with foreign key and indexes
const posts = sqliteTable("posts", {
    id: integer("id").primaryKey().autoincrement(),
    userId: integer("user_id").notNull().references("users", "id"),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    content: text("content"),
    published: boolean("published").notNull().default(0),
    createdAt: text("created_at").notNull().default("(CURRENT_TIMESTAMP)")
}, (table) => ({
    userPostsIdx: index("user_posts_idx", [table.userId.name]),
    publishedIdx: index("published_idx", [table.published.name]),
}));

// Infer types from schema
export type User = InferRow<typeof users>;
export type Post = InferRow<typeof posts>;

// ============================================
// 2. High-Level Service Pattern
// ============================================

class BlogService {
    private adapter: ReturnType<typeof sqliteNapi>;

    constructor(db: Database) {
        this.adapter = sqliteNapi(db);
        // Sync schema (idempotent: safe for table creation and column updates)
        this.adapter.sync([users, posts]);
    }

    get orm() {
        return this.adapter;
    }

    /**
     * Create a user and a welcome post in a single transaction
     */
    async setupNewUser(email: string, name: string) {
        return this.adapter.transaction((tx) => {
            console.log(`  [TX] Creating user: ${email}...`);
            const userResult = tx.insert(users).values({
                email,
                name,
                role: "user"
            }).run();

            const userId = Number(userResult.lastInsertRowid);

            console.log(`  [TX] Creating welcome post for user ${userId}...`);
            tx.insert(posts).values({
                userId,
                title: `Welcome ${name}!`,
                slug: `welcome-${name.toLowerCase().replace(/\s+/g, '-')}`,
                content: "This is your first post created automatically.",
                published: 1
            }).run();

            return userId;
        });
    }

    getUsersWithPosts() {
        // Demonstrate complex select with join
        return this.adapter.select(users)
            .select("name", "email")
            .join("posts", "users.id = posts.user_id")
            .all();
    }

    getStats() {
        return {
            users: this.adapter.count(users),
            posts: this.adapter.count(posts),
            dbInfo: this.adapter.getMetadata()
        };
    }
}

// ============================================
// 3. Main Execution
// ============================================

async function main() {
    console.log("\x1b[36m=== Modern SQLite NAPI ORM Demo ===\x1b[0m\n");

    const db = new Database(":memory:");
    const blog = new BlogService(db);

    console.log("\x1b[32m1. Atomic Transactional Setup\x1b[0m");
    try {
        const aliceId = await blog.setupNewUser("alice@example.com", "Alice Wonderland");
        const bobId = await blog.setupNewUser("bob@example.com", "Bob Builder");
        console.log(`   ✓ Setup complete. User IDs: ${aliceId}, ${bobId}`);
    } catch (e) {
        console.error("   ✗ Setup failed:", (e as Error).message);
    }

    console.log("\n\x1b[32m2. Transaction Rollback Verification\x1b[0m");
    try {
        await db.transactionFn("IMMEDIATE", []); // Just showing raw DB works alongside
        
        await blog.orm.transaction((tx) => {
            tx.insert(users).values({ name: "Evil", email: "evil@fail.com" }).run();
            console.log("   ✓ Inserted Evil (pending)...");
            throw new Error("Simulated Failure");
        });
    } catch (e) {
        console.log("   ✓ Caught expected error, transaction rolled back.");
    }

    console.log("\n\x1b[32m3. Relational Queries (JOIN)\x1b[0m");
    const feed = blog.getUsersWithPosts();
    console.log("   Users with activity:", feed);

    console.log("\n\x1b[32m4. Schema Introspection\x1b[0m");
    const stats = blog.getStats();
    console.log(`   Total Users: ${stats.users}`);
    console.log(`   Total Posts: ${stats.posts}`);
    console.log(`   SQLite Version: ${stats.dbInfo.sqlite_version}`);

    console.log("\n\x1b[32m5. Schema Migration Check\x1b[0m");
    console.log("   Current Tables:", blog.orm.getTables());

    db.close();
    console.log("\n\x1b[36m✓ end\x1b[0m");
}

main().catch(console.error);

