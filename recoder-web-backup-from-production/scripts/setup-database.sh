#!/bin/bash

# Database Setup Script for Bolt.new
# This script initializes the Neon database with all required tables

set -e  # Exit on error

echo "🚀 Setting up Bolt.new Database..."
echo ""

# Database URL
DB_URL="postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

echo "📡 Connecting to Neon database..."

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client."
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql-client"
    exit 1
fi

echo "✅ psql found"
echo ""

# Run the schema
echo "📝 Creating database schema..."
psql "$DB_URL" < app/lib/.server/db/schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Database schema created successfully!"
    echo ""

    # Verify tables
    echo "🔍 Verifying tables..."
    psql "$DB_URL" -c "\dt" | grep -E "users|subscriptions|usage_logs|payment_transactions|webhook_events"

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ All tables created successfully!"
        echo ""
        echo "📊 Database is ready! You can now:"
        echo "   1. Configure payment providers (Paddle/DodoPay)"
        echo "   2. Start the development server: npm run dev"
        echo "   3. Visit /pricing to test subscriptions"
    else
        echo "⚠️  Tables not found. Please check the schema file."
    fi
else
    echo "❌ Failed to create schema. Please check the error above."
    exit 1
fi
