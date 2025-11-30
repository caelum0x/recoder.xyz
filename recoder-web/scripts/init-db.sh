#!/bin/bash

# Database initialization script
# Run this to set up all required tables

echo "🗄️ Initializing Recoder database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set"
  echo "Please set it in your .env file or export it:"
  echo "export DATABASE_URL='postgresql://user:password@localhost:5432/recoder'"
  exit 1
fi

# Run schema files in order
SCHEMA_DIR="$(dirname "$0")/../app/lib/.server/db"

echo "📄 Running schema.sql..."
psql "$DATABASE_URL" -f "$SCHEMA_DIR/schema.sql"

echo "📄 Running chat-history-schema.sql..."
psql "$DATABASE_URL" -f "$SCHEMA_DIR/chat-history-schema.sql"

echo "📄 Running templates-schema.sql..."
psql "$DATABASE_URL" -f "$SCHEMA_DIR/templates-schema.sql"

echo "📄 Running projects-schema.sql..."
psql "$DATABASE_URL" -f "$SCHEMA_DIR/projects-schema.sql"

echo "📄 Running mcp-schema.sql..."
psql "$DATABASE_URL" -f "$SCHEMA_DIR/mcp-schema.sql"

echo "✅ Database initialization complete!"
