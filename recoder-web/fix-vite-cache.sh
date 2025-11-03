#!/bin/bash

# Vite Cache Fix Script
# Run this script whenever you see "504 Outdated Optimize Dep" errors
# or "Failed to fetch dynamically imported module" errors

echo "🧹 Fixing Vite cache issues..."

# Kill all processes on ports 5173 and 5174
echo "1. Killing processes on ports 5173 and 5174..."
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:5174 | xargs kill -9 2>/dev/null
echo "   ✅ Ports cleared"

# Remove Vite cache
echo "2. Clearing Vite dependency cache..."
rm -rf node_modules/.vite
echo "   ✅ Cache cleared"

# Wait a moment
sleep 1

# Start dev server
echo "3. Starting fresh dev server..."
pnpm run dev

# Instructions will be shown by the dev server
