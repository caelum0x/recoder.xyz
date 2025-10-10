# Complete Authentication & User Management Implementation

## 🎯 Overview
This document tracks the complete implementation of authentication, user management, API key collection, and usage tracking for recoder.xyz.

## ✅ Current Status (What Works)

### Frontend (95% Complete)
- ✅ Web authentication UI (recoder.xyz)
- ✅ OAuth providers (GitHub, Google, Discord)
- ✅ Device flow UI for CLI
- ✅ Session management
- ✅ Protected routes

### CLI (95% Complete)
- ✅ OAuth flow integration
- ✅ Device flow authentication
- ✅ API key authentication
- ✅ Session storage

### Backend Structure (50% Complete)
- ✅ Prisma schema with all models
- ✅ Auth routes scaffolding
- ✅ Middleware structure
- ⚠️ Database not connected
- ⚠️ Endpoints return mock data

## 🚀 Implementation Tasks

### Phase 1: Database Connection & User Persistence ✅
**Status:** Ready to implement
**Time:** 1 hour

#### Tasks:
1. ✅ Connect Vercel Postgres database
2. ✅ Run Prisma migrations
3. ✅ Update auth endpoints to use real DB
4. ✅ Implement user CRUD operations

#### Files to Update:
- `backend/src/database/prisma.ts` - Database connection
- `backend/src/routes/auth.ts` - Real user registration/login
- `backend/src/routes/oauth.ts` - OAuth callback handling
- `app/prisma/schema.prisma` - Ensure schema is production-ready

---

### Phase 2: OpenRouter API Key Collection ✅
**Status:** Ready to implement
**Time:** 2 hours

#### User Flow:
```
1. User signs up/logs in
2. Check if user has API key → user.hasOwnApiKey
3. If NO → Show onboarding modal
4. Collect OpenRouter API key
5. Encrypt and store in DB
6. Mark user.hasOwnApiKey = true
7. Set user.onboardingStep = 'completed'
```

#### Implementation:
1. Create API key collection component
2. Add encryption utilities for API keys
3. Create `/api/user/api-key` endpoint
4. Update user model with encrypted key field
5. Add onboarding flow to dashboard

#### Files to Create/Update:
- `app/components/onboarding/APIKeyCollection.tsx` - NEW
- `app/api/user/api-key/route.ts` - NEW
- `backend/src/utils/encryption.ts` - NEW (API key encryption)
- `backend/src/routes/user-settings.ts` - NEW (user preferences)

---

### Phase 3: Usage Tracking System ✅
**Status:** Ready to implement
**Time:** 3 hours

#### Architecture:
```
User Request → Check User Tier → Apply Limits → Track Usage → Update Quotas
```

#### Tracking Points:
1. **Every AI API call** - Track tokens, cost, provider
2. **Code generation** - Track complexity, files generated
3. **CLI commands** - Track usage patterns
4. **Router requests** - Track model selections

#### Implementation:
1. Create usage tracking middleware
2. Implement quota checking
3. Add usage recording service
4. Create usage analytics endpoints
5. Build usage dashboard

#### Files to Create/Update:
- `backend/src/middleware/usage-tracking.ts` - NEW
- `backend/src/services/quota-service.ts` - NEW
- `backend/src/services/usage-analytics.ts` - NEW
- `app/app/dashboard/usage/page.tsx` - NEW
- `packages/cli/src/utils/usage-reporter.ts` - NEW

---

### Phase 4: Premium vs Free Logic ✅
**Status:** Ready to implement
**Time:** 2 hours

#### User Tiers:

**Free Tier:**
- Must provide own OpenRouter API key
- Limited to X requests/month
- Basic features only
- Community support

**Pro Tier ($29/month):**
- Uses platform API keys (no user key needed)
- Higher usage limits
- All features unlocked
- Priority support
- Advanced AI models

**Enterprise Tier ($99/month):**
- Unlimited usage
- Dedicated API keys
- Custom integrations
- SLA guarantee
- White-label options

#### Implementation:
1. Create subscription tiers in DB
2. Implement tier checking middleware
3. Add tier-based feature flags
4. Create tier upgrade prompts
5. Integrate with payment system

#### Files to Create/Update:
- `backend/src/middleware/tier-check.ts` - NEW
- `backend/src/services/subscription-service.ts` - NEW
- `app/components/billing/TierUpgrade.tsx` - NEW
- `app/api/billing/check-tier/route.ts` - NEW

---

### Phase 5: Payment Integration (Paddle + DODO) 🔄
**Status:** Deferred until Phases 1-4 complete
**Time:** 4 hours

#### Integration Points:
1. Paddle for traditional payments
2. DODO Pay for crypto payments
3. Webhook handlers for both
4. Subscription management
5. Usage-based billing

#### Files to Create:
- `backend/src/integrations/paddle.ts`
- `backend/src/integrations/dodo-pay.ts`
- `backend/src/routes/webhooks/paddle.ts`
- `backend/src/routes/webhooks/dodo.ts`
- `app/app/billing/page.tsx`

---

## 📊 Database Schema Updates

### Critical Tables Already Defined:
✅ `users` - User accounts with API key fields
✅ `user_quotas` - Usage limits per user
✅ `usage_records` - Track every request
✅ `cli_sessions` - CLI authentication
✅ `auth_codes` - OAuth codes
✅ `device_codes` - Device flow
✅ `api_keys` - Long-lived API keys
✅ `platform_api_keys` - Platform keys for premium users

### New Fields Needed:
```prisma
model User {
  // ✅ Already in schema:
  openRouterApiKey  String?  // Encrypted
  hasOwnApiKey      Boolean  @default(false)
  apiKeyEncrypted   Boolean  @default(false)
  onboardingStep    String?  // 'completed', 'pending_api_key'
  subscriptionPlan  String   @default("free")
}
```

---

## 🔐 Security Considerations

### API Key Encryption:
```typescript
// Use AES-256-GCM encryption
const algorithm = 'aes-256-gcm';
const key = process.env.ENCRYPTION_KEY; // 32 bytes
```

### Usage Tracking Security:
- Rate limiting on all endpoints
- Prevent usage manipulation
- Validate all metrics
- Audit logs for suspicious activity

### Access Control:
- Free users: Only own API key requests
- Pro users: Platform API key with limits
- Enterprise: Dedicated keys, tracked separately

---

## 🧪 Testing Strategy

### Phase 1 Tests:
```bash
# Database connection
npm run test:db-connection

# User registration
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# User login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

### Phase 2 Tests:
```bash
# Add API key
curl -X POST http://localhost:3001/api/user/api-key \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-or-..."}'

# Get user profile
curl http://localhost:3001/api/user/profile \
  -H "Authorization: Bearer <token>"
```

### Phase 3 Tests:
```bash
# Track usage
curl -X POST http://localhost:3001/api/usage/track \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"code_generation","tokens":1500,"cost":0.03}'

# Get usage stats
curl http://localhost:3001/api/usage/stats \
  -H "Authorization: Bearer <token>"
```

---

## 📈 Implementation Order

### Week 1: Core Authentication
1. ✅ Day 1: Database setup & connection
2. ✅ Day 2: User registration & login (real DB)
3. ✅ Day 3: OAuth providers integration
4. ✅ Day 4: Testing & bug fixes
5. ✅ Day 5: CLI authentication flow

### Week 2: API Keys & Usage
1. ✅ Day 1: API key collection UI
2. ✅ Day 2: Encryption & storage
3. ✅ Day 3: Usage tracking middleware
4. ✅ Day 4: Quota system implementation
5. ✅ Day 5: Usage dashboard

### Week 3: Tiers & Billing
1. 🔄 Day 1: Tier logic implementation
2. 🔄 Day 2: Feature flags by tier
3. 🔄 Day 3: Paddle integration
4. 🔄 Day 4: DODO Pay integration
5. 🔄 Day 5: Testing & launch

---

## 🚀 Deployment Steps

### 1. Database Setup (Vercel):
```bash
# Create Postgres database in Vercel Dashboard
# Copy DATABASE_URL
# Add to environment variables
```

### 2. Run Migrations:
```bash
cd app
npx prisma migrate deploy
npx prisma generate
```

### 3. Deploy Backend:
```bash
cd backend
npm run build
vercel --prod
```

### 4. Deploy Frontend:
```bash
cd app
npm run build
vercel --prod
```

### 5. Configure OAuth:
- Update callback URLs in GitHub
- Update callback URLs in Google
- Update callback URLs in Discord

---

## 🎯 Success Metrics

### Phase 1 Success:
- ✅ Users can register
- ✅ Users can login
- ✅ Sessions persist in DB
- ✅ OAuth providers work

### Phase 2 Success:
- ✅ API keys stored encrypted
- ✅ Keys validated with OpenRouter
- ✅ Onboarding flow complete
- ✅ Users can update keys

### Phase 3 Success:
- ✅ Usage tracked accurately
- ✅ Quotas enforced
- ✅ Dashboard shows stats
- ✅ Limits prevent overuse

### Phase 4 Success:
- ✅ Free users use own keys
- ✅ Pro users use platform keys
- ✅ Tier checks work correctly
- ✅ Upgrade prompts appear

---

## 🔧 Environment Variables Needed

```bash
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."

# Encryption
ENCRYPTION_KEY="..." # 32 bytes for AES-256

# OAuth
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."

# OpenRouter (platform keys for premium users)
OPENROUTER_API_KEY="..." # Multiple keys for load balancing

# Payments
PADDLE_VENDOR_ID="..."
PADDLE_API_KEY="..."
DODO_API_KEY="..."
DODO_WEBHOOK_SECRET="..."

# URLs
NEXT_PUBLIC_WEB_URL="https://recoder.xyz"
BACKEND_URL="https://api.recoder.xyz"
```

---

## 📝 Next Actions

### Immediate (Today):
1. Set up Vercel Postgres database
2. Run Prisma migrations
3. Test database connection
4. Deploy updated backend

### This Week:
1. Implement real user registration
2. Implement real user login
3. Add API key collection
4. Test end-to-end flow

### Next Week:
1. Implement usage tracking
2. Add quota system
3. Build usage dashboard
4. Prepare for payments

---

## 🐛 Known Issues to Address

1. **Backend TypeScript errors** - Need to fix compilation
2. **Mock data in endpoints** - Replace with real DB calls
3. **No error handling** - Add comprehensive error handling
4. **No input validation** - Add validation middleware
5. **No rate limiting** - Implement rate limits

---

## 📚 Documentation Needed

1. **User Guide**: How to get OpenRouter API key
2. **API Docs**: Authentication endpoints
3. **CLI Guide**: Authentication methods
4. **Admin Guide**: Managing users and quotas
5. **Developer Guide**: Extending the system

---

**Last Updated:** 2024-01-XX
**Status:** Phase 1 Ready to Start
**Next Review:** After Phase 1 completion
