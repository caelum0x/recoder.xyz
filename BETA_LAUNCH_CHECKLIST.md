# 🚀 FREE BETA LAUNCH - Checklist

## ✅ COMPLETED Items

### Backend & Core Features
- [x] **API key management system** - Users can add/manage API keys ✅
  - Settings page UI (`/app/app/settings/ai-providers/page.tsx`)
  - Backend encryption/storage (AES-256-GCM)
  - Key validation endpoint (`/app/app/api/user/ai-provider-keys/route.ts`)
  - Secure key retrieval for AI requests

- [x] **Model/Provider selection in chat** ✅
  - Provider dropdown (OpenRouter/Anthropic/OpenAI)
  - Model dropdown (filtered by provider)
  - Persistence of user selection (localStorage)
  - Integration with API key system
  - 20+ real models from OpenRouter usage data

- [x] **Backend provider routing** ✅
  - OpenRouter streaming (`anthropic-stream.ts`)
  - Anthropic streaming (`openai-stream.ts`)
  - OpenAI streaming (`openrouter-stream.ts`)
  - Provider-specific error messages

- [x] **Dashboard with quota tracking** ✅
  - User quota management
  - Sessions tracking
  - API key status display

---

## ❌ REMAINING Items for FREE BETA Launch

### 1. **Landing Page Updates** 🚨 HIGH PRIORITY
**Status:** Not started
**Estimated Time:** 1-2 hours
**Location:** `/app/app/page.tsx` (main landing page)

**What needs to change:**
- [ ] Add **"FREE BETA"** hero section
- [ ] Update headline: "Build with AI - Bring Your Own Key"
- [ ] Add BYOK explanation section
- [ ] Remove any pricing mentions from hero
- [ ] Add "Get Started Free" CTA (no credit card)
- [ ] Add trust section: "Why BYOK?"
  - You control costs
  - You choose models
  - We're 100% free


**Example Hero Section:**
```
┌────────────────────────────────────────────────┐
│  🎉 FREE BETA - No Credit Card Required       │
│                                                 │
│  Build Full-Stack Apps with AI                │
│  Bring Your Own API Key                        │
│                                                 │
│  ✅ 100% Free Forever (Beta)                   │
│  ✅ 40+ AI Models (GPT, Claude, Gemini)       │
│  ✅ Web IDE + Terminal CLI                     │
│  ✅ You Control Costs                          │
│                                                 │
│  [Get Started Free →]                          │
└────────────────────────────────────────────────┘
```

---

### 2. **Hide/Update Pricing Pages** 🚨 HIGH PRIORITY
**Status:** Not started
**Estimated Time:** 30 minutes
**Location:** `/app/app/pricing/page.tsx` (if exists)

**Options:**
1. **Option A (Recommended):** Replace with "Coming Soon" page
2. **Option B:** Redirect to landing page
3. **Option C:** Hide link from navigation

**What to show:**
```
┌────────────────────────────────────────────────┐
│  Pricing - Coming Soon                        │
│                                                 │
│  🎉 Right now, Recoder.xyz is 100% FREE!      │
│                                                 │
│  During our beta, all features are free.      │
│  Just bring your own API key from:            │
│  • OpenRouter ($5 = 500+ requests)            │
│  • Anthropic (Claude API)                     │
│  • OpenAI (GPT API)                           │
│                                                 │
│  We'll announce pricing before we launch.     │
│  Beta users may get special pricing! 🎁       │
│                                                 │
│  [Get Started Free →]                          │
└────────────────────────────────────────────────┘
```

---

### 3. **Remove "Upgrade to Pro" Buttons** 🚨 HIGH PRIORITY
**Status:** Not started
**Estimated Time:** 30 minutes

**Files to check:**
- [ ] `/app/app/dashboard/page.tsx` - Remove upgrade CTA (lines 398-423)
- [ ] `/app/app/settings/**` - Remove any upgrade prompts
- [ ] Navigation menus - Remove "Pricing" link (during beta)

**What to do:**
- Hide "Upgrade to Pro" section in dashboard
- Replace with "Beta User" badge
- Add "Give Feedback" CTA instead

---

### 4. **Onboarding Flow for New Users** 🚨 CRITICAL
**Status:** Not started
**Estimated Time:** 2-3 hours
**Location:** Create `/app/app/onboarding/page.tsx`

**Flow:**
```
Step 1: Welcome Screen
┌────────────────────────────────────────────────┐
│  Welcome to Recoder.xyz FREE BETA! 🎉        │
│                                                 │
│  The only platform that combines:             │
│  • Web IDE (code in browser)                  │
│  • Terminal CLI (local development)           │
│  • Seamless sync between them                 │
│                                                 │
│  100% Free. Forever (during beta).            │
│                                                 │
│  [Get Started →]                               │
└────────────────────────────────────────────────┘

Step 2: API Key Setup
┌────────────────────────────────────────────────┐
│  Add Your AI Provider Key                     │
│                                                 │
│  To use AI features, you need an API key      │
│  from one of these providers:                 │
│                                                 │
│  ✨ OpenRouter (Recommended)                  │
│     Access 40+ models with one key            │
│     $5 free credit = 500+ requests            │
│                                                 │
│     [Get OpenRouter Key →]                     │
│                                                 │
│  Or use:                                       │
│  • Anthropic (Claude models)                  │
│  • OpenAI (GPT models)                        │
│                                                 │
│  [I Have a Key] [Skip for Now]                │
└────────────────────────────────────────────────┘

Step 3: Choose Model
┌────────────────────────────────────────────────┐
│  Choose Your Default Model                    │
│                                                 │
│  [OpenRouter ▼] [Grok Code Fast 1 ▼]         │
│                                                 │
│  💡 Recommended: Grok Code Fast 1             │
│  • #1 most used model                         │
│  • $0.001 per 1K tokens                       │
│  • Ultra-fast coding                          │
│                                                 │
│  [Continue →]                                  │
└────────────────────────────────────────────────┘

Step 4: Start Building
┌────────────────────────────────────────────────┐
│  ✅ You're All Set!                            │
│                                                 │
│  Here's how it works:                         │
│  1️⃣ Create projects in Web IDE               │
│  2️⃣ Download to local machine (CLI)          │
│  3️⃣ Edit locally, push changes back          │
│  4️⃣ Sync seamlessly between web & CLI        │
│                                                 │
│  [Start Building →]                            │
└────────────────────────────────────────────────┘
```

---

### 5. **Documentation Pages** 📚 MEDIUM PRIORITY
**Status:** Not started
**Estimated Time:** 3-4 hours
**Location:** Create `/app/app/docs/` pages

**Pages needed:**
- [ ] `/docs/getting-started` - Quick start guide
- [ ] `/docs/byok` - "Why BYOK?" explanation
- [ ] `/docs/api-keys/openrouter` - How to get OpenRouter key
- [ ] `/docs/api-keys/anthropic` - How to get Anthropic key
- [ ] `/docs/api-keys/openai` - How to get OpenAI key
- [ ] `/docs/models` - Model selection guide
- [ ] `/docs/web-cli-sync` - Web ↔ CLI workflow
- [ ] `/docs/faq` - Frequently asked questions

**FAQ Topics:**
- Is this really free?
- Why BYOK?
- Will you see my API keys?
- How much will this cost me?
- Which model should I choose?
- Can I use multiple API keys?
- What happens after beta?

---

### 6. **Dashboard Updates** 📊 LOW PRIORITY
**Status:** Partial (needs refinement)
**Estimated Time:** 1 hour

**Changes:**
- [ ] Replace "Current Plan: Free" with "Beta User 🎉"
- [ ] Add "Beta Feedback" button
- [ ] Remove upgrade CTA section (lines 398-423)
- [ ] Add "Invite Friends" section instead

---

## 📋 Launch Checklist Summary

### Must Have (P0 - Critical):
- [ ] Landing page updated with FREE BETA messaging
- [ ] Pricing page hidden or "Coming Soon"
- [ ] All "Upgrade" buttons removed
- [ ] Basic onboarding flow
- [ ] At least basic documentation (/docs/getting-started, /docs/byok)

### Should Have (P1 - Important):
- [ ] Complete onboarding wizard (4 steps)
- [ ] Full documentation suite
- [ ] FAQ page
- [ ] Email welcome sequence (optional)

### Nice to Have (P2 - Enhancement):
- [ ] Video tutorials
- [ ] Interactive demo
- [ ] Community Discord link
- [ ] Affiliate links to OpenRouter

---

## 🎯 Recommended Order

1. **Landing Page** (1-2 hours) - First impression
2. **Hide Pricing/Remove Upgrades** (30 min) - Avoid confusion
3. **Basic Onboarding** (2-3 hours) - Critical for activation
4. **Docs: Getting Started + BYOK** (1-2 hours) - Support users
5. **Full Onboarding Wizard** (if time permits)
6. **Complete Documentation** (if time permits)

---

## 📊 Current Progress

**Completed:** 60%
- ✅ Backend infrastructure
- ✅ API key management
- ✅ Model selection
- ✅ Provider routing

**Remaining:** 40%
- ❌ Landing page
- ❌ Pricing page
- ❌ Onboarding
- ❌ Documentation

**Total Estimated Time:** 6-10 hours of focused work

---

## 🚀 Ready to Launch When:

- [x] Users can sign up for free
- [x] Users can add API keys
- [x] Users can select models
- [x] Chat works with user's API keys
- [ ] Landing page clearly says "FREE BETA"
- [ ] No pricing/payment confusion
- [ ] Basic onboarding guides users
- [ ] Documentation explains BYOK

---

## 💡 Quick Wins (Can ship without):

These can be added after initial launch:
- Video tutorials
- Full documentation suite
- Community features
- Affiliate programs
- Email sequences

**Minimum Viable Beta:** Focus on items 1-4 above (landing, pricing, upgrades, basic onboarding)

---

## 🎯 Your Question: "What should we call it?"

**Recommended Naming:**
- **Hero:** "FREE BETA - No Credit Card Required"
- **Tagline:** "Build with AI - Bring Your Own Key"
- **Status badge:** "Beta User 🎉"
- **CTA:** "Get Started Free" (not "Sign Up for Beta")

**Why this works:**
- "FREE BETA" = Clear expectations
- "BYOK" = Explains the model
- No "trial" language = No expiration fears
- "Get Started Free" = Actionable, no commitment

Would you like me to start implementing these updates? I can:
1. Update the landing page first (highest impact)
2. Hide/update pricing pages
3. Remove upgrade buttons
4. Create basic onboarding flow

Which would you like me to tackle first?
