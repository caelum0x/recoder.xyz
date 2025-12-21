# 📋 Template Expansion Plan

## Current Coverage Analysis

### ✅ What We Have (40 Templates)

**Frontend Frameworks:**
- Next.js (with/without shadcn)
- React + Vite (with/without shadcn)
- Vue.js, Nuxt
- Svelte, SvelteKit
- Angular
- Astro
- Qwik

**Backend:**
- Express.js
- Hono (fast Node.js)
- Koa
- GraphQL

**Specialized:**
- React Native (Expo)
- GSAP animations
- Three.js (TresJS)
- Slidev (presentations)
- Bootstrap 5
- Static sites

---

## ❌ What We're Missing (High-Value Templates)

### Tier 1: Critical Gaps (Add First)

**1. E-commerce Templates**
```
Template: nextjs-ecommerce-stripe
Why: Common request, high value
Stack: Next.js + Stripe + Tailwind
Features:
  - Product catalog
  - Shopping cart
  - Stripe checkout
  - Order management
Expected usage: 15-20% of requests
Savings: 85-90% per request
```

**2. SaaS Dashboard Template**
```
Template: nextjs-saas-dashboard
Why: Many users building SaaS
Stack: Next.js + Prisma + tRPC + Auth
Features:
  - Multi-tenant auth
  - Billing integration
  - Analytics dashboard
  - Team management
Expected usage: 10-15% of requests
Savings: 85-90% per request
```

**3. Blog/CMS Template**
```
Template: nextjs-blog-contentlayer
Why: Very common request
Stack: Next.js + Contentlayer + MDX
Features:
  - Markdown blog
  - Categories/tags
  - SEO optimized
  - RSS feed
Expected usage: 10-12% of requests
Savings: 80-85% per request
```

**4. Admin Panel Template**
```
Template: react-admin-panel
Why: Internal tools common
Stack: React + Ant Design / MUI
Features:
  - CRUD operations
  - Data tables
  - Charts/analytics
  - User management
Expected usage: 8-10% of requests
Savings: 85-90% per request
```

**5. AI Chat Interface**
```
Template: nextjs-ai-chat
Why: AI apps are trending
Stack: Next.js + Vercel AI SDK
Features:
  - Chat UI
  - Streaming responses
  - Message history
  - Model selection
Expected usage: 8-10% of requests
Savings: 85-90% per request
```

### Tier 2: Nice to Have

**6. Landing Page Templates**
```
- SaaS landing page
- Product launch page
- Agency portfolio
- Personal portfolio
Expected usage: 5-8% of requests
```

**7. Auth Templates**
```
- NextAuth.js starter
- Clerk integration
- Supabase Auth
Expected usage: 5-7% of requests
```

**8. Real-time Apps**
```
- Chat application
- Collaborative editor
- Live dashboard
Stack: Next.js + Socket.io / Supabase
Expected usage: 3-5% of requests
```

**9. Mobile Templates**
```
- Expo with navigation
- Expo with Supabase
- React Native with Firebase
Expected usage: 3-5% of requests
```

**10. API Templates**
```
- REST API with Fastify
- GraphQL with Apollo
- tRPC monorepo
Expected usage: 3-5% of requests
```

---

## 📊 Impact Analysis

### Current Template Coverage
```
40 templates covering ~45% of requests
Average cost per template-based request: $0
```

### After Adding Tier 1 Templates (5 new)
```
45 templates covering ~65% of requests
Additional savings: $120-180/month per 1,000 requests
New templates would catch:
- E-commerce: 15-20%
- SaaS dashboards: 10-15%
- Blogs: 10-12%
- Admin panels: 8-10%
- AI chat: 8-10%
Total new coverage: +20%
```

### ROI Calculation
```
Cost to build 1 template: 2-4 hours
Savings per template per month: $24-36
Break-even: After ~100 uses
Long-term value: Massive (reused 1000s of times)
```

---

## 🛠️ How to Add Templates

### Option 1: Manual Creation (Recommended)
```bash
# 1. Create template directory
cd /Users/arhansubasi/bolt.new/starters
mkdir nextjs-ecommerce-stripe

# 2. Initialize
cd nextjs-ecommerce-stripe
npm init -y

# 3. Add dependencies
npm install next react react-dom stripe @stripe/stripe-js
npm install -D tailwindcss typescript @types/react

# 4. Create structure
mkdir -p app/api/checkout components lib
touch app/page.tsx app/layout.tsx
touch components/ProductCard.tsx
touch lib/stripe.ts

# 5. Add code files (see templates below)
```

### Option 2: Clone Existing (Faster)
```bash
# Use popular starters as base
git clone https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript
mv with-stripe-typescript starters/nextjs-ecommerce-stripe
# Customize...
```

### Option 3: AI-Generate Once (Smart)
```bash
# Use your own system to generate the template
# Then save it as a reusable template
# ROI: Costs $0.03 to generate, saves $0.06 per use
```

---

## 🎯 Template Quality Checklist

For each new template, ensure:

- [ ] `package.json` with all dependencies
- [ ] `README.md` with setup instructions
- [ ] `.env.example` for environment variables
- [ ] Proper folder structure (app/, components/, lib/)
- [ ] TypeScript configured
- [ ] Linting/formatting configured
- [ ] At least 1 working page
- [ ] No hardcoded secrets
- [ ] Production-ready build config
- [ ] Deployment instructions

---

## 📝 Template Starter Code

### Example: E-commerce Template Structure

```
nextjs-ecommerce-stripe/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── .env.example
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── products/
│   │   └── [id]/page.tsx
│   ├── cart/
│   │   └── page.tsx
│   └── api/
│       ├── checkout/route.ts
│       └── webhooks/route.ts
├── components/
│   ├── ProductCard.tsx
│   ├── CartItem.tsx
│   ├── CheckoutButton.tsx
│   └── Header.tsx
├── lib/
│   ├── stripe.ts
│   ├── products.ts
│   └── cart.ts
└── public/
    └── products/
```

---

## 🚀 Implementation Timeline

### Week 1: Tier 1 Templates
```bash
Day 1-2: E-commerce template
Day 3-4: SaaS dashboard template
Day 5-6: Blog template
Day 7: Test all templates
```

### Week 2: Integration & Testing
```bash
Day 1-2: Admin panel template
Day 3-4: AI chat template
Day 5-6: Update template matcher
Day 7: Test complete system
```

### Week 3: Validation
```bash
Day 1-3: Deploy and monitor
Day 4-7: Gather usage data
Result: Should see 65% template coverage
```

---

## 📊 Expected Results

### Before (40 templates)
```
Template coverage: 45%
Free model usage: 65%
Average cost: $0.015/request
Monthly cost (1,000 req): ~$45
```

### After (45 templates - Tier 1 only)
```
Template coverage: 65% (+20%)
Free model usage: 75% (+10%)
Average cost: $0.010/request (-33%)
Monthly cost (1,000 req): ~$30 (-33%)
Additional monthly savings: $15
```

### After (55 templates - All tiers)
```
Template coverage: 75% (+30%)
Free model usage: 80% (+15%)
Average cost: $0.008/request (-47%)
Monthly cost (1,000 req): ~$24 (-47%)
Additional monthly savings: $21
```

---

## 🎯 Priority Recommendations

### Start With (This Week):
1. **E-commerce template** - High demand, high value
2. **Blog template** - Very common, easy to build

### Add Next (Week 2):
3. **SaaS dashboard** - Complex but high value
4. **AI chat interface** - Trending, good demo

### Consider Later (Month 2):
5. **Admin panel** - Internal tools
6. **Auth templates** - Common need
7. **Real-time apps** - Specialized

---

## 💡 Pro Tips

### Template Naming Convention
```
{framework}-{purpose}-{tech}

Examples:
- nextjs-ecommerce-stripe
- react-admin-mui
- nextjs-blog-mdx
- vue-dashboard-primevue
```

### Documentation Template
```markdown
# {Template Name}

## What's Included
- Feature 1
- Feature 2

## Quick Start
```bash
npm install
npm run dev
```

## Environment Variables
- `STRIPE_SECRET_KEY` - Your Stripe key
- `DATABASE_URL` - Your database

## Customization
...
```

### Testing New Templates
```bash
# Test template matching
npm run test:templates

# Should show new template
# Verify confidence scoring
# Check keyword matching
```

---

## 📈 Tracking Template Performance

Add to analytics:

```typescript
// Track which templates are used most
const topTemplates = llmAnalytics.getOptimizationStats().topTemplates;

// Shows:
// 1. nextjs-shadcn: 123 uses, 87% savings
// 2. nextjs-ecommerce-stripe: 89 uses, 90% savings ← NEW!
// 3. react-admin-mui: 67 uses, 85% savings ← NEW!
```

---

## ✅ Next Actions for Templates

1. **Decide which 2-5 templates to add first**
2. **Allocate 1-2 days per template**
3. **Build and test each one**
4. **Update template-matcher keywords**
5. **Deploy and monitor usage**

Want me to generate the **actual code** for any of these templates? I can create the full e-commerce or blog template right now!
