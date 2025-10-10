# 🔐 Recoder.xyz Authentication Implementation Plan

## ✅ Current Status

### What's Working
1. ✅ **Homepage** - Black/Orange/Purple theme implemented
2. ✅ **Sign In Page** - Enterprise-grade UI with OAuth (GitHub + Google)
3. ✅ **Sign Up/Register Page** - Beautiful two-column layout
4. ✅ **Docs Page** - Proper theme matching
5. ✅ **Blog Page** - Proper theme matching
6. ✅ **Pricing Page** - With yearly discount options
7. ✅ **Environment Variables** - Google OAuth credentials added
8. ✅ **PostCSS Configuration** - Properly configured

### What Needs Implementation
- ❌ Backend API endpoints (`/api/auth/register`, `/api/auth/login`)
- ❌ Database integration (PostgreSQL/Prisma)
- ❌ Payment system (Paddle/DODO Pay)
- ❌ User dashboard
- ❌ API key management UI
- ❌ CLI authentication integration

---

## 🎯 Implementation Strategy

### Phase 1: Authentication Backend (Priority: HIGH)
**Goal**: Make sign up/sign in functional

#### 1.1 Database Setup
```bash
# In /app directory
cd /Users/arhansubasi/recoder.xyz/app

# Initialize Prisma schema
npx prisma init

# Create schema for users, sessions, api keys
# Run migrations
npx prisma migrate dev --name init
npx prisma generate
```

#### 1.2 API Endpoints Needed
- [ ] `POST /api/auth/register` - Create new user
- [ ] `POST /api/auth/login` - Sign in user
- [ ] `POST /api/auth/logout` - Sign out user
- [ ] `GET /api/auth/session` - Get current session
- [ ] `POST /api/auth/oauth/github` - GitHub OAuth callback
- [ ] `POST /api/auth/oauth/google` - Google OAuth callback
- [ ] `GET /api/auth/verify-email` - Email verification

#### 1.3 Authentication Flow
```
User → Sign Up Page → API /register → Create User in DB → Generate JWT
                                                         → Create Session
                                                         → Redirect to Dashboard
```

---

### Phase 2: Payment Integration (Priority: HIGH)
**Goal**: Enable paid subscriptions

#### 2.1 Pricing Tiers (Based on Bolt.new)
```
FREE:      $0/month    - 100 AI tokens, basic features
WEEKLY:    $10/week    - 5,000 tokens, all features
MONTHLY:   $20/month   - 20,000 tokens (or $18/mo yearly = $216/yr)
PRO:       $100/month  - 100,000 tokens (5x) (or $90/mo yearly = $1,080/yr)
ENTERPRISE: Custom     - Unlimited, custom deployment
```

#### 2.2 Payment Providers Setup

**PADDLE Integration:**
```typescript
// app/lib/paddle.ts
import { Paddle } from '@paddle/paddle-js';

export const paddle = new Paddle({
  environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as 'sandbox' | 'production',
  token: process.env.PADDLE_VENDOR_ID!
});
```

**DODO Pay Integration:**
```typescript
// app/lib/dodopay.ts
export const dodoPay = {
  baseUrl: process.env.DODO_PAY_BASE_URL,
  apiKey: process.env.DODO_PAY_API_KEY
};
```

#### 2.3 API Endpoints for Payments
- [ ] `POST /api/payments/create-checkout` - Create payment session
- [ ] `POST /api/payments/webhook/paddle` - Paddle webhook handler
- [ ] `POST /api/payments/webhook/dodo` - DODO Pay webhook handler
- [ ] `GET /api/payments/subscription` - Get user subscription
- [ ] `POST /api/payments/cancel` - Cancel subscription
- [ ] `POST /api/payments/update` - Update subscription

---

### Phase 3: User Dashboard (Priority: MEDIUM)
**Goal**: User management interface

#### 3.1 Dashboard Pages
- [ ] `/dashboard` - Overview, usage stats
- [ ] `/dashboard/projects` - User projects
- [ ] `/dashboard/settings` - Account settings
- [ ] `/dashboard/billing` - Subscription management
- [ ] `/dashboard/api-keys` - API key management
- [ ] `/dashboard/team` - Team management (Pro+)

#### 3.2 Dashboard Features
- Usage metrics visualization
- Recent activity
- API key generation/revocation
- Subscription upgrade/downgrade
- Billing history
- Team member management

---

### Phase 4: CLI Authentication (Priority: MEDIUM)
**Goal**: Enable CLI to authenticate with website

#### 4.1 CLI Authentication Flows

**Option 1: Device Flow (Recommended)**
```bash
# User runs in terminal
recoder auth login --device-flow

# CLI generates code and shows:
# "Visit: https://recoder.xyz/auth/device"
# "Enter code: ABC-123"

# User opens browser, enters code
# CLI polls /api/auth/device/poll until approved
# Returns JWT token, stores in ~/.recoder/config
```

**Option 2: Web OAuth Flow**
```bash
# User runs in terminal  
recoder auth login --web

# CLI opens browser: https://recoder.xyz/auth/cli?callback=http://localhost:8080
# User signs in on website
# Website redirects to localhost with token
# CLI captures token, stores locally
```

**Option 3: API Key**
```bash
# User generates key at https://recoder.xyz/dashboard/api-keys
# User runs:
recoder auth login --api-key <key>

# CLI validates key with API, stores locally
```

#### 4.2 CLI API Endpoints
- [ ] `POST /api/auth/cli/device` - Start device flow
- [ ] `POST /api/auth/cli/device/verify` - User enters code
- [ ] `GET /api/auth/cli/device/poll` - CLI polls for approval
- [ ] `POST /api/auth/cli/callback` - Web OAuth callback
- [ ] `POST /api/auth/cli/api-key/validate` - Validate API key

---

### Phase 5: Additional Pages (Priority: LOW)
**Goal**: Complete website content

#### 5.1 Legal Pages
- [ ] `/terms` - Terms of Service
- [ ] `/privacy` - Privacy Policy
- [ ] `/security` - Security practices

#### 5.2 Marketing Pages
- [ ] `/about` - About Recoder.xyz
- [ ] `/contact` - Contact form
- [ ] `/case-studies` - Success stories
- [ ] `/testimonials` - User testimonials

#### 5.3 Documentation Pages
All docs pages need actual content:
- [ ] `/docs/installation` - Setup guide
- [ ] `/docs/cli/commands` - CLI reference
- [ ] `/docs/api/rest` - API documentation
- [ ] Video tutorials
- [ ] Example projects

---

## 🔧 Technical Implementation Details

### Database Schema (Prisma)
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  password      String?   // Hashed
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  accounts      Account[]
  sessions      Session[]
  apiKeys       ApiKey[]
  subscription  Subscription?
  usage         Usage[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String  // oauth, email
  provider          String  // github, google
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ApiKey {
  id        String   @id @default(cuid())
  userId    String
  name      String
  key       String   @unique // Hashed
  lastUsed  DateTime?
  createdAt DateTime @default(now())
  expiresAt DateTime?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Subscription {
  id        String   @id @default(cuid())
  userId    String   @unique
  plan      String   // free, weekly, monthly, pro, enterprise
  status    String   // active, cancelled, expired
  provider  String   // paddle, dodo
  customerId String?
  priceId   String?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Usage {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime @default(now())
  tokens    Int      @default(0)
  apiCalls  Int      @default(0)
  
  user User @relation(fields: [userId], references: [id])
  
  @@index([userId, date])
}
```

### Environment Variables for Vercel

**Required for Production:**
```bash
# Application
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://recoder.xyz
NEXT_PUBLIC_SITE_URL=https://recoder.xyz

# Auth
NEXTAUTH_SECRET=<generated-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://recoder.xyz
SESSION_SYNC_SECRET=<generated-secret>
JWT_SECRET=<generated-secret>

# OAuth
GITHUB_ID=Ov23liVrw6X0xO8m2jPy
GITHUB_SECRET=<your-github-secret>
GOOGLE_CLIENT_ID=716966330476-u9b9p6bi7u5oqva2th0j9rg37phl969c.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

# Database (Get from Vercel Postgres)
DATABASE_URL=<vercel-postgres-url>

# Redis (Optional - for session storage)
REDIS_URL=<upstash-redis-url>

# Payments
PADDLE_VENDOR_ID=<your-paddle-vendor-id>
PADDLE_API_KEY=<your-paddle-api-key>
PADDLE_PUBLIC_KEY=<your-paddle-public-key>
PADDLE_WEBHOOK_SECRET=<your-paddle-webhook-secret>
NEXT_PUBLIC_PADDLE_VENDOR_ID=<your-paddle-vendor-id>
NEXT_PUBLIC_PADDLE_ENVIRONMENT=production

DODO_PAY_API_KEY=<your-dodo-api-key>
DODO_PAY_SECRET=<your-dodo-secret>
DODO_PAY_WEBHOOK_SECRET=<your-dodo-webhook-secret>
DODO_PAY_BASE_URL=https://api.dodo.dev

# Security
API_ENCRYPTION_KEY=<generated-32-byte-key>
RATE_LIMIT_ENABLED=true
```

---

## 📋 Quick Action Plan

### Today (3-4 hours)
1. ✅ Fix environment variables (DONE)
2. ✅ Update OAuth credentials (DONE)
3. ⏳ Set up Prisma database
4. ⏳ Create basic auth API endpoints
5. ⏳ Deploy to Vercel with updated env vars

### Tomorrow (3-4 hours)
1. ⏳ Test authentication flows
2. ⏳ Implement user dashboard
3. ⏳ Set up Paddle/DODO Pay accounts
4. ⏳ Create checkout flows

### Day 3 (3-4 hours)
1. ⏳ Implement CLI authentication
2. ⏳ Create API key management
3. ⏳ Add usage tracking
4. ⏳ Test end-to-end flows

### Day 4 (2-3 hours)
1. ⏳ Polish UI/UX
2. ⏳ Add error handling
3. ⏳ Security audit
4. ⏳ Final testing
5. 🚀 Launch!

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All environment variables set in Vercel
- [ ] Database migrations run
- [ ] OAuth redirect URLs configured
  - GitHub: `https://recoder.xyz/auth/oauth-success`
  - Google: `https://recoder.xyz/auth/oauth-success`
- [ ] Payment webhook endpoints registered
- [ ] SSL certificates active
- [ ] DNS configured properly

### Post-Deployment
- [ ] Test sign up flow
- [ ] Test sign in flow
- [ ] Test OAuth flows (GitHub, Google)
- [ ] Test payment flow
- [ ] Test CLI authentication
- [ ] Monitor error logs
- [ ] Set up alerts

---

## 📊 Success Metrics

### Week 1
- 100 sign ups
- 10 paid conversions
- 50 active CLI users

### Month 1
- 1,000 sign ups
- 100 paid conversions ($2,000 MRR)
- 500 active users

### Month 3
- 5,000 sign ups
- 500 paid conversions ($10,000 MRR)
- 2,500 active users

---

## 🔐 Security Considerations

1. **Password Hashing**: Use bcrypt with salt rounds >= 12
2. **JWT Tokens**: Short-lived (15 min), with refresh tokens (7 days)
3. **Rate Limiting**: Strict limits on auth endpoints
4. **CSRF Protection**: Implement CSRF tokens
5. **XSS Prevention**: Sanitize all user inputs
6. **SQL Injection**: Use Prisma ORM (prevents SQL injection)
7. **API Key Storage**: Hash API keys before storing
8. **Webhook Validation**: Verify webhook signatures
9. **HTTPS Only**: Force HTTPS in production
10. **Security Headers**: Implement proper security headers

---

## 📞 Support & Contact

- **Email**: support@recoder.xyz
- **GitHub**: https://github.com/recoder-xyz/recoder (when ready)
- **Discord**: TBD
- **Twitter**: TBD

---

## 🎉 Next Steps

1. **Review this plan** - Make sure it aligns with your vision
2. **Answer questions**:
   - Do you want to start with Paddle or DODO Pay first?
   - Do you have database credentials ready?
   - Any specific features to prioritize?
3. **Begin implementation** - Follow phase 1 first
4. **Iterate and improve** - Based on user feedback

Let's build something amazing! 🚀
