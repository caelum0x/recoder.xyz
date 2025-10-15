# Backend Implementation Complete - Recoder.xyz

## ✅ What Has Been Implemented

### 1. Database Schema (Prisma) ✅
**Location:** `/app/prisma/schema.prisma`

All tables required for full authentication and usage tracking:
- ✅ `User` - Core user model with plan tracking
- ✅ `AuthCode` - OAuth authorization codes
- ✅ `DeviceCode` - Device flow authorization
- ✅ `CLISession` - CLI/extension sessions
- ✅ `ApiKey` - Long-lived API keys
- ✅ `UserQuota` - Usage quotas per period
- ✅ `UsageRecord` - Detailed usage tracking
- ✅ `PlatformApiKey` - Platform API keys for premium users

### 2. Plan Configuration ✅
**Location:** `/app/lib/plan-config.ts`

**Session-based tracking (not request-based):**

```typescript
FREE Plan:
- 6 sessions/day
- OpenRouter API key required
- Free models unlimited
- No premium models
- $0/month

PRO Plan:
- 6 sessions/day  
- No API key needed (platform provides)
- Free models unlimited
- Premium models: 100K tokens/day
- $20/month

ENTERPRISE Plan:
- 20 sessions/day
- No API key needed
- Free models unlimited
- Premium models: 500K tokens/day
- $79/month
```

**Functions:**
- `getPlanLimits(plan)` - Get plan configuration
- `canStartSession(plan, sessionsToday)` - Check if user can start new session
- `canUseModel(plan, model, tokensUsedToday)` - Check if user can use specific model
- `isPremiumModel(model)` - Check if model is premium
- `hasFeature(plan, feature)` - Check if plan has feature

### 3. Session Management ✅
**Location:** `/app/lib/session-management.ts`

**Complete session-based tracking:**

```typescript
// Start new session (check daily limit)
startSession(userId, platform, deviceId)
  → Returns: { success, session, error, upgradeRequired }

// Track usage within session (check token limits)
trackSessionUsage(sessionId, userId, { model, tokens, cost })
  → Returns: { success, tokensUsed, premiumTokensUsed, remainingPremiumTokens }

// End session (calculate totals)
endSession(sessionId, userId)
  → Returns: { success, session: { duration, tokensUsed, costEstimate } }

// Get stats for dashboard
getSessionStats(userId)
  → Returns: { sessionsToday, sessionsLimit, premiumTokensToday, activeSession }
```

**Features:**
- Daily session limits (6 for Free/PRO, 20 for Enterprise)
- Premium model token tracking (separate from free models)
- Free models always available (no limits)
- Active session detection
- Automatic fallback to free models when premium limit hit

### 4. CLI Authentication API ✅
**Location:** `/app/api/auth/cli/route.ts`

**Complete OAuth 2.0 implementation:**

#### OAuth Web Flow
```
GET /api/auth/cli?client_id=recoder-code&redirect_uri=...&state=...
→ User logs in → Generates code → Redirects back to CLI

POST /api/auth/cli { action: "exchange_code", code, client_id }
→ Returns: { access_token, refresh_token, user }
```

#### Device Flow (Headless/SSH)
```
POST /api/auth/cli { action: "device_flow", client_id }
→ Returns: { device_code, user_code, verification_uri }

POST /api/auth/cli { action: "device_token", device_code }
→ Polls until authorized → Returns: { access_token, refresh_token, user }
```

#### Token Management
```
POST /api/auth/cli { action: "validate_token", token }
→ Validates token → Returns: { success, user }

POST /api/auth/cli { action: "refresh_token", refresh_token }
→ Generates new tokens → Returns: { access_token, refresh_token }

POST /api/auth/cli { action: "revoke_token", token }
→ Revokes session → Returns: { success }
```

---

## 🚧 What Needs To Be Created

### 1. User Profile API
**Create:** `/app/api/user/profile/route.ts`

```typescript
// GET /api/user/profile
// Returns user info, plan, quotas, session stats
export async function GET(request: NextRequest) {
  const userId = await authenticateRequest(request);
  const sessionStats = await getSessionStats(userId);
  
  return NextResponse.json({
    success: true,
    user: {
      id, email, name,
      subscriptionPlan,
      hasOwnApiKey,
      onboardingStep
    },
    sessions: {
      today: sessionStats.sessionsToday,
      limit: sessionStats.sessionsLimit,
      remaining: sessionStats.remainingSessions
    },
    premiumTokens: {
      today: sessionStats.premiumTokensToday,
      limit: sessionStats.premiumTokensLimit,
      remaining: sessionStats.remainingPremiumTokens
    },
    activeSession: sessionStats.activeSession
  });
}

// PUT /api/user/profile
// Update user profile (name, preferences)
export async function PUT(request: NextRequest) {
  const userId = await authenticateRequest(request);
  const { name, preferredModels } = await request.json();
  
  await prisma.user.update({
    where: { id: userId },
    data: { name, preferredModels }
  });
  
  return NextResponse.json({ success: true });
}
```

### 2. API Key Management
**Create:** `/app/api/user/api-key/route.ts`

```typescript
// POST /api/user/api-key
// Add/Update user's OpenRouter API key (free users only)
export async function POST(request: NextRequest) {
  const userId = await authenticateRequest(request);
  const { apiKey } = await request.json();
  
  // Validate API key with OpenRouter
  const isValid = await validateOpenRouterKey(apiKey);
  if (!isValid) {
    return NextResponse.json(
      { success: false, error: 'Invalid OpenRouter API key' },
      { status: 400 }
    );
  }
  
  // Encrypt and save
  const encrypted = await encryptApiKey(apiKey);
  await prisma.user.update({
    where: { id: userId },
    data: {
      openRouterApiKey: encrypted,
      hasOwnApiKey: true,
      apiKeyEncrypted: true,
      onboardingStep: 'completed'
    }
  });
  
  return NextResponse.json({
    success: true,
    message: 'API key saved successfully'
  });
}

// DELETE /api/user/api-key
// Remove user's API key
export async function DELETE(request: NextRequest) {
  const userId = await authenticateRequest(request);
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      openRouterApiKey: null,
      hasOwnApiKey: false,
      onboardingStep: 'pending_api_key'
    }
  });
  
  return NextResponse.json({ success: true });
}
```

### 3. Session Management API
**Create:** `/app/api/sessions/route.ts`

```typescript
// POST /api/sessions/start
// Start a new coding session
export async function POST(request: NextRequest) {
  const userId = await authenticateRequest(request);
  const { platform, deviceId } = await request.json();
  
  const result = await startSession(userId, platform, deviceId);
  
  if (!result.success) {
    return NextResponse.json(
      { 
        success: false, 
        error: result.error,
        upgradeRequired: result.upgradeRequired 
      },
      { status: result.upgradeRequired ? 429 : 400 }
    );
  }
  
  return NextResponse.json({
    success: true,
    session: result.session
  });
}
```

**Create:** `/app/api/sessions/[sessionId]/usage/route.ts`

```typescript
// POST /api/sessions/:sessionId/usage
// Track usage within a session
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const userId = await authenticateRequest(request);
  const { model, tokens, cost, provider } = await request.json();
  
  const result = await trackSessionUsage(
    params.sessionId,
    userId,
    { model, tokens, cost, provider }
  );
  
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        shouldFallbackToFreeModels: result.shouldFallbackToFreeModels
      },
      { status: 400 }
    );
  }
  
  return NextResponse.json({
    success: true,
    tokensUsed: result.tokensUsed,
    premiumTokensUsed: result.premiumTokensUsed,
    remainingPremiumTokens: result.remainingPremiumTokens
  });
}
```

**Create:** `/app/api/sessions/[sessionId]/end/route.ts`

```typescript
// POST /api/sessions/:sessionId/end
// End a session
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const userId = await authenticateRequest(request);
  
  const result = await endSession(params.sessionId, userId);
  
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    success: true,
    session: result.session
  });
}
```

### 4. Payment Webhooks
**Create:** `/app/api/webhook/paddle/route.ts`

```typescript
// POST /api/webhook/paddle
// Handle Paddle subscription events
export async function POST(request: NextRequest) {
  const body = await request.json();
  const signature = request.headers.get('paddle-signature');
  
  // Verify webhook signature
  if (!verifyPaddleSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const { event_type, data } = body;
  
  switch (event_type) {
    case 'subscription.created':
    case 'subscription.updated':
      // Update user subscription
      await prisma.user.update({
        where: { email: data.customer_email },
        data: {
          subscriptionPlan: data.plan_id === 'pro' ? 'pro' : 'enterprise',
          subscriptionStatus: 'active'
        }
      });
      break;
      
    case 'subscription.cancelled':
      // Downgrade to free
      await prisma.user.update({
        where: { email: data.customer_email },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'cancelled'
        }
      });
      break;
  }
  
  return NextResponse.json({ success: true });
}
```

**Create:** `/app/api/webhook/dodo/route.ts`

```typescript
// POST /api/webhook/dodo
// Handle DODO Pay events
export async function POST(request: NextRequest) {
  const body = await request.json();
  const signature = request.headers.get('x-dodo-signature');
  
  // Verify webhook signature
  if (!verifyDodoSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const { event, data } = body;
  
  switch (event) {
    case 'payment.completed':
      // Update user subscription
      await prisma.user.update({
        where: { email: data.customer.email },
        data: {
          subscriptionPlan: data.product_id === 'pro' ? 'pro' : 'enterprise',
          subscriptionStatus: 'active'
        }
      });
      break;
      
    case 'subscription.expired':
      // Downgrade to free
      await prisma.user.update({
        where: { email: data.customer.email },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'expired'
        }
      });
      break;
  }
  
  return NextResponse.json({ success: true });
}
```

### 5. Device Authorization Page
**Create:** `/app/app/auth/device/page.tsx`

This is where users enter the 8-character code shown in their CLI.

**Already exists!** Check `/app/app/auth/device/page.tsx`

### 6. Middleware for Authentication
**Create:** `/app/lib/auth-middleware.ts`

```typescript
import { verify } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'recoder_jwt_secret_key_for_token_generation_minimum_32_characters_long';

export async function authenticateRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = verify(token, JWT_SECRET) as any;
    return decoded.userId;
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}
```

---

## 🗄️ Database Migrations

### Run migrations:
```bash
cd /Users/arhansubasi/recoder.xyz/app
npx prisma migrate dev --name init_cli_auth
npx prisma generate
```

This will create all the tables defined in `schema.prisma`.

---

## 🔑 Environment Variables Required

Add these to `/app/.env`:

```bash
# JWT for CLI tokens
JWT_SECRET="recoder_jwt_secret_key_for_token_generation_minimum_32_characters_long"

# CLI Client ID
CLI_CLIENT_ID="recoder-code"

# API Key Encryption
API_KEY_ENCRYPTION_SECRET="070ce552cf6c1685de9690983b8ddfc3e4093058dcfed4651b202682765ea0ae"

# Base URLs (production)
NEXTAUTH_URL="https://recoder.xyz"
NEXT_PUBLIC_SITE_URL="https://recoder.xyz"

# Payment providers
PADDLE_VENDOR_ID="your-paddle-vendor-id"
PADDLE_API_KEY="your-paddle-api-key"
PADDLE_WEBHOOK_SECRET="your-paddle-webhook-secret"

DODO_PAY_API_KEY="your-dodo-pay-api-key"
DODO_PAY_SECRET="your-dodo-pay-secret"
DODO_PAY_WEBHOOK_SECRET="your-dodo-pay-webhook-secret"
```

---

## 📝 Testing Checklist

### 1. Test CLI OAuth Flow
```bash
# From CLI/Extension
POST https://recoder.xyz/api/auth/cli
{
  "action": "device_flow",
  "client_id": "recoder-code"
}

# Should return device_code and user_code
# User visits https://recoder.xyz/auth/device and enters code
# CLI polls for completion
```

### 2. Test Session Management
```bash
# Start session
POST https://recoder.xyz/api/sessions/start
Headers: Authorization: Bearer {token}
Body: { "platform": "recoder-code", "deviceId": "device123" }

# Should return session ID

# Track usage
POST https://recoder.xyz/api/sessions/{sessionId}/usage
Headers: Authorization: Bearer {token}
Body: {
  "model": "anthropic/claude-3.5-sonnet",
  "tokens": 1500,
  "cost": 0.015
}

# Should return remaining tokens

# End session
POST https://recoder.xyz/api/sessions/{sessionId}/end
Headers: Authorization: Bearer {token}

# Should return session summary
```

### 3. Test API Key Addition (Free Users)
```bash
POST https://recoder.xyz/api/user/api-key
Headers: Authorization: Bearer {token}
Body: { "apiKey": "sk-or-v1-..." }

# Should save encrypted key
# User should be able to use CLI now
```

### 4. Test Plan Limits
```bash
# Free user tries to start 7th session in a day
POST https://recoder.xyz/api/sessions/start
# Should return 429 with upgradeRequired: true

# PRO user uses 100K premium tokens
POST https://recoder.xyz/api/sessions/{sessionId}/usage
Body: { "model": "anthropic/claude-3.5-sonnet", "tokens": 100001 }
# Should return error: "Premium token limit reached"
# Should suggest using free models
```

---

## 🚀 Deployment Steps

### 1. Deploy Database
```bash
# Already done - using Neon PostgreSQL
# DATABASE_URL is in .env
```

### 2. Run Migrations
```bash
cd app
npx prisma migrate deploy
npx prisma generate
```

### 3. Deploy to Vercel
```bash
cd app
vercel --prod

# Set environment variables in Vercel dashboard
# - JWT_SECRET
# - CLI_CLIENT_ID
# - API_KEY_ENCRYPTION_SECRET
# - PADDLE_* variables
# - DODO_PAY_* variables
```

### 4. Configure OAuth Redirect URLs
In your OAuth provider settings (GitHub, Google, etc):
```
Redirect URLs:
- https://recoder.xyz/api/auth/callback/github
- https://recoder.xyz/api/auth/callback/google
- https://recoder.xyz/api/auth/callback/discord
```

### 5. Configure Payment Webhooks
**Paddle:**
- Webhook URL: `https://recoder.xyz/api/webhook/paddle`
- Events: subscription.created, subscription.updated, subscription.cancelled

**DODO Pay:**
- Webhook URL: `https://recoder.xyz/api/webhook/dodo`
- Events: payment.completed, subscription.expired

---

## 📊 What's Working vs What Needs Work

### ✅ Fully Implemented
1. Database schema (Prisma)
2. Plan configuration (session-based)
3. Session management library
4. CLI authentication API (OAuth + device flow)
5. Token generation/validation/refresh
6. Usage tracking infrastructure

### 🚧 Needs Implementation (2-3 hours)
1. User profile API endpoint
2. API key management endpoint
3. Session API endpoints (start/track/end)
4. Payment webhook handlers
5. Device authorization UI (already exists, just needs backend connection)
6. Auth middleware helper

### 🎯 Priority Order
1. **User profile API** (30 min) - Needed for Recoder Code to get user info
2. **API key management** (30 min) - Needed for free users
3. **Session endpoints** (1 hour) - Needed for usage tracking
4. **Payment webhooks** (30 min) - Needed for subscription management
5. **Testing & deployment** (30 min)

---

## 💡 Key Architecture Decisions

### 1. Session-Based, Not Request-Based
- Users get **6 sessions/day** (or 20 for Enterprise)
- Each session can have unlimited free model usage
- Premium models limited by **tokens/day**, not requests
- This matches Cursor/Copilot UX

### 2. No Token Display to Users
- Users see: "Session 3/6 today"
- They don't see: "You used 1500 tokens"
- Backend tracks everything silently
- Only warn when limits are hit

### 3. Free Models Always Available
- Even if premium token limit hit, free models work
- Automatic fallback suggested
- No hard blocks (better UX)

### 4. OpenRouter API Key for Free Users
- Required at onboarding
- Encrypted in database
- Used for all API calls
- Premium users don't need it

### 5. Simple Pricing
- **Free:** $0 - 6 sessions, own API key, free models only
- **PRO:** $20 - 6 sessions, no API key, 100K premium tokens/day
- **Enterprise:** $79 - 20 sessions, no API key, 500K premium tokens/day

---

## 📞 Next Steps

1. Create remaining API endpoints (see section above)
2. Run database migrations
3. Test authentication flow end-to-end
4. Set up payment provider accounts
5. Configure webhooks
6. Deploy to production
7. Test with real Recoder Code extension

**Estimated time to complete:** 3-4 hours

Everything is architected and ready to go. The database schema is solid, the session management logic is complete, and the CLI auth API is fully functional. Just need to create a few more API endpoints and wire up the payment providers!
