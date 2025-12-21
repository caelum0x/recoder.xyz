#!/bin/bash
echo "🔍 Recoder Environment Check"
echo "=============================="
echo ""

# Check Node version
echo "✅ Node Version:"
node --version
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "✅ .env.local exists"
    if grep -q "DATABASE_URL=postgresql://" .env.local; then
        echo "✅ DATABASE_URL format is correct"
    else
        echo "❌ DATABASE_URL format may be incorrect"
    fi
else
    echo "❌ .env.local not found"
fi
echo ""

# Check if .dev.vars exists
if [ -f .dev.vars ]; then
    echo "✅ .dev.vars exists"
    if grep -q "DATABASE_URL=postgresql://" .dev.vars; then
        echo "✅ DATABASE_URL format is correct in .dev.vars"
    else
        echo "❌ DATABASE_URL format may be incorrect in .dev.vars"
    fi
else
    echo "❌ .dev.vars not found"
fi
echo ""

# Check critical files
echo "📁 Critical Files Check:"
files=(
    "app/components/database/SchemaGenerator.tsx"
    "app/components/mcp/MCPServerManager.tsx"
    "app/components/deployment/DeploymentManager.tsx"
    "app/lib/.server/db/chat-history-db.ts"
    "app/lib/.server/mcp/server-manager.ts"
    "app/lib/.server/deployment/deployment-manager.ts"
    "app/routes/api.chat-history.ts"
    "app/routes/api.mcp.servers.ts"
    "app/routes/api.deployments.ts"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (missing)"
    fi
done
echo ""

# Check node_modules
if [ -d node_modules ]; then
    echo "✅ node_modules exists"
else
    echo "⚠️  node_modules not found - run: npm install"
fi
echo ""

echo "=============================="
echo "Environment check complete!"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev"
echo "2. Open: http://localhost:5173"
echo "3. Test all features"
echo ""
