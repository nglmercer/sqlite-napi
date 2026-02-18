/**
 * ORM (Prisma-like)
 */

import { Database } from "../index";
import {
  SQLiteSchema
} from "./core";

function ejemploSchemaDefinition() {
  console.log("=== EJEMPLO: Definición de Schema ===\n");

  const schemaBuilder = new SQLiteSchema();

  schemaBuilder.create("users", (s) => {
    s.integer("id").primaryKey().autoIncrement();
    s.text("email").notNull().unique();
    s.text("name");
    s.text("password_hash").notNull();
    s.boolean("active").default(1);
    s.text("role").default("user");
    s.text("created_at").default("datetime('now')");
  });

  schemaBuilder.create("posts", (s) => {
    s.integer("id").primaryKey().autoIncrement();
    s.integer("user_id").notNull().references("users", "id");
    s.text("title").notNull();
    s.text("slug").unique();
    s.text("content");
    s.boolean("published").default(0);
    s.text("created_at").default("datetime('now')");
    s.index(["user_id"]);
    s.index(["published", "created_at"]);
  });

  const migrations = schemaBuilder.toMigrations();

  console.log("Migraciones generadas:\n");
  
  for (const mig of migrations) {
    console.log(`--- Versión ${mig.version} ---`);
    console.log(mig.sql);
    console.log();
  }

  const db = new Database(":memory:");
  
  for (const mig of migrations) {
    db.run(mig.sql);
  }

  console.log("Tablas creadas:", db.getTables());
  console.log("Versión del schema:", db.getSchemaVersion());
}

interface UserModel {
  id: number;
  email: string;
  name: string | null;
  password_hash: string;
  active: number;
  role: string;
  created_at: string;
}

interface PostModel {
  id: number;
  user_id: number;
  title: string;
  slug: string | null;
  content: string | null;
  published: number;
  created_at: string;
}

class ModelRepository<T extends { id: number }> {
  protected db: Database;
  protected tableName: string;

  constructor(db: Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  create(data: Partial<T>): number {
    const keys = Object.keys(data).filter(k => k !== "id");
    const values = keys.map(k => (data as any)[k]);
    const placeholders = keys.map(() => "?").join(", ");
    
    const result = this.db.run(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values
    );
    
    return Number(result.lastInsertRowid);
  }

  findById(id: number): T | null {
    return this.db.query(`SELECT * FROM ${this.tableName} WHERE id = ?`).get([id]) as T | null;
  }

  findAll(): T[] {
    return this.db.query(`SELECT * FROM ${this.tableName}`).all() as T[];
  }

  update(id: number, data: Partial<T>): boolean {
    const keys = Object.keys(data).filter(k => k !== "id");
    if (keys.length === 0) return false;
    
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    const values = keys.map(k => (data as any)[k]);
    
    const result = this.db.run(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`,
      [...values, id]
    );
    
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.db.run(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }
}

class UserRepository extends ModelRepository<UserModel> {
  constructor(db: Database) {
    super(db, "users");
  }

  findByEmail(email: string): UserModel | null {
    return this.db.query("SELECT * FROM users WHERE email = ?").get([email]) as UserModel | null;
  }

  createUser(email: string, passwordHash: string, name?: string): number {
    return this.create({
      email,
      password_hash: passwordHash,
      name: name || null,
      active: 1,
      role: "user"
    });
  }
}

class PostRepository extends ModelRepository<PostModel> {
  constructor(db: Database) {
    super(db, "posts");
  }

  findPublished(): PostModel[] {
    return this.db.query(
      "SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC"
    ).all() as PostModel[];
  }

  findBySlug(slug: string): PostModel | null {
    return this.db.query("SELECT * FROM posts WHERE slug = ?").get([slug]) as PostModel | null;
  }

  createPost(userId: number, title: string, content?: string): number {
    const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return this.create({
      user_id: userId,
      title,
      slug,
      content: content || null,
      published: 0
    });
  }

  publish(id: number): boolean {
    return this.update(id, { published: 1 });
  }
}

class SQLiteORM {
  public users: UserRepository;
  public posts: PostRepository;
  
  private db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.users = new UserRepository(this.db);
    this.posts = new PostRepository(this.db);
  }

  static init(dbPath: string, schemaBuilder: (s: SQLiteSchema) => void): SQLiteORM {
    const orm = new SQLiteORM(dbPath);
    const schema = new SQLiteSchema();
    schemaBuilder(schema);
    
    const migrations = schema.toMigrations();
    for (const mig of migrations) {
      orm.db.run(mig.sql);
    }
    
    return orm;
  }

  getDatabase(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

function ejemploORM() {
  console.log("\n=== ORM estilo Prisma ===\n");

  const orm = SQLiteORM.init(":memory:", (s) => {
    s.create("users", (t) => {
      t.integer("id").primaryKey().autoIncrement();
      t.text("email").notNull().unique();
      t.text("name");
      t.text("password_hash").notNull();
      t.boolean("active").default(1);
      t.text("role").default("user");
      t.text("created_at").default("datetime('now')");
    });

    s.create("posts", (t) => {
      t.integer("id").primaryKey().autoIncrement();
      t.integer("user_id").notNull().references("users", "id");
      t.text("title").notNull();
      t.text("slug").unique();
      t.text("content");
      t.boolean("published").default(0);
      t.text("created_at").default("datetime('now')");
    });
  });

  const user1Id = orm.users.createUser("alice@example.com", "hash123", "Alice");
  const user2Id = orm.users.createUser("bob@example.com", "hash456", "Bob");

  console.log(`Usuarios creados: ${user1Id}, ${user2Id}`);

  const alice = orm.users.findByEmail("alice@example.com");
  console.log("Usuario encontrado:", alice?.email);

  const postId = orm.posts.createPost(user1Id, "Mi primer post", "Contenido del post");
  console.log(`Post creado con ID: ${postId}`);

  orm.posts.publish(postId);
  console.log("Post publicado");

  const publishedPosts = orm.posts.findPublished();
  console.log("Posts publicados:", publishedPosts.length);

  const allUsers = orm.users.findAll();
  console.log("Todos los usuarios:", allUsers.map(u => u.email).join(", "));
}

ejemploSchemaDefinition();
ejemploORM();

console.log("\n✓ Ejemplo completado correctamente");
