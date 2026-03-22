/**
 * Database Setup Script
 * Creates all necessary tables for chat history and project management
 * 
 * Usage:
 *   npm run setup-db
 *   or
 *   npx tsx scripts/setup-database.ts
 */

import { createSql } from '../app/lib/.server/db/pg-pool';
import { readFileSync } from 'fs';
import { join } from 'path';

async function setupDatabase() {
  console.log('🗄️  Database Setup Script');
  console.log('========================\n');

  // Get database URL from environment
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable not set');
    console.error('   Please set DATABASE_URL in .dev.vars or .env');
    console.error('   Format: postgresql://user:password@host/database?sslmode=require');
    process.exit(1);
  }

  console.log('✅ Database URL found');
  console.log(`   Host: ${new URL(databaseUrl).host}`);
  console.log();

  const sql = createSql(databaseUrl);

  try {
    // Test connection
    console.log('🔌 Testing database connection...');
    await sql`SELECT NOW()`;
    console.log('✅ Database connection successful\n');

    // Read schema file
    console.log('📖 Reading schema file...');
    const schemaPath = join(process.cwd(), 'app/lib/.server/db/chat-history-schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    console.log('✅ Schema file loaded\n');

    // Execute schema
    console.log('🔧 Creating tables and functions...');
    console.log('   This may take a few seconds...\n');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      try {
        // Extract table/function name for logging
        const match = statement.match(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER|OR REPLACE FUNCTION)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
        const objName = match ? match[1] : `statement ${i + 1}`;

        process.stdout.write(`   Creating ${objName}... `);
        await sql.unsafe(statement);
        console.log('✅');
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          console.log('⏭️  (already exists)');
        } else {
          console.log('❌');
          throw error;
        }
      }
    }

    console.log('\n✅ Schema setup complete!');

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('chat_sessions', 'chat_messages', 'projects', 'anonymous_sessions')
      ORDER BY table_name
    `;

    console.log(`   Found ${tables.length} tables:`);
    tables.forEach((table: any) => {
      console.log(`   ✅ ${table.table_name}`);
    });

    if (tables.length < 4) {
      console.log('\n⚠️  WARNING: Not all tables were created');
      console.log('   Expected 4 tables, found', tables.length);
    }

    // Show table counts
    console.log('\n📊 Table Statistics:');
    const sessionCount = await sql`SELECT COUNT(*) as count FROM chat_sessions`;
    const messageCount = await sql`SELECT COUNT(*) as count FROM chat_messages`;
    const projectCount = await sql`SELECT COUNT(*) as count FROM projects`;
    
    console.log(`   Chat Sessions: ${sessionCount[0].count}`);
    console.log(`   Chat Messages: ${messageCount[0].count}`);
    console.log(`   Projects: ${projectCount[0].count}`);

    console.log('\n🎉 Database setup completed successfully!');
    console.log('   You can now use chat history persistence.');
    
  } catch (error: any) {
    console.error('\n❌ Database setup failed:');
    console.error('   Error:', error.message);
    console.error('\n   Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run setup
setupDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
