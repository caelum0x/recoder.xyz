#!/bin/bash
# Quick test script for all fixes

echo "🧪 TESTING ALL FIXES"
echo "==================="
echo ""

echo "📋 Step 1: Verify fixes are applied"
echo "-----------------------------------"

# Check database fix
if grep -q "metadataJson" app/lib/.server/db/chat-history-db.ts; then
    echo "✅ Database fix applied"
else
    echo "❌ Database fix MISSING"
fi

# Check file restoration
if grep -q "Restoring files to workbench" app/lib/persistence/useChatHistory.ts; then
    echo "✅ File restoration fix applied"
else
    echo "❌ File restoration fix MISSING"
fi

# Check template penalty
if grep -q "category-mismatch" app/lib/.server/llm/starter-search.ts; then
    echo "✅ Template penalty fix applied"
else
    echo "❌ Template penalty fix MISSING"
fi

# Check AI prompt
if grep -q "CARDINAL RULE" app/lib/.server/llm/prompts.ts; then
    echo "✅ AI prompt fix applied"
else
    echo "❌ AI prompt fix MISSING"
fi

# Check dev server
if grep -q "completing action immediately" app/lib/runtime/action-runner.ts; then
    echo "✅ Dev server fix applied"
else
    echo "❌ Dev server fix MISSING"
fi

echo ""
echo "📋 Step 2: Build test"
echo "--------------------"
echo "Building project..."

if npm run build > /dev/null 2>&1; then
    echo "✅ Production build SUCCESS"
else
    echo "❌ Production build FAILED"
    echo "Run: npm run build"
fi

echo ""
echo "📋 Step 3: What to do next"
echo "-------------------------"
echo "1. Stop dev server (Ctrl+C if running)"
echo "2. Start fresh: npm run dev"
echo "3. Open http://localhost:5173"
echo "4. Create NEW chat"
echo "5. Generate code"
echo "6. Navigate away"
echo "7. Come back"
echo "8. CHECK: Files should persist!"
echo ""
echo "📊 Check console for:"
echo "  - fileCount > 0 (not 0!)"
echo "  - 'Restoring files to workbench...'"
echo "  - 'completing action immediately'"
echo ""
echo "🎯 If fileCount is still 0, check:"
echo "  - Did you restart server?"
echo "  - Did you create NEW chat?"
echo "  - Check CRITICAL_DATABASE_FIX.md"

