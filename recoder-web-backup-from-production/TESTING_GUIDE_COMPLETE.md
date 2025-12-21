# 🧪 Complete Testing Guide for Fixes

## Overview

This guide provides step-by-step testing procedures for all 6 issues, with expected results, screenshots points, and troubleshooting tips.

---

## 🎯 Test Setup

### Prerequisites
```bash
cd /Users/arhansubasi/recoder.xyz/recoder-web
npm run dev
```

### Browser Setup
1. Open Chrome/Firefox DevTools (F12)
2. Switch to Console tab
3. Clear console (Ctrl+L / Cmd+K)
4. Keep Network tab open in second view

### Test Environment
- Clean browser cache before testing
- Use incognito/private mode for fresh state
- Test on localhost:5173

---

## 🧪 Test 1: Old Chat Loading (Issue #1)

### Priority: HIGH
### Time: 5 minutes

### Setup
1. Start fresh chat
2. Type: "Create a simple React counter app"
3. Wait for files to be generated
4. Note the chat URL (e.g., `/chat/abc-123-def`)

### Test Steps

#### Step 1.1: Create Test Data
```
Action: Send message in chat
Input: "Create a simple React counter app"
Expected: Files generated in workbench
```

**✅ Success Indicators:**
- Workbench shows file tree
- Files have content (not empty)
- At least 3-4 files created

**Console should show:**
```
💾 [useChatHistory] Saving chat history: 2 messages
📊 [useChatHistory] Current state: { fileCount: 4 }
✅ [saveChat] Complete chat saved
```

#### Step 1.2: Navigate Away
```
Action: Click "New Chat" or go to homepage
Expected: Current chat saved, new chat starts
```

#### Step 1.3: Load Old Chat
```
Action: Click the saved chat from history sidebar
Expected: Chat loads with messages AND files
```

**✅ Success Indicators:**
```
Console logs:
📂 [loadChatFromDatabase] Loading chat: abc-123-def
✅ Loaded chat from database: xxx-session-id
📂 [useChatHistory] Scheduling workbench restoration: 4 files
🔄 [useChatHistory] Restoring files to workbench...
✅ [useChatHistory] Workbench files restored successfully
```

**Visual Check:**
- [ ] Chat messages appear
- [ ] Workbench opens automatically
- [ ] File tree shows all files
- [ ] Files have correct content
- [ ] Can click and edit files

#### Step 1.4: Verify File Contents
```
Action: Click on each file in workbench
Expected: File content is complete and correct
```

### ❌ Failure Scenarios

**If files don't appear:**
```
Check console for:
- "fileCount: 0" → Files weren't saved
- No "Restoring files to workbench" → Fix not applied
- "Failed to load from database" → Database issue
```

**If files are empty:**
```
Check:
- Database actually has file content
- No errors during restoration
- Workbench store is updating
```

---

## 🧪 Test 2: AI Simplicity (Issue #2)

### Priority: HIGH
### Time: 10 minutes

### Test 2.1: E-commerce Without Auth

#### Setup
```
Action: Start new chat
```

#### Test Steps
```
Input: "Build an e-commerce site with product listings, shopping cart, and checkout flow"

Expected Response:
✅ Creates product listing page
✅ Creates shopping cart component
✅ Creates checkout form
❌ Does NOT add authentication
❌ Does NOT add user accounts
❌ Does NOT add payment processing
❌ Does NOT add admin panel
```

**Console Check:**
```
Look for in system prompt:
"🚨 CARDINAL RULE: BUILD ONLY WHAT THE USER EXPLICITLY REQUESTS"
```

**AI Response Check:**
```
✅ Good: "I'll build a product listing and shopping cart..."
❌ Bad: "I'll build an e-commerce site with authentication, user accounts..."
```

#### Verification
Count the features implemented:
- [ ] Product listing: YES
- [ ] Shopping cart: YES
- [ ] Checkout form: YES
- [ ] Authentication: NO (unless you asked)
- [ ] Payment processing: NO (unless you asked)
- [ ] User accounts: NO (unless you asked)

### Test 2.2: Blog Without Comments

#### Test Steps
```
Input: "Create a blog platform where I can write and publish posts"

Expected Response:
✅ Creates blog post list
✅ Creates post editor
✅ Creates post viewer
❌ Does NOT add comment system
❌ Does NOT add user authentication
❌ Does NOT add admin panel
```

### Test 2.3: AI Should Ask First

#### Test Steps
```
Input: "Build a todo app"

Expected Response:
AI should ASK: "Would you like me to add user authentication so users can save their todos?"
NOT: Automatically add auth system
```

**Good AI Response Example:**
```
"I'll create a todo app with:
- Task list
- Add/edit/delete tasks
- Mark as complete

Would you like me to add:
- User authentication?
- Data persistence?
- Categories/tags?"
```

**Bad AI Response Example:**
```
"I'll create a comprehensive todo app with:
- User authentication
- Database backend
- User accounts
- Password reset
- Email notifications
..."
```

---

## 🧪 Test 3: Template Matching (Issue #3)

### Priority: HIGH
### Time: 5 minutes

### Setup
Enable verbose logging in console

### Test 3.1: E-commerce Request

#### Test Steps
```
Action: Start new chat
Input: "Build an e-commerce website"
```

**Console should show:**
```
🔍 Checking if user request matches a starter template...
🔍 Searching for: "Build an e-commerce website"
   Primary intent detected: ecommerce
```

**✅ Success Indicators:**
```
🎯 Search match: [appropriate-template] (score: X.XX)
   Reasoning: Matched by keyword relevance, e-commerce category

NOT:
express-auth-libsql (score: X.XX)
   Reasoning: category-mismatch:auth
```

**If express-auth-libsql appears:**
```
Check its score:
- Should have "category-mismatch" in matches
- Score should be LOW (< 2.0 after penalty)
- Should NOT be first result
```

### Test 3.2: Blog Request

#### Test Steps
```
Input: "Create a blog with posts and categories"
```

**Expected Template Match:**
```
✅ BlogApp or nextjs-blog-mdx
❌ NOT express-typescript-auth
❌ NOT any auth template
```

**Console Check:**
```
Primary intent detected: blog
💎 Primary intent match: BlogApp (or nextjs-blog-mdx)
```

### Test 3.3: API with Auth Request

#### Test Steps
```
Input: "Build a REST API with user authentication"
```

**Expected Template Match:**
```
✅ express-typescript-auth
✅ express-mongodb-api
❌ NOT blog templates
```

**Console Check:**
```
Primary intent detected: auth (or api)
💎 Primary intent match: express-typescript-auth
```

### Test 3.4: Category Mismatch Penalty

#### Verify Penalty System
```
Watch console for:
⚠️ Category mismatch penalty for [template-id] 
   (expected [intent], got [actual-category])
```

**Penalty should apply when:**
- User wants "blog" but template is "auth"
- User wants "ecommerce" but template is "api"
- User wants "dashboard" but template is "mobile"

---

## 🧪 Test 4: Dev Server Speed (Issue #4)

### Priority: CRITICAL
### Time: 5 minutes

### Test 4.1: GitHub Clone

#### Setup
```
Action: Start new chat
```

#### Test Steps
```
Input: "Clone https://github.com/facebook/react"

Watch for:
1. Clone progress (1114 files)
2. "Step 7 of 7" message
3. Time it takes to complete
```

**Timeline:**
```
00:00 - Clone starts
00:05 - Files downloading
00:30 - Clone complete
00:31 - "Step 7 of 7" appears
00:32 - ✅ Should complete HERE (within 1-2 seconds)
00:33 - ❌ Should NOT still show "Almost done..."
```

**Console should show:**
```
✅ Dev server command started - completing action immediately
   Server will start in background. Check terminal for output.
✅ Dev server process is running - action complete
```

**❌ If it hangs:**
```
Check console for:
- Still shows "Step 7 of 7" after 5 seconds → Fix not applied
- "Still waiting for dev server..." → Old code still running
```

### Test 4.2: Large Project Installation

#### Test Steps
```
Input: "Clone https://github.com/vercel/next.js"

Expected:
- Clone completes
- Step 7 completes in 1-2 seconds
- Can interact with files immediately
- Dev server output appears in terminal
```

**Visual Indicators:**
```
✅ "Almost done..." appears briefly
✅ Changes to "Complete" within 2 seconds
✅ File tree is interactive
✅ Can open and edit files
✅ Terminal shows dev server output
```

### Test 4.3: Regular npm install

#### Test Steps
```
Input: "Create a React app with Vite"

After generation, watch terminal for:
- npm install runs
- Dependencies install
- Step 7 completes quickly
```

**Should NOT:**
- Hang for 45 seconds
- Show endless "Almost done..."
- Block user interaction

---

## 🧪 Test 5: Manual Starter Import (Deferred)

### Status: NOT IMPLEMENTED
### Expected Behavior: N/A

**Note:** This feature was deferred. Current behavior:
- Starters load automatically via AI detection
- No manual browse/select UI
- Future enhancement tracked in backlog

---

## 🧪 Test 6: GitHub Cloning (Already Working)

### Priority: LOW (Verification Only)
### Time: 3 minutes

### Test Steps

#### Test 6.1: Public Repo Clone
```
Input: "Clone https://github.com/microsoft/vscode"

Expected:
✅ Repo info fetched
✅ Files downloaded with progress
✅ All files appear in workbench
✅ Complete repo structure preserved
```

**Console Check:**
```
📦 [GitHub] Clone request: { repoUrl: 'microsoft/vscode', ... }
✅ [GitHub] Repository is public! Cloning without token...
📦 Cloning public repo: microsoft/vscode (main)
⬇️  Downloading XXX files...
✅ Successfully cloned XXX files
```

#### Test 6.2: Owner/Repo Format
```
Input: "Clone facebook/react"

Expected:
✅ Automatically expands to github.com URL
✅ Clones successfully
```

---

## 📊 Test Results Matrix

| Test | Issue | Expected Result | Pass/Fail |
|------|-------|----------------|-----------|
| 1.1 | #1 | Create chat with files | ⬜ |
| 1.2 | #1 | Navigate away | ⬜ |
| 1.3 | #1 | Load old chat | ⬜ |
| 1.4 | #1 | Files appear in workbench | ⬜ |
| 2.1 | #2 | E-commerce without auth | ⬜ |
| 2.2 | #2 | Blog without comments | ⬜ |
| 2.3 | #2 | AI asks before adding | ⬜ |
| 3.1 | #3 | E-commerce matches correctly | ⬜ |
| 3.2 | #3 | Blog matches correctly | ⬜ |
| 3.3 | #3 | Auth matches correctly | ⬜ |
| 3.4 | #3 | Penalty applied | ⬜ |
| 4.1 | #4 | Clone completes fast | ⬜ |
| 4.2 | #4 | Large repo fast | ⬜ |
| 4.3 | #4 | npm install fast | ⬜ |
| 5.0 | #5 | N/A (deferred) | N/A |
| 6.1 | #6 | Public clone works | ⬜ |
| 6.2 | #6 | Short format works | ⬜ |

---

## 🔍 Troubleshooting

### Issue #1: Files Still Not Appearing

**Symptom:** Chat loads but workbench is empty

**Debug Steps:**
1. Check console for `fileCount: X`
2. If 0 → Files weren't saved originally
3. If >0 → Restoration failed

**Solutions:**
```bash
# Check if fix is applied
grep -n "setTimeout" app/lib/persistence/useChatHistory.ts

# Should see line ~204:
setTimeout(() => {
  console.log('🔄 [useChatHistory] Restoring files to workbench...');
```

### Issue #2: AI Still Adding Features

**Symptom:** AI adds auth when not requested

**Debug Steps:**
1. Check system prompt is loading
2. Verify CARDINAL RULE section exists

**Solutions:**
```bash
# Check if fix is applied
grep -n "CARDINAL RULE" app/lib/.server/llm/prompts.ts

# Should see line ~90:
🚨 CARDINAL RULE: BUILD ONLY WHAT THE USER EXPLICITLY REQUESTS
```

### Issue #3: Wrong Templates

**Symptom:** express-auth-libsql for e-commerce

**Debug Steps:**
1. Check console for template scores
2. Look for "category-mismatch" penalties
3. Verify penalty is being applied

**Solutions:**
```bash
# Check if fix is applied
grep -n "category-mismatch" app/lib/.server/llm/starter-search.ts

# Should see line ~414:
score *= 0.2; // 80% reduction
matches.push(`category-mismatch:${template.category}`);
```

### Issue #4: Still Hangs at Step 7

**Symptom:** Waits 45 seconds

**Debug Steps:**
1. Check console for "completing action immediately"
2. If not there → Fix not applied
3. Check action-runner.ts

**Solutions:**
```bash
# Check if fix is applied
grep -n "completing action immediately" app/lib/runtime/action-runner.ts

# Should see line ~235:
logger.info('✅ Dev server command started - completing action immediately');
```

---

## 📈 Success Metrics

### All Tests Pass When:

**Issue #1:**
- [ ] 100% of old chats load with files
- [ ] Files appear within 1 second
- [ ] All file contents preserved

**Issue #2:**
- [ ] AI builds ONLY requested features
- [ ] AI asks before adding extras
- [ ] No unwanted auth/comments/etc

**Issue #3:**
- [ ] E-commerce requests → e-commerce templates
- [ ] Blog requests → blog templates
- [ ] Auth templates penalized for non-auth requests

**Issue #4:**
- [ ] Step 7 completes in < 2 seconds
- [ ] Dev servers run in background
- [ ] UI responsive immediately

---

## 📋 Quick Test Checklist

Copy this for manual testing:

```
□ Test 1: Old chat loads with files
□ Test 2: AI builds only requested features
□ Test 3: Correct templates match
□ Test 4: Step 7 completes quickly
□ Test 6: GitHub cloning works

□ Console shows expected logs
□ No TypeScript errors introduced
□ Production build succeeds
□ No regressions in other features
```

---

## 🎯 Acceptance Criteria

**Ready for production when:**
1. All tests in matrix pass
2. No console errors
3. Performance is acceptable
4. User feedback is positive

---

**Testing Duration:** ~30 minutes for complete suite  
**Critical Tests:** Tests 1, 3, 4 (15 minutes)  
**Regression Tests:** All other features (15 minutes)
