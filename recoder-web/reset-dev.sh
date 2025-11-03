#!/bin/bash
# Reset development environment to fix Vite 504 errors

echo "🧹 Cleaning caches..."
rm -rf node_modules/.vite
rm -rf .wrangler/tmp
rm -rf .remix
rm -rf build

echo "✨ All caches cleared!"
echo ""
echo "Now do the following:"
echo "1. Close your browser completely"
echo "2. Run: pnpm run dev"
echo "3. Open browser in INCOGNITO/PRIVATE mode"
echo "4. Navigate to http://localhost:5173"
echo ""
echo "This ensures no cached dependencies cause 504 errors."
