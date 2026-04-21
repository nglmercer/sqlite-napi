# Skill: sqlite-napi ORM Development

This skill defines the standards and patterns for developing with the `sqlite-napi` ORM adapter. Use these guidelines when creating schemas, services, and database interactions.

## 1. Import Resolution Standards

When implementing code using the ORM, follow these import rules:

- **Library Core**: Always import `Database` from `sqlite-napi`.
- **ORM Adapter**: Import all ORM primitives (`sqliteTable`, columns, `sqliteNapi`) from the standardized path alias.
- **Type Inference**: Use `InferRow` for automatic type generation from table definitions.

### Example Imports
```typescript
import { Database } from "sqlite-napi";
import {
    sqliteNapi,
    sqliteTable,
    integer,
    text,
    boolean,
    real,
    index,
    uniqueIndex,
    type InferRow,
} from "sqlite-napi/orm";
```

---

## 2. Schema Definition Pattern

Tables should be defined using the fluent API with clear constraints and indexes.

- **Naming**: Use snake_case for column names in the database, camelCase for property names if preferred (handled by the builder).
- **Constraints**: Chain `.notNull()`, `.unique()`, `.default()`, and `.references()`.
- **Indexes**: Define indexes in the callback (second argument of `sqliteTable`).

### Example
```typescript
const users = sqliteTable("users", {
    id: integer("id").primaryKey().autoincrement(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("user"),
    createdAt: text("created_at").notNull().default("(CURRENT_TIMESTAMP)"),
}, (table) => ({
    emailIdx: uniqueIndex("email_idx", [table.email.name]),
}));

export type User = InferRow<typeof users>;
```

---

## 3. The Service Pattern

Encapsulate database logic within a Service class. This pattern promotes clean separation of concerns and reuse of the adapter.

- **Initialization**: Instantiate `sqliteNapi(db)` in the constructor.
- **Sync**: Call `this.adapter.sync([...])` to ensure tables exist and columns are up to date.
- **Transactions**: Wrap multi-step operations in `this.adapter.transaction()`.

### Example Service Structure
```typescript
class EntityService {
    private adapter: ReturnType<typeof sqliteNapi>;

    constructor(db: Database) {
        this.adapter = sqliteNapi(db);
        // Sync tables immediately
        this.adapter.sync([users, posts]);
    }

    get orm() {
        return this.adapter;
    }

    async createWithRelation(data: UserData) {
        return this.adapter.transaction((tx) => {
            const result = tx.insert(users).values(data).run();
            const id = Number(result.lastInsertRowid);
            // ... secondary operations ...
            return id;
        });
    }
}
```

---

## 4. Advanced Query Patterns

### Relational Joins
```typescript
this.adapter.select(users)
    .select("name", "email")
    .join("posts", "users.id = posts.user_id")
    .where("users.active = ?", [1])
    .all();
```

### Metrics and Raw SQL
For operations like increments or complex aggregations, use `execute` or `query`.
```typescript
incrementViews(id: number) {
    this.adapter.execute(`UPDATE media SET views = views + 1 WHERE id = ?`, [id]);
}

getAverageRating(mediaId: number): number {
    const sql = `SELECT AVG(rating) as avg_rating FROM seasons WHERE media_id = ?`;
    const res = this.adapter.query<{ avg_rating: number }>(sql).get([mediaId]);
    return res?.avg_rating || 0;
}
```

---

## 5. Best Practices
1. **Always Sync**: Ensure `adapter.sync()` is called at least once during application startup.
2. **Type Safety**: Always export `InferRow<typeof table>` types to ensure the rest of the application remains type-safe.
3. **Rollback Safety**: Use the `transaction` method for any logic that involves multiple write operations.
4. **Fluent Builders**: Prefer `adapter.select()`, `adapter.insert()`, etc., over raw SQL when possible for better type safety and readability.
