/**
 * Database Seeding Script
 * Seeds the database with sample data for testing
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function seedDatabase() {
  console.log('🌱 Seeding Bolt.new Database...\n');

  const sql = neon(DATABASE_URL);

  try {
    // Create sample users
    console.log('👥 Creating sample users...');

    const users = [
      { id: 'user-free-1', email: 'free@example.com', name: 'Free User' },
      { id: 'user-pro-1', email: 'pro@example.com', name: 'Pro User' },
      { id: 'user-team-1', email: 'team@example.com', name: 'Team User' },
      { id: 'user-enterprise-1', email: 'enterprise@example.com', name: 'Enterprise User' },
    ];

    for (const user of users) {
      await sql`
        INSERT INTO users (id, email, name)
        VALUES (${user.id}, ${user.email}, ${user.name})
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      `;
      console.log(`  ✓ ${user.name} (${user.email})`);
    }

    console.log('✅ Sample users created\n');

    // Create sample subscriptions
    console.log('💳 Creating sample subscriptions...');

    const subscriptions = [
      {
        userId: 'user-free-1',
        provider: 'paddle',
        subscriptionId: 'sub_free_demo',
        customerId: 'cus_free_demo',
        planId: 'free',
        limit: 5
      },
      {
        userId: 'user-pro-1',
        provider: 'paddle',
        subscriptionId: 'sub_pro_demo',
        customerId: 'cus_pro_demo',
        planId: 'pro',
        limit: 100
      },
      {
        userId: 'user-team-1',
        provider: 'dodopay',
        subscriptionId: 'sub_team_demo',
        customerId: 'cus_team_demo',
        planId: 'team',
        limit: 500
      },
      {
        userId: 'user-enterprise-1',
        provider: 'paddle',
        subscriptionId: 'sub_ent_demo',
        customerId: 'cus_ent_demo',
        planId: 'enterprise',
        limit: 2000
      }
    ];

    for (const sub of subscriptions) {
      await sql`
        INSERT INTO subscriptions (
          user_id,
          provider,
          subscription_id,
          customer_id,
          plan_id,
          status,
          current_period_start,
          current_period_end,
          generations_limit,
          generations_used
        ) VALUES (
          ${sub.userId},
          ${sub.provider},
          ${sub.subscriptionId},
          ${sub.customerId},
          ${sub.planId},
          'active',
          NOW(),
          NOW() + INTERVAL '30 days',
          ${sub.limit},
          ${Math.floor(Math.random() * sub.limit * 0.5)}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          generations_limit = EXCLUDED.generations_limit
      `;
      console.log(`  ✓ ${sub.planId.toUpperCase()} subscription (${sub.provider})`);
    }

    console.log('✅ Sample subscriptions created\n');

    // Create sample usage logs
    console.log('📊 Creating sample usage logs...');

    const models = ['deepseek-r1', 'gemini-2.5-flash', 'claude-sonnet-4', 'mistral-small'];
    const strategies = ['template-based', 'model-routed', 'free-tier'];

    for (const user of users) {
      const logCount = Math.floor(Math.random() * 20) + 5;

      for (let i = 0; i < logCount; i++) {
        const model = models[Math.floor(Math.random() * models.length)];
        const strategy = strategies[Math.floor(Math.random() * strategies.length)];
        const tokensUsed = Math.floor(Math.random() * 5000) + 1000;
        const costEstimated = tokensUsed * 0.000003; // Rough estimate

        await sql`
          INSERT INTO usage_logs (
            user_id,
            action_type,
            tokens_used,
            cost_estimated,
            model_used,
            optimization_strategy,
            created_at
          ) VALUES (
            ${user.id},
            'generation',
            ${tokensUsed},
            ${costEstimated},
            ${model},
            ${strategy},
            NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days'
          )
        `;
      }

      console.log(`  ✓ Created ${logCount} usage logs for ${user.name}`);
    }

    console.log('✅ Sample usage logs created\n');

    // Create sample payment transactions
    console.log('💰 Creating sample payment transactions...');

    const paidUsers = [
      { id: 'user-pro-1', plan: 'pro', amount: 20 },
      { id: 'user-team-1', plan: 'team', amount: 50 },
      { id: 'user-enterprise-1', plan: 'enterprise', amount: 200 }
    ];

    for (const user of paidUsers) {
      // Create 3 successful payments (last 3 months)
      for (let i = 0; i < 3; i++) {
        await sql`
          INSERT INTO payment_transactions (
            user_id,
            provider,
            transaction_id,
            amount,
            currency,
            status,
            payment_method,
            created_at
          ) VALUES (
            ${user.id},
            'paddle',
            ${`txn_${user.id}_${i}`},
            ${user.amount},
            'USD',
            'succeeded',
            'card',
            NOW() - INTERVAL '${i * 30} days'
          )
        `;
      }

      console.log(`  ✓ Created payment history for ${user.plan.toUpperCase()}`);
    }

    console.log('✅ Sample transactions created\n');

    // Display summary
    console.log('📈 Database Seeding Summary:\n');

    const stats = await sql`
      SELECT
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM subscriptions) as subscription_count,
        (SELECT COUNT(*) FROM usage_logs) as usage_log_count,
        (SELECT COUNT(*) FROM payment_transactions) as transaction_count
    `;

    console.log(`  Users: ${stats[0].user_count}`);
    console.log(`  Subscriptions: ${stats[0].subscription_count}`);
    console.log(`  Usage Logs: ${stats[0].usage_log_count}`);
    console.log(`  Transactions: ${stats[0].transaction_count}\n`);

    // Display sample users
    console.log('👤 Sample Users (for testing):\n');
    console.log('  Email: free@example.com        → Free Plan (5 gen/month)');
    console.log('  Email: pro@example.com         → Pro Plan (100 gen/month)');
    console.log('  Email: team@example.com        → Team Plan (500 gen/month)');
    console.log('  Email: enterprise@example.com  → Enterprise Plan (2000 gen/month)\n');

    console.log('🎉 Database seeding complete!\n');
    console.log('You can now:');
    console.log('  - Start the app: npm run dev');
    console.log('  - Login with any sample user email');
    console.log('  - View subscription dashboard: /dashboard/subscription\n');

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
