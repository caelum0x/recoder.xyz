# 🚀 Beta Launch Testing Guide
## Recoder.xyz - FREE BETA with BYOK

This guide outlines the complete testing workflow before launching the FREE BETA.

---

## ✅ Completed Work

### 1. **Payment/Subscription UI Hidden** ✅
- All 10 billing pages replaced with "Coming Soon"
- Settings page shows "Beta" instead of "Pro"
- Clear FREE BETA messaging throughout

### 2. **API Key Management** ✅
- Full UI at `/settings/ai-providers`
- Backend API with AES-256-GCM encryption
- Supports: OpenRouter, Anthropic, OpenAI, Groq

### 3. **Auth Routing Fixed** ✅
- Infinite loop issue resolved
- Cross-domain redirects working
- Signin/signup support both `redirect` and `return` params

### 4. **Onboarding Flow** ✅
- Comprehensive 4-step onboarding
- BYOK messaging and education
- Provider comparison with pricing

### 5. **Web ↔ CLI Integration** ✅
- `/api/projects` endpoint fetches from Web IDE
- `/projects` page with CLI commands
- All CLI commands implemented (`list`, `download`, `open`, `sync`)
- CLI builds successfully

### 6. **CLI Documentation Page** ✅
- Updated `/cli` page with FREE BETA messaging
- Correct npm package name (`recoder-code`)
- Web ↔ CLI workflow highlighted
- Command reference with copy buttons

---

## 🧪 Pre-Launch Testing Checklist

### **Phase 1: Authentication Testing** (15 minutes)

#### Test 1.1: Main App Authentication
```bash
# 1. Open browser to http://localhost:3000
# 2. Click "Sign Up"
# 3. Create account with email/password OR GitHub/Google
# Expected: Redirect to /dashboard or /onboarding
```

#### Test 1.2: Web IDE Authentication
```bash
# 1. Visit http://localhost:5173 (or your recoder-web URL)
# 2. Should redirect to main app signin
# 3. Sign in
# 4. Should redirect back to Web IDE
# Expected: No infinite loop, successful access to Web IDE
```

#### Test 1.3: Cross-Platform Session
```bash
# 1. Sign in at main app (localhost:3000)
# 2. Open Web IDE (localhost:5173) in same browser
# Expected: Already authenticated, no signin required
```

---

### **Phase 2: API Key Management** (10 minutes)

#### Test 2.1: Add API Key
```bash
# 1. Go to /settings/ai-providers
# 2. Click "Add API Key"
# 3. Select provider (OpenRouter recommended)
# 4. Paste API key
# 5. Click "Save"
# Expected: Key saved, shows masked version (sk-or-v1-***)
```

#### Test 2.2: Key Validation
```bash
# 1. Try adding invalid API key (random string)
# Expected: Error message about invalid format
```

#### Test 2.3: Delete API Key
```bash
# 1. Click delete on existing key
# Expected: Key removed from list
```

---

### **Phase 3: Web IDE Project Creation** (10 minutes)

#### Test 3.1: Create Project
```bash
# 1. Go to Web IDE (localhost:5173 or web.recoder.xyz)
# 2. Start a new chat
# 3. Type: "Create a React todo app"
# 4. Wait for AI response
# Expected: Code generated, files shown in file tree
```

#### Test 3.2: View in My Projects
```bash
# 1. Go to /projects in main app
# 2. Should see the project you just created
# Expected: Project listed with correct file count and message count
```

---

### **Phase 4: CLI Integration** (20 minutes)

#### Test 4.1: CLI Installation
```bash
# In terminal:
npm install -g recoder-code

# Verify installation:
recoder --version
# Expected: Shows version number
```

#### Test 4.2: CLI Authentication
```bash
recoder auth login

# This will:
# 1. Show a device code
# 2. Open browser to authorize
# 3. Sign in if not already signed in
# 4. Approve device

# Expected: "✓ Authentication successful"
```

#### Test 4.3: List Web Projects
```bash
recoder web list

# Expected: Shows table of your web projects with:
# - URL ID
# - Description
# - File count
# - Message count
```

#### Test 4.4: Download Project
```bash
# Copy a URL ID from the list above, then:
recoder web download <paste-urlId-here>

# Example:
# recoder web download c1h5v2m9-1732632478

# Expected:
# - Creates folder with project files
# - Shows "✓ Downloaded X files"
```

#### Test 4.5: Verify Downloaded Files
```bash
cd downloaded-project
ls -la

# Expected: All project files present
# Try running the project if applicable:
# npm install
# npm run dev
```

#### Test 4.6: Open in Browser
```bash
recoder web open <urlId>

# Expected: Opens browser to web.recoder.xyz/chat/<urlId>
```

---

### **Phase 5: Onboarding Flow** (10 minutes)

#### Test 5.1: New User Onboarding
```bash
# 1. Sign out
# 2. Create NEW account
# 3. Should see onboarding flow OR redirect to /onboarding
# 4. Complete all steps:
#    - Welcome (click "Get Started")
#    - Preferences (select use case, experience, models)
#    - API Key setup (optionally add key)
#    - Complete (see CLI instructions if selected)
# Expected: Smooth flow, redirects to /dashboard?welcome=true
```

---

### **Phase 6: Edge Cases & Error Handling** (15 minutes)

#### Test 6.1: Unauthenticated Access
```bash
# Open private/incognito window
# Try to access:
# - /dashboard
# - /projects
# - /settings/ai-providers
# Expected: All redirect to /auth/signin
```

#### Test 6.2: CLI Without Authentication
```bash
# In terminal (sign out first if needed):
recoder auth logout
recoder web list

# Expected: Error message "❌ Not authenticated. Run: recoder auth login"
```

#### Test 6.3: Web IDE Without API Key
```bash
# 1. Remove all API keys from /settings/ai-providers
# 2. Try using Web IDE to generate code
# Expected: Error or prompt to add API key
```

#### Test 6.4: Invalid Project ID
```bash
recoder web download invalid-id-12345

# Expected: Error message "Project not found"
```

---

## 🔍 What to Check

### Visual Checks
- [ ] No "Upgrade to Pro" buttons visible anywhere
- [ ] All billing/pricing pages show "Coming Soon"
- [ ] FREE BETA badges prominent on key pages
- [ ] No broken links (especially to /pricing)

### Functional Checks
- [ ] Authentication works across main app and Web IDE
- [ ] API keys can be added, viewed (masked), and deleted
- [ ] Web IDE projects appear in /projects
- [ ] CLI can authenticate and list projects
- [ ] CLI can download project files successfully
- [ ] Copy buttons work on CLI page and My Projects page
- [ ] Onboarding flow is smooth and informative

### Performance Checks
- [ ] Page load times < 2 seconds
- [ ] API responses < 1 second
- [ ] CLI commands respond quickly
- [ ] No console errors in browser

---

## 🐛 Known Issues / Limitations

1. **CLI Build Warnings**: Some non-critical packages (vscode-extension, mcp-eternos) have build errors, but main CLI works fine.
2. **Push/Sync Commands**: `recoder web push` and `recoder web sync` may need additional testing for two-way sync.
3. **Environment Variables**: Make sure `.env` files are properly configured for production URLs.

---

## 🚀 Launch Readiness Checklist

- [ ] All Phase 1-6 tests pass
- [ ] Visual checks completed
- [ ] Functional checks completed
- [ ] Performance checks completed
- [ ] Production environment variables set
- [ ] Database migrations run
- [ ] SSL certificates valid
- [ ] Domain DNS configured
- [ ] Error tracking setup (Sentry, etc.)
- [ ] Analytics configured
- [ ] Backup strategy in place

---

## 🎯 Success Criteria

Before declaring the beta launch ready:

1. **✅ Core Flow Works**: Signup → Add API Key → Use Web IDE → Download via CLI
2. **✅ No Critical Bugs**: No auth loops, no data loss, no broken core features
3. **✅ Clear Messaging**: Users understand it's FREE BETA with BYOK
4. **✅ Documentation**: CLI page, onboarding, and help text are clear
5. **✅ Performance**: Acceptable load times and response times

---

## 📞 Support Channels

Prepare these before launch:
- Discord community
- GitHub issues
- Email support (support@recoder.xyz)
- Status page

---

## 🎉 Launch Day Tasks

1. **Announcement Posts**:
   - Twitter/X
   - Reddit (r/webdev, r/coding, r/reactjs)
   - Hacker News
   - Product Hunt
   - Dev.to

2. **Monitoring**:
   - Watch error logs
   - Monitor server performance
   - Track user signups
   - Read user feedback

3. **Quick Response**:
   - Be ready to fix critical bugs
   - Respond to user questions
   - Gather feedback for v2

---

Good luck with the beta launch! 🚀
