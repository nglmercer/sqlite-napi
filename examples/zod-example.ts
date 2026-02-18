/**
 * Zod Schema Generator Example
 * 
 * Demonstrates how to convert Schema definitions to Zod schemas
 * for runtime validation
 */

import { Schema, StandardFields, createZodFromSchema, createZodInputSchema, createZodWhereSchema } from './core/index.js';

// ============================================
// Example 1: Basic Schema to Zod
// ============================================

console.log('=== Example 1: Basic Schema to Zod ===\n');

const userSchema = new Schema("users")
  .apply(StandardFields.UUID)
  .text("name").notNull()
  .text("email").unique()
  .integer("age")
  .boolean("is_active").default(true)
  .apply(StandardFields.Timestamps);

console.log('SQL Schema:');
console.log(userSchema.toSQL());
console.log('\n');

// Get Zod schema
const userZodSchema = createZodFromSchema(userSchema);
console.log('Zod Schema created successfully!');

// Test validation
const validUser = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  name: "John Doe",
  email: "john@example.com",
  age: 25,
  is_active: true,
  created_at: 1700000000,
  updated_at: 1700000000,
};

const result = userZodSchema.safeParse(validUser);
console.log('Validation result:', result.success ? '✓ Valid' : '✗ Invalid');

if (!result.success) {
  console.log('Errors:', result.error.issues);
}

// ============================================
// Example 2: Input Schema (for CREATE/UPDATE)
// ============================================

console.log('\n=== Example 2: Input Schema ===\n');

const inputSchema = createZodInputSchema(userSchema);

const createInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  // age is optional
};

const inputResult = inputSchema.safeParse(createInput);
console.log('Input validation:', inputResult.success ? '✓ Valid' : '✗ Invalid');

if (!inputResult.success) {
  console.log('Errors:', inputResult.error.issues);
}

// ============================================
// Example 3: Where Schema (for queries)
// ============================================

console.log('\n=== Example 3: Where Schema ===\n');

const whereSchema = createZodWhereSchema(userSchema);

const whereQuery = {
  email: "john@example.com",
  is_active: true,
};

const whereResult = whereSchema.safeParse(whereQuery);
console.log('Where validation:', whereResult.success ? '✓ Valid' : '✗ Invalid');

// ============================================
// Example 4: Prisma-like model definition
// ============================================

console.log('\n=== Example 4: Prisma-like Model ===\n');

const oauthSchema = new Schema("oauth_tokens")
  .model({
    id: StandardFields.UUID,
    token: { type: String, required: true, unique: true },
    client_id: { type: String, required: true },
    user_id: { type: String, required: true },
    scope: { type: String, default: "" },
    expires_at: { type: Date, required: true },
    is_revoked: { type: Boolean, default: false },
    rotation_count: { type: Number, default: 0 },
    created_at: StandardFields.CreatedAt,
  });

console.log('OAuth Schema SQL:');
console.log(oauthSchema.toSQL());

const oauthZodSchema = createZodFromSchema(oauthSchema);
console.log('\nOAuth Zod Schema created!');

// Test OAuth token
const validToken = {
  id: "b1ffcc11-9c0b-4ef8-bb6d-6bb9bd380a22",
  token: "tok_1234567890abcdef",
  client_id: "client_abc123",
  user_id: "user_xyz789",
  scope: "read write",
  expires_at: Date.now() + 3600000,
  is_revoked: false,
  rotation_count: 0,
  created_at: 1700000000,
};

const tokenResult = oauthZodSchema.safeParse(validToken);
console.log('Token validation:', tokenResult.success ? '✓ Valid' : '✗ Invalid');

console.log('\n=== All examples completed! ===');
