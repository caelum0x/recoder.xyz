# CLI Authentication & Premium Features Implementation Plan

## 🎯 Overview

This document outlines the end-to-end implementation of CLI authentication integration with recoder.xyz and premium/subscription management features for the platform.

## 📋 Project Structure

```
recoder.xyz/
├── app/                          # Next.js frontend
│   ├── app/settings/premium/     # ✅ TO CREATE - Premium settings page
│   ├── app/dashboard/usage/      # ✅ TO CREATE - Usage analytics
│   ├── app/billing/subscription/ # ✅ TO ENHANCE - Subscription management
│   └── app/api/                  # Frontend API routes
└── backend/                      # Express.js backend
    ├── prisma/schema.prisma      # ✅ TO UPDATE - Add CLI auth models
    ├── src/routes/               # ✅ TO CREATE - CLI auth routes
    └── src/services/             # ✅ TO CREATE - CLI auth services
```

## 🔑 Part 1: CLI Authentication System

### Goal
Enable users to authenticate `recoder-code` CLI tool with recoder.xyz accounts using device code flow.

### Database Schema Updates

```prisma
// Add to schema.prisma

model CLISession {
  id            String    @id @default(cuid())
  deviceCode    String    @unique  // User-friendly code like "ABCD-1234"
  userCode      String    @unique  // Short code for user input
  accessToken   String?   @unique  // Generated JWT
  refreshToken  String?   @unique  // For token refresh
  expiresAt     DateTime            // Device code expiration (15 minutes)
  tokenExpiresAt DateTime?         // Access token expiration
  status        String    @default("pending") // pending, authorized, expired, revoked
  deviceInfo    Json      @default("{}")
  ipAddress     String?
  userAgent     String?
  lastUsedAt    DateTime?
  authorizedAt  DateTime?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  userId        String?
  user          User?     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([deviceCode, status])
  @@index([userId, status])
  @@index([expiresAt])
  @@map("cli_sessions")
}

model CLIUsage {
  id          String    @id @default(cuid())
  sessionId   String
  requestType String    // generate, chat, plan, validate, etc.
  model       String?   // AI model used
  provider    String?   // AI provider
  tokens      Int?
  cost        Float?
  duration    Int?      // milliseconds
  success     Boolean   @default(true)
  errorCode   String?
  errorMessage String?
  metadata    Json      @default("{}")
  timestamp   DateTime  @default(now())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  session     CLISession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([userId, timestamp])
  @@index([sessionId, timestamp])
  @@index([provider, model])
  @@map("cli_usage")
}

// Enhance existing ApiKey model
model ApiKey {
  // Existing fields...
  
  source      String    @default("web") // web, cli, api, mobile
  sessionId   String?   // Link to CLI session if created via CLI
  rateLimitDaily    Int?    // Daily rate limit
  rateLimitMonthly  Int?    // Monthly rate limit
  usageCount        Int     @default(0)
  lastResetAt       DateTime @default(now())
  
  // Add relation to CLISession
  cliSession  CLISession? @relation(fields: [sessionId], references: [id])
}
```

### Backend API Endpoints

#### 1. Start CLI Auth Flow
```typescript
POST /api/auth/cli/authorize
Request: {}
Response: {
  deviceCode: "abc123-def456-ghi789",
  userCode: "ABCD-1234",
  verificationUrl: "https://recoder.xyz/cli/authorize",
  expiresIn: 900, // 15 minutes
  interval: 5 // Polling interval in seconds
}
```

#### 2. Poll for Token
```typescript
GET /api/auth/cli/token?deviceCode=abc123-def456-ghi789
Response (pending): {
  status: "pending",
  message: "User has not authorized yet"
}

Response (authorized): {
  status: "authorized",
  accessToken: "jwt_token_here",
  refreshToken: "refresh_token_here",
  expiresIn: 2592000, // 30 days
  user: {
    id: "user_id",
    email: "user@example.com",
    name: "User Name",
    subscription: "pro"
  }
}
```

#### 3. Verify CLI Token
```typescript
GET /api/auth/cli/verify
Headers: Authorization: Bearer <token>
Response: {
  valid: true,
  user: { ... },
  subscription: { ... },
  limits: { ... }
}
```

#### 4. Revoke CLI Session
```typescript
DELETE /api/auth/cli/session/:sessionId
Headers: Authorization: Bearer <token>
Response: {
  success: true,
  message: "Session revoked"
}
```

#### 5. List CLI Sessions
```typescript
GET /api/auth/cli/sessions
Headers: Authorization: Bearer <token>
Response: {
  sessions: [
    {
      id: "session_id",
      deviceInfo: { ... },
      createdAt: "2024-01-15T10:00:00Z",
      lastUsedAt: "2024-01-15T12:00:00Z",
      status: "active"
    }
  ]
}
```

### Frontend Pages

#### 1. CLI Authorization Page
```
/app/app/cli/authorize/page.tsx
```
- Display user code from URL param
- Show device info being authorized
- Authorize/Deny buttons
- Success/Error states

#### 2. CLI Sessions Management (Settings)
```
/app/app/settings/cli/page.tsx
```
- List all active CLI sessions
- Show device info, last used, created date
- Revoke session functionality
- Generate new API keys for CLI

## 💎 Part 2: Premium & Subscription Management

### Frontend Pages to Build

#### 1. Premium Settings Page
```
/app/app/settings/premium/page.tsx
```

Features:
- Current subscription plan display with badge
- Premium features list
- API key management for CLI
- Usage overview (requests, tokens, cost)
- Quick stats dashboard
- Upgrade/Downgrade options

Components:
```
/app/app/settings/premium/components/
├── PlanOverview.tsx        # Current plan card
├── ApiKeyManager.tsx       # CRUD for API keys
├── UsageMetrics.tsx        # Usage statistics
├── PremiumFeatures.tsx     # Feature list
└── SubscriptionActions.tsx # Upgrade/Cancel actions
```

#### 2. Usage Dashboard
```
/app/app/dashboard/usage/page.tsx
```

Features:
- Real-time usage charts (requests, tokens, cost)
- Historical data with date range picker
- Cost breakdown by provider/model
- Export usage reports (CSV, PDF)
- Usage alerts and notifications
- CLI sessions activity

Components:
```
/app/app/dashboard/usage/components/
├── UsageChart.tsx          # Line/bar charts for usage
├── CostBreakdown.tsx       # Pie chart for cost distribution
├── SessionsTable.tsx       # Active/past CLI sessions
├── ExportButton.tsx        # Export functionality
└── UsageAlerts.tsx         # Alert settings
```

#### 3. Enhanced Subscription Page
```
/app/app/billing/subscription/page.tsx
```

Enhancements:
- Show CLI usage in subscription details
- API key quota management
- Premium feature usage tracking
- Billing history with CLI usage breakdown

### Backend API Endpoints

#### Premium Settings APIs
```typescript
GET  /api/user/premium-status
POST /api/user/api-key/generate
GET  /api/user/api-keys
DELETE /api/user/api-key/:keyId
PUT  /api/user/api-key/:keyId/revoke
```

#### Usage Analytics APIs
```typescript
GET  /api/analytics/usage
GET  /api/analytics/usage/summary
GET  /api/analytics/usage/by-model
GET  /api/analytics/usage/by-provider
GET  /api/analytics/cost
POST /api/analytics/export
```

#### Subscription Enhancement APIs
```typescript
GET  /api/billing/subscription/details
PUT  /api/billing/subscription/update-plan
POST /api/billing/subscription/cancel
POST /api/billing/subscription/resume
GET  /api/billing/subscription/preview-change
```

## 🔄 CLI Authentication Flow (Device Code Flow)

```
┌─────────────┐                                    ┌──────────────┐
│             │  1. recoder auth login             │              │
│  CLI Tool   │ ────────────────────────────────>  │   Backend    │
│             │                                     │              │
│             │  2. Return device code + URL       │              │
│             │  <────────────────────────────────  │              │
└─────────────┘                                    └──────────────┘
      │                                                     ▲
      │                                                     │
      │ 3. Display code + URL to user                      │
      │ "Visit: https://recoder.xyz/cli/authorize"         │
      │ "Enter code: ABCD-1234"                            │
      │                                                     │
      │ 4. Start polling for token                         │
      │ ──────────────────────────────────────────────────│
      │                                                     │
      ▼                                                     │

┌─────────────┐                                    ┌──────────────┐
│             │  5. User opens browser             │              │
│   Browser   │  ──────────────────────────────>   │   Frontend   │
│             │                                     │              │
│             │  6. Enter user code                │              │
│             │  ──────────────────────────────>   │              │
│             │                                     │              │
│             │  7. Verify code & show auth UI     │              │
│             │  <──────────────────────────────   │              │
└─────────────┘                                    └──────────────┘
      │                                                     │
      │                                                     │
      │ 8. User clicks "Authorize"                         │
      │ ──────────────────────────────────────────────────>│
      │                                                     │
      │                                                     ▼

                                                   ┌──────────────┐
                                                   │              │
                                                   │   Backend    │
                                                   │              │
                                                   │ 9. Mark code │
                                                   │    authorized│
                                                   │              │
                                                   └──────────────┘
                                                            │
      ┌─────────────────────────────────────────────────────┘
      │
      ▼

┌─────────────┐                                    ┌──────────────┐
│             │  10. Poll succeeds                 │              │
│  CLI Tool   │  <──────────────────────────────   │   Backend    │
│             │      Returns access token          │              │
│             │                                     │              │
│             │  11. Store token locally           │              │
│             │                                     │              │
│             │  12. Make authenticated requests   │              │
│             │  ──────────────────────────────>   │              │
└─────────────┘                                    └──────────────┘
```

## 📊 Database Migration Plan

### Step 1: Create Migration File
```bash
cd backend
npx prisma migrate dev --name add-cli-auth-and-premium
```

### Step 2: Seed Subscription Plans
```typescript
// backend/prisma/seed-subscription-plans.ts
const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    limits: {
      monthlyRequests: 100,
      dailyRequests: 10,
      tokensPerRequest: 2000,
      modelsAvailable: ['claude-3-haiku', 'gpt-3.5-turbo'],
      features: ['basic-cli', 'web-interface']
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    limits: {
      monthlyRequests: 5000,
      dailyRequests: 200,
      tokensPerRequest: 10000,
      modelsAvailable: ['claude-3-sonnet', 'gpt-4', 'gemini-pro'],
      features: ['advanced-cli', 'api-access', 'priority-support']
    }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 299,
    limits: {
      monthlyRequests: -1, // unlimited
      dailyRequests: -1,
      tokensPerRequest: -1,
      modelsAvailable: ['all'],
      features: ['unlimited', 'dedicated-support', 'custom-models']
    }
  }
];
```

## 🔧 Implementation Checklist

### Phase 1: Database & Backend Setup (Day 1-2)

- [ ] Update Prisma schema with CLISession, CLIUsage models
- [ ] Enhance ApiKey model
- [ ] Create migration and run it
- [ ] Seed subscription plans
- [ ] Create CLI auth service (`backend/src/services/cliAuth.service.ts`)
- [ ] Create device code generator utility
- [ ] Create JWT token service for CLI

### Phase 2: Backend API Routes (Day 2-3)

- [ ] Create `/api/auth/cli/authorize` endpoint
- [ ] Create `/api/auth/cli/token` endpoint
- [ ] Create `/api/auth/cli/verify` endpoint
- [ ] Create `/api/auth/cli/sessions` endpoint
- [ ] Create `/api/auth/cli/session/:id/revoke` endpoint
- [ ] Add authentication middleware for CLI tokens
- [ ] Add rate limiting per subscription plan

### Phase 3: Premium Backend APIs (Day 3-4)

- [ ] Create `/api/user/premium-status` endpoint
- [ ] Create `/api/user/api-keys` CRUD endpoints
- [ ] Create `/api/analytics/usage` endpoints
- [ ] Create `/api/analytics/cost` endpoints
- [ ] Create `/api/analytics/export` endpoint
- [ ] Enhance subscription endpoints

### Phase 4: Frontend - CLI Authorization (Day 4-5)

- [ ] Create `/app/cli/authorize/page.tsx`
- [ ] Create authorization form component
- [ ] Add device info display
- [ ] Add success/error states
- [ ] Add session security warnings

### Phase 5: Frontend - Premium Settings (Day 5-6)

- [ ] Create `/app/settings/premium/page.tsx`
- [ ] Create `PlanOverview` component
- [ ] Create `ApiKeyManager` component with copy/revoke
- [ ] Create `UsageMetrics` component
- [ ] Create `PremiumFeatures` component
- [ ] Add upgrade/downgrade flows

### Phase 6: Frontend - Usage Dashboard (Day 6-7)

- [ ] Create `/app/dashboard/usage/page.tsx`
- [ ] Integrate Chart.js or Recharts
- [ ] Create `UsageChart` component
- [ ] Create `CostBreakdown` component
- [ ] Create `SessionsTable` component
- [ ] Add export functionality
- [ ] Add date range picker

### Phase 7: Frontend - CLI Sessions Management (Day 7-8)

- [ ] Create `/app/settings/cli/page.tsx`
- [ ] List active CLI sessions
- [ ] Add revoke functionality
- [ ] Show session details modal
- [ ] Add security alerts

### Phase 8: Testing & Polish (Day 8-9)

- [ ] Unit tests for CLI auth service
- [ ] Integration tests for auth flow
- [ ] E2E test for complete CLI auth flow
- [ ] Test premium features with different plans
- [ ] Test rate limiting
- [ ] Security audit of token handling
- [ ] Performance testing for analytics queries

### Phase 9: Documentation (Day 9-10)

- [ ] API documentation for CLI endpoints
- [ ] User guide for CLI authentication
- [ ] Premium features documentation
- [ ] Usage dashboard guide
- [ ] Developer docs for recoder-code integration

## 🎨 UI/UX Design Guidelines

### Premium Settings Page
- **Hero Section**: Current plan with prominent badge
- **Cards Layout**: 3-column grid for stats (requests, tokens, cost)
- **API Keys Section**: Table with copy buttons and revoke actions
- **CTA Buttons**: Prominent upgrade button for free users

### Usage Dashboard
- **Chart Section**: Large area charts for usage over time
- **Filters**: Date range picker, provider filter, model filter
- **Quick Stats**: 4 metric cards at top (total requests, total cost, avg latency, success rate)
- **Export**: Floating action button for export

### CLI Authorization Page
- **Simple Layout**: Center-aligned card
- **Code Display**: Large, monospace font for user code
- **Device Info**: Clear display of requesting device
- **Action Buttons**: Primary "Authorize" and secondary "Deny"

## 🔐 Security Considerations

1. **Device Code Security**
   - Short expiration (15 minutes)
   - One-time use only
   - Secure random generation
   - Rate limiting on code generation

2. **Token Security**
   - JWT with short expiration (30 days)
   - Refresh token rotation
   - Secure storage recommendations for CLI
   - HTTPS only

3. **API Key Security**
   - Prefix system (rck_live_... / rck_test_...)
   - Hash storage in database
   - Scoped permissions
   - Revocation support

4. **Rate Limiting**
   - Per-plan limits enforcement
   - Graceful degradation
   - Clear error messages
   - Usage warnings at 80% threshold

## 📈 Success Metrics

1. **CLI Adoption**
   - Number of CLI sessions created
   - Active CLI users
   - CLI vs web usage ratio

2. **Premium Conversion**
   - Free to paid conversion rate
   - Average revenue per user (ARPU)
   - Churn rate

3. **Usage Patterns**
   - Most used AI models
   - Peak usage times
   - Average cost per request

4. **User Satisfaction**
   - Time to first CLI auth
   - Session revocation rate
   - Support tickets related to CLI

## 🚀 Deployment Plan

### Environment Variables
```bash
# Backend .env
CLI_JWT_SECRET=your-secret-here
CLI_TOKEN_EXPIRY=30d
CLI_DEVICE_CODE_EXPIRY=15m
CLI_POLLING_INTERVAL=5

# Rate limiting
RATE_LIMIT_FREE_DAILY=10
RATE_LIMIT_PRO_DAILY=200
RATE_LIMIT_ENTERPRISE_DAILY=-1
```

### Database Migration
```bash
# Production deployment
cd backend
npx prisma migrate deploy
npx prisma db seed
```

### Feature Flags
```typescript
// Toggle features during rollout
export const FEATURE_FLAGS = {
  CLI_AUTH_ENABLED: true,
  PREMIUM_DASHBOARD_ENABLED: true,
  USAGE_EXPORT_ENABLED: true,
  ADVANCED_ANALYTICS_ENABLED: false, // Coming soon
};
```

## 📝 Notes for AI Implementation

When implementing this plan:

1. **Start with database schema** - Foundation for everything
2. **Build backend first** - Test with Postman/curl before frontend
3. **Use existing patterns** - Follow current codebase conventions
4. **Real data only** - No mock data, connect to actual database
5. **Error handling** - Comprehensive error messages
6. **Type safety** - Full TypeScript types for all new code
7. **Reusable components** - Extract common UI patterns
8. **Responsive design** - Mobile-first approach
9. **Accessibility** - WCAG 2.1 AA compliance
10. **Performance** - Optimize queries, use pagination, cache where appropriate

## 🔗 Related Files

- Database Schema: `/backend/prisma/schema.prisma`
- Backend Routes: `/backend/src/routes/`
- Services: `/backend/src/services/`
- Frontend App: `/app/app/`
- API Client: `/app/lib/api.ts`
- Types: `/app/types/`

---

**Status**: Ready for Implementation  
**Estimated Timeline**: 8-10 days  
**Priority**: High  
**Dependencies**: None (all prerequisites met)
