# Recoder.xyz Authentication Integration Guide for Recoder-Code CLI

## 🎯 Overview

This guide explains how **recoder-code** (CLI/VS Code extension) integrates with **recoder.xyz** (main website) for authentication, user management, and subscription tracking.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RECODER ECOSYSTEM                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │ recoder.xyz  │◄────►│ web.recoder  │◄────►│ recoder   │ │
│  │   (landing)  │      │    .xyz      │      │   -code   │ │
│  │              │      │ (Bolt clone) │      │   (CLI)   │ │
│  │ • Auth       │      │              │      │           │ │
│  │ • Pricing    │      │ • IDE        │      │ • Local   │ │
│  │ • Payments   │      │ • Premium    │      │ • Remote  │ │
│  │ • Dashboard  │      │   Users      │      │   Auth    │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│         │                      │                    │       │
│         └──────────────────────┴────────────────────┘       │
│                              │                              │
│                    ┌─────────▼─────────┐                    │
│                    │   PostgreSQL      │                    │
│                    │   Database        │                    │
│                    │                   │                    │
│                    │ • Users           │                    │
│                    │ • Subscriptions   │                    │
│                    │ • API Keys        │                    │
│                    │ • Usage Tracking  │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Authentication Flow

### 1. First-Time User Installation

When a user installs `recoder-code` for the first time:

```
User installs recoder-code
       ↓
User runs command (triggers auth check)
       ↓
CLI detects no auth token
       ↓
CLI opens browser to: https://recoder.xyz/auth/cli
       ↓
User logs in via OAuth (GitHub/Google/Discord) or email
       ↓
recoder.xyz creates/finds user in database
       ↓
recoder.xyz generates auth token
       ↓
Token sent back to CLI via callback
       ↓
CLI stores token locally
       ↓
CLI fetches user profile and subscription status
       ↓
✅ User authenticated and ready to use
```

### 2. OAuth Callback Flow

```javascript
// CLI initiates auth
const authUrl = 'https://recoder.xyz/auth/cli?cli_version=1.0.0&device_id=xxx';
openBrowser(authUrl);

// User authenticates on website
// Website generates token and redirects to:
http://localhost:58432/callback?token=eyJhbGc...&userId=usr_xxx

// CLI receives callback and stores token
saveAuthToken(token);
```

## 📊 Database Schema

### Users Table
```sql
User {
  id                String    @id @default(cuid())
  email             String    @unique
  name              String?
  image             String?
  emailVerified     DateTime?
  
  -- Subscription
  subscriptionPlan  String    @default("free") -- free, weekly, monthly, pro, enterprise
  subscriptionStatus String?   -- active, past_due, cancelled, trialing
  paddleCustomerId  String?
  paddleSubscriptionId String?
  
  -- OpenRouter API Key (for free users)
  openrouterApiKey  String?   @db.Text -- Encrypted
  openrouterKeyValid Boolean  @default(false)
  
  -- Auth
  accounts          Account[]
  sessions          Session[]
  apiKeys           ApiKey[]
  usageRecords      UsageRecord[]
  userQuotas        UserQuota[]
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

### UserQuota Table (Session-Based Tracking)
```sql
UserQuota {
  id                    String    @id @default(cuid())
  userId                String
  user                  User      @relation(fields: [userId], references: [id])
  
  -- Session limits
  sessionsUsedToday     Int       @default(0)
  sessionsLimit         Int       @default(6) -- Based on plan
  lastSessionReset      DateTime  @default(now())
  
  -- Token limits for premium models
  premiumTokensUsed     BigInt    @default(0)
  premiumTokensLimit    BigInt    @default(0)
  
  -- Period tracking
  periodStart           DateTime  @default(now())
  periodEnd             DateTime
  
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

### UsageRecord Table (Detailed Tracking)
```sql
UsageRecord {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  
  sessionId     String?   -- Groups related requests
  requestType   String    -- "cli", "web", "api"
  
  -- Model info
  modelUsed     String?
  providerUsed  String?
  tokensUsed    Int?
  cost          Float?
  
  -- Request details
  endpoint      String?
  method        String?
  statusCode    Int?
  duration      Int?      -- milliseconds
  success       Boolean   @default(true)
  errorMessage  String?
  
  metadata      Json?     -- Additional data
  timestamp     DateTime  @default(now())
}
```

## 💳 Subscription Plans

### Plan Configuration

```typescript
// Defined in: app/lib/plan-config.ts

export type PlanType = 'free' | 'weekly' | 'monthly' | 'pro' | 'enterprise';

const PLANS = {
  free: {
    price: 0,
    sessionsPerDay: 6,
    requiresOwnApiKey: true,
    premiumModels: false,
    premiumTokensLimit: 10000, // per session
    freeModelsUnlimited: true
  },
  
  weekly: {
    price: 10, // $10/week
    sessionsPerDay: 10,
    requiresOwnApiKey: false, // We provide OpenRouter key
    premiumModels: true,
    premiumTokensLimit: 30000, // per session
    freeModelsUnlimited: true
  },
  
  monthly: {
    price: 20, // $20/month
    sessionsPerDay: 15,
    requiresOwnApiKey: false,
    premiumModels: true,
    premiumTokensLimit: 50000, // per session
    freeModelsUnlimited: true
  },
  
  pro: {
    price: 100, // $100/month
    sessionsPerDay: 20,
    requiresOwnApiKey: false,
    premiumModels: true,
    premiumTokensLimit: 100000, // per session
    freeModelsUnlimited: true,
    betaAccess: true,
    customModels: true
  },
  
  enterprise: {
    price: 'Custom',
    sessionsPerDay: 50,
    requiresOwnApiKey: false,
    premiumModels: true,
    premiumTokensLimit: 500000, // per session
    freeModelsUnlimited: true,
    customIntegrations: true,
    dedicatedSupport: true
  }
};
```

### Premium vs Free Models

```typescript
// Premium models (have token limits per session)
const PREMIUM_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-sonnet-4.5',
  'google/gemini-2.0-flash-exp',
  'google/gemini-2.5-pro',
  'openai/gpt-4-turbo',
  'openai/gpt-4'
];

// Free models (unlimited usage within sessions)
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-flash-1.5',
  'anthropic/claude-3-haiku',
  'openai/gpt-3.5-turbo',
  'mistralai/mixtral-8x7b-instruct'
];
```

## 🚦 Usage Tracking & Limits

### How Sessions Work

1. **Session Definition**: A session is a continuous work period in CLI or web IDE
2. **Daily Reset**: Session counts reset at midnight UTC
3. **Token Limits**: Premium models have per-session token limits
4. **Free Models**: Always unlimited (no token counting)

### API Endpoints for CLI

#### Check Authentication Status
```http
GET https://recoder.xyz/api/auth/status
Authorization: Bearer <token>

Response:
{
  "authenticated": true,
  "user": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "name": "John Doe",
    "plan": "monthly",
    "subscriptionStatus": "active"
  },
  "requiresApiKey": false
}
```

#### Get User Quota/Limits
```http
GET https://recoder.xyz/api/user/quota
Authorization: Bearer <token>

Response:
{
  "plan": "monthly",
  "sessions": {
    "used": 3,
    "limit": 15,
    "remaining": 12,
    "resetAt": "2024-01-02T00:00:00Z"
  },
  "premiumTokens": {
    "used": 25000,
    "limit": 50000,
    "remaining": 25000
  },
  "requiresApiKey": false,
  "openrouterKeyValid": true
}
```

#### Track Usage (Called by CLI)
```http
POST https://recoder.xyz/api/usage/track
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "ses_xxx",
  "requestType": "cli",
  "modelUsed": "anthropic/claude-3.5-sonnet",
  "tokensUsed": 1500,
  "endpoint": "/generate",
  "duration": 3500,
  "success": true
}

Response:
{
  "success": true,
  "quotaRemaining": {
    "sessions": 11,
    "premiumTokens": 48500
  }
}
```

#### Validate OpenRouter API Key (Free Users)
```http
POST https://recoder.xyz/api/user/openrouter/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "apiKey": "sk-or-v1-xxx..."
}

Response:
{
  "valid": true,
  "balance": 10.50,
  "rateLimit": {
    "remaining": 5000
  }
}
```

#### Save OpenRouter API Key (Free Users)
```http
POST https://recoder.xyz/api/user/openrouter
Authorization: Bearer <token>
Content-Type: application/json

{
  "apiKey": "sk-or-v1-xxx...",
  "provider": "openrouter"
}

Response:
{
  "success": true,
  "message": "API key saved securely"
}
```

## 🔄 CLI Integration Flow

### On CLI Startup

```typescript
async function initializeCLI() {
  // 1. Check for local auth token
  const token = getStoredAuthToken();
  
  if (!token) {
    // No auth - trigger login flow
    await authenticateUser();
  }
  
  // 2. Validate token and get user info
  const user = await validateToken(token);
  
  if (!user) {
    // Token expired - re-authenticate
    await authenticateUser();
  }
  
  // 3. Get user's plan and quota
  const quota = await getUserQuota(token);
  
  // 4. Check if user needs to provide API key
  if (quota.requiresApiKey && !quota.openrouterKeyValid) {
    await promptForApiKey();
  }
  
  // 5. CLI ready
  return {
    user,
    quota,
    token
  };
}
```

### Before Making AI Request

```typescript
async function beforeAIRequest(model: string) {
  // 1. Check if model is premium
  const isPremium = PREMIUM_MODELS.includes(model);
  
  // 2. Get current quota
  const quota = await getUserQuota(token);
  
  // 3. Check session limit
  if (quota.sessions.remaining <= 0) {
    throw new Error('Daily session limit reached. Resets at midnight UTC.');
  }
  
  // 4. Check premium token limit (if using premium model)
  if (isPremium && quota.premiumTokens.remaining <= 0) {
    // Suggest free model
    throw new Error('Premium model token limit reached. Use free models or upgrade plan.');
  }
  
  // 5. Get API key
  let apiKey;
  if (quota.requiresApiKey) {
    // Free user - use their OpenRouter key
    apiKey = await getUserOpenRouterKey(token);
  } else {
    // Paid user - use platform key
    apiKey = await getPlatformOpenRouterKey(token);
  }
  
  return { allowed: true, apiKey };
}
```

### After AI Request

```typescript
async function afterAIRequest(requestData: {
  sessionId: string;
  model: string;
  tokensUsed: number;
  duration: number;
  success: boolean;
}) {
  // Track usage
  await trackUsage({
    sessionId: requestData.sessionId,
    requestType: 'cli',
    modelUsed: requestData.model,
    tokensUsed: requestData.tokensUsed,
    duration: requestData.duration,
    success: requestData.success
  });
  
  // Update local quota cache
  await refreshQuotaCache();
}
```

## 💰 Payment Integration

### Payment Providers

1. **Paddle** - Primary payment processor (credit cards, PayPal)
2. **DODO Pay** - Payment processor (alternative payment methods)

### Payment Flow

```
User clicks upgrade on recoder.xyz
       ↓
User selects plan (weekly/monthly/pro)
       ↓
User chooses payment method (Paddle or DODO Pay)
       ↓
Payment processor handles checkout
       ↓
On success: Webhook to recoder.xyz
       ↓
Database updated (subscriptionPlan, subscriptionStatus)
       ↓
User redirected to success page
       ↓
CLI automatically detects upgrade on next request
```

### Webhook Handling

```typescript
// Webhook endpoint: /api/webhooks/paddle
async function handlePaddleWebhook(event: PaddleEvent) {
  switch (event.type) {
    case 'subscription.created':
      await updateUserSubscription(event.userId, {
        plan: event.planId,
        status: 'active',
        paddleSubscriptionId: event.subscriptionId
      });
      break;
      
    case 'subscription.cancelled':
      await updateUserSubscription(event.userId, {
        status: 'cancelled',
        cancelledAt: new Date()
      });
      break;
      
    case 'payment.succeeded':
      await recordPayment(event);
      break;
  }
}
```

## 🔧 Environment Variables

### Required in recoder.xyz

```bash
# Database
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# Auth (NextAuth.js)
NEXTAUTH_URL="https://recoder.xyz"
NEXTAUTH_SECRET="xxx..."

# OAuth Providers
GITHUB_ID="xxx"
GITHUB_SECRET="xxx"
GOOGLE_CLIENT_ID="xxx"
GOOGLE_CLIENT_SECRET="xxx"
DISCORD_CLIENT_ID="xxx"
DISCORD_CLIENT_SECRET="xxx"

# Payment Processors
PADDLE_VENDOR_ID="xxx"
PADDLE_API_KEY="xxx"
PADDLE_WEBHOOK_SECRET="xxx"
DODOPAY_API_KEY="xxx"
DODOPAY_WEBHOOK_SECRET="xxx"

# OpenRouter (Platform Keys)
OPENROUTER_API_KEY="sk-or-v1-xxx" # Used for paid users
```

### Required in recoder-code (CLI)

```bash
# API Endpoints
RECODER_API_URL="https://recoder.xyz"
RECODER_WEB_URL="https://web.recoder.xyz"

# Local auth storage
RECODER_CONFIG_DIR="~/.recoder"
RECODER_AUTH_FILE="~/.recoder/auth.json"
```

## 📱 Multi-Platform Support

### recoder.xyz (Landing)
- User authentication (OAuth + email)
- Subscription management
- Payment processing
- Dashboard with usage stats
- API key management (for free users)

### web.recoder.xyz (IDE)
- Full web-based IDE (like Bolt.new)
- Only accessible to authenticated users
- Checks subscription status
- Premium users get full access
- Free users redirected to upgrade or add API key

### recoder-code (CLI)
- Local development tool
- Syncs with recoder.xyz for auth
- Respects quota limits
- Can work offline with cached tokens (limited)

## 🎯 Key Implementation Details

### Session Tracking Logic

```typescript
// Check if user can start new session
async function canStartSession(userId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Count sessions started today
  const sessionsToday = await prisma.usageRecord.count({
    where: {
      userId,
      timestamp: { gte: today },
      requestType: 'cli',
      // Only count unique session IDs
    },
    distinct: ['sessionId']
  });
  
  // Get user's plan
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true }
  });
  
  const limits = getPlanLimits(user.subscriptionPlan);
  
  return sessionsToday < limits.sessionsPerDay;
}
```

### Token Counting for Premium Models

```typescript
async function canUseTokens(
  userId: string,
  sessionId: string,
  model: string,
  tokensNeeded: number
): Promise<boolean> {
  // Only check if premium model
  if (!PREMIUM_MODELS.includes(model)) {
    return true; // Free models unlimited
  }
  
  // Get tokens used in this session
  const sessionUsage = await prisma.usageRecord.aggregate({
    where: {
      userId,
      sessionId,
      modelUsed: { in: PREMIUM_MODELS }
    },
    _sum: { tokensUsed: true }
  });
  
  const tokensUsed = sessionUsage._sum.tokensUsed || 0;
  const user = await getUser(userId);
  const limits = getPlanLimits(user.subscriptionPlan);
  
  return (tokensUsed + tokensNeeded) <= limits.premiumTokensLimit;
}
```

## 🚨 Error Handling

### Common Error Scenarios

```typescript
// 1. Session limit reached
{
  error: 'SESSION_LIMIT_REACHED',
  message: 'You have used all 6 daily sessions. Resets at midnight UTC.',
  resetAt: '2024-01-02T00:00:00Z',
  upgradeUrl: 'https://recoder.xyz/pricing'
}

// 2. Token limit reached (premium models)
{
  error: 'TOKEN_LIMIT_REACHED',
  message: 'Premium model token limit reached for this session (10k limit).',
  suggestion: 'Use free models or upgrade your plan',
  freeModels: ['llama-3.3-70b', 'gemini-flash-1.5']
}

// 3. No API key (free user)
{
  error: 'API_KEY_REQUIRED',
  message: 'Free plan requires your own OpenRouter API key.',
  setupUrl: 'https://recoder.xyz/auth/onboarding',
  getKeyUrl: 'https://openrouter.ai/keys'
}

// 4. Subscription expired
{
  error: 'SUBSCRIPTION_EXPIRED',
  message: 'Your subscription has expired.',
  renewUrl: 'https://recoder.xyz/dashboard/billing'
}
```

## 📚 API Reference Summary

### Authentication
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/login` - Login (returns token)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/cli` - CLI auth initiation

### User Management
- `GET /api/user/profile` - Get user profile
- `GET /api/user/quota` - Get quota/limits
- `POST /api/user/openrouter` - Save OpenRouter key
- `POST /api/user/openrouter/validate` - Validate key

### Usage Tracking
- `POST /api/usage/track` - Track usage
- `GET /api/usage/stats` - Get usage statistics
- `GET /api/usage/history` - Get usage history

### Subscription
- `GET /api/user/subscription` - Get subscription details
- `POST /api/checkout/create` - Create checkout session
- `POST /api/webhooks/paddle` - Paddle webhooks
- `POST /api/webhooks/dodopay` - DODO Pay webhooks

## 🎓 Best Practices

1. **Always check quota before AI requests** - Prevents failed requests
2. **Track every request** - Essential for billing and analytics
3. **Cache quota locally** - Reduce API calls, improve performance
4. **Handle errors gracefully** - Guide users to solutions (upgrade, add key, etc.)
5. **Refresh tokens automatically** - Seamless user experience
6. **Use session IDs** - Group related requests for better tracking
7. **Reset cache on plan changes** - User upgrades should reflect immediately

## 🔗 URLs Configuration

### Development
```
LANDING: http://localhost:3000
WEB_IDE: http://localhost:3001  
API: http://localhost:3000/api
```

### Production
```
LANDING: https://recoder.xyz
WEB_IDE: https://web.recoder.xyz
API: https://api.recoder.xyz (or https://recoder.xyz/api)
```

## ✅ Implementation Checklist for CLI

- [ ] Store auth token securely
- [ ] Implement OAuth callback listener (localhost:58432)
- [ ] Check authentication status on startup
- [ ] Fetch user quota before each request
- [ ] Prompt for OpenRouter key if needed (free users)
- [ ] Track all AI requests
- [ ] Handle session limits gracefully
- [ ] Handle token limits for premium models
- [ ] Show upgrade prompts when limits reached
- [ ] Cache quota locally (refresh every 5 minutes)
- [ ] Handle token expiration
- [ ] Implement offline mode (with limited features)
- [ ] Show usage stats in CLI
- [ ] Support switching between free and paid plans
- [ ] Handle plan downgrades

---

**Last Updated**: January 2025
**Contact**: support@recoder.xyz
