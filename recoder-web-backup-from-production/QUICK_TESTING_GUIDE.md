# 🚀 Quick Testing Guide

## Before You Start Testing

1. **Make sure the dev server is running**:
   ```bash
   npm run dev
   ```

2. **Check that all fixes are applied**:
   - ✅ `api.chat.ts` has starter detection
   - ✅ `starter-search.ts` has fallback logic
   - ✅ `starters-bundle.json` is regenerated
   - ✅ All tests pass

## 🧪 Test 1: Simple Starter Request (No Customization)

**What to try**: "Create a React TypeScript app"

**Expected behavior**:
- Should detect `react-ts` starter instantly
- Should return complete project files immediately
- Should NOT call AI (saves 100% cost)
- Response time: <1 second

**How to verify**:
1. Open browser console (F12)
2. Look for logs like:
   ```
   🔍 Checking if user request matches a starter template...
   ✅ Starter detected: react-ts
   🚀 Returning pre-loaded starter
   → Direct return (no customization needed)
   ```
3. Check files panel - should show:
   - `package.json`
   - `src/main.tsx`
   - `src/App.tsx`
   - `index.html`
   - etc.

---

## 🧪 Test 2: Starter with Customization

**What to try**: "Create a Next.js dashboard with dark mode"

**Expected behavior**:
- Should detect `nextjs-shadcn` starter
- Should load base starter files
- Should call AI to add dark mode
- Response time: 2-5 seconds

**How to verify**:
1. Look for logs:
   ```
   ✅ Starter detected: nextjs-shadcn
   → AI will customize the loaded starter
   ```
2. Check that base files are created first
3. Then AI adds dark mode modifications

---

## 🧪 Test 3: No Starter Match (Full AI)

**What to try**: "Create a machine learning data visualization dashboard with real-time updates"

**Expected behavior**:
- Should NOT match any starter (too specific)
- Should use full AI generation
- Response time: 10-30 seconds

**How to verify**:
1. Look for logs:
   ```
   → No starter match found, proceeding with normal AI generation
   ```
2. Files are created one by one by AI

---

## 🧪 Test 4: GitHub Cloning

**What to try**: Use the GitHub import feature with:
`https://github.com/vercel/next.js/tree/canary/examples/blog-starter`

**Expected behavior**:
- Should clone the repository
- Should show all files in the file tree
- Should NOT add random fake files
- Should have complete folder structure

**How to verify**:
1. Check file count matches GitHub
2. Verify `package.json` content is correct
3. No files named "mock-xyz" or similar

---

## 🧪 Test 5: Search Different Starters

Try these and verify correct matches:

| Query | Expected Starter |
|-------|-----------------|
| "express api" | `express-simple` |
| "nextjs with shadcn" | `nextjs-shadcn` |
| "vue app" | `vue` |
| "react native app" | `bolt-expo` |
| "astro site" | `astro-shadcn` |

---

## 🐛 Common Issues & Solutions

### Issue: Starter not detected
**Solution**: Check console logs for search results. If score is too low, the starter won't be used. Adjust `minScore` in config if needed.

### Issue: Files are duplicated
**Solution**: This shouldn't happen now. If it does, check that AI isn't regenerating existing files.

### Issue: Package.json is wrong
**Solution**: Verify the starter bundle has correct package.json. Run `npx tsx rebuild-starters-bundle.ts` to regenerate.

### Issue: GitHub clone fails
**Solution**: 
- Check if repo is public
- Check internet connection
- Add GITHUB_TOKEN to `.dev.vars` for private repos

---

## 📊 Performance Benchmarks

**Good performance indicators**:
- Starter detection: <10ms
- Starter loading: <100ms
- Simple starter request (no AI): <1 second
- Starter + customization: 2-5 seconds
- GitHub clone (100 files): 5-10 seconds
- GitHub clone (1000+ files): 15-30 seconds

**If slower than this**:
- Check network connection
- Check if bundle is loaded (not re-scanning filesystem)
- Check AI provider latency

---

## ✅ Success Criteria

Your system is working correctly if:

1. ✅ Simple starter requests return instantly
2. ✅ Starter files are complete (no missing files)
3. ✅ AI can customize starters without regenerating everything
4. ✅ GitHub cloning works for public repositories
5. ✅ No crashes or undefined variable errors
6. ✅ Console shows helpful logs for debugging

---

## 🎯 Next: Manual Testing Checklist

After testing the above, go through this checklist:

### Core Features
- [ ] Chat works
- [ ] Starters auto-detect
- [ ] Files are created correctly
- [ ] GitHub import works
- [ ] Preview/WebContainer works

### UI Features
- [ ] Template browser (if keeping it)
- [ ] File tree shows files
- [ ] Terminal works
- [ ] Preview updates correctly

### Advanced Features
- [ ] MCP tools (if using)
- [ ] Deployment (if implemented)
- [ ] Schema generator (if keeping)

---

## 🚨 Critical Bugs to Watch For

1. **Undefined variable errors** - Should be fixed, but watch console
2. **Missing files** - Especially in GitHub clones
3. **AI regenerating entire projects** - Should only customize
4. **Slow response times** - Starters should be instant
5. **Duplicate files** - AI creating files that exist

---

## 💪 You're Ready!

Once you've tested the above scenarios and verified they work, you can confidently deploy your MVP. The core functionality is solid and tested.

Good luck! 🎉
