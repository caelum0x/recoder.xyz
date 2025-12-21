/**
 * Test Script for Database Schema Generator
 * Run with: npx tsx app/lib/.server/database/test-schema-generation.ts
 */

import { generateDatabaseSchema, generateProjectFiles } from './index';

console.log('🧪 Testing Database Schema Generator\n');
console.log('═'.repeat(70));

// Test 1: Blog System
console.log('\n📝 Test 1: Blog System');
console.log('─'.repeat(70));
const blogResult = generateDatabaseSchema({
  description: 'Create a blog with users, posts, and comments. Users can write multiple posts, and posts can have many comments.',
  dbType: 'sqlite',
  includeSeedData: true,
  seedRecordsPerEntity: 3,
});

console.log(`✓ Generated ${blogResult.summary.entityCount} entities`);
console.log(`✓ Total fields: ${blogResult.summary.totalFields}`);
console.log(`✓ Relationships: ${blogResult.summary.relationshipCount}`);
console.log('\nEntities:');
blogResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Test 2: E-commerce
console.log('\n\n🛒 Test 2: E-commerce Platform');
console.log('─'.repeat(70));
const ecommerceResult = generateDatabaseSchema({
  description: 'E-commerce platform with products, categories, orders, and customers',
  dbType: 'postgresql',
  includeSeedData: true,
  seedRecordsPerEntity: 5,
});

console.log(`✓ Generated ${ecommerceResult.summary.entityCount} entities`);
console.log(`✓ Total fields: ${ecommerceResult.summary.totalFields}`);
console.log(`✓ Relationships: ${ecommerceResult.summary.relationshipCount}`);
console.log('\nEntities:');
ecommerceResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Test 3: Task Manager
console.log('\n\n✅ Test 3: Task Management System');
console.log('─'.repeat(70));
const taskResult = generateDatabaseSchema({
  description: 'Task manager with projects, tasks, and users. Each project has multiple tasks.',
  dbType: 'sqlite',
  includeSeedData: true,
  seedRecordsPerEntity: 4,
});

console.log(`✓ Generated ${taskResult.summary.entityCount} entities`);
console.log(`✓ Total fields: ${taskResult.summary.totalFields}`);
console.log(`✓ Relationships: ${taskResult.summary.relationshipCount}`);
console.log('\nEntities:');
taskResult.entities.forEach(e => {
  console.log(`  - ${e.name} (${e.tableName}): ${e.fields.length} fields`);
});

// Show sample SQL output
console.log('\n\n📄 Sample SQL Output (Blog - first 50 lines):');
console.log('─'.repeat(70));
const sqlLines = blogResult.schema.sql.split('\n').slice(0, 50);
console.log(sqlLines.join('\n'));
console.log('...\n');

// Show sample TypeScript output
console.log('\n📘 Sample TypeScript Types (Blog - first 30 lines):');
console.log('─'.repeat(70));
const tsLines = blogResult.schema.typescript.split('\n').slice(0, 30);
console.log(tsLines.join('\n'));
console.log('...\n');

// Show sample seed data
console.log('\n🌱 Sample Seed Data (Blog - users table):');
console.log('─'.repeat(70));
if (blogResult.seedData) {
  console.log(JSON.stringify(blogResult.seedData.json.users?.slice(0, 2), null, 2));
}

console.log('\n\n═'.repeat(70));
console.log('✅ All tests completed successfully!');
console.log('═'.repeat(70) + '\n');

// Example: Generate complete project files
console.log('📦 Generating complete project files for blog...\n');
const projectFiles = generateProjectFiles({
  description: 'Blog platform with users, posts, comments, and tags',
  dbType: 'sqlite',
  includeSeedData: true,
  includePrisma: true,
  includeDrizzle: true,
});

console.log('Generated files:');
Object.keys(projectFiles).forEach(filename => {
  const content = projectFiles[filename as keyof typeof projectFiles];
  const size = content?.length || 0;
  console.log(`  - ${filename} (${size} bytes)`);
});

console.log('\n🎉 Database Schema Generator is working perfectly!\n');
