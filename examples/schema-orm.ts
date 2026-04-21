/**
 * ORM Example (Drizzle-style)
 * 
 * Demonstrates how to use the Drizzle-compatible adapter and schema builders
 */

import { Database } from "../index";
import {
  sqliteTable,
  integer,
  text,
  boolean,
  primaryKey,
  notNull,
  unique,
  default_,
  references,
  sqliteNapi,
  type InferRow,
} from "./core/index";

// ============================================
// Schema Definition
// ============================================

const users = sqliteTable("users", {
  id: primaryKey(integer("id")),
  email: notNull(unique(text("email"))),
  name: text("name"),
  password_hash: notNull(text("password_hash")),
  active: default_(boolean("active"), 1),
  role: default_(text("role"), "user"),
  created_at: default_(text("created_at"), "CURRENT_TIMESTAMP"),
});

const posts = sqliteTable("posts", {
  id: primaryKey(integer("id")),
  user_id: notNull(references(integer("user_id"), { table: "users", column: "id" })),
  title: notNull(text("title")),
  slug: unique(text("slug")),
  content: text("content"),
  published: default_(boolean("published"), 0),
  created_at: default_(text("created_at"), "CURRENT_TIMESTAMP")
});

// Infer types from schema
type User = InferRow<typeof users>;
type Post = InferRow<typeof posts>;

function exampleSchemaDefinition() {
  console.log("=== Schema Definition ===\n");

  const db = new Database(":memory:");
  const adapter = sqliteNapi(db);

  // Sync schema (creates tables and adds missing columns automatically)
  adapter.sync([users, posts]);

  console.log("\nTables in DB:", db.getTables());
  db.close();
}

// ============================================
// Repository Pattern with Adapter
// ============================================

class ModelRepository<T extends { id: number }> {
  protected adapter: ReturnType<typeof sqliteNapi>;
  protected table: any;

  constructor(adapter: ReturnType<typeof sqliteNapi>, table: any) {
    this.adapter = adapter;
    this.table = table;
  }

  create(data: Partial<T>): number {
    const result = this.adapter.insert(this.table).values(data as any).run();
    return Number(result.lastInsertRowid);
  }

  findById(id: number): T | null {
    return this.adapter.select(this.table).where("id = ?", [id]).get() as T | null;
  }

  findAll(): T[] {
    return this.adapter.select(this.table).all() as T[];
  }

  update(id: number, data: Partial<T>): boolean {
    const result = this.adapter.update(this.table)
      .set(data as any)
      .where("id = ?", [id])
      .run();
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.adapter.delete(this.table)
      .where("id = ?", [id])
      .run();
    return result.changes > 0;
  }
}

class UserRepository extends ModelRepository<User> {
  constructor(adapter: ReturnType<typeof sqliteNapi>) {
    super(adapter, users);
  }

  findByEmail(email: string): User | null {
    return this.adapter.select(users).where("email = ?", [email]).get() as User | null;
  }

  createUser(email: string, passwordHash: string, name?: string): number {
    return this.create({
      email,
      password_hash: passwordHash,
      name: name || undefined,
      active: 1,
      role: "user"
    });
  }
}

class PostRepository extends ModelRepository<Post> {
  constructor(adapter: ReturnType<typeof sqliteNapi>) {
    super(adapter, posts);
  }

  findPublished(): Post[] {
    return this.adapter.select(posts)
      .where("published = 1")
      .orderBy("created_at", "desc")
      .all() as Post[];
  }

  findBySlug(slug: string): Post | null {
    return this.adapter.select(posts).where("slug = ?", [slug]).get() as Post | null;
  }

  createPost(userId: number, title: string, content?: string): number {
    const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return this.create({
      user_id: userId,
      title,
      slug,
      content: content || undefined,
      published: 0
    });
  }
}

class SQLiteORM {
  public users: UserRepository;
  public posts: PostRepository;
  private db: Database;
  private adapter: ReturnType<typeof sqliteNapi>;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.adapter = sqliteNapi(this.db);
    this.users = new UserRepository(this.adapter);
    this.posts = new PostRepository(this.adapter);
  }

  static init(dbPath: string): SQLiteORM {
    const orm = new SQLiteORM(dbPath);

    // Auto-sync schema (safe for updates)
    orm.adapter.sync([users, posts]);

    return orm;
  }

  getDatabase(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

function exampleORM() {
  console.log("\n=== Repository Pattern with Driver Adapter ===\n");

  const orm = SQLiteORM.init(":memory:");

  const user1Id = orm.users.createUser("alice@example.com", "hash123", "Alice");
  const user2Id = orm.users.createUser("bob@example.com", "hash456", "Bob");

  console.log(`Users created: ${user1Id}, ${user2Id}`);

  const alice = orm.users.findByEmail("alice@example.com");
  console.log("User found:", alice?.name, `(${alice?.email})`);

  const postId = orm.posts.createPost(user1Id, "My first post", "Post content about SQLite NAPI");
  console.log(`Post created with ID: ${postId}`);

  orm.posts.update(postId, { published: 1 });
  console.log("Post published via update");

  const publishedPosts = orm.posts.findPublished();
  console.log("Published posts count:", publishedPosts.length);
  if (publishedPosts.length > 0) {
    console.log("Latest post title:", publishedPosts[0].title);
  }

  const allUsers = orm.users.findAll();
  console.log("All users emails:", allUsers.map(u => u.email).join(", "));

  orm.close();
}

// Run examples
exampleSchemaDefinition();
exampleORM();

console.log("\n✓ end");

