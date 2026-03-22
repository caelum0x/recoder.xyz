/**
 * Database Verification Script
 * Verifies the database connection and schema
 */

import { createSql } from '../app/lib/.server/db/pg-pool';

const DATABASE_URL = 'postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>/<DB_NAME>?sslmode=require&channel_binding=require';

async function verifyDatabase() {
  console.log('🔍 Verifying Recoder Web Database...\n');

  const sql = createSql(DATABASE_URL);

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await sql`SELECT NOW()`;
    console.log('✅ Connection successful!\n');

    // Check tables
    console.log('📊 Checking tables...');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log(`Found ${tables.length} tables:`);
    tables.forEach((table: any) => {
      console.log(`  ✓ ${table.table_name}`);
    });
    console.log('');

    // Expected tables
    const expectedTables = [
      'users',
      'subscriptions',
      'usage_logs',
      'payment_transactions',
      'webhook_events',
      'chat_sessions',
      'chat_messages'
    ];

    const missingTables = expectedTables.filter(
      expected => !tables.some((t: any) => t.table_name === expected)
    );

    if (missingTables.length > 0) {
      console.log('⚠️  Missing tables:');
      missingTables.forEach(table => console.log(`  ✗ ${table}`));
      console.log('\nRun: npm run setup:db\n');
      process.exit(1);
    }

    // Check table structures
    console.log('🔧 Verifying table structures...\n');

    // Check subscriptions table
    const subscriptionCols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'subscriptions'
      ORDER BY ordinal_position
    `;

    console.log('Subscriptions table columns:');
    subscriptionCols.forEach((col: any) => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    console.log('');

    // Test creating a sample user and subscription
    console.log('🧪 Testing database operations...\n');

    // Clean up test data first
    await sql`DELETE FROM subscriptions WHERE user_id = 'test-user-123'`;
    await sql`DELETE FROM users WHERE id = 'test-user-123'`;

    // Create test user
    console.log('Creating test user...');
    await sql`
      INSERT INTO users (id, email, name)
      VALUES ('test-user-123', 'test@example.com', 'Test User')
    `;
    console.log('✅ Test user created\n');

    // Create test subscription
    console.log('Creating test subscription...');
    const result = await sql`
      INSERT INTO subscriptions (
        user_id,
        provider,
        subscription_id,
        customer_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        generations_limit
      ) VALUES (
        'test-user-123',
        'paddle',
        'sub_test_123',
        'cus_test_123',
        'pro',
        'active',
        NOW(),
        NOW() + INTERVAL '30 days',
        100
      )
      RETURNING *
    `;
    console.log('✅ Test subscription created\n');

    // Query the subscription
    console.log('Querying test subscription...');
    const subscription = await sql`
      SELECT * FROM subscriptions
      WHERE user_id = 'test-user-123'
    `;

    if (subscription.length > 0) {
      console.log('✅ Subscription query successful');
      console.log(`   Plan: ${subscription[0].plan_id}`);
      console.log(`   Limit: ${subscription[0].generations_limit}`);
      console.log(`   Used: ${subscription[0].generations_used}\n`);
    }

    // Test usage increment
    console.log('Testing usage increment...');
    await sql`
      UPDATE subscriptions
      SET generations_used = generations_used + 1
      WHERE user_id = 'test-user-123'
    `;

    const updated = await sql`
      SELECT generations_used, generations_limit
      FROM subscriptions
      WHERE user_id = 'test-user-123'
    `;

    console.log(`✅ Usage incremented: ${updated[0].generations_used}/${updated[0].generations_limit}\n`);

    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await sql`DELETE FROM subscriptions WHERE user_id = 'test-user-123'`;
    await sql`DELETE FROM users WHERE id = 'test-user-123'`;
    console.log('✅ Test data cleaned\n');

    // Summary
    console.log('🎉 Database verification complete!\n');
    console.log('✅ All checks passed');
    console.log('✅ Database is ready for use\n');
    console.log('Next steps:');
    console.log('  1. Configure payment providers in .env.local');
    console.log('  2. Start development: npm run dev');
    console.log('  3. Visit /pricing to test subscriptions\n');

  } catch (error) {
    console.error('❌ Database verification failed:', error);
    console.log('\nTroubleshooting:');
    console.log('  1. Check database URL is correct');
    console.log('  2. Ensure database schema is created: npm run setup:db');
    console.log('  3. Check network connection\n');
    process.exit(1);
  }
}

verifyDatabase();
