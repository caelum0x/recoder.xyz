#!/usr/bin/env tsx
/**
 * Initialize Subscription Database
 * Creates tables for subscriptions, payments, usage tracking
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set in environment');
    console.log('\nAdd this to your .dev.vars:');
    console.log('DATABASE_URL=postgresql://user:pass@host/db');
    process.exit(1);
  }

  console.log('🚀 Initializing subscription database...\n');

  try {
    const sql = neon(databaseUrl);

    // Read and execute schema
    const schemaPath = join(process.cwd(), 'app/lib/.server/db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('📝 Executing schema.sql...');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        await sql(statement);
      }
    }

    console.log('✅ Database schema created successfully\n');

    // Verify tables exist
    console.log('🔍 Verifying tables...');

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log('\n✅ Tables created:');
    tables.forEach((table: any) => {
      console.log(`   ${table.table_name}`);
    });

    console.log('\n🎉 Database initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Set up Paddle account at https://paddle.com');
    console.log('2. Set up DodoPay account');
    console.log('3. Update product IDs in app/routes/api.subscribe.ts');
    console.log('4. Configure webhook URLs in payment provider dashboards');
    console.log('5. Test with: npm run test:subscriptions\n');

  } catch (error: any) {
    console.error('❌ Database initialization failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  }
}

initDatabase();
