# 🎯 Recoder.xyz Complete Website Implementation Plan

## Current Status
✅ **Homepage** - Professional black/orange/purple design (DONE)  
⚠️ **CLI Page** - Exists but doesn't match new theme  
⚠️ **Pricing Page** - Exists but needs payment integration  
⚠️ **Docs Page** - Exists but needs theming  
⚠️ **Blog Page** - Exists but needs theming  
❌ **Payment System** - Not implemented  
❌ **User Dashboard** - Not implemented  
❌ **API Key Management** - Created but needs integration  

---

## 🎨 Design System

### Theme Colors
```css
Black:  #000000 (backgrounds)
Orange: #FF6B35 (primary, CLI, CTAs)
Purple: #A855F7 (secondary, Web platform)
Gray:   #6B7280 (body text)
White:  #FFFFFF (headings)

Gradients:
- Orange to Purple: from-orange-500 to-purple-600
- Black to Dark: from-black to-gray-900
```

### Typography
- **Headlines:** text-6xl to text-8xl, font-bold
- **Subheadlines:** text-3xl to text-4xl, font-bold
- **Body:** text-lg (18px), text-gray-400
- **Small:** text-sm (14px), text-gray-500

### Components
- **Cards:** border border-white/10, bg-black/50, rounded-2xl
- **Buttons Primary:** bg-orange-500 hover:bg-orange-600
- **Buttons Secondary:** border border-white/10 hover:border-white/20
- **Input:** bg-black border border-white/10 focus:border-orange-500

---

## 📄 Pages to Implement/Fix

### 1. CLI Page (`/cli`)
**Status:** Needs theme update  
**Priority:** HIGH  
**Current Issue:** Different theme, doesn't match homepage

**Requirements:**
- [ ] Match black/orange/purple theme
- [ ] Bold minimal design
- [ ] Installation instructions (clear, step-by-step)
- [ ] Code examples with syntax highlighting
- [ ] Feature showcase (orange accents)
- [ ] Download/install CTA (prominent orange button)
- [ ] GitHub link (when available)

**Sections:**
1. Hero - "Install Recoder CLI in 60 seconds"
2. Installation - Step-by-step with copy buttons
3. Features - 3-column grid with icons
4. Quick Start - Code examples
5. Authentication - How to login
6. CTA - "Start Building Now"

---

### 2. Pricing Page (`/pricing`)
**Status:** Needs payment integration  
**Priority:** CRITICAL  
**Current Issue:** No actual payment system

**Requirements:**
- [ ] Match theme (black/orange/purple)
- [ ] 3-4 pricing tiers
- [ ] Stripe payment integration
- [ ] Monthly/Annual toggle
- [ ] Feature comparison table
- [ ] FAQ section
- [ ] "Most Popular" badge on middle tier

**Pricing Tiers (Recommended):**

#### Free Tier
- **Price:** $0/month
- **Features:**
  - 100 API calls/month
  - 1 project
  - Community support
  - Basic AI models
  - CLI + Web access
- **CTA:** "Start Free"

#### Pro Tier (MOST POPULAR)
- **Price:** $20/month ($200/year - save 17%)
- **Features:**
  - 5,000 API calls/month
  - Unlimited projects
  - Priority support
  - All AI models (Claude, GPT-4, Gemini)
  - Advanced features
  - Team collaboration (3 members)
- **CTA:** "Start Pro Trial" (orange)

#### Team Tier
- **Price:** $50/month ($500/year)
- **Features:**
  - 20,000 API calls/month
  - Unlimited projects
  - Priority support + Slack
  - All AI models
  - Advanced features
  - Team collaboration (10 members)
  - Custom templates
- **CTA:** "Start Team Trial"

#### Enterprise Tier
- **Price:** Custom
- **Features:**
  - Unlimited API calls
  - Unlimited everything
  - Dedicated support
  - On-premise options
  - Custom AI models
  - SLA guarantees
  - Security audit
- **CTA:** "Contact Sales"

**Payment Integration:**
- Use Stripe Checkout
- Stripe Customer Portal for management
- Webhook handling for subscription events
- Usage-based billing support

---

### 3. Docs Page (`/docs`)
**Status:** Needs theme + content  
**Priority:** HIGH  

**Requirements:**
- [ ] Match theme
- [ ] Searchable documentation
- [ ] Sidebar navigation
- [ ] Code syntax highlighting
- [ ] Copy code buttons
- [ ] Table of contents
- [ ] API reference
- [ ] Interactive examples

**Documentation Structure:**

```
Getting Started
├── Installation
├── Quick Start
├── Authentication
└── First Project

CLI Documentation
├── Commands Reference
├── Natural Language Interface
├── Configuration
├── AI Model Selection
└── Troubleshooting

Web Platform
├── Overview
├── Code Generation
├── Collaboration
├── Deployment
└── Templates

API Reference
├── Authentication API
├── Code Generation API
├── Projects API
├── Usage API
└── Webhooks

Guides & Tutorials
├── Build a Full-Stack App
├── Deploy to Production
├── Team Collaboration
└── Advanced AI Usage
```

---

### 4. Blog Page (`/blog`)
**Status:** Needs theme + CMS  
**Priority:** MEDIUM  

**Requirements:**
- [ ] Match theme
- [ ] Blog post listing (grid)
- [ ] Individual post pages
- [ ] Categories/tags
- [ ] Search functionality
- [ ] RSS feed
- [ ] Author profiles
- [ ] Related posts

**Content Management:**
- Use MDX for blog posts
- Store in `/app/blog/posts/` directory
- Frontmatter for metadata
- Static generation for performance

**Initial Blog Posts:**
1. "Introducing Recoder.xyz: Real AI Development"
2. "How We Use Multiple AI Models"
3. "From Idea to Production in Minutes"
4. "CLI vs Web: Which Tool for Your Workflow?"
5. "Production-Ready Code: What It Really Means"

---

### 5. Dashboard Page (`/dashboard`)
**Status:** NOT IMPLEMENTED  
**Priority:** HIGH  

**Requirements:**
- [ ] User authentication required
- [ ] Match theme
- [ ] Project listing
- [ ] Usage statistics
- [ ] API key management link
- [ ] Recent activity
- [ ] Quick actions

**Sections:**
1. Welcome header with user info
2. Quick stats (API calls, projects, tokens used)
3. Recent projects (cards)
4. Usage chart (last 30 days)
5. Quick actions (New Project, View Docs, Settings)

---

### 6. Settings Pages
**Status:** Partial (API keys done)  
**Priority:** MEDIUM  

**Pages Needed:**

#### `/settings/account`
- Profile information
- Email/password change
- Account deletion
- Session management

#### `/settings/api-keys` ✅
- Already created
- Needs theme update to match

#### `/settings/billing`
- Current plan
- Usage statistics
- Payment method
- Invoices
- Upgrade/downgrade
- Cancel subscription

#### `/settings/team`
- Team members
- Invite members
- Permissions
- Team usage

---

## 💳 Payment System Implementation

### Stripe Integration

**Required Environment Variables:**
```bash
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Stripe Products/Prices:**
```bash
# Create products in Stripe Dashboard
- Product: Recoder Pro Monthly ($20)
- Product: Recoder Pro Annual ($200)
- Product: Recoder Team Monthly ($50)
- Product: Recoder Team Annual ($500)
```

**Files to Create:**

1. **`/app/api/stripe/checkout/route.ts`**
   - Create checkout session
   - Handle plan selection
   - Redirect to Stripe

2. **`/app/api/stripe/portal/route.ts`**
   - Create portal session
   - Manage subscriptions
   - Update payment methods

3. **`/app/api/stripe/webhooks/route.ts`**
   - Handle subscription events
   - Update user plan in database
   - Send confirmation emails

4. **`/app/lib/stripe.ts`**
   - Stripe client configuration
   - Helper functions

5. **Database Updates:**
   - Add subscription table
   - Add payment_method table
   - Add invoice table
   - Update user table with plan info

---

## 🗄️ Database Schema Updates

### New Tables Needed:

```prisma
model Subscription {
  id                String   @id @default(cuid())
  userId            String   @unique
  stripeCustomerId  String   @unique
  stripeSubscriptionId String? @unique
  stripePriceId     String?
  stripeCurrentPeriodEnd DateTime?
  plan              Plan     @default(FREE)
  status            SubscriptionStatus @default(ACTIVE)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id])
}

model Invoice {
  id          String   @id @default(cuid())
  userId      String
  amount      Int      // in cents
  currency    String   @default("usd")
  status      String
  stripeInvoiceId String @unique
  invoiceUrl  String?
  paidAt      DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
}

model Project {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  type        ProjectType // WEB, CLI, API, MOBILE
  repository  String?
  status      ProjectStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])
}

enum Plan {
  FREE
  PRO
  TEAM
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  UNPAID
}

enum ProjectType {
  WEB
  CLI
  API
  MOBILE
  FULLSTACK
}

enum ProjectStatus {
  ACTIVE
  ARCHIVED
  DELETED
}
```

---

## 🔧 Implementation Priority

### Phase 1: Critical (This Week)
1. ✅ Homepage redesign (DONE)
2. 🔄 Fix CLI page theme
3. 🔄 Update pricing page with Stripe
4. 🔄 Create payment system
5. 🔄 Update database schema

### Phase 2: High Priority (Next Week)
1. Complete docs page
2. Create dashboard
3. Complete settings pages
4. User authentication flow
5. Email notifications

### Phase 3: Medium Priority (2 Weeks)
1. Blog system
2. Search functionality
3. Team features
4. Usage analytics
5. API documentation

### Phase 4: Nice to Have (3-4 Weeks)
1. Advanced features
2. Integrations
3. Templates marketplace
4. Community features
5. Mobile app updates

---

## 📝 Content Needed

### Immediate:
- [ ] GitHub repository URL
- [ ] Actual CLI npm package name
- [ ] Support email address
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie Policy

### Marketing:
- [ ] Product screenshots
- [ ] Demo videos
- [ ] Customer testimonials
- [ ] Case studies
- [ ] Logo assets

### Technical:
- [ ] API documentation
- [ ] Code examples
- [ ] Troubleshooting guides
- [ ] FAQ content
- [ ] Changelog

---

## 🚀 Next Steps - Action Items

### Immediate (Today):
1. **Fix CLI Page Theme**
   - Update to match homepage
   - Add proper installation instructions
   - Add orange CTAs

2. **Create Stripe Account**
   - Sign up for Stripe
   - Get API keys
   - Create products/prices

3. **Update Pricing Page**
   - Add actual pricing
   - Add payment buttons
   - Link to Stripe checkout

### Short Term (This Week):
1. **Implement Payment System**
   - Stripe integration
   - Webhook handling
   - Database updates

2. **Create Dashboard**
   - User dashboard page
   - Project listing
   - Usage stats

3. **Update Settings Pages**
   - Theme consistency
   - Billing page
   - Account management

### Medium Term (Next 2 Weeks):
1. **Documentation System**
   - Complete docs
   - Search functionality
   - API reference

2. **Blog System**
   - MDX setup
   - Blog posts
   - RSS feed

3. **User Features**
   - Team collaboration
   - Project management
   - Usage tracking

---

## 💰 Monetization Strategy

### Revenue Streams:
1. **Subscriptions** (Primary)
   - Monthly/Annual plans
   - Usage-based overages
   - Team seats

2. **Enterprise** (High-value)
   - Custom pricing
   - On-premise options
   - Dedicated support

3. **Marketplace** (Future)
   - Template sales
   - Plugin marketplace
   - Premium features

### Pricing Philosophy:
- **Free tier:** Generous for learning/trial
- **Pro tier:** Sweet spot for individuals ($20)
- **Team tier:** Small teams ($50)
- **Enterprise:** Custom for big companies

---

## 📊 Success Metrics

### Week 1:
- [ ] CLI page updated
- [ ] Payment system live
- [ ] First paying customer

### Month 1:
- [ ] 100 signups
- [ ] 10 paying customers
- [ ] $200 MRR

### Month 3:
- [ ] 1,000 signups
- [ ] 50 paying customers
- [ ] $1,000 MRR

### Month 6:
- [ ] 10,000 signups
- [ ] 200 paying customers
- [ ] $4,000 MRR

---

## 🛠️ Tech Stack Summary

**Frontend:**
- Next.js 15
- React 19
- Tailwind CSS
- shadcn/ui components

**Backend:**
- Next.js API routes
- Prisma ORM
- PostgreSQL
- Redis (optional)

**Payment:**
- Stripe Checkout
- Stripe Customer Portal
- Webhook handling

**Authentication:**
- NextAuth.js
- OAuth providers
- API keys

**Deployment:**
- Vercel (frontend)
- Vercel Postgres (database)
- Stripe (payments)

---

## 📞 Decision Points

### Need to Decide:
1. **GitHub URL** - Where is the actual repo?
2. **npm Package Name** - What's the real CLI package?
3. **Pricing** - Confirm final pricing tiers
4. **Payment Gateway** - Stripe confirmed?
5. **Support Email** - support@recoder.xyz?
6. **Legal** - ToS, Privacy Policy ready?

### Nice to Have:
1. Custom domain email
2. Status page
3. Changelog automation
4. Analytics (PostHog, Mixpanel?)
5. Error tracking (Sentry?)

---

## 🎯 Immediate Action Plan

**Let's start with the most critical fixes:**

### Step 1: Fix CLI Page (30 min)
Make it match the homepage theme

### Step 2: Setup Stripe (1 hour)
- Create account
- Get API keys
- Create products

### Step 3: Update Pricing Page (1 hour)
- Add real pricing
- Add Stripe buttons
- Test checkout flow

### Step 4: Implement Payment System (4 hours)
- API routes
- Webhook handling
- Database integration

**Total Time: ~6-7 hours to get payments working**

---

Ready to start? Let's prioritize what to build first! 🚀
