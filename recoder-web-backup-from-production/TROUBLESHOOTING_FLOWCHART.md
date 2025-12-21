# 🔧 Troubleshooting Flowchart

## Quick Diagnosis Guide

Use this flowchart to quickly diagnose and fix issues.

---

## 🔍 Issue #1: Old Chats Not Loading Files

```
START: Click old chat from history
  ↓
Does chat load at all?
  ├─ NO → Check database connection
  │        └─ Verify DATABASE_URL in .env
  │
  └─ YES → Do messages appear?
       ├─ NO → Check chat-history API
       │        └─ Verify /api/chat-history works
       │
       └─ YES → Do files appear in workbench?
            ├─ YES → ✅ WORKING!
            │
            └─ NO → Check console logs
                 ├─ "fileCount: 0"
                 │   └─ Files weren't saved originally
                 │        └─ FIX: Ensure saving works first
                 │
                 ├─ "fileCount: X" but no restoration message
                 │   └─ setTimeout fix not applied
                 │        └─ FIX: Check useChatHistory.ts line 204
                 │
                 └─ "Restoring files" appears but still empty
                      └─ Workbench store not updating
                           └─ FIX: Check workbenchStore.setFile calls
```

### Quick Fix Commands

```bash
# 1. Verify fix is applied
grep -A5 "setTimeout" app/lib/persistence/useChatHistory.ts | grep "Restoring files"

# Should output: console.log('🔄 [useChatHistory] Restoring files to workbench...');

# 2. Check database has files
# In browser console after loading chat:
localStorage.getItem('chat-history') // Check structure

# 3. Force re-save
# In chat, make a small edit and wait for save indicator
```

---

## 🔍 Issue #2: AI Adds Unwanted Features

```
START: Request "Build a blog"
  ↓
Does AI add authentication?
  ├─ NO → ✅ WORKING!
  │
  └─ YES → Check which template was loaded
       ├─ express-auth-libsql loaded
       │   └─ Wrong template match (see Issue #3)
       │
       └─ No template, AI generated
            └─ Check system prompt
                 ├─ "CARDINAL RULE" not in prompt
                 │   └─ FIX: Check prompts.ts line 90
                 │
                 └─ "CARDINAL RULE" present
                      └─ AI ignoring instructions
                           └─ Try more explicit request:
                               "Build ONLY a blog with posts.
                                Do NOT add authentication."
```

### Quick Fix Commands

```bash
# Verify fix is applied
grep "CARDINAL RULE" app/lib/.server/llm/prompts.ts

# Should output: 🚨 CARDINAL RULE: BUILD ONLY WHAT THE USER EXPLICITLY REQUESTS 🚨

# Check what template was detected
# Look in console for:
# 🔍 Checking if user request matches a starter template...
```

---

## 🔍 Issue #3: Wrong Template Matching

```
START: Request "Build e-commerce site"
  ↓
What template was matched?
  ├─ express-auth-libsql
  │   └─ WRONG! Check penalty system
  │        ├─ Console shows "category-mismatch"?
  │        │   ├─ YES → Score still too high
  │        │   │   └─ Increase penalty in starter-search.ts
  │        │   │
  │        │   └─ NO → Penalty not applied
  │        │        └─ FIX: Check starter-search.ts line 391
  │        │
  │        └─ No primary intent detected
  │             └─ Check detectPrimaryIntent function
  │
  ├─ Appropriate e-commerce template
  │   └─ ✅ WORKING!
  │
  └─ No template matched
       └─ Check starter bundle
            └─ Verify starters-bundle.json exists
```

### Quick Fix Commands

```bash
# 1. Verify penalty system exists
grep -A10 "category-mismatch" app/lib/.server/llm/starter-search.ts

# Should show:
# score *= 0.2; // 80% reduction
# matches.push(`category-mismatch:${template.category}`);

# 2. Test template search
# In browser console:
fetch('/api/starters?list=true')
  .then(r => r.json())
  .then(d => console.log(d))

# 3. Check primary intent detection
# Request "e-commerce site" and watch console for:
# "Primary intent detected: ecommerce"
```

---

## 🔍 Issue #4: Installation Stuck at Step 7

```
START: Clone repo or create project
  ↓
Does "Step 7 of 7" appear?
  ├─ NO → Installation failed earlier
  │   └─ Check npm install errors
  │
  └─ YES → How long does it take to complete?
       ├─ < 2 seconds → ✅ WORKING!
       │
       ├─ 5-15 seconds → Partial fix
       │   └─ Check for old server detection logic
       │
       └─ > 30 seconds or never
            └─ Fix not applied
                 ├─ Check action-runner.ts line 232
                 │   └─ Should say "completing action immediately"
                 │
                 └─ Old timeout logic still present
                      └─ FIX: Replace with quick check version
```

### Quick Fix Commands

```bash
# 1. Verify fix is applied
grep -A5 "completing action immediately" app/lib/runtime/action-runner.ts

# Should output:
# logger.info('✅ Dev server command started - completing action immediately');

# 2. Check for old timeout logic (should NOT exist)
grep "timeout = 45000" app/lib/runtime/action-runner.ts

# Should output: (empty - no results)

# 3. Time the execution
# Use stopwatch when "Step 7" appears
# Should complete in < 2 seconds
```

---

## 🔍 General Issues

### "Fix not applied" - File wasn't edited

```
1. Check git status
   git status

2. Verify file was modified
   git diff app/lib/[filename]

3. If not modified, re-apply fix
   git stash  # Save any work
   # Re-apply edits from documentation

4. Verify changes compile
   npm run build
```

### Build Fails

```
1. Check TypeScript errors
   npx tsc --noEmit

2. If errors in our changed files
   └─ Review changes carefully
   └─ Check for syntax errors

3. If errors in other files
   └─ Pre-existing issues
   └─ Our fixes don't affect build
```

### Dev Server Won't Start

```
1. Kill existing processes
   lsof -ti:5173 | xargs kill -9

2. Clear node_modules and reinstall
   rm -rf node_modules pnpm-lock.yaml
   pnpm install

3. Start fresh
   npm run dev
```

### Console Errors

```
ERROR: "Cannot read property 'fileSnapshot' of undefined"
  └─ Chat data structure mismatch
       └─ FIX: Clear browser localStorage
            localStorage.clear()

ERROR: "workbenchStore.setFile is not a function"
  └─ Workbench store not initialized
       └─ FIX: Reload page, check imports

ERROR: "Failed to load from database"
  └─ Database connection issue
       └─ FIX: Check DATABASE_URL environment variable
```

---

## 📊 Decision Tree: Which Issue Am I Seeing?

```
My Problem:
├─ Old chat doesn't show files
│   └─ Go to: Issue #1 flowchart
│
├─ AI adds features I didn't ask for
│   └─ Go to: Issue #2 flowchart
│
├─ Blog request returns auth template
│   └─ Go to: Issue #3 flowchart
│
├─ Installation hangs forever
│   └─ Go to: Issue #4 flowchart
│
├─ Can't browse available templates
│   └─ Issue #5 (not implemented yet)
│
└─ GitHub clone doesn't work
    └─ Check Issue #6 section
         └─ This should already work
```

---

## 🎯 Quick Diagnostics Checklist

Run these in order to identify the issue:

```bash
# 1. Are fixes applied?
./test-fixes.sh

# 2. Does it compile?
npx tsc --noEmit

# 3. Does it build?
npm run build

# 4. Check specific fix
# Issue #1:
grep "setTimeout.*workbenchStore" app/lib/persistence/useChatHistory.ts

# Issue #2:
grep "CARDINAL RULE" app/lib/.server/llm/prompts.ts

# Issue #3:
grep "category-mismatch" app/lib/.server/llm/starter-search.ts

# Issue #4:
grep "completing action immediately" app/lib/runtime/action-runner.ts
```

---

## 🚨 Emergency Fixes

### If Everything Breaks

```bash
# 1. Revert to last known good state
git stash
git reset --hard HEAD~1

# 2. Clean environment
rm -rf node_modules .next
pnpm install

# 3. Start fresh
npm run dev

# 4. Re-apply fixes one by one
# Test after each fix
```

### If Specific Fix Breaks Something

```bash
# Revert just that file
git checkout HEAD -- app/lib/[filename]

# Or view the changes
git diff HEAD -- app/lib/[filename]

# Re-apply more carefully
```

---

## 📞 Still Stuck?

### Information to Gather

1. **Console logs** (full output)
2. **Network tab** (failed requests)
3. **Steps to reproduce** (exact sequence)
4. **Browser/OS** (environment details)
5. **Git status** (verify fixes applied)

### Files to Check

```bash
# View recent changes
git diff HEAD~1

# Check test results
./test-fixes.sh

# View console output
# Copy everything from browser console
```

---

## ✅ Success Indicators

You know fixes are working when:

- ✅ Old chats load with files in < 1 second
- ✅ AI asks before adding optional features
- ✅ Correct templates match user intent
- ✅ Step 7 completes in < 2 seconds
- ✅ Console shows expected log messages
- ✅ No errors in browser console

---

**Use this flowchart alongside:**
- `TESTING_GUIDE_COMPLETE.md` for detailed test procedures
- `FIXES_SUMMARY.md` for quick reference
- Browser DevTools for real-time debugging
