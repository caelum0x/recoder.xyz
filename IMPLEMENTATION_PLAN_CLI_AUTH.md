# CLI Authentication & User Management Implementation Plan

## Current Status ✅
 
### What's Working
1. ✅ **Frontend UI** - All authentication pages designed and styled
2. ✅ **API Endpoints** - Routes created for CLI auth flows
3. ✅ **Database Schema** - Prisma schema defined with all required models
4. ✅ **Mock Database** - In-memory database for testing
5. ✅ **OAuth Flow** - Device flow and OAuth code exchange logic implemented

### What's Missing ❌
1. ❌ **Database Connection** - Not connected to real PostgreSQL
2. ❌ **User Persistence** - Users are mocked, not stored
3. ❌ **OpenRouter API Key Collection** - No mechanism to collect user's OpenRouter keys
4. ❌ **Usage Tracking** - Not tracking actual usage against limits
5. ❌ **Premium vs Free Logic** - No distinction in behavior
6. ❌ **Subscription Integration** - No payment/subscription system

---

## Implementation Phases

### Phase 1: Database Setup & User Registration (30-45 mins) ⚡ PRIORITY

**Goal:** Connect real database and enable user registration with OpenRouter API key collection

#### Step 1.1: Database Connection
- [ ] Set up Vercel Postgres or Supabase database
- [ ] Add `DATABASE_URL` to environment variables
- [ ] Run `npx prisma generate` to generate client
- [ ] Run `npx prisma db push` to create tables
- [ ] Test database connection

#### Step 1.2: Update Registration Flow
File: `app/app/api/auth/register/route.ts`
- [ ] Replace mock user creation with Prisma
- [ ] Add password hashing with bcrypt
- [ ] Store user in database
- [ ] Create initial quota record

#### Step 1.3: Add OpenRouter API Key Collection
Create: `app/app/auth/onboarding/page.tsx`
```typescript
// After registration, prompt for:
1. OpenRouter API Key (required for free users)
2. Preferred AI models
3. Usage preferences

// Store in user metadata or separate table
```

Update Prisma Schema:
```prisma
model User {
  // ... existing fields
  openRouterApiKey String? @map("open_router_api_key")
  hasOwnApiKey     Boolean @default(false)
  apiKeyEncrypted  Boolean @default(false)
}
```

---

### Phase 2: CLI Authentication Integration (30 mins)

**Goal:** CLI can authenticate users and retrieve their API keys

#### Step 2.1: Update Login Endpoint
File: `app/app/api/auth/login/route.ts`
- [ ] Replace mock authentication with real user lookup
- [ ] Verify password with bcrypt
- [ ] Generate CLI session with Prisma
- [ ] Return access token and refresh token

#### Step 2.2: Update CLI Auth Route
File: `app/app/api/auth/cli/route.ts`
- [ ] Replace in-memory storage with Prisma database calls
- [ ] Implement proper token validation
- [ ] Return user data including API key status

#### Step 2.3: Add API Key Retrieval Endpoint
Create: `app/app/api/user/api-keys/route.ts`
```typescript
GET /api/user/api-keys
- Validate user session
- Return user's OpenRouter API key (if exists)
- Return key status (has_own_key vs using_platform_key)
```

---

### Phase 3: Usage Tracking & Limits (45 mins)

**Goal:** Track every CLI request and enforce quota limits

#### Step 3.1: Create Usage Middleware
File: `app/lib/usage-tracking.ts`
```typescript
export async function trackUsage(
  userId: string,
  sessionId: string,
  requestType: string,
  metadata: {
    modelUsed?: string,
    providerUsed?: string,
    tokensUsed?: number,
    cost?: number
  }
) {
  // 1. Record usage in database
  // 2. Update user quota
  // 3. Check if limit exceeded
  // 4. Return remaining quota
}

export async function checkQuota(userId: string): Promise<{
  allowed: boolean,
  remaining: number,
  resetDate: Date
}> {
  // Check user's current quota
}
```

#### Step 3.2: Add Usage Tracking Endpoint
Create: `app/app/api/usage/track/route.ts`
```typescript
POST /api/usage/track
{
  "session_token": "rct_...",
  "request_type": "code_generation",
  "model_used": "claude-3-sonnet",
  "tokens_used": 1500,
  "cost": 0.045
}

Response:
{
  "success": true,
  "quota": {
    "remaining": 4998,
    "limit": 5000,
    "reset_date": "2024-11-07T..."
  }
}
```

#### Step 3.3: Add Quota Check Endpoint
Create: `app/app/api/user/quota/route.ts`
```typescript
GET /api/user/quota
- Return user's current quota status
- Include breakdown by request type
- Show cost savings (if using router)
```

---

### Phase 4: Premium vs Free Logic (30 mins)

**Goal:** Different behavior for free users vs premium subscribers

#### Step 4.1: Create Plan Configuration
File: `app/lib/plan-config.ts`
```typescript
export const PLAN_LIMITS = {
  free: {
    monthlyRequests: 1000,
    requiresOwnApiKey: true,
    features: ['cli_access', 'basic_generation'],
    maxConcurrentSessions: 1,
    rateLimit: 10 // requests per minute
  },
  pro: {
    monthlyRequests: 50000,
    requiresOwnApiKey: false, // We provide API keys
    features: ['cli_access', 'advanced_generation', 'router_optimization', 'priority_support'],
    maxConcurrentSessions: 5,
    rateLimit: 100
  },
  enterprise: {
    monthlyRequests: -1, // unlimited
    requiresOwnApiKey: false,
    features: ['everything', 'custom_models', 'dedicated_support', 'sla'],
    maxConcurrentSessions: -1,
    rateLimit: -1
  }
};

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
}
```

#### Step 4.2: Implement API Key Logic
File: `app/lib/api-key-resolver.ts`
```typescript
export async function resolveApiKey(userId: string): Promise<{
  apiKey: string,
  source: 'user' | 'platform',
  provider: string
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  // Free users must provide own key
  if (user.subscriptionPlan === 'free') {
    if (!user.openRouterApiKey) {
      throw new Error('Free users must provide their own OpenRouter API key');
    }
    return {
      apiKey: user.openRouterApiKey,
      source: 'user',
      provider: 'openrouter'
    };
  }
  
  // Premium users can use platform keys
  if (user.subscriptionPlan === 'pro' || user.subscriptionPlan === 'enterprise') {
    // Use platform's API key pool
    const platformKey = await getPlatformApiKey();
    return {
      apiKey: platformKey,
      source: 'platform',
      provider: 'openrouter'
    };
  }
}
```

---

### Phase 5: Security & Encryption (20 mins)

**Goal:** Securely store and handle API keys

#### Step 5.1: Add API Key Encryption
File: `app/lib/crypto.ts`
```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET!;
const ALGORITHM = 'aes-256-gcm';

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decryptApiKey(encryptedKey: string): string {
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

#### Step 5.2: Update User API Key Storage
- [ ] Encrypt API keys before storing in database
- [ ] Decrypt only when needed for API calls
- [ ] Never return raw API keys in API responses
- [ ] Show only last 4 characters in UI

---

### Phase 6: CLI Integration (15 mins)

**Goal:** Update CLI package to use new authentication system

#### Step 6.1: Update CLI Auth Flow
Location: `packages/cli/` (if it exists in this repo) or external `recoder-code` package

Required changes:
```typescript
// 1. After authentication, check if user needs to provide API key
const authResponse = await fetch('https://recoder.xyz/api/auth/cli', {
  method: 'POST',
  body: JSON.stringify({ action: 'authenticate', ... })
});

const { user, needs_api_key } = authResponse.json();

// 2. If free user and no API key, prompt for it
if (needs_api_key) {
  const apiKey = await promptForApiKey();
  await updateUserApiKey(apiKey);
}

// 3. Store session locally
saveSession({ access_token, user_id, plan });

// 4. Before each request, check quota
const quota = await checkQuota(user_id);
if (quota.remaining <= 0) {
  console.error('Quota exceeded. Upgrade to continue.');
  process.exit(1);
}

// 5. After each request, track usage
await trackUsage({
  user_id,
  model_used,
  tokens_used,
  cost
});
```

---

## Database Schema Updates

Add these fields to existing Prisma schema:

```prisma
model User {
  // Add these fields:
  openRouterApiKey  String?  @map("open_router_api_key")
  hasOwnApiKey      Boolean  @default(false) @map("has_own_api_key")
  apiKeyEncrypted   Boolean  @default(false) @map("api_key_encrypted")
  onboardingStep    String?  @map("onboarding_step") // 'completed', 'pending_api_key', etc.
  
  // OpenRouter specific settings
  preferredModels   String[] @default([]) @map("preferred_models")
  routerEnabled     Boolean  @default(true) @map("router_enabled")
}

model UserQuota {
  // Add these fields:
  tokensUsedThisPeriod    BigInt   @default(0) @map("tokens_used_this_period")
  costThisPeriod          Float    @default(0) @map("cost_this_period")
  lastResetAt             DateTime @default(now()) @map("last_reset_at")
}

// New table for platform API keys (for premium users)
model PlatformApiKey {
  id                String   @id @default(cuid())
  provider          String   // 'openrouter', 'anthropic', etc.
  keyEncrypted      String   @map("key_encrypted")
  keyName           String   @map("key_name")
  quotaLimit        Int      @default(1000000) @map("quota_limit")
  quotaUsed         Int      @default(0) @map("quota_used")
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at")
  lastUsedAt        DateTime? @map("last_used_at")
  
  @@map("platform_api_keys")
}
```

---

## Environment Variables Required

```env
# Database
DATABASE_URL="postgresql://..."

# Authentication
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="https://recoder.xyz"

# Encryption
API_KEY_ENCRYPTION_SECRET="64-char-hex-string"

# OpenRouter (Platform keys for premium users)
OPENROUTER_API_KEY_1="sk-or-v1-..."
OPENROUTER_API_KEY_2="sk-or-v1-..."
OPENROUTER_API_KEY_3="sk-or-v1-..."

# OAuth Providers (optional, for social login)
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

---

## Testing Checklist

### Authentication Flow
- [ ] User can register with email/password
- [ ] Free user is prompted for OpenRouter API key
- [ ] User can log in and receive access token
- [ ] CLI can validate access token
- [ ] Token refresh works correctly
- [ ] Device flow works end-to-end

### API Key Management
- [ ] Free user must provide API key
- [ ] Premium user doesn't need API key
- [ ] API keys are encrypted in database
- [ ] User can view/update their API key
- [ ] User can't see others' API keys

### Usage Tracking
- [ ] Each CLI request is tracked
- [ ] Quota is updated correctly
- [ ] User can view usage stats
- [ ] Quota resets monthly
- [ ] Over-quota requests are rejected

### Security
- [ ] Passwords are hashed
- [ ] API keys are encrypted
- [ ] Tokens expire correctly
- [ ] Rate limiting works
- [ ] No sensitive data in responses

---

## Deployment Order

1. **Database First**
   ```bash
   # Set up Vercel Postgres
   vercel postgres create
   vercel env pull
   npx prisma generate
   npx prisma db push
   ```

2. **Deploy Backend**
   ```bash
   cd app
   vercel --prod
   ```

3. **Update CLI Package**
   ```bash
   # Update recoder-code npm package
   # Point to production API endpoints
   npm publish
   ```

4. **Test End-to-End**
   ```bash
   npm install -g recoder-code@latest
   recoder auth login
   recoder generate "test project"
   ```

---

## Success Criteria

✅ **Phase 1 Complete When:**
- New users can register via website
- Registration creates user in database
- Users are prompted for OpenRouter API key
- API keys are encrypted and stored

✅ **Phase 2 Complete When:**
- CLI can authenticate against database
- CLI receives valid session tokens
- CLI can retrieve user's API key status

✅ **Phase 3 Complete When:**
- Every CLI request is tracked
- Usage appears in database
- Quota is enforced
- User can view usage stats

✅ **Phase 4 Complete When:**
- Free users must provide API keys
- Premium users use platform keys
- Plan limits are enforced
- Upgrade prompts work

✅ **Phase 5 Complete When:**
- All API keys are encrypted
- No plaintext keys in logs
- Security audit passes

✅ **Phase 6 Complete When:**
- Full end-to-end flow works
- User registers → adds API key → uses CLI → usage tracked
- Both free and premium flows work

---

## Next Steps (Priority Order)

1. ⚡ **SET UP DATABASE** (30 mins)
   - Create Vercel Postgres database
   - Add DATABASE_URL to environment
   - Run Prisma migrations

2. ⚡ **IMPLEMENT REGISTRATION** (30 mins)
   - Connect `/api/auth/register` to database
   - Add API key collection step
   - Encrypt and store API keys

3. ⚡ **IMPLEMENT LOGIN** (20 mins)
   - Connect `/api/auth/login` to database
   - Return proper session tokens
   - Include API key status in response

4. ⚡ **IMPLEMENT USAGE TRACKING** (45 mins)
   - Create usage tracking endpoint
   - Add quota checking middleware
   - Enforce limits

5. **TEST & DEPLOY** (30 mins)
   - Test all flows
   - Deploy to production
   - Update CLI package

**Total Estimated Time:** 2.5-3 hours

---

## Future Enhancements (Post-Launch)

- [ ] Add support for multiple API providers (Anthropic, OpenAI, etc.)
- [ ] Implement API key rotation for platform keys
- [ ] Add cost optimization recommendations
- [ ] Create usage analytics dashboard
- [ ] Add webhook notifications for quota limits
- [ ] Implement team/organization accounts
- [ ] Add API key sharing within teams
- [ ] Create admin panel for managing platform keys
