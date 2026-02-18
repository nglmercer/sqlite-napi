/**
 * SQLite NAPI - Schema Builder Core
 * 
 * Un ORM ligero estilo Prisma para SQLite
 * 
 * @example
 *   import { Schema, SQLiteSchema, StandardFields } from "./core";
 *   
 *   // Esquema simple
 *   const userSchema = new Schema("users")
 *     .apply(StandardFields.UUID)
 *     .text("name").notNull()
 *     .text("email").unique()
 *     .apply(StandardFields.Timestamps)
 *     .apply(StandardFields.Active);
 * 
 *   console.log(userSchema.toSQL());
 * 
 * @example
 *   // Múltiples tablas con migraciones
 *   const db = new SQLiteSchema()
 *     .create("users", (s) => {
 *       s.apply(StandardFields.UUID);
 *       s.text("name").notNull();
 *       s.text("email").unique();
 *       s.apply(StandardFields.Timestamps);
 *     })
 *     .create("posts", (s) => {
 *       s.apply(StandardFields.UUID);
 *       s.text("title").notNull();
 *       s.text("user_id").references("users", "id");
 *       s.apply(StandardFields.Timestamps);
 *     });
 * 
 *   const migrations = db.toMigrations();
 */

// Re-export all modules
export { Schema } from "./schema.js";
export type { 
  ColumnDefinition, 
  SchemaDefinition, 
  IndexDefinition,
  SerializedSchema 
} from "./schema.js";

export { SQLiteSchema } from "./database.js";
export type { Migration } from "./database.js";

export {
  StandardFields,
  UUID,
  Timestamps,
  CreatedAt,
  Active,
  DeletedAt,
  getSqliteType,
} from "./constants.js";
export type { 
  StandardField,
  FieldType,
  ModelFieldConfig,
  ModelDefinition,
  ModelField,
  SchemaOptions,
} from "./constants.js";