#!/bin/bash

echo "🔧 Fixing Vite 504 Outdated Optimize Dep errors..."

# Stop any running dev servers
echo "⏹️  Stopping dev servers..."
pkill -f "remix vite:dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

# Clear all Vite and build caches
echo "🧹 Clearing caches..."
rm -rf node_modules/.vite
rm -rf .wrangler/state
rm -rf .wrangler/tmp
rm -rf build
rm -rf .cache
rm -rf .remix

# Clear any lock files that might be stuck
rm -rf node_modules/.vite/*.lock 2>/dev/null || true

echo "✅ Caches cleared successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Run: pnpm run dev"
echo "2. Open your browser in INCOGNITO/PRIVATE mode"
echo "3. Navigate to http://localhost:5173"
echo ""
echo "💡 Tip: If the error persists, close ALL browser windows and try again in incognito mode."
