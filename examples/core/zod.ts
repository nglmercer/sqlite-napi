/**
 * Zod Schema Generator
 * 
 * Utility to generate Zod schemas from Schema definitions or JSON
 * 
 * @example
 * // From Schema instance
 *   import { Schema, StandardFields, createZodFromSchema } from "./core";
 *   
 *   const userSchema = new Schema("users")
 *     .apply(StandardFields.UUID)
 *     .text("name").notNull()
 *     .text("email").unique()
 *     .integer("age")
 *     .apply(StandardFields.Timestamps);
 * 
 *   const zodSchema = createZodFromSchema(userSchema);
 *   type User = z.infer<typeof zodSchema>;
 * 
 * @example
 * // From JSON
 *   import { createZodFromJSON } from "./core";
 *   
 *   const json = schema.toJSON();
 *   const zodSchema = createZodFromJSON(json);
 */

import { z } from 'zod';
import type { SerializedSchema, ColumnDefinition } from './schema.js';

/**
 * Options for Zod schema generation
 */
export interface ZodSchemaOptions {
  /** Include default values in the schema */
  includeDefaults?: boolean;
  /** Make all fields optional (useful for partial updates) */
  partial?: boolean;
  /** Strip default values and make optional (useful for inputs) */
  strip?: boolean;
  /** Add descriptions from column names */
  descriptions?: boolean;
}

/**
 * Create a Zod schema from a SerializedSchema (JSON)
 * 
 * @param json - The serialized schema from Schema.toJSON()
 * @param options - Configuration options
 * @returns Zod schema
 * 
 * @example
 *   const schema = new Schema("users").text("name").notNull().integer("age");
 *   const zodSchema = createZodFromJSON(schema.toJSON());
 *   type User = z.infer<typeof zodSchema>;
 */
export function createZodFromJSON(json: SerializedSchema, options: ZodSchemaOptions = {}): z.ZodObject<z.ZodRawShape> {
  const { includeDefaults = true, partial = false, strip = false } = options;
  
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const col of json.columns) {
    let validator = mapColumnToZod(col);
    
    // Handle optionality
    const isOptional = !col.notNull && !col.primaryKey;
    
    if (partial || isOptional) {
      validator = validator.optional();
    }
    
    // Handle defaults
    if (includeDefaults && col.defaultValue !== undefined) {
      // Skip SQL expressions like (CURRENT_TIMESTAMP)
      if (!isSqlExpression(col.defaultValue)) {
        validator = validator.default(col.defaultValue as any);
      }
    }
    
    // Handle strip mode (remove defaults, make optional)
    if (strip) {
      validator = validator.optional();
    }
    
    shape[col.name] = validator;
  }

  return z.object(shape);
}

/**
 * Create a Zod schema directly from a Schema instance
 * 
 * @param schema - The Schema instance
 * @param options - Configuration options
 * @returns Zod schema
 * 
 * @example
 *   const userSchema = new Schema("users")
 *     .apply(StandardFields.UUID)
 *     .text("name").notNull()
 *     .text("email").unique();
 * 
 *   const zodSchema = createZodFromSchema(userSchema);
 *   const validUser = zodSchema.parse({ id: "...", name: "John" });
 */
export function createZodFromSchema(schema: { toJSON(): SerializedSchema }, options?: ZodSchemaOptions): z.ZodObject<z.ZodRawShape> {
  return createZodFromJSON(schema.toJSON(), options);
}

/**
 * Create a Zod schema for a table from the database
 * 
 * @param tableName - Name of the table
 * @param columns - Column definitions
 * @param options - Configuration options
 * @returns Zod schema
 * 
 * @example
 *   const zodSchema = createZodFromColumns("users", [
 *     { name: "id", type: "TEXT", primaryKey: true },
 *     { name: "name", type: "TEXT", notNull: true },
 *     { name: "email", type: "TEXT", unique: true },
 *   ]);
 */
export function createZodFromColumns(columns: ColumnDefinition[], options: ZodSchemaOptions = {}): z.ZodObject<z.ZodRawShape> {
  const { includeDefaults = true, partial = false, strip = false } = options;
  
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const col of columns) {
    let validator = mapColumnToZod(col);
    
    const isOptional = !col.notNull && !col.primaryKey;
    
    if (partial || isOptional) {
      validator = validator.optional();
    }
    
    if (includeDefaults && col.defaultValue !== undefined) {
      if (!isSqlExpression(col.defaultValue)) {
        validator = validator.default(col.defaultValue as any);
      }
    }
    
    if (strip) {
      validator = validator.optional();
    }
    
    shape[col.name] = validator;
  }

  return z.object(shape);
}

/**
 * Map a column definition to a Zod type
 */
function mapColumnToZod(col: ColumnDefinition): z.ZodTypeAny {
  let validator: z.ZodTypeAny;

  // Map SQLite types to Zod
  switch (col.type.toUpperCase()) {
    case 'TEXT':
    case 'VARCHAR':
    case 'CHAR':
      validator = z.string();
      break;
    case 'UUID':
      validator = z.string().uuid();
      break;
    case 'INTEGER':
      // Check if it's a boolean (stored as INTEGER 0/1)
      if (col.name.startsWith('is_') || col.name === 'active' || col.name === 'deleted') {
        validator = z.boolean();
      } else {
        validator = z.number().int();
      }
      break;
    case 'REAL':
    case 'NUMERIC':
    case 'FLOAT':
    case 'DOUBLE':
      validator = z.number();
      break;
    case 'BOOLEAN':
      validator = z.boolean();
      break;
    case 'BLOB':
      // Blob can be Buffer, Uint8Array, or base64 string
      validator = z.instanceof(Buffer).or(z.instanceof(Uint8Array)).or(z.string());
      break;
    case 'DATETIME':
    case 'DATE':
      // SQLite stores dates as INTEGER (Unix timestamp)
      validator = z.number().int();
      break;
    default:
      validator = z.any();
  }

  // Add primary key refinement
  if (col.primaryKey) {
    // Primary keys can't be null/undefined
    validator = validator;
  }

  return validator;
}

/**
 * Check if a value is an SQL expression that should not be used as a default in Zod
 * Examples: datetime('now'), CURRENT_TIMESTAMP, (strftime('%s', 'now')), etc.
 */
function isSqlExpression(value: any): boolean {
  if (typeof value !== 'string') return false;
  // Starts with parenthesis (expression)
  if (value.startsWith('(')) return true;
  // SQL function calls like datetime('now'), strftime('%s', 'now')
  if (/^[a-z_]+\s*\(/i.test(value)) return true;
  // SQL keywords like CURRENT_TIMESTAMP, CURRENT_DATE, CURRENT_TIME, NULL
  if (/^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|NULL)$/i.test(value)) return true;
  return false;
}

/**
 * Create an "input" schema (all optional, no defaults)
 * Useful for CREATE/UPDATE operations
 * 
 * @param schema - The Schema or SerializedSchema
 * @returns Zod schema for input
 * 
 * @example
 *   const inputSchema = createZodInputSchema(userSchema);
 *   const createInput = inputSchema.parse({ name: "John" }); // email, age optional
 */
export function createZodInputSchema(schema: { toJSON(): SerializedSchema } | SerializedSchema): z.ZodObject<z.ZodRawShape> {
  const json = 'toJSON' in schema ? schema.toJSON() : schema;
  return createZodFromJSON(json, { partial: true, strip: true });
}

/**
 * Create a "where" schema (all fields optional, suitable for WHERE clauses)
 * 
 * @param schema - The Schema or SerializedSchema
 * @returns Zod schema for where clauses
 * 
 * @example
 *   const whereSchema = createZodWhereSchema(userSchema);
 *   const query = whereSchema.parse({ email: "user@example.com" });
 */
export function createZodWhereSchema(schema: { toJSON(): SerializedSchema } | SerializedSchema): z.ZodObject<z.ZodRawShape> {
  const json = 'toJSON' in schema ? schema.toJSON() : schema;
  return createZodFromJSON(json, { partial: true, includeDefaults: false });
}

/**
 * Create a "unique" schema (only primary key and unique fields)
 * 
 * @param schema - The Schema or SerializedSchema
 * @returns Zod schema for unique lookups
 * 
 * @example
 *   const uniqueSchema = createZodUniqueSchema(userSchema);
 *   const query = uniqueSchema.parse({ id: "uuid-here" });
 */
export function createZodUniqueSchema(schema: { toJSON(): SerializedSchema } | SerializedSchema): z.ZodObject<z.ZodRawShape> {
  const json = 'toJSON' in schema ? schema.toJSON() : schema;
  
  const uniqueColumns = json.columns.filter(col => col.primaryKey || col.unique);
  
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const col of uniqueColumns) {
    shape[col.name] = mapColumnToZod(col);
  }
  
  return z.object(shape);
}

/**
 * Extension for Schema class to add toZod method
 */
declare module './schema.js' {
  interface Schema {
    /**
     * Convert this schema to a Zod schema
     * 
     * @example
     *   const userSchema = new Schema("users")
     *     .apply(StandardFields.UUID)
     *     .text("name").notNull()
     *     .integer("age");
     * 
     *   const zodSchema = userSchema.toZod();
     *   type User = z.infer<typeof zodSchema>;
     */
    toZod(options?: ZodSchemaOptions): z.ZodObject<z.ZodRawShape>;
  }
}

// Apply the extension
import { Schema } from './schema.js';

Schema.prototype.toZod = function(options?: ZodSchemaOptions) {
  return createZodFromSchema(this, options);
};

export { Schema };
