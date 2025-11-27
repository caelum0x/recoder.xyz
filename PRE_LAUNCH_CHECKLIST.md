# ✅ PRE-LAUNCH CHECKLIST
## Critical Issues to Fix Before Launch

**Target Launch Date:** December 8, 2025 (3 weeks)  
**Business Model:** BYOK (Bring Your Own Key)  
**Pricing:** Free (3 projects) | Pro ($12/mo)

---

## 🔴 CRITICAL BLOCKERS (Must fix before launch)

### 1. Auth Routing Between Domains
**Status:** ❌ BROKEN  
**Time:** 2-3 hours  
**Priority:** URGENT

**Test:**
- [ ] User logs in at recoder.xyz
- [ ] User clicks "Launch Web IDE"
- [ ] User lands on web.recoder.xyz **WITH active session**
- [ ] User can use IDE without re-login

**Files to Check:**
- `/app/app/dashboard/page.tsx` - "Launch IDE" button
- `/recoder-web/src/` - Session validation
- Cookie/session sharing implementation

**Fix Options:**
1. JWT token in URL parameter (quick)
2. Shared session cookie (`.recoder.xyz` domain)
3. OAuth-style redirect with code exchange

---

### 2. Payment & Subscription System
**Status:** ❌ NOT TESTED  
**Time:** 4-5 hours  
**Priority:** URGENT

**Test Flow:**
- [ ] User clicks "Upgrade to Pro" button
- [ ] Stripe checkout page loads
- [ ] User completes payment (test mode)
- [ ] Webhook fires and hits your endpoint
- [ ] Database updates subscription status
- [ ] Features unlock immediately
- [ ] User sees "Pro" badge
- [ ] User can manage subscription

**Files to Check:**
- `/app/api/billing/` - Stripe endpoints
- `/app/api/webhooks/stripe/` - Webhook handler
- Stripe dashboard - Webhook configuration

**Required:**
- [ ] Stripe test mode configured
- [ ] Webhooks set up (use Stripe CLI for local testing)
- [ ] Subscription management page built
- [ ] Feature gating implemented (check tier before actions)

---

### 3. API Key Management System (BYOK)
**Status:** ❌ DOESN'T EXIST  
**Time:** 5-6 hours  
**Priority:** URGENT (for BYOK launch)

**Must Build:**

**Frontend (`/app/app/settings/api-keys/page.tsx`):**
```tsx
- Settings page with API key inputs
- OpenRouter API key field (primary)
- OpenAI API key field (optional)
- Anthropic API key field (optional)
- "Test Connection" button for each
- "Save" button
- Show key status (connected/error)
- Link to OpenRouter signup (affiliate link)
```

**Backend (`/app/api/user/api-keys/`):**
```typescript
- POST /api/user/api-keys - Save encrypted keys
- GET /api/user/api-keys - Get key status (not actual keys)
- DELETE /api/user/api-keys/:provider - Remove key
- POST /api/user/api-keys/test - Test key validity
```

**Security:**
- [ ] Encrypt keys with AES-256 before storing
- [ ] Never return actual keys to frontend
- [ ] Store in separate `user_api_keys` table
- [ ] Handle key errors gracefully in AI service

**AI Service Updates:**
- [ ] Check if user has API key before AI request
- [ ] Use user's key instead of platform key
- [ ] Show clear error if key missing/invalid
- [ ] Fallback handling

---

### 4. Projects System Verification
**Status:** ⚠️ UNKNOWN  
**Time:** 2-3 hours  
**Priority:** HIGH

**Test End-to-End:**
- [ ] Create project in web IDE
- [ ] Project saves to database
- [ ] Project appears in dashboard (`/projects`)
- [ ] Can click project and reopen in IDE
- [ ] CLI can list projects (`recoder web list`)
- [ ] CLI can download project (`recoder web download <id>`)
- [ ] CLI can push changes (`recoder web push`)
- [ ] Changes reflect in web IDE

**Files to Check:**
- `/app/api/chat-history/` - Project CRUD endpoints
- `/app/app/projects/page.tsx` - Projects dashboard
- `/recoder-web/` - Project save/load logic
- `/packages/cli/src/commands/web.ts` - CLI commands

**Database:**
```sql
-- Verify this table exists and works
SELECT * FROM chat_history LIMIT 5;
```

---

### 5. Cross-Domain Navigation
**Status:** ⚠️ UNKNOWN  
**Time:** 1-2 hours  
**Priority:** MEDIUM

**Test All Links:**
- [ ] Dashboard → Web IDE (recoder.xyz → web.recoder.xyz)
- [ ] Web IDE → Dashboard (back button)
- [ ] Projects page → Web IDE (open project)
- [ ] Settings → Dashboard
- [ ] All internal links use correct domains

**Check:**
- Hardcoded `localhost:3000` anywhere? Replace with env variable
- Hardcoded `localhost:5173` anywhere? Replace with env variable
- Use `NEXT_PUBLIC_WEB_IDE_URL` and `NEXT_PUBLIC_MAIN_APP_URL`

---

## 🟡 IMPORTANT (Should fix before launch)

### 6. Landing Page Copy (BYOK Positioning)
**Time:** 1 hour

Update landing page to reflect BYOK model:
- [ ] Emphasize Web+CLI integration (your unique value)
- [ ] Clear explanation of BYOK
- [ ] "How to Get Started" with OpenRouter
- [ ] Pricing page shows $12/mo Pro tier
- [ ] Benefits focus on features, not AI access

### 7. User Onboarding Flow
**Time:** 2 hours

- [ ] Welcome modal on first login
- [ ] "Set up API key" step-by-step guide
- [ ] Link to OpenRouter with affiliate code
- [ ] Simple tutorial video (or screenshots)

### 8. Error Handling
**Time:** 2 hours

- [ ] "No API key configured" error with CTA
- [ ] "Invalid API key" error with fix instructions
- [ ] "Rate limit exceeded" error with suggestion
- [ ] Payment failed error handling

---

## 🟢 NICE TO HAVE (Post-launch)

### 9. Analytics & Monitoring
- [ ] PostHog/Mixpanel for user events
- [ ] Sentry for error tracking
- [ ] Track: signups, activations, upgrades, churn

### 10. Documentation
- [ ] BYOK setup guide
- [ ] Video walkthrough
- [ ] FAQ page
- [ ] CLI documentation

### 11. Marketing Assets
- [ ] Product Hunt listing
- [ ] Twitter announcement thread
- [ ] Reddit posts (r/webdev, r/SideProject)
- [ ] Demo video/GIF

---

## 📋 TESTING CHECKLIST

Before launch, test these complete flows:

### Flow 1: New User Signup → First Project
1. [ ] Sign up with email
2. [ ] Verify email (if required)
3. [ ] See onboarding welcome
4. [ ] Navigate to settings
5. [ ] Add OpenRouter API key
6. [ ] Test connection succeeds
7. [ ] Click "Launch Web IDE"
8. [ ] Create first project
9. [ ] AI generates code successfully
10. [ ] Project saves
11. [ ] Can see project in dashboard

### Flow 2: Upgrade to Pro
1. [ ] Log in as free user
2. [ ] Hit project limit (4th project)
3. [ ] See "Upgrade" prompt
4. [ ] Click upgrade
5. [ ] Complete Stripe checkout (test mode)
6. [ ] Redirected back with success
7. [ ] See "Pro" badge
8. [ ] Can create unlimited projects
9. [ ] Can use advanced CLI features

### Flow 3: CLI Integration
1. [ ] Install CLI: `npm install -g recoder-code`
2. [ ] Run: `recoder auth login`
3. [ ] Complete device flow auth
4. [ ] Run: `recoder web list` (shows web projects)
5. [ ] Run: `recoder web download <id>` (downloads files)
6. [ ] Edit files locally
7. [ ] Run: `recoder web push` (uploads changes)
8. [ ] Open in browser, see changes reflected

---

## 🚀 LAUNCH DAY CHECKLIST

### Before Deployment:
- [ ] All critical tests pass
- [ ] Stripe production mode configured
- [ ] Webhooks pointing to production URLs
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] SSL certificates valid
- [ ] DNS configured correctly

### Deployment:
- [ ] Deploy main app (recoder.xyz)
- [ ] Deploy web IDE (web.recoder.xyz)
- [ ] Verify both apps accessible
- [ ] Test auth flow in production
- [ ] Test payment in production (small test charge)
- [ ] Monitor error logs

### Launch Posts:
- [ ] Reddit r/webdev
- [ ] Reddit r/SideProject
- [ ] Indie Hackers
- [ ] Twitter/X thread
- [ ] Product Hunt (schedule for 12:01 AM PT)
- [ ] LinkedIn (if applicable)

### Day 1 Monitoring:
- [ ] Watch error logs (Sentry)
- [ ] Monitor signups
- [ ] Respond to user issues quickly
- [ ] Track conversion rate
- [ ] Gather feedback

---

## 💰 BUSINESS METRICS TO TRACK

### Week 1:
- Signups: Target 50+
- Activations (created project): Target 60%
- Paid conversions: Target 2-3 users
- MRR: Target $24-36

### Month 1:
- Signups: Target 500+
- Paid users: Target 20
- MRR: Target $240
- Churn: Target <10%

### Month 3:
- Signups: Target 2,000+
- Paid users: Target 100
- MRR: Target $1,200
- Add "Enterprise" tier with managed keys

---

## ❓ QUESTIONS TO ANSWER NOW

Please test and answer:

1. **Auth Routing:**
   - Does session transfer from recoder.xyz → web.recoder.xyz?
   - YES / NO / HAVEN'T TESTED

2. **Projects:**
   - Can you create and save a project in web IDE?
   - Does it show in dashboard?
   - YES / NO / HAVEN'T TESTED

3. **Payments:**
   - Is Stripe integrated and working?
   - Have you completed a test payment?
   - YES / NO / NOT SET UP

4. **CLI:**
   - Can CLI authenticate?
   - Can CLI list web projects?
   - YES / NO / HAVEN'T TESTED

5. **Capital:**
   - Do you have $500+ for API credits?
   - YES → Could do hybrid model
   - NO → Must do BYOK

---

## 🎯 NEXT IMMEDIATE STEPS

### Today (2 hours):
1. **Test everything above** - Document what works vs broken
2. **Answer the 5 questions** - So I know what to fix
3. **Choose launch model** - BYOK vs Hybrid (I recommend BYOK)

### Tomorrow (8 hours):
1. **Fix auth routing** (2-3 hours)
2. **Build API key management** (5-6 hours)

### Day 3 (8 hours):
1. **Fix payment flow** (4-5 hours)
2. **Test projects system** (2-3 hours)

### Week 2:
- Polish, test, document

### Week 3:
- **LAUNCH! 🚀**

---

**Once you test and answer the questions, I'll help you fix everything and get you launched in 2-3 weeks!**
