#!/bin/bash
# Complete fix for Vite 504 errors

echo "🛑 Stopping any running dev servers..."
pkill -f "remix vite:dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

echo "🧹 Cleaning all caches..."
rm -rf node_modules/.vite
rm -rf .wrangler/tmp
rm -rf .remix
rm -rf build

echo "✨ Caches cleared!"
echo ""
echo "🚀 Starting dev server..."
pnpm run dev &
DEV_PID=$!

echo ""
echo "⏳ Waiting 15 seconds for dependencies to be pre-bundled..."
sleep 15

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Dev server should be ready now!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "🌐 Open your browser:"
echo "   → Use INCOGNITO/PRIVATE mode to avoid cached files"
echo "   → Navigate to: http://localhost:5173"
echo ""
echo "🔧 If you still see 504 errors:"
echo "   1. Close ALL browser windows"
echo "   2. Clear browser cache (Cmd+Shift+Delete on Mac)"
echo "   3. Reopen browser in incognito mode"
echo "   4. Go to http://localhost:5173"
echo ""
echo "To stop the dev server, press Ctrl+C or run: kill $DEV_PID"
echo "════════════════════════════════════════════════════════════"
