/**
 * Database initialization script
 * Run this to set up all required tables
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export async function initializeDatabase(db: any) {
  console.log('🗄️ Initializing database schema...');

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
      
      console.log(`📄 Running ${file}...`);
      await db.exec(schema);
      console.log(`✅ ${file} completed`);
    } catch (error) {
      console.error(`❌ Failed to run ${file}:`, error);
      // Continue with other files
    }
  }

  console.log('✅ Database initialization complete');
}
