# End-to-End Tests for .recoder/ Context Feature

## Test Suite 1: WebContainer Integration

### Test 1.1: Auto-Initialize on First Message
**Steps:**
1. Open fresh project (no .recoder/ directory)
2. Send first message: "create a button"
3. Check WebContainer file system

**Expected:**
- `.recoder/` directory created
- Default files present: `context.md`, `spec.md`, `style-guide.md`
- Files contain default templates

**Verification:**
```javascript
const wc = await webcontainer;
const files = await wc.fs.readdir('.recoder');
console.log('Files:', files);
// Should include: context.md, spec.md, style-guide.md, prompts/
```

### Test 1.2: Context Loading
**Steps:**
1. Edit `.recoder/context.md` with: "Always use TypeScript strict mode"
2. Send message: "create a function"
3. Check AI response

**Expected:**
- AI creates function with TypeScript strict mode
- Response includes `strict: true` or similar

**Verification:**
Check generated code includes TypeScript strict mode configuration.

### Test 1.3: Context Persistence
**Steps:**
1. Edit `.recoder/context.md`
2. Reload page
3. Send message
4. Check if AI still uses context

**Expected:**
- Context persists across page reloads
- AI continues to use project context

---

## Test Suite 2: Settings UI

### Test 2.1: Open Settings Page
**Steps:**
1. Navigate to `/settings/context`
2. Verify page loads

**Expected:**
- Settings page displays
- File list shows all .recoder/ files
- Editor area is visible

### Test 2.2: Edit Context File
**Steps:**
1. Open `/settings/context`
2. Select `context.md`
3. Edit content: "Project uses React 18"
4. Click Save
5. Reload page

**Expected:**
- Content saves successfully
- Content persists after reload
- "Saved successfully!" message appears

### Test 2.3: Switch Between Files
**Steps:**
1. Open `/settings/context`
2. Click `context.md` - verify content loads
3. Click `spec.md` - verify content loads
4. Click `prompts/component.md` - verify content loads

**Expected:**
- Each file loads its content
- No errors in console
- Smooth transitions

### Test 2.4: Load Template
**Steps:**
1. Open `/settings/context`
2. Click "Load Template"
3. Select "Next.js Project"
4. Verify content updates

**Expected:**
- Template content loads
- Files updated with Next.js-specific context
- Can save template content

---

## Test Suite 3: CLI Commands

### Test 3.1: Initialize .recoder/
**Steps:**
```bash
cd test-project
recoder context init
ls -la .recoder/
```

**Expected:**
- `.recoder/` directory created
- Files: `context.md`, `spec.md`, `style-guide.md`, `prompts/component.md`
- Success message displayed

### Test 3.2: Initialize with Template
**Steps:**
```bash
cd test-project
recoder context init --template nextjs
cat .recoder/context.md
```

**Expected:**
- Next.js template content in files
- Mentions "Next.js", "App Router", etc.

### Test 3.3: Edit Context File
**Steps:**
```bash
cd test-project
export EDITOR=nano
recoder context edit context.md
# Edit and save
cat .recoder/context.md
```

**Expected:**
- Editor opens with file content
- Changes persist after save
- File updated on disk

### Test 3.4: List Available Files
**Steps:**
```bash
recoder context edit --list
```

**Expected:**
- Lists all available .recoder/ files
- Shows file paths clearly

---

## Test Suite 4: AI Integration

### Test 4.1: Context in System Prompt
**Steps:**
1. Edit `.recoder/context.md`: "Use camelCase for all variables"
2. Send message: "create a user object"
3. Check generated code

**Expected:**
- Variables use camelCase (e.g., `userName`, not `user_name`)
- AI follows context guidelines

### Test 4.2: Style Guide Enforcement
**Steps:**
1. Edit `.recoder/style-guide.md`: "Always add JSDoc comments"
2. Send message: "create a function to add two numbers"
3. Check generated code

**Expected:**
- Function includes JSDoc comment
- Comment describes parameters and return value

### Test 4.3: Custom Prompts
**Steps:**
1. Edit `.recoder/prompts/component.md`: "Always use functional components with TypeScript"
2. Send message: "create a button component"
3. Check generated code

**Expected:**
- Component is functional (not class)
- Includes TypeScript types
- Follows custom prompt guidelines

### Test 4.4: Multiple Context Files
**Steps:**
1. Edit multiple files:
   - `context.md`: "Project uses Next.js 14"
   - `style-guide.md`: "Use Tailwind CSS"
   - `architecture.md`: "Follow MVC pattern"
2. Send message: "create a user profile page"
3. Check generated code

**Expected:**
- Uses Next.js 14 features
- Includes Tailwind CSS classes
- Follows MVC structure

---

## Test Suite 5: Error Handling

### Test 5.1: Missing .recoder/ Directory
**Steps:**
1. Delete `.recoder/` directory
2. Send message
3. Check behavior

**Expected:**
- No errors
- AI works without context
- Optional: Auto-creates .recoder/ on next message

### Test 5.2: Corrupted Context File
**Steps:**
1. Write invalid content to `.recoder/context.md`
2. Send message
3. Check behavior

**Expected:**
- No crashes
- AI works with partial or no context
- Error logged but not shown to user

### Test 5.3: Large Context File
**Steps:**
1. Create very large `context.md` (>100KB)
2. Send message
3. Check performance

**Expected:**
- Context loads (may be slow)
- AI request succeeds
- No memory issues

---

## Test Suite 6: Performance

### Test 6.1: Context Loading Time
**Steps:**
1. Measure time to load context
2. Send message
3. Check total latency

**Expected:**
- Context loads in <100ms
- Total latency increase <5%

### Test 6.2: Multiple Rapid Messages
**Steps:**
1. Send 5 messages rapidly
2. Check if context loads each time
3. Verify no race conditions

**Expected:**
- All messages use correct context
- No duplicate loads
- No errors

---

## Test Suite 7: Cross-Platform

### Test 7.1: Web → CLI Sync
**Steps:**
1. Edit context in web settings
2. Run CLI command in same project
3. Check if CLI sees changes

**Expected:**
- CLI loads updated context
- Changes from web visible in CLI

### Test 7.2: CLI → Web Sync
**Steps:**
1. Edit context with CLI
2. Reload web IDE
3. Check if web sees changes

**Expected:**
- Web loads updated context
- Changes from CLI visible in web

---

## Automated Test Script

```bash
#!/bin/bash
# Run all E2E tests

echo "🧪 Running .recoder/ E2E Tests..."

# Test 1: CLI Init
echo "Test 1: CLI Init"
cd /tmp/test-project
recoder context init
if [ -d ".recoder" ]; then
  echo "✅ PASS: .recoder/ created"
else
  echo "❌ FAIL: .recoder/ not created"
fi

# Test 2: CLI Edit
echo "Test 2: CLI Edit"
echo "Test content" > .recoder/context.md
if grep -q "Test content" .recoder/context.md; then
  echo "✅ PASS: File edited"
else
  echo "❌ FAIL: File not edited"
fi

# Test 3: Context Loading
echo "Test 3: Context Loading"
# Add web test here

echo "✅ All tests complete!"
```

---

## Manual Testing Checklist

- [ ] Auto-initialize .recoder/ on first message
- [ ] Load context in AI prompts
- [ ] Edit context in settings UI
- [ ] Save context changes
- [ ] Load templates
- [ ] CLI init command
- [ ] CLI edit command
- [ ] Context affects AI responses
- [ ] Style guide enforcement
- [ ] Custom prompts work
- [ ] Error handling (missing files)
- [ ] Performance (context loading time)
- [ ] Cross-platform sync (web ↔ CLI)

---

## Success Criteria

All tests must pass:
- ✅ 100% of core functionality tests
- ✅ 90%+ of edge case tests
- ✅ No critical errors
- ✅ Performance within targets
- ✅ Cross-platform compatibility

---

**Test Status:** Ready to Run  
**Estimated Time:** 2-3 hours for full suite  
**Priority:** High - Required before production deployment
