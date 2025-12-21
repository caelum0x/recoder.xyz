# ⚡ Test Fixes Now - Quick Guide

**Time**: 5 minutes  
**All 3 fixes implemented** ✅

---

## 🚀 START TESTING (1 minute)

```bash
# Make sure you're in the right directory
cd /Users/arhansubasi/recoder.xyz/recoder-web

# Start dev server
npm run dev
```

Wait for: `http://localhost:5173`

---

## 🧪 TEST #1: Blog Template (2 min)

### Steps
1. Open: http://localhost:5173
2. Open browser DevTools (F12)
3. Go to Console tab
4. In chat, type: **"Create a blog"**
5. Watch console output

### What to Look For ✅

**Good Signs**:
```
🔍 Checking if user request matches a starter template...
✅ Starter detected: BlogApp
📦 Importing starter template: BlogApp
✅ Starter template imported successfully: BlogApp
```

**In UI**:
- Files appear in left sidebar
- File count: **Should be around 15-20 files** (from template)
- **NOT** 50+ files being generated one by one

**If this works**: Fix #1 is successful! 🎉

---

## 🧪 TEST #2: GitHub Clone (2 min)

### Steps
1. In chat, type: **"Clone https://github.com/vercel/next.js/tree/canary/examples/blog"**
2. Watch console output

### What to Look For ✅

**Good Signs**:
```
🔀 GitHub URL detected: https://github.com/vercel/next.js/tree/canary/examples/blog
🔄 Cloning GitHub repository: [url]
✅ Repository cloned: X files
🔒 File generation locked - repository cloned
```

**If AI tries to generate files after**:
```
⚠️ Skipping file action for '...' - Repository already cloned
```
↑ This is GOOD! It means Fix #3 is working.

**In UI**:
- Files from GitHub appear
- Check package.json → Should match actual GitHub repo
- **NO** AI-generated helper files

**If this works**: Fixes #2 and #3 are successful! 🎉

---

## 🧪 OPTIONAL TEST #3: Next.js + Shadcn

### Steps
1. In chat, type: **"Build a Next.js app with Shadcn UI"**
2. Watch console

### Expected ✅
```
✅ Starter detected: nextjs-shadcn
📦 Importing starter template: nextjs-shadcn
```

**Result**: Complete Next.js + Shadcn setup in seconds

---

## ✅ SUCCESS CHECKLIST

After testing, you should have:

- [ ] Saw decision tree working (starters used)
- [ ] GitHub URL detected before AI
- [ ] Repository cloned without extra files
- [ ] File count <20 for template projects
- [ ] Fast response time (~5s)
- [ ] Console logs show new emojis (🔀, 📦, 🔒)

---

## ❌ IF SOMETHING DOESN'T WORK

### Starter Not Used

**Check**: Does console show "✅ Starter detected"?

- **NO**: Starter detection didn't match
  - Solution: Try exact phrase: "Create a blog"
  - Check: `detectAndPrepareStarter` in api.chat.ts

- **YES but no import**: AI didn't follow instructions
  - Check: AI model might need different temperature
  - Try: Different phrasing or model

### GitHub Clone Issues

**Check**: Does console show "🔀 GitHub URL detected"?

- **NO**: Detection function not working
  - Check: `detectGitHubUrl` in api.chat.ts
  - Try: Full URL with https://

- **YES but files mixed**: Check for "🔒 File generation locked"
  - Should see "⚠️ Skipping file action" for any file attempts
  - If not, check `#repositoryCloned` flag in action-runner.ts

---

## 🐛 DEBUGGING COMMANDS

### Check if fixes are in place

```bash
# Check Fix #1: Decision tree in prompt
grep -n "critical_decision_tree" app/lib/.server/llm/prompts.ts
# Should show line number

# Check Fix #2: GitHub detection function
grep -n "detectGitHubUrl" app/routes/api.chat.ts
# Should show line number

# Check Fix #3: Repository cloned flag
grep -n "#repositoryCloned" app/lib/runtime/action-runner.ts
# Should show line number
```

### View system prompt

```bash
# See what AI actually receives
head -100 app/lib/.server/llm/prompts.ts
# First 100 lines should include critical_decision_tree
```

---

## 📊 EXPECTED CONSOLE OUTPUT

### Successful Blog Creation
```
🔍 Checking if user request matches a starter template...
✅ Starter detected: BlogApp (confidence: 0.90)
🚀 Returning pre-loaded starter
📦 Importing starter template: BlogApp
   Reason: User wants a blog application
✅ Starter template loaded: 18 files
✅ Starter template imported successfully: BlogApp
```

### Successful GitHub Clone
```
🔀 GitHub URL detected: vercel/next.js/tree/canary/examples/blog
🔄 Cloning GitHub repository: vercel/next.js
   Reason: User requested to clone this repository
✅ Repository cloned: 12 files
🔒 File generation locked - repository cloned. AI should not generate additional files.
```

---

## 🎯 QUICK VERIFICATION

Run this in browser console after testing:

```javascript
// Check if template or clone was used
const messages = document.querySelectorAll('[data-message-role="assistant"]');
const lastMessage = messages[messages.length - 1]?.textContent || '';

console.log('=== VERIFICATION ===');
console.log('Used importStarter?', lastMessage.includes('importStarter'));
console.log('Used cloneGitHub?', lastMessage.includes('cloneGitHub'));
console.log('File count:', document.querySelectorAll('[data-file-path]').length);
```

---

## 💡 TIPS

### For Best Results

1. **Use exact phrases** for first test:
   - "Create a blog"
   - "Clone https://github.com/vercel/next.js/tree/canary/examples/blog"
   - "Build a Next.js app with Shadcn UI"

2. **Watch the console** - all the action is logged there

3. **Count files** - templates should have <20 files

4. **Check package.json** - should match template/GitHub repo

5. **Response time** - should be fast (~5s vs 30s+)

---

## 🚀 AFTER TESTING

### If All Tests Pass ✅

**You're done!** The fixes are working.

**Optional**: Try other phrases:
- "Make an API with authentication"
- "Create a React TypeScript app"
- "Clone facebook/react"

### If Tests Fail ❌

1. Check browser console for errors
2. Check server console (terminal) for errors
3. Verify files were actually modified:
   ```bash
   git diff app/lib/.server/llm/prompts.ts
   git diff app/routes/api.chat.ts
   git diff app/lib/runtime/action-runner.ts
   ```
4. Try restarting dev server: `npm run dev`

---

## 📞 TROUBLESHOOTING

**Problem**: Server won't start
```bash
# Check for syntax errors
npm run typecheck
```

**Problem**: No console logs appearing
```bash
# Make sure console is showing all logs
# Click "All levels" in DevTools Console filter
```

**Problem**: Changes not visible
```bash
# Hard refresh browser
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

---

**Ready to test!** 🚀

Start with TEST #1 (Blog Template) - should take 2 minutes.
