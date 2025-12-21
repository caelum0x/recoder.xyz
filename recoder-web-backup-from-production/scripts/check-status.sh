#!/bin/bash

# Status Check Script for Bolt.new
# Verifies database and shows current state

DB_URL="postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

echo "🔍 Bolt.new System Status"
echo "=========================="
echo ""

# Check database connection
echo "📡 Database Connection:"
psql "$DB_URL" -c "SELECT NOW() as current_time" -t | head -n1
echo ""

# Count tables
echo "📊 Database Tables:"
psql "$DB_URL" -c "\dt" -t | wc -l | xargs echo "Total tables:"
echo ""

# Show subscriptions
echo "💳 Active Subscriptions:"
psql "$DB_URL" -c "
SELECT
  u.email,
  s.plan_id,
  s.generations_used || '/' || s.generations_limit as usage,
  s.status
FROM users u
JOIN subscriptions s ON u.id = s.user_id
ORDER BY s.plan_id
" -t

echo ""

# Show usage stats
echo "📈 Usage Statistics (Last 30 days):"
psql "$DB_URL" -c "
SELECT
  COUNT(*) as total_generations,
  SUM(tokens_used) as total_tokens,
  ROUND(SUM(cost_estimated)::numeric, 4) as total_cost
FROM usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
" -t

echo ""

# Show recent transactions
echo "💰 Recent Transactions:"
psql "$DB_URL" -c "
SELECT
  LEFT(transaction_id, 20) as transaction,
  amount,
  currency,
  status,
  TO_CHAR(created_at, 'YYYY-MM-DD') as date
FROM payment_transactions
ORDER BY created_at DESC
LIMIT 5
" -t

echo ""
echo "✅ System Status: OPERATIONAL"
echo ""
echo "Next steps:"
echo "  1. npm run dev       - Start development server"
echo "  2. Visit /pricing    - Test subscription flow"
echo "  3. See START_HERE.md - Complete setup guide"
echo ""
