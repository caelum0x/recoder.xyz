/**
 * Database Migration Script
 * Run this to set up all required database tables
 */

import { neon } from '@neondatabase/serverless';

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  console.log('🚀 Starting database migration...');

  const sql = neon(databaseUrl);

  try {
    // Read schema files
    const fs = await import('fs/promises');
    const path = await import('path');

    const schemaPath = path.join(process.cwd(), 'app/lib/.server/db/schema.sql');
    const chatHistoryPath = path.join(process.cwd(), 'app/lib/.server/db/chat-history-schema.sql');

    const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
    const chatHistorySQL = await fs.readFile(chatHistoryPath, 'utf-8');

    // Execute schemas
    console.log('📝 Creating base tables...');
    await sql(schemaSQL);

    console.log('📝 Creating chat history tables...');
    await sql(chatHistorySQL);

    // Create deployments table
    console.log('📝 Creating deployments table...');
    await sql(`
      CREATE TABLE IF NOT EXISTS deployments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
        
        -- Deployment info
        platform VARCHAR(50) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        deployment_url TEXT,
        deployment_id VARCHAR(255),
        
        -- Configuration
        framework VARCHAR(50),
        build_command TEXT,
        start_command TEXT,
        output_directory TEXT,
        env_vars JSONB DEFAULT '{}',
        
        -- Status
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        build_logs TEXT,
        error_message TEXT,
        
        -- Metrics
        build_time_ms INTEGER,
        deploy_time_ms INTEGER,
        file_count INTEGER,
        bundle_size_kb INTEGER,
        
        -- Metadata
        git_commit VARCHAR(255),
        git_branch VARCHAR(255),
        git_repo VARCHAR(500),
        metadata JSONB DEFAULT '{}',
        
        created_at TIMESTAMP DEFAULT NOW(),
        deployed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id);
      CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
      CREATE INDEX IF NOT EXISTS idx_deployments_platform ON deployments(platform);
      CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at DESC);
    `);

    // Create MCP tool executions table
    console.log('📝 Creating MCP tool executions table...');
    await sql(`
      CREATE TABLE IF NOT EXISTS mcp_tool_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
        
        -- Tool info
        tool_name VARCHAR(100) NOT NULL,
        server_id VARCHAR(100) NOT NULL,
        parameters JSONB DEFAULT '{}',
        
        -- Execution
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        result JSONB,
        error_message TEXT,
        execution_time_ms INTEGER,
        
        -- Context
        context JSONB DEFAULT '{}',
        
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_executions_user_id ON mcp_tool_executions(user_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_executions_session_id ON mcp_tool_executions(session_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_executions_tool_name ON mcp_tool_executions(tool_name);
      CREATE INDEX IF NOT EXISTS idx_mcp_executions_created_at ON mcp_tool_executions(created_at DESC);
    `);

    console.log('✅ Database migration completed successfully!');
    console.log('');
    console.log('📊 Database structure:');
    console.log('  ✓ users');
    console.log('  ✓ subscriptions');
    console.log('  ✓ usage_logs');
    console.log('  ✓ payment_transactions');
    console.log('  ✓ webhook_events');
    console.log('  ✓ chat_sessions');
    console.log('  ✓ chat_messages');
    console.log('  ✓ projects');
    console.log('  ✓ anonymous_sessions');
    console.log('  ✓ deployments');
    console.log('  ✓ mcp_tool_executions');
    console.log('');
    console.log('🎉 Ready to use!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
