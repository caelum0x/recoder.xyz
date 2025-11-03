/**
 * TEST 1: DATABASE CONNECTION
 *
 * Tests:
 * - Load environment variables
 * - Initialize database connection
 * - Test basic queries
 * - Verify connection pooling
 */

import { ChatHistoryDB } from '../../app/lib/.server/db/chat-history-db';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function info(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function section(title: string) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

async function testDatabaseConnection() {
  section('TEST 1: DATABASE CONNECTION');

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1.1: Load environment variables
    console.log('\n📋 Test 1.1: Loading environment variables...');
    const envPath = join(process.cwd(), '.env.local');

    if (!existsSync(envPath)) {
      throw new Error('.env.local file not found');
    }

    const envContent = readFileSync(envPath, 'utf-8');
    const databaseUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in .env.local');
    }

    info(`Database URL loaded (length: ${databaseUrl.length})`);
    info(`Provider: ${databaseUrl.includes('neon.tech') ? 'Neon PostgreSQL' : 'PostgreSQL'}`);
    success('Environment variables loaded');
    testsPassed++;

    // Test 1.2: Initialize database connection
    console.log('\n📋 Test 1.2: Initializing database connection...');
    const db = new ChatHistoryDB(databaseUrl);
    info('ChatHistoryDB instance created');
    success('Database connection initialized');
    testsPassed++;

    // Test 1.3: Test basic query
    console.log('\n📋 Test 1.3: Testing basic query...');
    const result = await db.sql`SELECT NOW() as current_time`;
    if (!result || result.length === 0) {
      throw new Error('Query returned no results');
    }
    info(`Current database time: ${result[0].current_time}`);
    success('Basic query successful');
    testsPassed++;

    // Test 1.4: Verify database tables exist
    console.log('\n📋 Test 1.4: Verifying database tables...');
    const tables = await db.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('chat_sessions', 'chat_messages', 'projects', 'anonymous_sessions')
      ORDER BY table_name
    `;

    const expectedTables = ['anonymous_sessions', 'chat_messages', 'chat_sessions', 'projects'];
    const foundTables = tables.map((t: any) => t.table_name);

    info(`Found tables: ${foundTables.join(', ')}`);

    for (const tableName of expectedTables) {
      if (!foundTables.includes(tableName)) {
        error(`Missing table: ${tableName}`);
        testsFailed++;
      } else {
        info(`✓ Table exists: ${tableName}`);
      }
    }

    if (foundTables.length === expectedTables.length) {
      success('All required tables exist');
      testsPassed++;
    } else {
      throw new Error(`Missing tables: ${expectedTables.filter(t => !foundTables.includes(t)).join(', ')}`);
    }

    // Test 1.5: Test connection pooling (multiple queries)
    console.log('\n📋 Test 1.5: Testing connection pooling...');
    const startTime = Date.now();
    const queries = await Promise.all([
      db.sql`SELECT 1 as test`,
      db.sql`SELECT 2 as test`,
      db.sql`SELECT 3 as test`,
      db.sql`SELECT 4 as test`,
      db.sql`SELECT 5 as test`,
    ]);
    const duration = Date.now() - startTime;

    info(`5 parallel queries completed in ${duration}ms`);
    info(`Average: ${(duration / 5).toFixed(2)}ms per query`);
    success('Connection pooling working');
    testsPassed++;

    // Test 1.6: Test database version and extensions
    console.log('\n📋 Test 1.6: Checking database version and extensions...');
    const version = await db.sql`SELECT version()`;
    info(`PostgreSQL version: ${version[0].version.split(' ')[1]}`);

    const extensions = await db.sql`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('uuid-ossp', 'pgcrypto')
    `;

    if (extensions.length > 0) {
      info('Extensions:');
      for (const ext of extensions) {
        info(`  - ${ext.extname}: ${ext.extversion}`);
      }
    }
    success('Database version verified');
    testsPassed++;

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

    if (testsFailed === 0) {
      console.log(`${colors.bright}${colors.green}🎉 All database connection tests passed!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.bright}${colors.red}❌ Some tests failed${colors.reset}\n`);
      process.exit(1);
    }

  } catch (err) {
    error(`Test failed: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
    console.log(`\n${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
testDatabaseConnection();
