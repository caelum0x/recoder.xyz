# Starter Template System - Usage Examples

## Example 1: Simple Blog Creation

### User Request
```
"Create a blog app"
```

### What Happens

**Before** (Old System):
```
AI generates from scratch:
├── package.json (AI writes dependencies)
├── app/layout.tsx (AI writes layout)
├── app/page.tsx (AI writes homepage)
├── components/Header.tsx (AI writes header)
├── components/Footer.tsx (AI writes footer)
├── components/PostCard.tsx (AI writes post card)
├── lib/posts.ts (AI writes post loader)
├── styles/globals.css (AI writes styles)
└── ... 40+ more files

Time: 30-60 seconds
Cost: ~$0.05-0.10
Quality: May miss configs, best practices
```

**After** (New System with Starter Injection):
```
System detects: "blog" → matches nextjs-blog-mdx
Loads from /starters/nextjs-blog-mdx:
├── package.json ✓ (already coded)
├── app/layout.tsx ✓ (already coded)
├── app/page.tsx ✓ (already coded)
├── components/Header.tsx ✓ (already coded)
├── components/Footer.tsx ✓ (already coded)
├── components/PostCard.tsx ✓ (already coded)
├── lib/posts.ts ✓ (already coded)
├── styles/globals.css ✓ (already coded)
└── ... 40+ files ✓ (all pre-coded)

Time: <1 second
Cost: $0.00
Quality: Production-ready, tested code
```

### System Logs
```
🎯 Direct keyword match: nextjs-blog-mdx (85% confidence)
📦 Preparing to inject starter: nextjs-blog-mdx
  ✅ Loaded: package.json
  ✅ Loaded: app/layout.tsx
  ✅ Loaded: app/page.tsx
  ... (47 files total)
✅ Starter prepared: 47 files ready to inject
🚀 Returning pre-loaded starter directly (bypassing AI)
```

### User Receives
```markdown
I've loaded the **nextjs-blog-mdx** starter template with 47 pre-configured files!

<boltArtifact id="nextjs-blog-mdx-starter" title="Next.js Blog MDX Project">
  <boltAction type="file" filePath="package.json">
    {
      "name": "nextjs-blog-mdx",
      "version": "1.0.0",
      "dependencies": {
        "next": "^14.0.0",
        "react": "^18.2.0",
        ...
      }
    }
  </boltAction>
  
  <boltAction type="file" filePath="app/layout.tsx">
    import './globals.css'
    ...
  </boltAction>
  
  ... (45 more files)
  
  <boltAction type="shell">
    npm install
  </boltAction>
  
  <boltAction type="shell">
    npm run dev
  </boltAction>
</boltArtifact>

The project is ready to use! All dependencies are configured and the development server will start automatically.
```

---

## Example 2: Blog with Customization

### User Request
```
"Create a blog app with dark mode and newsletter signup"
```

### What Happens

**System Flow:**
```
1. Detects: "blog" → matches nextjs-blog-mdx
2. Loads 47 files from starter
3. Injects starter context into AI prompt
4. AI sees: "Base blog already loaded, only add dark mode + newsletter"
5. AI generates ONLY the customizations:
   - Dark mode toggle component
   - Newsletter form component
   - Updated theme configuration
```

### AI Receives This Context
```
🎯 STARTER TEMPLATE LOADED: nextjs-blog-mdx

I've already loaded 47 files from the nextjs-blog-mdx starter template into the project.
All the base code is already there - you don't need to recreate it!

WHAT'S ALREADY INCLUDED:
- Framework: next, react, mdx-components, typescript
- 47 pre-coded files
- Complete project structure
- All dependencies configured

USER'S REQUEST: Create a blog app with dark mode and newsletter signup

YOUR TASK:
1. ✅ The starter files are ALREADY in the project
2. ✅ Identify which files need customization for the user's request
3. ✅ ONLY modify/add files that need changes
4. ❌ DO NOT recreate existing files unless they need modification
5. ❌ DO NOT generate boilerplate - it's already there

Focus on the DELTA (changes needed), not the FULL project!
```

### AI Response
```markdown
I've loaded the Next.js blog starter. Now adding dark mode and newsletter functionality.

<boltArtifact id="nextjs-blog-mdx-starter" title="Next.js Blog with Dark Mode">
  <!-- Base files already loaded, only adding customizations -->
  
  <boltAction type="file" filePath="components/ThemeToggle.tsx">
    'use client'
    import { useTheme } from 'next-themes'
    ...
  </boltAction>
  
  <boltAction type="file" filePath="components/Newsletter.tsx">
    'use client'
    import { useState } from 'react'
    ...
  </boltAction>
  
  <boltAction type="file" filePath="app/layout.tsx">
    <!-- Modified to include ThemeProvider -->
    import { ThemeProvider } from 'next-themes'
    ...
  </boltAction>
  
  <boltAction type="shell">
    npm install next-themes
  </boltAction>
</boltArtifact>

I've added dark mode support and newsletter signup to your blog!
```

**Time:** 5-10 seconds (only customizations)
**Cost:** ~$0.01 (80% savings)
**Result:** Blog starter + dark mode + newsletter

---

## Example 3: E-commerce Store

### User Request
```
"Create an e-commerce store"
```

### System Detection
```
Keywords: "e-commerce", "store"
Match: nextjs-ecommerce-stripe (85% confidence)
Files: 62 pre-coded files
```

### Files Loaded from `/starters/nextjs-ecommerce-stripe`
```
✅ package.json (Stripe, Next.js, shadcn configured)
✅ app/products/page.tsx (Product listing)
✅ app/product/[id]/page.tsx (Product detail)
✅ app/cart/page.tsx (Shopping cart)
✅ app/checkout/page.tsx (Checkout flow)
✅ components/ProductCard.tsx (Product display)
✅ components/CartButton.tsx (Add to cart)
✅ components/CheckoutForm.tsx (Payment form)
✅ lib/stripe.ts (Stripe integration)
✅ lib/cart.ts (Cart logic)
... 52 more files
```

### User Receives
Complete e-commerce store with:
- Product catalog
- Shopping cart
- Stripe checkout
- Order management
- Responsive design
- All in <1 second!

---

## Example 4: Express API with Authentication

### User Request
```
"Create an Express API with user authentication"
```

### Detection
```
Keywords: "express", "authentication"
Match: express-typescript-auth (80% confidence)
```

### Loaded Features
```
From /starters/express-typescript-auth:

✅ JWT authentication
✅ User registration
✅ Login/logout
✅ Password hashing (bcrypt)
✅ Email verification
✅ Password reset
✅ Refresh tokens
✅ Prisma ORM setup
✅ TypeScript types
✅ API documentation
✅ Rate limiting
✅ Input validation (Zod)
✅ Error handling
✅ Logger setup
... all pre-coded!
```

---

## Comparison Table

| Aspect | Without Starters | With Starter Injection |
|--------|-----------------|------------------------|
| **Time** | 30-60 seconds | <1 second |
| **AI Cost** | $0.05-0.10 | $0.00 |
| **Files Generated** | 40-60 files from scratch | 0 (pre-loaded) |
| **Code Quality** | Variable | Production-tested |
| **Best Practices** | May be missed | Built-in |
| **TypeScript** | May have errors | Fully typed |
| **Dependencies** | May be incomplete | Complete |
| **Configuration** | May be missing | All included |

---

## Supported Project Types

| User Says | System Loads | Files |
|-----------|-------------|-------|
| "blog" | `nextjs-blog-mdx` | 47 |
| "e-commerce" | `nextjs-ecommerce-stripe` | 62 |
| "mobile app" | `bolt-expo` | 35 |
| "express api" | `express-typescript` | 28 |
| "express auth" | `express-typescript-auth` | 45 |
| "next.js app" | `nextjs-shadcn` | 52 |
| "angular app" | `angular` | 38 |
| "react app" | `bolt-vite-react-ts` | 24 |

---

## Benefits Summary

✅ **Instant Results** - No waiting for AI generation
✅ **Zero Cost** - No AI tokens used for boilerplate
✅ **Perfect Code** - Production-tested starters
✅ **Complete Setup** - All configs, types, dependencies
✅ **Best Practices** - Industry-standard architecture
✅ **Customizable** - AI only handles the delta
✅ **Scalable** - Easy to add more starters

The starter injection system transforms how projects are created in bolt.new!
