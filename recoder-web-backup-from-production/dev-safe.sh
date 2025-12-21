#!/bin/bash

echo "🚀 Starting Bolt.new development server with 504 error prevention..."

# Stop any running instances
pkill -f "remix vite:dev" 2>/dev/null || true
sleep 1

# Clear caches
echo "🧹 Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf .wrangler/state

# Create a fresh cache directory with proper permissions
mkdir -p node_modules/.vite

echo "✅ Ready to start!"
echo ""
echo "📝 Starting dev server..."
echo "⏳ Please wait for dependencies to be optimized..."
echo ""

# Start the dev server
exec pnpm run dev
