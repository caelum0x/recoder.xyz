# Product Requirements Document (PRD)
# Recoder.xyz - AI-Powered Web & Terminal Development Platform

**Document Version:** 2.0 (BETA Launch)  
**Last Updated:** November 17, 2025  
**Status:** Beta Launch - Free BYOK Model  
**Owner:** Product Team

---

## Executive Summary

Recoder.xyz is launching as a **FREE BETA** - the only platform that combines web-based IDE with terminal CLI access, enabling developers to seamlessly switch between browser and local development. Unlike competitors (Bolt.new - web only, Claude Code - terminal only), Recoder.xyz offers both with unified authentication and project synchronization.

**Launch Strategy:** 100% Free BYOK (Bring Your Own Key) Beta to build user base and prove value before monetizing.

### Key Differentiator
**Start in the browser, finish in your editor - with one seamless workflow. Completely free.**

---

## Revised Launch Strategy: Free Platform + BYOK → Monetize Later

### Why We're Launching FREE with BYOK

**The Reality:**
- **Zero capital available** for API cost subsidies
- Users will NOT pay just to use their own API keys
- The market expects free AI coding tools (Cursor, Windsurf, Bolt.new clones are free/BYOK)
- Our unique value is **web ↔ CLI synchronization**, not AI access itself
- We need **users and traction** before we can monetize effectively

**The Strategy:**
Growth first, monetization later. Build a user base by offering something competitors don't have - free unified web + terminal development.

---

### Phase 1: Free Launch Plan (Immediate - Next 3 Months)

#### What Users Get (100% Free)
✅ **Unlimited Web IDE access** (web.recoder.xyz)  
✅ **Unlimited CLI tool usage** (recoder-code)  
✅ **Full 40+ AI model support** (BYOK - they provide API keys)  
✅ **Web ↔ CLI project synchronization**  
✅ **Unlimited projects and storage** (within reasonable limits)  
✅ **No trial period, no credit card required**  
✅ **Full feature access** (no freemium restrictions)

#### What Users Bring
🔑 **Their own API keys:**
- OpenAI (GPT-4o, o1, o3)
- Anthropic (Claude 3.5 Sonnet, Opus)
- Google (Gemini 2.0 Flash)
- OpenRouter (access to 200+ models)
- xAI (Grok)
- DeepSeek (R1)

**We handle the rest:** Secure key storage, unified model interface, web/CLI sync, project management, authentication.

---

### Critical Fixes Before Launch

#### 1. **Fix Auth Routing** 🚨 CRITICAL
**Problem:** Users stuck in infinite sign-in loops  
**Fix:** Implement proper cookie-based auth flow between main app and web IDE  
**Priority:** P0 - Blocks all users

#### 2. **Build API Key Management UI** 🚨 CRITICAL
**What's Needed:**
- Dashboard page for adding/editing/deleting API keys
- Secure encrypted storage (database encrypted at rest)
- Key validation before saving
- Support for OpenAI, Anthropic, Google, OpenRouter, xAI, DeepSeek
- Clear instructions and help text
- Fallback handling for missing keys

**Priority:** P0 - Required for BYOK model

#### 3. **Remove All Payment/Subscription UI** ✅ EASY
**What to Hide/Remove:**
- Pricing pages (keep as "Coming Soon")
- "Upgrade to Pro" buttons
- Stripe checkout flows
- Subscription management pages
- Billing history

**Keep dormant in codebase for Phase 2, just hide from UI.**

**Priority:** P1 - Avoids confusion

#### 4. **Build Onboarding Flow** 🚨 IMPORTANT
**New User Experience:**
1. Sign up with GitHub/Google (no payment)
2. Welcome modal: "Welcome to Recoder.xyz Beta!"
3. Guided setup:
   - Step 1: Add your first API key (with "Why BYOK?" explanation)
   - Step 2: Choose default model/provider
   - Step 3: Start your first project (web IDE)
   - Step 4: Install CLI tool (optional, for later)
4. Empty state handling: Show helpful prompts if no projects yet

**Priority:** P0 - Critical for activation

---

### Launch Checklist

#### Technical Requirements
- [ ] Auth routing fixed and tested across web/CLI
- [ ] API key management dashboard built and secure
- [ ] All payment UI hidden (but code preserved)
- [ ] Onboarding flow implemented
- [ ] Error handling for missing/invalid API keys
- [ ] Usage analytics implemented (track key usage, costs)
- [ ] Documentation updated (BYOK setup guides)
- [ ] Terms of Service updated (clarify BYOK liability)
- [ ] Privacy policy updated (key storage practices)

#### Content & Marketing
- [ ] Homepage updated: "FREE BETA - BYOK"
- [ ] Clear value proposition on landing page
- [ ] "Why BYOK?" explanation page
- [ ] Video demo showing web ↔ CLI sync
- [ ] Documentation: API key setup for each provider
- [ ] FAQ: "Is this really free?" / "Why BYOK?" / "Will you see my API keys?"
- [ ] Launch post for Reddit, Hacker News, Twitter
- [ ] GitHub README updated
- [ ] Discord/community setup

---

### Why This Will Work

**1. Unique Value Proposition:**
- Only platform offering **both web IDE and CLI** with sync
- Bolt.new = web only, Claude Code = terminal only
- We're the bridge between both worlds

**2. Zero Friction Signup:**
- No credit card, no trial, no limits
- Just sign up and start coding (after adding API key)

**3. Real Cost Transparency:**
- Users see exactly what they pay (to AI providers)
- No hidden markup, no surprise bills
- We're the platform, not the middleman

**4. Community-Driven Growth:**
- Free = shareable, no barrier to recommending
- Developers share tools they love
- Word-of-mouth > paid ads

**5. Future Monetization Path:**
Once we have 1,000+ active users who love the platform:
- **Phase 2:** Introduce optional premium features:
  - Managed API keys (convenience layer, small markup)
  - Advanced features (team collaboration, private deployments)
  - Priority support
  - Enterprise plans
- Users who want convenience will pay, others stay free

---

### Success Metrics (Free Beta)
- **1,000+ signups** in first 2 months
- **60% activation rate** (complete first project with BYOK)
- **40% web↔CLI sync usage** (proves unique value)
- **50% month 2 retention**
- **80%+ positive feedback** ("This is what I've been looking for!")

---

### What Happens After Beta?

**If successful (1,000+ active users):**
1. Introduce optional paid tier with managed keys + premium features
2. Free tier stays free forever (BYOK)
3. Offer convenience upgrade path for users who want simplicity
4. Explore enterprise/team plans

**If not successful:**
- We learned the market doesn't want unified web+CLI development
- Pivot or shut down gracefully
- But we tried with ZERO capital burned 🎯

---

## 1. Product Vision & Goals

### Vision
To become the leading AI-powered development platform that eliminates the friction between web-based and local development, empowering developers to code anywhere, anytime.

### Business Goals (Beta Phase)
- Launch FREE BETA by December 2025
- Achieve 1,000+ active beta users within first 2 months
- Gather feedback and validate product-market fit
- Build community and word-of-mouth growth
- Establish unique market position vs. Bolt.new and Claude Code
- **Monetization Phase 2:** After proving value with 1,000+ users

### Success Metrics (Beta)
- User Signups: 1,000+ in first 2 months
- User Activation Rate: 60% (complete first project with their API key)
- Web↔CLI Sync Usage: 40% of active users
- Monthly Active Users (MAU) retention: 50%
- Average session duration: 25+ minutes
- Community engagement: Active Discord/GitHub discussions
- User satisfaction: 80%+ positive feedback

---

## 2. Target Users

### Primary Personas

**1. Full-Stack Developer (Alex)**
- Age: 25-35
- Experience: 3-7 years
- Needs: Quick prototyping, AI assistance, local testing
- Pain Point: Switching between Bolt.new and local editor is cumbersome
- Value Prop: Start in web IDE, download to local machine, push changes back

**2. Indie Hacker (Sarah)**
- Age: 22-40
- Experience: 2-5 years
- Needs: Fast MVP creation, cost-effective tools
- Pain Point: Paying for multiple tools (web IDE + AI coding assistant)
- Value Prop: All-in-one platform with unified pricing

**3. Learning Developer (Mike)**
- Age: 18-30
- Experience: 0-2 years
- Needs: Guided AI assistance, safe experimentation
- Pain Point: Local environment setup is complicated
- Value Prop: Start coding immediately in browser, graduate to CLI

---

## 3. Platform Architecture

### 3.1 Main App (recoder.xyz)
**Port:** 3000  
**Tech Stack:** Next.js 14, better-auth, PostgreSQL (Neon), Prisma

**Core Features:**
- User authentication & authorization
- **API key management (BYOK)** ⭐ NEW - Critical for Beta
- **Model/Provider selection** ⭐ NEW - Critical for Beta
- User dashboard & analytics
- Project listing & management
- Marketing pages & documentation
- ~~Subscription management & billing~~ (Phase 2 - Post-Beta)

**Status:** 🚧 80% Complete - API key management needed

### 3.2 Web IDE (web.recoder.xyz / recoder-web)
**Port:** 5173 (dev) / 8788 (prod)  
**Tech Stack:** React, WebContainer, Vite, AI SDK

**Core Features:**
- Bolt.new-style web IDE
- AI code generation (40+ models)
- Live preview with WebContainer
- Terminal emulator
- File tree navigation
- Real-time code execution
- Multi-file editing
- Background dev server management

**Status:** ✅ Production Ready

### 3.3 CLI Tool (recoder-code)
**Distribution:** npm package  
**Tech Stack:** Node.js, TypeScript, Commander.js

**Core Features:**
- Terminal-based AI coding assistant
- Local file system access
- Project download from web
- Project upload to web
- Intelligent two-way sync
- 40+ AI model support
- MCP server integration
- Tool calling capabilities

**Status:** ✅ Production Ready

---

## 4. Feature Requirements

### 4.1 Authentication & Authorization ✅

**Requirements:**
- [x] Email/password registration & login
- [x] OAuth providers (Google, GitHub)
- [x] Session management with cookies
- [x] Cross-domain session sharing (recoder.xyz ↔ web.recoder.xyz)
- [x] JWT token generation for API access
- [x] Role-based access control (Free, Pro, Enterprise)
- [x] CLI device flow authentication

**User Stories:**
- As a user, I can sign up with email/password or OAuth
- As a user, I remain logged in when navigating from main app to web IDE
- As a CLI user, I can authenticate via device flow like GitHub CLI
- As a user, I can manage my API keys from dashboard

**Acceptance Criteria:**
- Session persists for 30 days
- OAuth flow completes in <5 seconds
- CLI device flow shows QR code + URL
- Token refresh happens automatically

### 4.2 Web IDE Features ✅

**Requirements:**
- [x] AI-powered code generation
- [x] Multi-file project support
- [x] Live preview with hot reload
- [x] Terminal emulator
- [x] File tree with CRUD operations
- [x] Syntax highlighting
- [x] Auto-save functionality
- [x] Background dev server execution
- [x] Smart framework detection (Next.js, Vite, React, etc.)
- [x] Error handling & recovery

**User Stories:**
- As a user, I can describe my project and AI generates complete code
- As a user, I can see live preview of my web app instantly
- As a user, I can edit multiple files simultaneously
- As a user, dev servers start automatically without blocking
- As a user, I can run terminal commands in the browser

**Acceptance Criteria:**
- Code generation completes in <30 seconds
- Live preview updates in <2 seconds
- Dev servers start in background within 30 seconds
- Supports 8+ major frameworks
- Terminal output displays in real-time

### 4.3 CLI Integration ✅

**Requirements:**
- [x] `recoder web list` - List all web projects
- [x] `recoder web download <id>` - Download project to local
- [x] `recoder web upload [id]` - Upload local changes to web
- [x] `recoder web sync [id]` - Intelligent two-way sync
- [x] `recoder web open <id>` - Open project in browser
- [x] `recoder web info <id>` - Show project details
- [x] `recoder auth login` - Authenticate CLI
- [x] `recoder auth logout` - Clear session
- [x] `recoder auth status` - Show current user

**User Stories:**
- As a CLI user, I can see all my web projects from terminal
- As a CLI user, I can download any web project with one command
- As a CLI user, I can edit locally and push changes back
- As a CLI user, sync detects conflicts and lets me resolve them
- As a CLI user, I can open web projects in browser from terminal

**Acceptance Criteria:**
- Project list loads in <3 seconds
- Download completes in <10 seconds for typical project
- Sync detects file changes accurately
- Conflict resolution UI is clear and actionable
- All commands provide progress indicators

### 4.4 Project Management ✅

**Requirements:**
- [x] Project storage in PostgreSQL
- [x] File snapshot in JSONB format
- [x] Project metadata (name, description, file count)
- [x] Last modified timestamp
- [x] User association
- [x] Projects dashboard page
- [x] Search & filter functionality
- [x] Copy CLI commands with one click

**User Stories:**
- As a user, all my projects are automatically saved
- As a user, I can view all my projects in one dashboard
- As a user, I can search projects by name
- As a user, I can copy CLI commands to download projects
- As a user, I can see project statistics (files, last updated)

**Acceptance Criteria:**
- Projects auto-save every 30 seconds
- Dashboard loads in <2 seconds
- Search results appear instantly
- CLI commands copy to clipboard
- Metadata updates in real-time

### 4.5 API Key Management (BYOK) 🆕 **CRITICAL FOR BETA**

**Requirements:**
- [ ] API key storage page (/settings/api-keys)
- [ ] Multiple provider support (OpenRouter, Anthropic, OpenAI)
- [ ] Secure encryption (AES-256) for stored keys
- [ ] Key validation and testing
- [ ] Key management (add, edit, delete)
- [ ] Model/Provider selection in chat interface
- [ ] Default provider/model preferences
- [ ] Key usage status and health checks

**User Stories:**
- As a user, I can add my OpenRouter/Anthropic/OpenAI API key
- As a user, I can test if my API key is valid
- As a user, I can choose which provider/model to use for each project
- As a user, I can switch between models during a chat session
- As a user, I see clear instructions on how to get API keys
- As a user, I can manage multiple API keys for different providers
- As a user, my keys are encrypted and secure

**Acceptance Criteria:**
- API keys encrypted before storage
- Key validation completes in <3 seconds
- Provider selection dropdown in chat UI
- Model selection dropdown (filtered by selected provider)
- Clear onboarding flow for first-time users
- Affiliate links to OpenRouter/providers (potential revenue)
- Graceful error handling when key is invalid/expired

**Supported Providers & Models:**

**OpenRouter (Recommended - Multi-Model):**
- GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku
- Gemini Pro, Gemini Flash
- Meta Llama models
- Mistral models
- 40+ total models

**Anthropic (Direct):**
- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku

**OpenAI (Direct):**
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

### 4.6 Model Selection Interface 🆕 **CRITICAL FOR BETA**

**Chat Bar Enhancement:**

```
┌─────────────────────────────────────────────────────────┐
│ [Provider ▼] [Model ▼]                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Type your message...                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                  [Send] │
└─────────────────────────────────────────────────────────┘
```

**Provider Dropdown:**
- OpenRouter (Recommended) 🌟
- Anthropic
- OpenAI
- ⚙️ Manage API Keys

**Model Dropdown (Dynamic based on provider):**
- If OpenRouter: Show all 40+ models with categories
- If Anthropic: Show Claude variants
- If OpenAI: Show GPT variants
- Show pricing info per model
- Show speed/quality indicators
- Remember last selection per user

**Requirements:**
- [ ] Provider selector dropdown
- [ ] Model selector dropdown (filtered by provider)
- [ ] Visual indicators (speed, cost, quality)
- [ ] Persistent selection (saved to user preferences)
- [ ] "Manage API Keys" quick link
- [ ] Tooltip help for each model
- [ ] Real-time availability check
- [ ] Fallback to default if key missing

**Acceptance Criteria:**
- Dropdown renders in <100ms
- Model list updates instantly on provider change
- Selection persists across sessions
- Clear error if no API key configured
- Mobile-responsive design

### 4.7 Beta Tier (FREE) ⭐ **LAUNCH TIER**

**What Users Get:**
- ✅ **Unlimited projects** (no limits during beta)
- ✅ **Full Web IDE access** (all features)
- ✅ **Complete CLI integration** (download, upload, sync)
- ✅ **All 40+ AI models** (via their own API keys)
- ✅ **Model/Provider selection** (choose any model)
- ✅ **Priority features** (newest features first)
- ✅ **Community support** (Discord, GitHub)
- ✅ **Direct feedback channel** (help shape product)

**What Users Bring:**
- Their own API key from:
  - OpenRouter (recommended - $5 = 500+ requests)
  - Anthropic API key
  - OpenAI API key

**Beta User Benefits:**
- 🎁 Early access to all features
- 🎁 Lifetime "Founding User" badge
- 🎁 First to know about new features
- 🎁 Input on product roadmap
- 🎁 Potential grandfathered pricing when paid tiers launch

**Cost to Platform:** $0 (users bring own keys)
**Value to Users:** Unique Web+CLI integration
**Goal:** Prove value, build community, gather feedback

**Future Monetization (Post-Beta):**
- Premium features (team collaboration, advanced sync)
- Managed API keys tier (for users who don't want BYOK)
- Enterprise features (SSO, audit logs)
- Will announce well in advance to beta users

**Acceptance Criteria:**
- Clear "FREE BETA" messaging on landing page
- No payment/billing UI during beta
- Onboarding explains BYOK model clearly
- Users can start using immediately after adding API key
- Feedback mechanism built-in

---

## 5. Technical Requirements

### 5.1 Performance

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Web IDE Load Time | <3s | <5s |
| Code Generation Time | <30s | <60s |
| Live Preview Update | <2s | <5s |
| API Response Time (p95) | <200ms | <500ms |
| CLI Command Response | <3s | <10s |
| Project Download Time | <10s | <30s |
| Uptime | 99.9% | 99.5% |

### 5.2 Security

**Requirements:**
- [x] HTTPS only (SSL/TLS)
- [x] Password hashing (bcrypt)
- [x] JWT token expiration (15min access, 30d refresh)
- [x] Rate limiting on APIs
- [x] CORS configuration
- [x] XSS protection
- [x] CSRF protection
- [x] SQL injection prevention (Prisma ORM)
- [x] API key rotation
- [ ] 2FA support (Future)
- [ ] Security audit (Q1 2026)

### 5.3 Scalability

**Current Capacity:**
- 1,000 concurrent users
- 10,000 projects
- 100,000 API requests/day

**6-Month Target:**
- 10,000 concurrent users
- 100,000 projects
- 1,000,000 API requests/day

**Infrastructure:**
- Database: Neon PostgreSQL (serverless)
- Hosting: Vercel (main app + web IDE)
- CDN: Cloudflare
- Storage: Vercel Blob Storage (future)

### 5.4 Browser Support

| Browser | Version | Support Level |
|---------|---------|---------------|
| Chrome | 90+ | Full ✅ |
| Firefox | 88+ | Full ✅ |
| Safari | 14+ | Full ✅ |
| Edge | 90+ | Full ✅ |
| Mobile Safari | 14+ | Limited 🟡 |
| Mobile Chrome | 90+ | Limited 🟡 |

*Note: WebContainer requires modern browser APIs*

---

## 6. User Flows

### 6.1 Primary Flow: Web → CLI Development

1. User signs up on recoder.xyz
2. User clicks "Launch Web IDE"
3. User describes project: "Create a React todo app"
4. AI generates complete project with files
5. User sees live preview automatically
6. User decides to edit locally
7. User opens terminal, runs: `recoder web list`
8. User downloads project: `recoder web download <id>`
9. User edits files locally in VSCode
10. User pushes changes: `recoder web push`
11. User opens in browser: `recoder web open <id>`
12. Changes reflected in web IDE ✅

**Success Criteria:**
- Flow completes in <5 minutes
- No manual file copying required
- Changes sync accurately

### 6.2 Secondary Flow: CLI → Web Continuation

1. User works on local project
2. User wants to share preview
3. User runs: `recoder web upload`
4. System creates new web project
5. User gets shareable URL
6. User opens in browser
7. Live preview available instantly ✅

### 6.3 Onboarding Flow

1. User lands on recoder.xyz
2. User clicks "Try Demo" (no signup)
3. Guest session created
4. Simple project generated
5. User experiences platform
6. Prompt to sign up to save project
7. Sign up with GitHub OAuth
8. Projects migrated to account ✅

---

## 7. API Key Management - Detailed Specifications

### 7.1 Settings Page: /settings/api-keys

**Layout:**

```
┌───────────────────────────────────────────────────────────┐
│ API Keys Management                                       │
│                                                           │
│ ℹ️ Recoder.xyz is 100% FREE during beta!                 │
│    You just need to bring your own API key from one      │
│    of these providers.                                    │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📦 OpenRouter (Recommended)                         │ │
│ │                                                     │ │
│ │ Access 40+ AI models with one key                  │ │
│ │ • GPT-4, Claude 3.5, Gemini, Llama, and more       │ │
│ │ • Pay only for what you use                        │ │
│ │ • $5 credit = ~500 requests                        │ │
│ │                                                     │ │
│ │ API Key: [sk-or-v1-*********************]          │ │
│ │ Status: ✅ Connected | Last used: 2 min ago        │ │
│ │                                                     │ │
│ │ [Test Connection] [Update] [Delete]                │ │
│ │                                                     │ │
│ │ Don't have a key?                                  │ │
│ │ → Get $5 free credit at OpenRouter.ai              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🤖 Anthropic                                        │ │
│ │                                                     │ │
│ │ Direct access to Claude models                     │ │
│ │                                                     │ │
│ │ [+ Add Anthropic API Key]                          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🔷 OpenAI                                           │ │
│ │                                                     │ │
│ │ Direct access to GPT models                        │ │
│ │                                                     │ │
│ │ [+ Add OpenAI API Key]                             │ │
│ └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**Features:**
- Provider cards with status indicators
- One-click test connection
- Clear instructions for each provider
- Affiliate links to sign up (potential revenue)
- Key masking for security
- Last used timestamp
- Health status (✅ Active / ⚠️ Low credits / ❌ Invalid)

### 7.2 Model Selection in Chat Interface

**Location:** Web IDE chat bar (recoder-web)

**UI Design:**

```
┌─────────────────────────────────────────────────────────────┐
│ New Chat                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [OpenRouter ▼] [GPT-4 Turbo ▼]                      [⚙️]   │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Describe your project or ask a question...             ││
│ │                                                         ││
│ │                                                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                      [Send] │
└─────────────────────────────────────────────────────────────┘
```

**Provider Dropdown:**
```
┌────────────────────────────┐
│ OpenRouter 🌟              │ ← Selected
├────────────────────────────┤
│ Anthropic                  │
│ OpenAI                     │
├────────────────────────────┤
│ ⚙️ Manage API Keys         │
└────────────────────────────┘
```

**Model Dropdown (OpenRouter Selected):**
```
┌────────────────────────────────────────────────┐
│ 🔥 Popular Models                              │
├────────────────────────────────────────────────┤
│ GPT-4 Turbo          $0.01/1K tokens  ⚡⚡⚡  │ ← Selected
│ Claude 3.5 Sonnet    $0.003/1K tokens ⚡⚡⚡  │
│ GPT-4                $0.03/1K tokens  ⚡⚡    │
│ Gemini Pro           $0.0005/1K tokens⚡⚡⚡  │
├────────────────────────────────────────────────┤
│ 💰 Budget Models                               │
├────────────────────────────────────────────────┤
│ GPT-3.5 Turbo        $0.0005/1K tokens⚡⚡⚡  │
│ Claude 3 Haiku       $0.00025/1K tokens⚡⚡⚡ │
│ Llama 3.1 70B        $0.00052/1K tokens⚡⚡   │
├────────────────────────────────────────────────┤
│ 🧠 Advanced Models                             │
├────────────────────────────────────────────────┤
│ Claude 3 Opus        $0.015/1K tokens ⚡⚡    │
│ GPT-4 32K            $0.06/1K tokens  ⚡      │
├────────────────────────────────────────────────┤
│ View all 40+ models →                         │
└────────────────────────────────────────────────┘
```

**Speed Indicators:**
- ⚡⚡⚡ = Very Fast
- ⚡⚡ = Fast
- ⚡ = Standard

**Model Information Tooltip:**
```
┌────────────────────────────────────┐
│ GPT-4 Turbo                        │
├────────────────────────────────────┤
│ Best for: Complex reasoning, code │
│ Speed: Very Fast (⚡⚡⚡)           │
│ Cost: $0.01 per 1K tokens         │
│ Context: 128K tokens              │
│ Provider: OpenAI via OpenRouter   │
└────────────────────────────────────┘
```

**Gear Icon (⚙️):**
- Quick access to API key settings
- Default model preferences
- Model favorites

### 7.3 First-Time User Onboarding

**Step 1: Welcome Screen**
```
┌─────────────────────────────────────────┐
│ Welcome to Recoder.xyz FREE BETA! 🎉   │
│                                         │
│ The only platform that combines:       │
│ • Web IDE (code in browser)            │
│ • Terminal CLI (local development)     │
│ • Seamless sync between them           │
│                                         │
│ 100% Free. Forever (during beta).      │
│                                         │
│ [Get Started]                           │
└─────────────────────────────────────────┘
```

**Step 2: API Key Setup**
```
┌─────────────────────────────────────────┐
│ Add Your AI Provider Key                │
│                                         │
│ To use AI features, you need an API    │
│ key from one of these providers:       │
│                                         │
│ ✨ OpenRouter (Recommended)            │
│    Access 40+ models with one key      │
│    $5 free credit = 500+ requests      │
│                                         │
│    [Get OpenRouter Key →]              │
│                                         │
│ Or use:                                 │
│ • Anthropic (Claude models)            │
│ • OpenAI (GPT models)                  │
│                                         │
│ [I Have a Key] [Skip for Now]          │
└─────────────────────────────────────────┘
```

**Step 3: Key Entry**
```
┌─────────────────────────────────────────┐
│ Add OpenRouter API Key                  │
│                                         │
│ API Key:                                │
│ [sk-or-v1-________________________]    │
│                                         │
│ Give it a name (optional):              │
│ [My OpenRouter Key                 ]    │
│                                         │
│ ℹ️ Your key is encrypted and secure    │
│                                         │
│ [Test & Save] [Cancel]                  │
└─────────────────────────────────────────┘
```

**Step 4: Success + Quick Tour**
```
┌─────────────────────────────────────────┐
│ ✅ API Key Connected!                   │
│                                         │
│ You're all set! Here's how it works:   │
│                                         │
│ 1️⃣ Create projects in Web IDE          │
│ 2️⃣ Download to local machine (CLI)     │
│ 3️⃣ Edit locally, push changes back     │
│ 4️⃣ Sync seamlessly between web & CLI   │
│                                         │
│ [Start Building]                        │
└─────────────────────────────────────────┘
```

### 7.4 Backend Architecture

**Database Schema Addition:**

```prisma
model UserApiKey {
  id            String   @id @default(cuid())
  userId        String
  provider      String   // 'openrouter' | 'anthropic' | 'openai'
  name          String?  // User-friendly name
  keyPrefix     String   // First 8 chars for display (sk-or-v1...)
  encryptedKey  String   @db.Text // Full key encrypted with AES-256
  isActive      Boolean  @default(true)
  lastUsed      DateTime?
  lastChecked   DateTime?
  healthStatus  String?  // 'healthy' | 'low_credits' | 'invalid' | 'expired'
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([provider])
}

model UserPreferences {
  id                 String   @id @default(cuid())
  userId             String   @unique
  defaultProvider    String?  // 'openrouter' | 'anthropic' | 'openai'
  defaultModel       String?  // e.g., 'gpt-4-turbo'
  favoriteModels     String[] // Array of model IDs
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Encryption Service:**

```typescript
// lib/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv + authTag + encrypted
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptApiKey(encryptedData: string): string {
  const buffer = Buffer.from(encryptedData, 'base64');
  
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
}
```

**Model Configuration:**

```typescript
// lib/models.ts
export const MODEL_PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    icon: '📦',
    recommended: true,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    signupUrl: 'https://openrouter.ai?ref=recoder',
    models: [
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        category: 'popular',
        speed: 3,
        cost: 0.01,
        contextLength: 128000,
        description: 'Best for complex reasoning and code generation'
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        category: 'popular',
        speed: 3,
        cost: 0.003,
        contextLength: 200000,
        description: 'Excellent for coding and analysis'
      },
      // ... 38 more models
    ]
  },
  anthropic: {
    name: 'Anthropic',
    icon: '🤖',
    endpoint: 'https://api.anthropic.com/v1/messages',
    signupUrl: 'https://console.anthropic.com',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        speed: 3,
        cost: 0.003,
        contextLength: 200000
      },
      // ... more Claude models
    ]
  },
  openai: {
    name: 'OpenAI',
    icon: '🔷',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    signupUrl: 'https://platform.openai.com',
    models: [
      {
        id: 'gpt-4-turbo-preview',
        name: 'GPT-4 Turbo',
        speed: 3,
        cost: 0.01,
        contextLength: 128000
      },
      // ... more GPT models
    ]
  }
};
```

## 8. API Endpoints

### 8.1 API Key Management Endpoints

```typescript
// POST /api/user/api-keys
Request: {
  provider: 'openrouter' | 'anthropic' | 'openai',
  apiKey: string,
  name?: string
}
Response: {
  id: string,
  provider: string,
  name: string,
  keyPrefix: string, // 'sk-or-v1-***'
  healthStatus: 'healthy',
  createdAt: string
}

// GET /api/user/api-keys
Response: {
  keys: [
    {
      id: string,
      provider: string,
      name: string,
      keyPrefix: string,
      isActive: boolean,
      lastUsed: string,
      healthStatus: 'healthy' | 'low_credits' | 'invalid'
    }
  ]
}

// POST /api/user/api-keys/:id/test
Response: {
  valid: boolean,
  provider: string,
  credits?: number, // If available
  error?: string
}

// DELETE /api/user/api-keys/:id
Response: {
  success: boolean
}

// PUT /api/user/api-keys/:id
Request: {
  name?: string,
  isActive?: boolean
}
Response: {
  success: boolean
}
```

### 8.2 Model/Provider Preference Endpoints

```typescript
// GET /api/user/preferences
Response: {
  defaultProvider: 'openrouter',
  defaultModel: 'openai/gpt-4-turbo',
  favoriteModels: ['openai/gpt-4-turbo', 'anthropic/claude-3.5-sonnet']
}

// PUT /api/user/preferences
Request: {
  defaultProvider?: string,
  defaultModel?: string,
  favoriteModels?: string[]
}
Response: {
  success: boolean
}

// GET /api/models
Query params: {
  provider?: string // Filter by provider
}
Response: {
  providers: {
    openrouter: { name, icon, models: [...] },
    anthropic: { name, icon, models: [...] },
    openai: { name, icon, models: [...] }
  }
}
```

### 8.3 Authentication APIs

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/refresh
GET    /api/auth/providers
POST   /api/auth/device-authorize  (CLI)
POST   /api/auth/device-token      (CLI)
```

### 8.4 Project APIs

```
GET    /api/chat-history           (List projects)
GET    /api/chat-history/:urlId    (Get project)
POST   /api/chat-history           (Create project)
PUT    /api/chat-history/:urlId    (Update project)
DELETE /api/chat-history/:urlId    (Delete project)
POST   /api/chat-history/:urlId/sync (Sync files)
```

### 8.5 AI Proxy APIs (Uses User's API Key)

```typescript
// POST /api/ai/chat
Request: {
  messages: [...],
  provider: 'openrouter' | 'anthropic' | 'openai',
  model: string, // e.g., 'openai/gpt-4-turbo'
  stream?: boolean
}
Process:
1. Get user's API key for selected provider
2. Decrypt key
3. Make request to provider's API using user's key
4. Stream/return response
5. Update key usage stats

// GET /api/ai/models
Returns: List of available models from all providers

// POST /api/ai/validate-key
Request: {
  provider: string,
  apiKey: string
}
Response: {
  valid: boolean,
  credits?: number,
  error?: string
}
```

### 8.6 ~~Billing APIs~~ (Disabled for Beta)

```
// These endpoints exist but are disabled during beta
// Will be re-enabled in Phase 3 (Monetization)

// GET    /api/billing/subscription
// POST   /api/billing/checkout
// POST   /api/billing/portal
// GET    /api/billing/usage
```

---

## 9. Data Models

### 9.1 User

```typescript
interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  emailVerified: boolean;
  isBetaUser: boolean;        // All initial users are beta users
  betaJoinedAt?: Date;        // When they joined beta
  createdAt: Date;
  updatedAt: Date;
}
```

### 9.2 UserApiKey (NEW)

```typescript
interface UserApiKey {
  id: string;
  userId: string;
  provider: 'openrouter' | 'anthropic' | 'openai';
  name?: string;              // User-friendly name
  keyPrefix: string;          // First 8-10 chars for display
  encryptedKey: string;       // Full key encrypted with AES-256
  isActive: boolean;          // Can be disabled without deleting
  lastUsed?: Date;
  lastChecked?: Date;
  healthStatus?: 'healthy' | 'low_credits' | 'invalid' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}
```

### 9.3 UserPreferences (NEW)

```typescript
interface UserPreferences {
  id: string;
  userId: string;
  defaultProvider?: 'openrouter' | 'anthropic' | 'openai';
  defaultModel?: string;      // e.g., 'openai/gpt-4-turbo'
  favoriteModels: string[];   // Array of model IDs
  theme: 'light' | 'dark';
  createdAt: Date;
  updatedAt: Date;
}
```

### 9.4 Project (Chat History)

```typescript
interface Project {
  id: string;
  urlId: string;              // Public ID for URLs
  userId: string;
  title: string;
  description?: string;
  metadata: {
    fileSnapshot: FileTree;   // Complete file structure
    framework?: string;
    lastEditedFile?: string;
    usedProvider?: string;    // Which provider was used
    usedModel?: string;       // Which model generated this
  };
  messageCount: number;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FileTree {
  [path: string]: {
    content: string;
    type: 'file' | 'directory';
  };
}
```

### 9.5 ~~Subscription~~ (Disabled for Beta)

```typescript
// This model exists but is not used during beta
// Will be activated in Phase 3 (Monetization)

interface Subscription {
  id: string;
  userId: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due';
  // ... rest of fields dormant
}
```

### 9.6 Usage Stats (Optional - for analytics)

```typescript
interface UsageStats {
  id: string;
  userId: string;
  date: Date;               // Daily stats
  projectsCreated: number;
  aiRequests: number;
  cliSyncs: number;
  providersUsed: string[];  // Which providers they tried
  modelsUsed: string[];     // Which models they tried
}
```

---

## 9. Non-Functional Requirements

### 9.1 Reliability
- 99.9% uptime SLA
- Automated health checks every 5 minutes
- Database backups every 6 hours
- Disaster recovery plan (RPO: 6 hours, RTO: 2 hours)

### 9.2 Maintainability
- TypeScript for type safety
- Comprehensive logging (structured JSON)
- Error tracking (Sentry)
- Code coverage >70%
- Automated testing (unit + integration)

### 9.3 Usability
- Mobile-responsive design
- Keyboard shortcuts for power users
- Dark/light theme support
- Accessibility (WCAG 2.1 Level AA)
- Comprehensive documentation

### 9.4 Compliance
- GDPR compliance (EU users)
- CCPA compliance (California users)
- SOC 2 Type II (roadmap)
- Privacy policy & terms of service

---

## 10. Release Plan

### Phase 1: FREE BETA LAUNCH 🚀 (Nov-Dec 2025)

**Core Platform:**
- [x] Core platform (main app + web IDE + CLI)
- [x] Web↔CLI synchronization
- [x] CLI commands (list, download, upload, sync)
- [x] Projects storage and management

**Critical Pre-Launch Work:**
- [ ] Authentication & cross-domain session management **← FIX (2-3 hours)**
- [ ] Projects dashboard verification **← TEST (1-2 hours)**
- [ ] API key management system **← BUILD (5-6 hours)**
  - [ ] Settings page UI
  - [ ] Backend encryption/storage
  - [ ] Key validation endpoint
  - [ ] Secure key retrieval for AI requests
- [ ] Model/Provider selection in chat **← BUILD (3-4 hours)**
  - [ ] Provider dropdown (OpenRouter/Anthropic/OpenAI)
  - [ ] Model dropdown (filtered by provider)
  - [ ] Persistence of user selection
  - [ ] Integration with API key system
- [ ] Onboarding flow for BYOK **← BUILD (2-3 hours)**
  - [ ] Welcome screen explaining beta
  - [ ] API key setup wizard
  - [ ] Links to get API keys (with affiliate codes)
  - [ ] Test project generation
- [ ] Beta landing page **← UPDATE (1-2 hours)**
  - [ ] "FREE BETA" messaging
  - [ ] Clear BYOK explanation
  - [ ] Sign up CTA
  - [ ] No pricing/payment mentions
- [ ] Documentation **← WRITE (3-4 hours)**
  - [ ] How to get OpenRouter key
  - [ ] How to add API key to Recoder
  - [ ] How to select models
  - [ ] Web↔CLI workflow guide

**Status:** 75% COMPLETE - 20-25 hours work remaining (2-3 weeks)  
**Business Model:** FREE BETA with BYOK (zero capital, zero revenue, maximum growth)  
**Target:** Launch with $0 costs, 1,000+ users in 2 months, prove value before monetizing  
**Launch Date:** Early December 2025

### Phase 2: Beta Iteration (Jan-Feb 2026)
**Focus:** Gather feedback, fix bugs, improve UX based on beta user input

- [ ] Bug fixes from beta user reports
- [ ] Performance optimizations
- [ ] Enhanced onboarding based on user feedback
- [ ] Project templates library (community-contributed)
- [ ] Usage analytics dashboard (for users to see their stats)
- [ ] Email notifications (project updates, features)
- [ ] Community features (share projects publicly)
- [ ] Enhanced model selection UI (better filtering, search)
- [ ] API key health monitoring (alerts if key expires)

**Success Criteria:** 80%+ user satisfaction, active community engagement

### Phase 3: Monetization Planning (March 2026)
**Timing:** After 1,000+ active users and proven value

**Potential Revenue Streams:**
- [ ] Premium tier (team collaboration, advanced features)
- [ ] Managed API keys tier (for users who don't want BYOK)
- [ ] Enterprise tier (SSO, audit logs, SLA)
- [ ] OpenRouter affiliate revenue (10% commission)
- [ ] API marketplace (sell/share project templates)

**Decision Criteria:**
- 1,000+ monthly active users
- Strong user retention (50%+ MAU)
- Community advocacy (users promoting us)
- Clear value proposition validated

### Phase 4: Paid Features Launch (Q2 2026)
**Only after proving value in free beta**

- [ ] Team collaboration (share projects, real-time editing)
- [ ] Managed API keys option ($29/mo - we provide keys)
- [ ] Advanced CLI features (Git integration, CI/CD)
- [ ] Enterprise features (SSO, audit logs, SLA)
- [ ] Premium support
- [ ] Custom AI model fine-tuning
- [ ] VS Code extension
- [ ] Advanced analytics

