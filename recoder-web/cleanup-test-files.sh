#!/bin/bash

echo "🧹 Cleaning up test files..."
echo ""

# Move test files to a tests directory
mkdir -p tests/scripts

echo "Moving test scripts to tests/scripts/..."
mv -v test-github-clone.ts tests/scripts/ 2>/dev/null || echo "  test-github-clone.ts already moved or doesn't exist"
mv -v test-e2e.ts tests/scripts/ 2>/dev/null || echo "  test-e2e.ts already moved or doesn't exist"
mv -v rebuild-starters-bundle.ts tests/scripts/ 2>/dev/null || echo "  rebuild-starters-bundle.ts already moved or doesn't exist"

echo ""
echo "Documentation files (keeping in root):"
ls -lh *.md | grep -E "(FIXES|QUICK|START)" | awk '{print "  " $9 " (" $5 ")"}'

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Test scripts are now in: tests/scripts/"
echo "Run them with:"
echo "  npx tsx tests/scripts/test-e2e.ts"
echo "  npx tsx tests/scripts/test-github-clone.ts"
echo "  npx tsx tests/scripts/rebuild-starters-bundle.ts"
