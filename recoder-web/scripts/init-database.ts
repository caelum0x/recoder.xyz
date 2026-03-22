/**
 * Database Initialization Script
 * Sets up all tables and functions in Neon database
 */

import { createSql } from '../app/lib/.server/db/pg-pool';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.dev.vars' });
dotenv.config({ path: '.env' });

async function initDatabase() {
  console.log('🚀 Initializing Recoder Web Database...\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    console.error('   Please set it in .dev.vars or .env');
    process.exit(1);
  }

  console.log('✅ Database URL loaded from environment\n');
  const sql = createSql(DATABASE_URL);

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    const result = await sql`SELECT NOW() as current_time, version()`;
    console.log('✅ Connected to Neon database');
    console.log(`   Time: ${result[0].current_time}`);
    console.log(`   Version: ${result[0].version.split(' ').slice(0, 2).join(' ')}\n`);

    // Read and execute schema
    console.log('📝 Creating database schema...\n');

    // Create users table
    console.log('Creating users table...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ Users table created\n');

    // Create subscriptions table
    console.log('Creating subscriptions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('paddle', 'dodopay')),
        subscription_id VARCHAR(255) UNIQUE NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        plan_id VARCHAR(50) NOT NULL CHECK (plan_id IN ('free', 'pro', 'team', 'enterprise')),
        status VARCHAR(50) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'incomplete', 'incomplete_expired')),
        current_period_start TIMESTAMP NOT NULL,
        current_period_end TIMESTAMP NOT NULL,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        cancelled_at TIMESTAMP,
        trial_end TIMESTAMP,
        generations_limit INTEGER NOT NULL DEFAULT 5,
        generations_used INTEGER NOT NULL DEFAULT 0,
        last_reset_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_user_subscription UNIQUE (user_id)
      )
    `;
    console.log('✅ Subscriptions table created\n');

    // Create usage_logs table
    console.log('Creating usage_logs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('generation', 'template', 'export', 'deployment')),
        tokens_used INTEGER DEFAULT 0,
        cost_estimated DECIMAL(10, 4) DEFAULT 0,
        model_used VARCHAR(100),
        optimization_strategy VARCHAR(50),
        request_data JSONB,
        response_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ Usage logs table created\n');

    // Create payment_transactions table
    console.log('Creating payment_transactions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        provider VARCHAR(20) NOT NULL,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
        payment_method VARCHAR(50),
        receipt_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ Payment transactions table created\n');

    // Create webhook_events table
    console.log('Creating webhook_events table...');
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(20) NOT NULL,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ Webhook events table created\n');

    // Create indexes
    console.log('Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, subscription_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at)`;
    console.log('✅ Indexes created\n');

    // Create update trigger function
    console.log('Creating trigger functions...');
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users
    `;
    await sql`
      CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions
    `;
    await sql`
      CREATE TRIGGER update_subscriptions_updated_at
      BEFORE UPDATE ON subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions
    `;
    await sql`
      CREATE TRIGGER update_payment_transactions_updated_at
      BEFORE UPDATE ON payment_transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;

    console.log('✅ Triggers created\n');

    // Create chat history tables
    console.log('Creating chat history tables...');
    
    console.log('  Creating chat_sessions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        anonymous_id VARCHAR(255),
        title VARCHAR(500),
        description TEXT,
        url_id VARCHAR(255) UNIQUE NOT NULL,
        total_messages INTEGER DEFAULT 0,
        last_message_at TIMESTAMP,
        project_id UUID,
        artifact_id VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_url_id ON chat_sessions(url_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_anonymous_id ON chat_sessions(anonymous_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC)`;
    console.log('  ✅ chat_sessions created');

    console.log('  Creating chat_messages table...');
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        model_used VARCHAR(100),
        tokens_used INTEGER DEFAULT 0,
        stream_complete BOOLEAN DEFAULT TRUE,
        tool_calls JSONB,
        artifacts JSONB,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`;
    console.log('  ✅ chat_messages created');

    console.log('  Creating projects table...');
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        files JSONB NOT NULL DEFAULT '{}',
        preview_url TEXT,
        deployed_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_session_id ON projects(session_id)`;
    console.log('  ✅ projects created');

    console.log('  Creating anonymous_sessions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS anonymous_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        anonymous_id VARCHAR(255) UNIQUE NOT NULL,
        session_count INTEGER DEFAULT 0,
        last_active_at TIMESTAMP DEFAULT NOW(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_id ON anonymous_sessions(anonymous_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_user_id ON anonymous_sessions(user_id)`;
    console.log('  ✅ anonymous_sessions created');

    // Create chat history functions
    console.log('  Creating chat history functions...');
    
    await sql`
      CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    
    await sql`DROP TRIGGER IF EXISTS update_chat_sessions_timestamp ON chat_sessions`;
    await sql`
      CREATE TRIGGER update_chat_sessions_timestamp
      BEFORE UPDATE ON chat_sessions
      FOR EACH ROW EXECUTE FUNCTION update_chat_sessions_updated_at()
    `;

    await sql`
      CREATE OR REPLACE FUNCTION update_session_on_message()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE chat_sessions
        SET 
          total_messages = total_messages + 1,
          last_message_at = NOW(),
          updated_at = NOW()
        WHERE id = NEW.session_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    
    await sql`DROP TRIGGER IF EXISTS update_session_stats ON chat_messages`;
    await sql`
      CREATE TRIGGER update_session_stats
      AFTER INSERT ON chat_messages
      FOR EACH ROW EXECUTE FUNCTION update_session_on_message()
    `;

    await sql`
      CREATE OR REPLACE FUNCTION claim_anonymous_sessions(
        p_anonymous_id VARCHAR(255),
        p_user_id UUID
      )
      RETURNS INTEGER AS $$
      DECLARE
        claimed_count INTEGER;
      BEGIN
        UPDATE chat_sessions
        SET user_id = p_user_id, anonymous_id = NULL
        WHERE anonymous_id = p_anonymous_id;
        
        GET DIAGNOSTICS claimed_count = ROW_COUNT;
        
        UPDATE anonymous_sessions
        SET user_id = p_user_id
        WHERE anonymous_id = p_anonymous_id;
        
        RETURN claimed_count;
      END;
      $$ LANGUAGE plpgsql
    `;
    
    console.log('  ✅ Chat history functions created');
    console.log('✅ Chat history tables setup complete\n');

    // Verify tables
    console.log('🔍 Verifying tables...');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log(`\nFound ${tables.length} tables:`);
    tables.forEach((table: any) => {
      console.log(`  ✓ ${table.table_name}`);
    });

    console.log('\n🎉 Database initialization complete!\n');
    console.log('✅ All tables created successfully');
    console.log('✅ All indexes created successfully');
    console.log('✅ All triggers created successfully');
    console.log('✅ Chat history persistence enabled\n');

    console.log('Next steps:');
    console.log('  1. Run seed script (optional): npm run db:seed');
    console.log('  2. Start development: npm run dev');
    console.log('  3. Test chat history persistence');
    console.log('  4. Visit /pricing to test subscriptions\n');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.log('\nTroubleshooting:');
    console.log('  1. Check database URL is correct');
    console.log('  2. Ensure you have network access to Neon');
    console.log('  3. Verify database credentials\n');
    process.exit(1);
  }
}

initDatabase();
