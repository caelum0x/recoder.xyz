# 🧪 Beta Launch Testing Guide
**Date:** January 19, 2025
**Platform:** Recoder.xyz FREE BETA
**Status:** Ready to Test

---

## 📋 Testing Checklist

### Test 1: Complete User Journey (15 minutes)

#### Step 1: Signup & Email Verification
**What to test:**
- [ ] User signup flow
- [ ] Email delivery (welcome + verification)
- [ ] Email content looks professional

**How to test:**
```bash
1. Open: http://localhost:3000/auth/signup
2. Sign up with: YOUR_EMAIL@gmail.com
3. Check your Gmail inbox for 2 emails:
   ✓ Welcome email from Recoder.xyz
   ✓ Temporary password email
   ✓ Email verification link (if using Better Auth)

Expected result:
✓ Account created successfully
✓ Emails arrive within 1 minute
✓ Emails are properly formatted (no broken images/links)
✓ From address shows "Recoder.xyz <noreply@recoder.xyz>"
```

**Screenshots to take:**
- [ ] Signup form
- [ ] Success message
- [ ] Welcome email in inbox
- [ ] Temporary password email

---

#### Step 2: First Login & Onboarding
**What to test:**
- [ ] Login with temporary password
- [ ] Onboarding flow (4 steps)
- [ ] Progress bar animation

**How to test:**
```bash
1. Go to: http://localhost:3000/auth/signin
2. Sign in with email + temporary password from email
3. Should redirect to: http://localhost:3000/onboarding

Expected onboarding flow:
✓ Step 1: Welcome screen with FREE BETA badge
✓ Step 2: User preferences (use case, experience, models)
✓ Step 3: API key setup (OpenRouter recommended)
✓ Step 4: Completion screen with CLI instructions
✓ Progress bar shows 25% → 50% → 75% → 100%
```

**Test both paths:**
- [ ] Path A: Skip onboarding → Goes to dashboard
- [ ] Path B: Complete onboarding → Goes to dashboard with welcome banner

---

#### Step 3: Dashboard Check
**What to test:**
- [ ] Dashboard loads properly
- [ ] Beta user banner visible
- [ ] No "Upgrade" buttons anywhere
- [ ] Quick actions work

**How to test:**
```bash
1. Should be at: http://localhost:3000/dashboard
2. Check for:
   ✓ "🎉 You're a Beta User!" banner (green/blue gradient)
   ✓ "Manage API Keys" button (green)
   ✓ "Give Feedback" button (GitHub link)
   ✓ Quick actions: Projects, API Keys, Usage, Docs
   ✓ Platform cards: Web IDE, CLI, Chat
```

**What should NOT be there:**
- ❌ "Upgrade to Pro" section
- ❌ "Premium Features" locked behind paywall
- ❌ Any pricing mentions on dashboard

---

#### Step 4: API Key Setup
**What to test:**
- [ ] Settings page loads
- [ ] Can add/save API keys
- [ ] Keys are validated
- [ ] Encryption works

**How to test:**
```bash
1. Click "Manage API Keys" or go to:
   http://localhost:3000/settings/ai-providers

2. Add a test API key (OpenRouter):
   - Provider: OpenRouter
   - API Key: sk-or-v1-test123 (fake key for UI test)
   - Click "Test Connection" (should fail with invalid key - that's okay!)
   - Click "Save" anyway (for UI testing)

Expected result:
✓ Form accepts input
✓ Validation shows error for invalid key (expected)
✓ Can still save for testing purposes
✓ Keys show in list after saving
✓ Can delete keys
```

**Important:** Use a REAL API key if you want to test AI features next!

---

#### Step 5: Launch Web IDE
**What to test:**
- [ ] Session sharing works (logged in state persists)
- [ ] Web IDE loads without re-login
- [ ] UI is responsive

**How to test:**
```bash
1. From dashboard, click "Launch Web IDE" button
2. Should redirect to: http://localhost:5173 (Web IDE)

Expected result:
✓ Redirects without asking for login again
✓ Web IDE loads in ~2-3 seconds
✓ Shows chat interface on left
✓ Shows file explorer, editor, terminal layout
✓ Terminal is collapsed by default
```

---

#### Step 6: Create Project & Test Auto-Preview
**What to test:**
- [ ] AI code generation works (if you have API key)
- [ ] npm install runs automatically
- [ ] Terminal auto-shows with orange glow
- [ ] Progress feedback appears
- [ ] npm run dev starts automatically
- [ ] Preview iframe loads

**How to test:**
```bash
1. In Web IDE, type in chat:
   "Create a simple React app with Vite"

2. Press Enter or click Send

Expected behavior (if API key is valid):
✓ AI generates code (creates package.json, index.html, App.jsx, etc.)
✓ Files appear in file explorer on left
✓ npm install starts AUTOMATICALLY (no manual command needed)
✓ Terminal expands AUTOMATICALLY with orange glow
✓ Progress shows: "📦 Installing react...", "✅ Installed 47 packages"
✓ After install completes, npm run dev starts AUTOMATICALLY
✓ Preview iframe appears on right showing "Vite + React" app
✓ Can see app running at http://localhost:5173

If API key is NOT set:
⚠️ Chat will show error: "Please add API key in Settings"
→ This is expected! Go back and add a real API key to test this.
```

**Screenshots to take:**
- [ ] Chat with AI response
- [ ] Terminal showing orange glow + "New Output ⚡" badge
- [ ] Progress: "📦 Installing react..."
- [ ] Preview iframe with running app

---

#### Step 7: Terminal Features
**What to test:**
- [ ] Multiple terminal tabs work
- [ ] Terminal auto-shows for any shell command
- [ ] Visual feedback (orange glow) works
- [ ] Can manually run commands

**How to test:**
```bash
1. In Web IDE terminal (should be auto-open from previous test)
2. Try these commands:
   - ls (list files)
   - pwd (print working directory)
   - echo "test" (echo test)

Expected result:
✓ Commands execute immediately
✓ Output appears in terminal
✓ No "command not found" errors for basic commands
✓ Terminal header glows orange when new output arrives
✓ "New Output ⚡" badge appears briefly

3. Click "+" button to create new terminal tab:
✓ Can create up to 3 terminal tabs
✓ Can switch between tabs
✓ Each tab maintains its own session
```

---

#### Step 8: File Operations
**What to test:**
- [ ] Can create/edit files
- [ ] Can save changes
- [ ] File tree updates
- [ ] Unsaved indicator works

**How to test:**
```bash
1. In file explorer, click on "App.jsx" (or any file)
2. Edit the file:
   - Change some text
   - Notice "•" (dot) appears next to filename (unsaved indicator)
3. Press Cmd+S (Mac) or Ctrl+S (Windows) to save
   - Dot should disappear
4. Click "Reset" button if you want to undo changes
5. Try creating a new file:
   - Right-click in file tree (if context menu exists)
   - OR use AI: "Create a new file called utils.js"

Expected result:
✓ Can edit files smoothly
✓ Syntax highlighting works
✓ Save/Reset buttons work
✓ Unsaved indicator (•) shows correctly
```

---

### Test 2: CLI Integration (10 minutes)

#### Prerequisites:
- [ ] Have Node.js installed
- [ ] Have npm or pnpm

#### Step 1: Install CLI
```bash
cd /Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/cli
npm link
```

Expected result:
✓ CLI installs globally
✓ Can run `recoder` command

---

#### Step 2: CLI Login
```bash
recoder login
```

Expected result:
✓ Opens browser to authorize
✓ Shows device code (6-character code)
✓ After authorizing in browser, CLI says "✓ Logged in successfully"
✓ Auth token saved locally

---

#### Step 3: List Web Projects
```bash
recoder web list
```

Expected result:
✓ Shows projects created in Web IDE
✓ Displays project ID, name, last modified
✓ If no projects yet, shows empty list (expected)

---

#### Step 4: Download Project
```bash
# First create a project in Web IDE (Test 6 above)
# Then download it:
recoder web download <project-id>

# Example:
# recoder web download abc-123-def
```

Expected result:
✓ Downloads project files to local directory
✓ Creates folder with project name
✓ All files present (package.json, src/, etc.)

---

#### Step 5: Make Changes & Sync
```bash
cd <downloaded-project>
# Edit some files with your local editor (VS Code, etc.)
# Then sync back to web:
recoder web sync
```

Expected result:
✓ Shows diff of changes
✓ Asks for confirmation
✓ Uploads changes to web
✓ Can see changes in Web IDE after refresh

---

### Test 3: OAuth Login (5 minutes)

#### Test GitHub OAuth
```bash
1. Sign out from Recoder.xyz
2. Go to: http://localhost:3000/auth/signin
3. Click "Sign in with GitHub"

Expected result:
✓ Redirects to GitHub OAuth page
✓ Shows app permissions request
✓ After authorizing, returns to Recoder.xyz
✓ Lands on dashboard (logged in)
✓ Session persists across refreshes
```

#### Test Google OAuth
```bash
1. Sign out again
2. Click "Sign in with Google"

Expected result:
✓ Same flow as GitHub
✓ Works smoothly
```

---

### Test 4: Landing Page & Marketing (5 minutes)

#### Check Landing Page
```bash
1. Open incognito/private window
2. Go to: http://localhost:3000

Check for:
✓ "🎉 FREE BETA - No Credit Card Required" badge visible
✓ Headline: "Build with AI - Bring Your Own Key"
✓ "Get Started Free" CTA button
✓ No pricing mentions on hero section
✓ "Why BYOK?" section explains model
✓ Example costs shown ($0.01 per chat)
✓ Footer links work (Docs, Pricing, etc.)
```

#### Check Pricing Page
```bash
1. Go to: http://localhost:3000/pricing

Check for:
✓ "Pricing Coming Soon" headline
✓ "Everything is Free!" during beta
✓ BYOK explanation
✓ Example costs: $0.01/chat, $5 = 500+ requests
✓ Transparency about future pricing
✓ "Get Started Free" CTA
```

#### Check Documentation
```bash
1. Go to: http://localhost:3000/docs

Check for:
✓ Docs hub page loads
✓ Links to Getting Started, FAQ, BYOK, etc.
✓ All doc pages load without errors
✓ Code examples are readable
✓ Navigation works
```

---

## ✅ Success Criteria

### Must Pass (Blockers):
- [ ] User can sign up successfully
- [ ] Emails are delivered
- [ ] User can log in
- [ ] Dashboard loads without errors
- [ ] Web IDE loads and session shares
- [ ] Can add API keys
- [ ] Landing page shows FREE BETA messaging

### Should Pass (Important):
- [ ] Onboarding flow works smoothly
- [ ] AI code generation works (with valid API key)
- [ ] Terminal auto-shows with visual feedback
- [ ] npm run dev starts automatically
- [ ] Preview appears in iframe
- [ ] CLI login and sync work

### Nice to Have (Polish):
- [ ] Animations are smooth
- [ ] No console errors
- [ ] Mobile responsive (test on phone)
- [ ] OAuth providers work

---

## 🐛 Bug Reporting Template

If you find bugs during testing, use this format:

```markdown
**Bug:** [Short description]
**Severity:** Critical / High / Medium / Low
**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected:** [What should happen]
**Actual:** [What actually happened]
**Screenshot:** [If applicable]
**Console Errors:** [If any]
```

---

## 📊 Testing Results

Fill this out as you test:

### Test 1: User Journey
- [ ] PASS / FAIL - Signup & Email
- [ ] PASS / FAIL - Onboarding
- [ ] PASS / FAIL - Dashboard
- [ ] PASS / FAIL - API Keys
- [ ] PASS / FAIL - Web IDE Launch
- [ ] PASS / FAIL - Auto-Preview
- [ ] PASS / FAIL - Terminal Auto-Show
- [ ] PASS / FAIL - File Operations

### Test 2: CLI Integration
- [ ] PASS / FAIL - CLI Install
- [ ] PASS / FAIL - CLI Login
- [ ] PASS / FAIL - List Projects
- [ ] PASS / FAIL - Download Project
- [ ] PASS / FAIL - Sync Changes

### Test 3: OAuth
- [ ] PASS / FAIL - GitHub OAuth
- [ ] PASS / FAIL - Google OAuth

### Test 4: Marketing Pages
- [ ] PASS / FAIL - Landing Page
- [ ] PASS / FAIL - Pricing Page
- [ ] PASS / FAIL - Documentation

---

## 🚀 After Testing

Once all critical tests pass:

1. **Document Issues:** List any bugs found
2. **Fix Critical Bugs:** Must fix before launch
3. **Deploy to Production:** Vercel/Railway
4. **Invite Beta Testers:** 5-10 friends first
5. **Public Launch:** Reddit, Twitter, Indie Hackers

---

## 📝 Notes Section

Use this space for testing notes:

```
[Your testing notes here]
- Found issue with...
- Works great on...
- Need to improve...
```

---

**Ready to launch after testing!** 🎉
