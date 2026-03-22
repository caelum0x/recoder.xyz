/**
 * Database Setup Script
 * Runs the chat history schema on Neon database
 */

import { createSql } from './app/lib/.server/db/pg-pool.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  // Get database URL from environment
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    console.log('💡 Add DATABASE_URL to your .env file');
    process.exit(1);
  }

  console.log('🔗 Connecting to Neon database...');
  const sql = createSql(DATABASE_URL);

  // Read schema file
  const schemaPath = join(__dirname, 'app/lib/.server/db/chat-history-schema.sql');
  console.log(`📖 Reading schema from: ${schemaPath}`);

  const schema = readFileSync(schemaPath, 'utf-8');

  try {
    console.log('🚀 Running database schema...');

    // Split schema into individual statements and execute each
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await sql`${sql.raw(statement)}`;
        } catch (err) {
          // Ignore "already exists" errors
          if (!err.message.includes('already exists')) {
            throw err;
          }
        }
      }
    }

    console.log('✅ Database setup complete!');
    console.log('');
    console.log('Created tables:');
    console.log('  ✓ chat_sessions');
    console.log('  ✓ chat_messages');
    console.log('  ✓ projects');
    console.log('  ✓ anonymous_sessions');
    console.log('');
    console.log('📊 You can now start the development server:');
    console.log('   npm run dev');

  } catch (error) {
    console.error('❌ Failed to setup database:', error.message);
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  }
}

setupDatabase().catch(console.error);
