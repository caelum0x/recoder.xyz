#!/bin/bash

echo "🔄 Restarting TypeScript server and cleaning cache..."

# Clean Next.js cache
rm -rf .next
rm -rf node_modules/.cache

# Clean TypeScript cache
rm -rf tsconfig.tsbuildinfo

echo "✅ Cache cleaned. Please restart VS Code TypeScript server:"
echo "   Cmd+Shift+P -> 'TypeScript: Restart TS Server'"

echo "🔧 Quick TypeScript fixes:"
echo "   1. Increased TS server memory to 8GB"
echo "   2. Disabled auto-imports and suggestions"
echo "   3. Excluded .next folder from TypeScript checking"
echo "   4. Fixed strict mode conflicts"
