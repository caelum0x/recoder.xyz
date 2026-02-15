/**
 * Schema Generation Examples
 * Demonstrates schema generation capabilities with real-world examples
 */

import { generateDatabaseSchema, generateProjectFiles } from './index';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SchemaExamples');

/**
 * Example schema generations for testing and demonstration
 */
export const schemaExamples = {
  blog: {
    description: 'Create a blog with users, posts, and comments',
    expected: ['users', 'posts', 'comments'],
  },
  ecommerce: {
    description: 'Build an e-commerce platform with products, orders, and customers',
    expected: ['products', 'orders', 'customers', 'categories'],
  },
  taskManager: {
    description: 'Task manager with projects, tasks, and team members',
    expected: ['projects', 'tasks', 'users'],
  },
  socialMedia: {
    description: 'Social network with users, posts, likes, and follows',
    expected: ['users', 'posts', 'likes', 'follows'],
  },
};

/**
 * Test schema generation with example
 */
export function testSchemaGeneration(exampleName: keyof typeof schemaExamples) {
  const example = schemaExamples[exampleName];

  logger.info(`\n🧪 Testing Schema Generation: ${exampleName}`);
  logger.info(`📝 Description: ${example.description}\n`);

  const result = generateDatabaseSchema({
    description: example.description,
    dbType: 'sqlite',
    includeSeedData: true,
    seedRecordsPerEntity: 3,
  });

  logger.info(`✅ Generated ${result.summary.entityCount} entities:`);
  for (const entity of result.entities) {
    logger.info(`   - ${entity.name} (${entity.fields.length} fields, ${entity.relationships.length} relationships)`);
  }

  logger.info(`\n📊 Summary:`);
  logger.info(`   Total Fields: ${result.summary.totalFields}`);
  logger.info(`   Relationships: ${result.summary.relationshipCount}`);
  logger.info(`   Indexes: ${result.summary.indexCount}`);

  return result;
}

/**
 * Generate schema from user prompt
 */
export function generateSchemaFromPrompt(prompt: string, dbType: 'postgresql' | 'mysql' | 'sqlite' = 'sqlite') {
  return generateDatabaseSchema({
    description: prompt,
    dbType,
    includeSeedData: true,
    seedRecordsPerEntity: 5,
    includeTypes: true,
    includePrisma: true,
    includeDrizzle: true,
  });
}

/**
 * Quick schema generation helper
 */
export function quickSchema(description: string) {
  const result = generateSchemaFromPrompt(description);

  return {
    sql: result.schema.sql,
    types: result.schema.typescript,
    entities: result.entities.map(e => ({
      name: e.name,
      table: e.tableName,
      fields: e.fields.map(f => `${f.name}: ${f.type}`),
    })),
  };
}
