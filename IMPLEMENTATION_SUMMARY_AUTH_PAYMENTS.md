# Recoder.xyz Implementation Summary - Authentication & Payments

## 🎯 What We've Built

This document summarizes the complete authentication, payment, and user tracking system for **recoder.xyz** and **recoder-code** integration.

---

## ✅ Completed Components

### 1. Database Schema (Prisma)

**Location**: `/app/prisma/schema.prisma`

**Models Created:**

- ✅ **User** - Core user model with subscription tracking
- ✅ **AuthCode** - OAuth authorization codes (short-lived)
- ✅ **DeviceCode** - Device flow authentication
- ✅ **CLISession** - CLI access/refresh tokens
- ✅ **ApiKey** - Long-lived API keys for advanced users
- ✅ **WorkSession** - Session-based work tracking (NEW)
- ✅ **UserQuota** - Daily session limits and token limits (UPDATED)
- ✅ **UsageRecord** - Individual AI request tracking
- ✅ **PlatformApiKey** - Platform OpenRouter keys for premium users

**Key Features:**
- Session-based tracking (not per-request)
- Daily session limits: 6, 10, 15, 20 based on plan
- Token limits per session for pricey models only
- Unlimited tracking for free models (Gemini Flash, Llama, etc.)
- Proper relations between all tables
- Indexes for performance

### 2. Pricing Page

**Location**: `/app/app/pricing/page.tsx`

**Plans Configured:**

```typescript
Free:    $0/forever   - 6 sessions/day,  10k tokens/session
Weekly:  $10/week     - 10 sessions/day, 30k tokens/session
Monthly: $20/month    - 15 sessions/day, 50k tokens/session
Pro:     $100/month   - 20 sessions/day, 100k tokens/session
```

**Features:**
- Clean, simple presentation (no excessive explanations)
- Billing toggle (monthly/yearly with 10% discount)
- Mobile responsive
- Direct signup links
- Enterprise contact section
- FAQ section

### 3. Payment Integration

**DODO Pay Integration** (Primary):
- **Location**: `/app/lib/dodopayments.ts`
- **Features**: Credit cards, bank transfers, subscriptions
- **SDK**: `dodopayments` npm package
- **Note**: NOT a crypto payment processor (standard payment gateway)

**Paddle Integration** (Secondary):
- **Location**: `/app/lib/payments/paddle.ts`
- **Features**: Subscription management, tax handling, invoicing
- **SDK**: Paddle.js

**API Routes:**
- `/app/api/billing/checkout/dodo/route.ts` - DODO checkout
- `/app/api/billing/checkout/paddle/route.ts` - Paddle checkout

### 4. Authentication Documentation

**For AI Copilot**: `/RECODER_CODE_AUTH_INTEGRATION_COMPLETE_GUIDE.md`

**Contents:**
- Complete authentication flow diagrams
- User journey explanations (free vs premium)
- Three auth methods: Web OAuth, Device Flow, API Keys
- Database schema details
- Session management logic
- Code examples for CLI integration
- Environment variable setup
- Security best practices

### 5. Environment Configuration

**Location**: `/app/.env.example`

**Configured:**
- ✅ Database URLs (PostgreSQL)
- ✅ OAuth providers (GitHub, Google, Discord)
- ✅ Payment providers (DODO Pay, Paddle)
- ✅ API keys encryption settings
- ✅ JWT token configuration
- ✅ Platform OpenRouter keys
- ✅ Production URL structure:
  - `https://recoder.xyz` - Main website
  - `https://api.recoder.xyz` - Backend API
  - `https://web.recoder.xyz` - Bolt-like IDE

---

## 🔧 Implementation Details

### Session-Based Tracking Logic

**Free Users:**
```
1. User authenticates with their OpenRouter API key
2. System tracks daily sessions (6 per day limit)
3. Each session can use 10k tokens for pricey models
4. Free models (Gemini Flash, Llama) are unlimited
5. Session ends after 30 minutes inactivity or manual close
6. Resets daily at midnight UTC
```

**Premium Users (Weekly/Monthly/Pro):**
```
1. User authenticates (NO API key needed)
2. System uses platform OpenRouter keys (load balanced)
3. Higher session limits: 10-20 per day
4. Higher token limits: 30k-100k per session
5. Pricey models tracked against limits
6. Free models still unlimited
7. Premium support and features
```

### API Key Management

**For Free Users:**
- User provides their own OpenRouter API key
- Key is encrypted with AES-256 and stored in database
- Validated before storing
- Used for all AI requests
- Can be updated/removed anytime

**For Premium Users:**
- Platform maintains pool of OpenRouter API keys
- Load balanced across multiple keys
- Automatic failover if quota exceeded
- Keys rotated regularly for security
- Users never see or manage keys

### Quota Enforcement

**Daily Reset:**
```typescript
// Runs at midnight UTC
async function resetDailyQuotas() {
  await db.userQuota.updateMany({
    where: {
      periodEnd: { lte: new Date() }
    },
    data: {
      sessionsUsedToday: 0,
      periodStart: new Date(),
      periodEnd: addDays(new Date(), 1),
      lastResetAt: new Date()
    }
  });
}
```

**Session Start Check:**
```typescript
async function startSession(userId: string) {
  const quota = await getUserQuota(userId);
  
  if (quota.sessionsUsedToday >= quota.sessionsPerDay) {
    throw new QuotaExceededError(
      `Daily session limit reached (${quota.sessionsPerDay}). ` +
      'Upgrade your plan or wait for daily reset.'
    );
  }
  
  // Create session
  const session = await db.workSession.create({
    data: {
      userId,
      sessionToken: generateToken(),
      startedAt: new Date(),
      isActive: true
    }
  });
  
  // Increment session count
  await db.userQuota.update({
    where: { userId },
    data: {
      sessionsUsedToday: { increment: 1 }
    }
  });
  
  return session;
}
```

**Token Tracking (Pricey Models Only):**
```typescript
async function trackRequest(sessionId: string, request: AIRequest) {
  const session = await getSession(sessionId);
  const isPricey = isPriceyModel(request.model);
  
  // Update session tokens
  if (isPricey) {
    const newTokens = session.tokensUsed + request.tokensUsed;
    const quota = await getUserQuota(session.userId);
    
    if (newTokens > quota.tokensPerSession) {
      throw new QuotaExceededError(
        `Session token limit exceeded (${quota.tokensPerSession}). ` +
        'Start a new session or use a free model.'
      );
    }
    
    await db.workSession.update({
      where: { id: sessionId },
      data: {
        tokensUsed: newTokens,
        totalCost: { increment: request.cost },
        requestCount: { increment: 1 },
        lastActivityAt: new Date()
      }
    });
  }
  
  // Record usage
  await db.usageRecord.create({
    data: {
      userId: session.userId,
      sessionId: sessionId,
      modelUsed: request.model,
      tokensUsed: request.tokensUsed,
      cost: request.cost,
      isPriceyModel: isPricey,
      success: true
    }
  });
}
```

---

## 🎨 User Flows

### New User Signup Flow

```
1. User visits recoder.xyz
   ↓
2. Clicks "Start Free" or "Start Monthly"
   ↓
3. Redirected to /auth/signup?plan=free
   ↓
4. Creates account (email/password or OAuth)
   ↓
5. User record created in database
   ↓
6. UserQuota record created with plan limits
   ↓
7. If free plan:
   → Onboarding modal: "Add your OpenRouter API key"
   → User provides key
   → Key validated and encrypted
   → Stored in user.openRouterApiKey
   ↓
8. If paid plan:
   → Redirected to payment page (DODO Pay or Paddle)
   → Payment completed
   → Subscription activated
   → User.subscriptionPlan updated
   ↓
9. Redirected to dashboard
   ↓
10. User can now use CLI or web interface
```

### CLI Authentication Flow

```
1. User installs recoder-code CLI
   ↓
2. Runs: recoder auth login
   ↓
3. CLI opens browser to recoder.xyz/auth/cli
   ↓
4. User authorizes CLI access
   ↓
5. Browser redirects to http://localhost:8080/callback
   ↓
6. CLI exchanges auth code for tokens
   ↓
7. Tokens saved to ~/.recoder/credentials.json (encrypted)
   ↓
8. CLI checks user subscription status
   ↓
9. If free: Prompt for OpenRouter key (if not set)
   ↓
10. Ready to use!
```

### AI Request Flow

```
1. User starts work in CLI: recoder "build a React app"
   ↓
2. CLI checks if authenticated
   ↓
3. Starts new work session (if first request of task)
   ↓
4. Checks session quota (sessions used < limit)
   ↓
5. Sends request to api.recoder.xyz/api/generate
   ↓
6. Backend checks user subscription:
   - Free: Use user's OpenRouter key
   - Premium: Use platform key (load balanced)
   ↓
7. Makes request to OpenRouter API
   ↓
8. Tracks usage:
   - If pricey model: Count tokens against session limit
   - If free model: Don't count (unlimited)
   ↓
9. Returns response to CLI
   ↓
10. Updates session.tokensUsed and session.lastActivityAt
    ↓
11. Records in usageRecords table for analytics
```

---

## 💳 Payment Processing

### DODO Pay Checkout

```typescript
// User clicks "Start Monthly" on pricing page
async function createDodoCheckout(userId: string, plan: string) {
  const user = await getUser(userId);
  const planConfig = PLANS[plan];
  
  const dodo = getDodoPayService();
  const subscription = await dodo.createSubscription({
    userId: user.id,
    email: user.email,
    plan: plan,
    amount: planConfig.price * 100,  // Convert to cents
    interval: planConfig.interval,   // 'week' or 'month'
    successUrl: 'https://recoder.xyz/dashboard?payment=success',
    cancelUrl: 'https://recoder.xyz/pricing?payment=canceled',
    metadata: {
      userId: user.id,
      plan: plan
    }
  });
  
  return subscription.checkoutUrl;
}
```

### Webhook Processing

```typescript
// When payment succeeds
app.post('/api/webhooks/dodo', async (req, res) => {
  const event = req.body;
  
  if (event.type === 'subscription.created') {
    // Activate subscription
    await activateSubscription(
      event.data.metadata.userId,
      event.data.metadata.plan
    );
    
    // Update quota limits
    await updateQuotaLimits(
      event.data.metadata.userId,
      event.data.metadata.plan
    );
    
    // Send welcome email
    await sendWelcomeEmail(event.data.metadata.userId);
  }
  
  res.json({ received: true });
});

async function activateSubscription(userId: string, plan: string) {
  const planConfig = PLANS[plan];
  
  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: 'active'
    }
  });
  
  await db.userQuota.update({
    where: { userId },
    data: {
      sessionsPerDay: planConfig.limits.sessionsPerDay,
      tokensPerSession: planConfig.limits.tokensPerSession
    }
  });
}
```

---

## 📊 Analytics & Monitoring

### Usage Dashboard

**Endpoint**: `GET /api/user/usage/stats`

**Returns:**
```json
{
  "today": {
    "sessionsUsed": 3,
    "sessionsLimit": 15,
    "tokensUsed": 12450,
    "requestCount": 24,
    "cost": 0.15
  },
  "thisMonth": {
    "totalSessions": 85,
    "totalTokens": 425000,
    "totalCost": 5.23,
    "averageSessionLength": 18  // minutes
  },
  "topModels": [
    { "model": "claude-3-5-sonnet", "requests": 45, "tokens": 250000 },
    { "model": "gemini-flash", "requests": 120, "tokens": 0 }  // Free, not counted
  ]
}
```

### Admin Monitoring

**Endpoint**: `GET /api/admin/platform/stats`

**Returns:**
```json
{
  "activeUsers": 1250,
  "subscriptions": {
    "free": 800,
    "weekly": 150,
    "monthly": 250,
    "pro": 50
  },
  "apiKeys": {
    "totalKeys": 3,
    "activeKeys": 3,
    "totalQuota": 3000000,
    "usedQuota": 1250000
  },
  "revenue": {
    "today": 450,
    "thisMonth": 12500
  }
}
```

---

## 🔒 Security Features

### API Key Encryption

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,  // 5 attempts
  message: 'Too many authentication attempts, please try again later'
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 60,  // 60 requests
  message: 'API rate limit exceeded'
});

app.use('/api/auth/login', authLimiter);
app.use('/api/*', apiLimiter);
```

---

## 📁 File Structure

```
recoder.xyz/
├── app/
│   ├── prisma/
│   │   └── schema.prisma                    ✅ Updated schema
│   ├── app/
│   │   ├── pricing/
│   │   │   └── page.tsx                     ✅ Updated pricing
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts  ✅ NextAuth config
│   │   │   │   └── cli/route.ts            ✅ CLI OAuth
│   │   │   ├── billing/
│   │   │   │   ├── checkout/
│   │   │   │   │   ├── dodo/route.ts       ✅ DODO checkout
│   │   │   │   │   └── paddle/route.ts     ✅ Paddle checkout
│   │   │   │   └── webhooks/
│   │   │   │       ├── dodo/route.ts       🔨 Need to create
│   │   │   │       └── paddle/route.ts     🔨 Need to create
│   │   │   └── user/
│   │   │       ├── quota/route.ts          🔨 Need to create
│   │   │       ├── usage/route.ts          🔨 Need to create
│   │   │       └── api-key/route.ts        🔨 Need to create
│   ├── lib/
│   │   ├── dodopayments.ts                 ✅ DODO integration
│   │   └── payments/
│   │       ├── paddle.ts                    ✅ Paddle integration
│   │       └── dodo.ts                      ✅ DODO client
│   └── .env.example                         ✅ Updated config
│
├── RECODER_CODE_AUTH_INTEGRATION_COMPLETE_GUIDE.md  ✅ Complete guide
└── IMPLEMENTATION_SUMMARY_AUTH_PAYMENTS.md          ✅ This file
```

---

## 🚀 Next Steps

### Immediate (Required for Launch):

1. **Create API Routes** (30 minutes)
   ```bash
   # Need to create:
   - /api/user/quota/route.ts       # Check quota status
   - /api/user/usage/route.ts       # Get usage stats
   - /api/user/api-key/route.ts     # Manage OpenRouter keys
   - /api/webhooks/dodo/route.ts    # DODO webhooks
   - /api/webhooks/paddle/route.ts  # Paddle webhooks
   - /api/sessions/start/route.ts   # Start work session
   - /api/sessions/end/route.ts     # End work session
   ```

2. **Run Database Migrations** (5 minutes)
   ```bash
   cd app
   npx prisma migrate dev --name add-session-tracking
   npx prisma generate
   ```

3. **Set Up Payment Accounts** (1-2 hours)
   - Create DODO Pay account: https://dodopayments.com
   - Create Paddle account: https://paddle.com
   - Configure products in both platforms
   - Add API keys to .env

4. **Configure Webhooks** (15 minutes)
   - DODO webhook URL: https://api.recoder.xyz/api/webhooks/dodo
   - Paddle webhook URL: https://api.recoder.xyz/api/webhooks/paddle
   - Copy webhook secrets to .env

5. **Add Platform API Keys** (10 minutes)
   - Get 3 OpenRouter API keys
   - Encrypt and store in database
   - Or add to .env for automatic seeding

### Testing (Before Launch):

```bash
# 1. Test authentication
curl -X POST https://api.recoder.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# 2. Test session creation
curl -X POST https://api.recoder.xyz/api/sessions/start \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Test quota check
curl https://api.recoder.xyz/api/user/quota \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Test payment flow
# Visit: https://recoder.xyz/pricing
# Click "Start Monthly"
# Complete payment
# Verify subscription activated

# 5. Test CLI authentication
recoder auth login
recoder auth status
```

### Post-Launch:

1. **Monitor Usage** - Set up alerts for high usage
2. **Rotate Keys** - Rotate platform API keys monthly
3. **Scale** - Add more API keys as user base grows
4. **Analytics** - Track conversion rates, churn, etc.
5. **Support** - Handle user questions about limits

---

## 📞 Support

### For Developers:

**Documentation**: `/RECODER_CODE_AUTH_INTEGRATION_COMPLETE_GUIDE.md`

**Key Concepts:**
- Session-based tracking (not per-request)
- Free models are unlimited
- Only pricey models count against limits
- Daily session resets at midnight UTC
- Premium users use platform keys

### For Users:

**FAQ Answers:**
- "How do sessions work?" → One continuous work period
- "What are pricey models?" → Claude Sonnet, GPT-4, Gemini Pro
- "What are free models?" → Gemini Flash, Llama, Claude Haiku
- "Can I use my own key?" → Yes, on free plan
- "Do limits reset?" → Yes, daily at midnight UTC

---

## ✅ Summary

### What's Working:
- ✅ Database schema designed
- ✅ Pricing page configured
- ✅ Payment integrations ready
- ✅ Environment configured
- ✅ Documentation complete
- ✅ Authentication flow designed

### What's Needed:
- 🔨 Create API route handlers
- 🔨 Run database migrations
- 🔨 Set up payment accounts
- 🔨 Configure webhooks
- 🔨 Add platform API keys
- 🔨 Test end-to-end flows

### Estimated Time to Launch:
- **API Routes**: 30 minutes
- **Database Setup**: 5 minutes
- **Payment Setup**: 1-2 hours
- **Testing**: 30 minutes
- **Total**: ~3 hours

**Status**: Ready for implementation! 🚀

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Author**: Claude (Anthropic)
