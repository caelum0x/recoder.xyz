# 🧪 Manual Testing Script - Run Before Launch

## Test Session: [Date: _________] [Tester: _________]

---

## ✅ Test 1: Starter Project Creation

### Steps:
1. Open http://localhost:5173
2. Click "New Project" or similar
3. Select "Next.js" starter
4. Wait for project to load

### Expected Results:
- [ ] Project loads in < 5 seconds
- [ ] File tree shows complete structure
- [ ] All files visible (no "generating..." states)
- [ ] Preview/terminal available

### Actual Results:
```
Time to load: _______
Issues found: _______
```

---

## ✅ Test 2: Multiple Starters

### Steps:
Test these 5 critical starters:

#### 2a. Next.js Blog
- [ ] Select "nextjs-blog-mdx" starter
- [ ] Verify loads instantly
- [ ] Check has blog posts
- [ ] Preview works

#### 2b. React TypeScript
- [ ] Select "react-ts" starter  
- [ ] Verify TypeScript config present
- [ ] Check has example components
- [ ] Preview works

#### 2c. Express API
- [ ] Select "express-typescript" starter
- [ ] Verify has API routes
- [ ] Check has authentication
- [ ] Can start server

#### 2d. Vue 3
- [ ] Select "vue" starter
- [ ] Verify Vue 3 components
- [ ] Check has routing
- [ ] Preview works

#### 2e. Svelte Kit
- [ ] Select "sveltekit" starter
- [ ] Verify SvelteKit structure
- [ ] Check has pages
- [ ] Preview works

---

## ✅ Test 3: GitHub Import

### Steps:
1. Click "Import from GitHub"
2. Enter: `https://github.com/vercel/next.js/tree/canary/examples/blog`
3. Wait for clone
4. Verify file structure

### Expected Results:
- [ ] Clones successfully
- [ ] Complete file structure (compare with GitHub)
- [ ] No missing files
- [ ] No extra/mock files
- [ ] Accurate file contents

### Actual Results:
```
Clone time: _______
File count: _______
Issues: _______
```

---

## ✅ Test 4: Chat & AI Editing

### Steps:
1. Open a Next.js starter
2. In chat, type: "Add a contact form component"
3. Wait for AI response
4. Check file changes

### Expected Results:
- [ ] AI responds in < 10 seconds
- [ ] Creates/modifies only necessary files
- [ ] Code is valid and works
- [ ] Preview updates automatically
- [ ] No unnecessary file regeneration

### Actual Results:
```
Response time: _______
Files modified: _______
Issues: _______
```

---

## ✅ Test 5: File Editing

### Steps:
1. Open any starter
2. Click on a file (e.g., `src/App.tsx`)
3. Edit the file (change some text)
4. Save
5. Check preview updates

### Expected Results:
- [ ] File opens instantly
- [ ] Editor has syntax highlighting
- [ ] Can edit freely
- [ ] Save works
- [ ] Preview hot-reloads

### Actual Results:
```
Issues: _______
```

---

## ✅ Test 6: Deploy to Vercel (CRITICAL)

### Prerequisites:
- Get Vercel token from: https://vercel.com/account/tokens

### Steps:
1. Open any starter project
2. Click "Deploy" button (green button in header)
3. Select "Vercel"
4. Enter your Vercel API token
5. Enter project name: `test-deploy-[your-name]`
6. Click "Deploy Now"
7. Wait for deployment

### Expected Results:
- [ ] Modal opens without errors
- [ ] Token input works
- [ ] Token saves to localStorage
- [ ] Deployment starts
- [ ] Progress shown (uploading, building, deploying)
- [ ] Success message with URL
- [ ] URL opens and works
- [ ] Deployment visible in Vercel dashboard

### Actual Results:
```
Deployment time: _______
URL: _______
Issues: _______
```

### Test Token Persistence:
1. Deploy again with different project
2. Token should be pre-filled
- [ ] Token remembered from localStorage

---

## ✅ Test 7: Deploy to Netlify

### Prerequisites:
- Get Netlify token from: https://app.netlify.com/user/applications

### Steps:
1. Open any starter project
2. Click "Deploy" button
3. Select "Netlify"
4. Enter your Netlify API token
5. Enter project name: `test-deploy-netlify-[your-name]`
6. Click "Deploy Now"
7. Wait for deployment

### Expected Results:
- [ ] Same as Test 6 but for Netlify
- [ ] Deployment succeeds
- [ ] URL works

### Actual Results:
```
Deployment time: _______
URL: _______
Issues: _______
```

---

## ✅ Test 8: Error Handling

### 8a. Invalid GitHub URL
1. Try to import: `https://github.com/invalid/repo`
- [ ] Shows clear error message
- [ ] Doesn't crash
- [ ] Can retry

### 8b. Invalid Deploy Token
1. Try to deploy with token: `invalid_token_123`
- [ ] Shows "Invalid token" error
- [ ] Provides help link
- [ ] Doesn't crash

### 8c. Network Offline
1. Disconnect internet
2. Try to deploy
- [ ] Shows offline error
- [ ] Graceful handling

---

## ✅ Test 9: Performance

### 9a. Starter Load Time
Test 5 different starters, measure load time:
- Next.js: _____ seconds
- React: _____ seconds
- Vue: _____ seconds
- Express: _____ seconds
- Svelte: _____ seconds

**Target: < 5 seconds each**

### 9b. GitHub Clone Time
Clone `https://github.com/vercel/next.js/tree/canary/examples/blog`
- Time: _____ seconds

**Target: < 30 seconds**

### 9c. Deployment Time
Deploy to Vercel:
- Time: _____ seconds

**Target: < 60 seconds**

---

## ✅ Test 10: Browser Compatibility

Test in multiple browsers:

### Chrome
- [ ] All features work
- [ ] No console errors
- [ ] Deploy works

### Firefox
- [ ] All features work
- [ ] No console errors
- [ ] Deploy works

### Safari
- [ ] All features work
- [ ] No console errors
- [ ] Deploy works

### Edge
- [ ] All features work
- [ ] No console errors
- [ ] Deploy works

---

## ✅ Test 11: Mobile Responsive (Optional for MVP)

Test on mobile device or resize browser:

- [ ] Layout doesn't break
- [ ] Buttons are clickable
- [ ] Text is readable
- [ ] File tree usable

---

## ✅ Test 12: Long Session Stability

### Steps:
1. Leave app open for 30 minutes
2. Switch between 5 different starters
3. Make edits to files
4. Deploy 2 projects
5. Import 1 GitHub repo

### Expected Results:
- [ ] No memory leaks
- [ ] No crashes
- [ ] No slowdowns
- [ ] All features still work

---

## 🚨 CRITICAL BUGS (Must Fix Before Launch)

Found any bugs that BLOCK launch? List here:

1. _________________________________
2. _________________________________
3. _________________________________

---

## ⚠️ IMPORTANT BUGS (Should Fix Soon)

Found bugs that are annoying but not blocking?

1. _________________________________
2. _________________________________
3. _________________________________

---

## 💡 IMPROVEMENTS NOTICED

Any UX improvements or feature ideas?

1. _________________________________
2. _________________________________
3. _________________________________

---

## ✅ FINAL VERDICT

### Can we launch? (Check one)

- [ ] ✅ YES - Everything works, ready to launch
- [ ] ⚠️ ALMOST - Fix critical bugs first (list above)
- [ ] ❌ NO - Major issues found, needs more work

### Tester Notes:
```
_________________________________
_________________________________
_________________________________
```

### Tester Signature: _________________ Date: _________

---

**Next Step:** If all tests pass, proceed to launch checklist!
