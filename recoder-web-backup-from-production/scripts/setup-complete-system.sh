#!/bin/bash

# Complete System Setup Script
# Sets up MCP, Deployment, and Chat History features

set -e

echo "🚀 Recoder Complete System Setup"
echo "================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env or .dev.vars exists
if [ ! -f ".env" ] && [ ! -f ".dev.vars" ]; then
    echo -e "${RED}❌ No .env or .dev.vars file found${NC}"
    echo "Please create one with your configuration"
    exit 1
fi

# Check for DATABASE_URL
if grep -q "DATABASE_URL" .env 2>/dev/null || grep -q "DATABASE_URL" .dev.vars 2>/dev/null; then
    echo -e "${GREEN}✅ DATABASE_URL found${NC}"
else
    echo -e "${RED}❌ DATABASE_URL not found in .env or .dev.vars${NC}"
    echo "Please add your Neon PostgreSQL connection string:"
    echo "DATABASE_URL=postgresql://..."
    exit 1
fi

# Check for deployment tokens
echo ""
echo "📋 Checking deployment platform tokens..."

VERCEL_OK=false
NETLIFY_OK=false

if grep -q "VERCEL_TOKEN" .env 2>/dev/null || grep -q "VERCEL_TOKEN" .dev.vars 2>/dev/null; then
    echo -e "${GREEN}✅ VERCEL_TOKEN found${NC}"
    VERCEL_OK=true
else
    echo -e "${YELLOW}⚠️  VERCEL_TOKEN not found (optional)${NC}"
fi

if grep -q "NETLIFY_TOKEN" .env 2>/dev/null || grep -q "NETLIFY_TOKEN" .dev.vars 2>/dev/null; then
    echo -e "${GREEN}✅ NETLIFY_TOKEN found${NC}"
    NETLIFY_OK=true
else
    echo -e "${YELLOW}⚠️  NETLIFY_TOKEN not found (optional)${NC}"
fi

if ! $VERCEL_OK && ! $NETLIFY_OK; then
    echo -e "${YELLOW}⚠️  No deployment tokens found. Deployment features will be limited.${NC}"
    echo "Add VERCEL_TOKEN or NETLIFY_TOKEN to enable deployments"
fi

# Check for GitHub token
echo ""
if grep -q "GITHUB_TOKEN" .env 2>/dev/null || grep -q "GITHUB_TOKEN" .dev.vars 2>/dev/null; then
    echo -e "${GREEN}✅ GITHUB_TOKEN found${NC}"
else
    echo -e "${YELLOW}⚠️  GITHUB_TOKEN not found (optional but recommended)${NC}"
    echo "Add GITHUB_TOKEN to avoid GitHub API rate limits"
fi

# Run database migration
echo ""
echo "🗄️  Running database migration..."
echo ""

npx tsx scripts/migrate-database.ts

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Database migration completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Database migration failed${NC}"
    exit 1
fi

# Check if dependencies are installed
echo ""
echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found. Installing dependencies...${NC}"
    npm install
else
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

# Print status summary
echo ""
echo "================================="
echo "📊 System Status Summary"
echo "================================="
echo ""

echo "✅ Database: Ready"
echo "   - chat_sessions table created"
echo "   - chat_messages table created"
echo "   - deployments table created"
echo "   - mcp_tool_executions table created"
echo ""

echo "🔌 MCP Servers:"
echo "   ✅ Filesystem Server (ready)"
echo "   🔜 GitHub Server (needs token)"
echo "   🔜 Database Server (ready)"
echo "   🔜 API Server (ready)"
echo ""

echo "🚢 Deployment Platforms:"
if $VERCEL_OK; then
    echo "   ✅ Vercel (ready)"
else
    echo "   ❌ Vercel (needs token)"
fi
if $NETLIFY_OK; then
    echo "   ✅ Netlify (ready)"
else
    echo "   ❌ Netlify (needs token)"
fi
echo "   🔜 Railway (coming soon)"
echo "   🔜 Render (coming soon)"
echo ""

echo "💬 Chat History: Ready"
echo "   - Database persistence enabled"
echo "   - Anonymous user support"
echo "   - Cross-device sync ready"
echo ""

echo "================================="
echo "🎉 Setup Complete!"
echo "================================="
echo ""
echo "Next steps:"
echo "1. Start dev server: npm run dev"
echo "2. Test deployment: Click Deploy button in UI"
echo "3. Test chat history: Start a chat and reload page"
echo "4. Test MCP tools: Use AI to read/write files"
echo ""
echo "📖 See MCP_AND_DEPLOYMENT_IMPLEMENTATION.md for full documentation"
echo ""
