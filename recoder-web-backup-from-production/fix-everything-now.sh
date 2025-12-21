#!/bin/bash

echo "🔧 Comprehensive Fix Script"
echo "=============================="
echo ""

# Stop any running servers
echo "⏹️  Stopping dev servers..."
pkill -f "remix vite:dev" 2>/dev/null || true
sleep 2

# Clear all caches
echo "🧹 Clearing all caches..."
rm -rf node_modules/.vite
rm -rf node_modules/.cache  
rm -rf .wrangler/state
rm -rf build
rm -rf .cache

echo "✅ Caches cleared"
echo ""

# Verify .dev.vars
echo "📝 Checking .dev.vars configuration..."
if grep -q "VITE_DISABLE_PERSISTENCE=false" .dev.vars; then
  echo "✅ VITE_DISABLE_PERSISTENCE is set to false"
else
  echo "⚠️  VITE_DISABLE_PERSISTENCE not found, adding it..."
  echo "VITE_DISABLE_PERSISTENCE=false" >> .dev.vars
fi

if grep -q "DATABASE_URL" .dev.vars; then
  echo "✅ DATABASE_URL is configured"
else
  echo "❌ DATABASE_URL is missing!"
fi

if grep -q "OPENROUTER_API_KEY" .dev.vars; then
  echo "✅ OPENROUTER_API_KEY is configured"
else
  echo "⚠️  OPENROUTER_API_KEY is missing"
fi

echo ""
echo "=============================="
echo "🚀 Ready to start!"
echo ""
echo "Next steps:"
echo "1. Run: pnpm run dev"
echo "2. Wait for '✅ Optimization complete' message"
echo "3. Clear browser cache (Ctrl/Cmd + Shift + Delete)"
echo "4. Go to http://localhost:5173 in incognito mode first"
echo "5. After it works in incognito, use normal browser"
echo ""
echo "=============================="

