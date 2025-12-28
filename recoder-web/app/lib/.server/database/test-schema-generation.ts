/**
 * Test Script for Database Schema Generator
 * Run with: npx tsx app/lib/.server/database/test-schema-generation.ts
 */

import { generateDatabaseSchema, generateProjectFiles } from './index';


// Test 1: Blog System
const blogResult = generateDatabaseSchema({
  description: 'Create a blog with users, posts, and comments. Users can write multiple posts, and posts can have many comments.',
  dbType: 'sqlite',
  includeSeedData: true,
  seedRecordsPerEntity: 3,
});

blogResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Test 2: E-commerce
const ecommerceResult = generateDatabaseSchema({
  description: 'E-commerce platform with products, categories, orders, and customers',
  dbType: 'postgresql',
  includeSeedData: true,
  seedRecordsPerEntity: 5,
});

ecommerceResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Test 3: Task Manager
const taskResult = generateDatabaseSchema({
  description: 'Task manager with projects, tasks, and users. Each project has multiple tasks.',
  dbType: 'sqlite',
  includeSeedData: true,
  seedRecordsPerEntity: 4,
});

taskResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Show sample SQL output
const sqlLines = blogResult.schema.sql.split('\n').slice(0, 50);

// Show sample TypeScript output
const tsLines = blogResult.schema.typescript.split('\n').slice(0, 30);

// Show sample seed data
if (blogResult.seedData) {
  console.log(JSON.stringify(blogResult.seedData.json.users?.slice(0, 2), null, 2));
}


// Example: Generate complete project files
const projectFiles = generateProjectFiles({
  description: 'Blog platform with users, posts, comments, and tags',
  dbType: 'sqlite',
  includeSeedData: true,
  includePrisma: true,
  includeDrizzle: true,
});

Object.keys(projectFiles).forEach(filename => {
  const content = projectFiles[filename as keyof typeof projectFiles];
  const size = content?.length || 0;
  console.log(`  - ${filename} (${size} bytes)`);
});

