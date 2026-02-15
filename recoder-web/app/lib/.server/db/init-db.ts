/**
 * Database initialization script
 * Run this to set up all required tables
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('InitDB');

export async function initializeDatabase(db: any) {
  logger.info('🗄️ Initializing database schema...');

  const schemaFiles = [
    'schema.sql',
    'chat-history-schema.sql',
    'templates-schema.sql',
    'projects-schema.sql',
    'mcp-schema.sql',
  ];

  for (const file of schemaFiles) {
    try {
      const schemaPath = join(__dirname, file);
      const schema = readFileSync(schemaPath, 'utf-8');
      
      logger.info(`📄 Running ${file}...`);
      await db.exec(schema);
      logger.info(`✅ ${file} completed`);
    } catch (error) {
      logger.error(`❌ Failed to run ${file}:`, error);
      // Continue with other files
    }
  }

  logger.info('✅ Database initialization complete');
}
