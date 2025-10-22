# CLI Authentication & Premium Features - Complete Implementation Plan

## 🎯 Overview
This document outlines the end-to-end implementation of CLI authentication (device flow) and premium subscription features for recoder.xyz.

## 📋 Implementation Phases

### Phase 1: Database Schema Updates ✅ (Already in schema)
The Prisma schema already includes:
- `CLISession` - Device flow authentication
- `ApiKey` - Premium API keys
- `Subscription` - Premium plans
- `UsageRecord` - Usage tracking
- `CLIUsage` - CLI-specific usage

### Phase 2: Backend API Implementation
#### 2.1 CLI Authentication Endpoints
- `POST /api/cli/auth/device` - Initiate device flow
- `POST /api/cli/auth/token` - Poll/exchange for token
- `POST /api/cli/auth/verify` - Verify token
- `POST /api/cli/auth/refresh` - Refresh token
- `DELETE /api/cli/auth/revoke` - Revoke session

#### 2.2 Premium Management Endpoints
- `GET /api/user/premium-status` - Get premium plan info
- `GET /api/user/api-keys` - List user's API keys
- `POST /api/user/api-keys` - Generate new API key
- `DELETE /api/user/api-keys/:id` - Revoke API key
- `GET /api/analytics/usage` - Get usage analytics
- `GET /api/analytics/cost` - Get cost breakdown
- `POST /api/analytics/export` - Export usage reports

#### 2.3 Subscription Management
- `GET /api/billing/subscription` - Current subscription
- `POST /api/billing/update-plan` - Upgrade/downgrade
- `POST /api/billing/cancel` - Cancel subscription

### Phase 3: Frontend Pages Implementation
#### 3.1 Premium Settings Page
**Location:** `/app/app/settings/premium/page.tsx`

Components:
- `PlanOverview` - Current plan display
- `ApiKeyManager` - Full CRUD for API keys
- `UsageMetrics` - Current usage stats
- `PremiumFeatures` - Feature list

#### 3.2 Usage Dashboard
**Location:** `/app/app/dashboard/usage/page.tsx`

Components:
- `UsageChart` - Time-series usage graphs
- `CostBreakdown` - Cost analysis
- `SessionsTable` - Active CLI sessions
- `ExportButton` - Export reports

#### 3.3 CLI Authentication Page
**Location:** `/app/app/cli/auth/page.tsx`

Components:
- `DeviceCodeDisplay` - Show user code
- `AuthorizationForm` - User authorization
- `SessionList` - Active CLI sessions

#### 3.4 Subscription Management
**Location:** `/app/app/settings/subscription/page.tsx`

Components:
- `PlanSelector` - Plan comparison
- `BillingHistory` - Invoices list
- `PaymentMethods` - Payment method management

### Phase 4: API Integration
- Create service classes for backend communication
- Implement React hooks for data fetching
- Add real-time updates with polling/websockets

### Phase 5: Testing & Validation
- E2E tests for auth flow
- API integration tests
- UI component tests
- Load testing

## 🔧 Technical Implementation Details

### Device Flow Authentication

```
CLI                    Browser             Backend
│                        │                    │
│─────── GET /cli/auth ───────────────────────>│
│                        │                    │
│<──── device_code, user_code, verification_url
│                        │                    │
│  Display code          │                    │
│  & URL to user         │                    │
│                        │                    │
│     User visits URL ──>│                    │
│                        │                    │
│                        │── POST /authorize ─>│
│                        │  (with user_code)  │
│                        │                    │
│                        │<─── Success ───────│
│                        │                    │
│──── Poll /cli/token ───────────────────────>│
│  (with device_code)    │                    │
│                        │                    │
│<──── access_token ──────────────────────────│
│  + premium API key     │                    │
```

### Premium API Key Generation

When a premium user generates a CLI API key:
1. Check user's subscription status
2. Generate secure key with prefix (e.g., `reco_live_...`)
3. Store hashed version in database
4. Return full key once (never shown again)
5. Link to CLI session for tracking
6. Apply rate limits based on plan

### Usage Tracking Flow

```
CLI Request → API Gateway
              │
              ├─ Verify API Key
              ├─ Check Rate Limits
              ├─ Route to AI Provider
              ├─ Track Usage
              │   ├─ Tokens used
              │   ├─ Cost
              │   ├─ Model
              │   └─ Duration
              └─ Return Response
```

## 📊 Database Migrations

### Migration 1: Ensure CLISession is up to date
Already included in schema.

### Migration 2: Add indexes for performance
```sql
-- Already included in schema
CREATE INDEX idx_cli_session_device_code ON cli_sessions(device_code);
CREATE INDEX idx_cli_session_user_status ON cli_sessions(userId, status);
CREATE INDEX idx_api_key_user ON api_keys(userId);
CREATE INDEX idx_usage_record_user_timestamp ON usage_records(userId, timestamp);
```

## 🎨 UI Components Structure

```
/app/app/settings/
├── premium/
│   ├── page.tsx
│   └── components/
│       ├── PlanOverview.tsx
│       ├── ApiKeyManager.tsx
│       ├── UsageMetrics.tsx
│       └── PremiumFeatures.tsx
│
├── subscription/
│   ├── page.tsx
│   └── components/
│       ├── PlanSelector.tsx
│       ├── BillingHistory.tsx
│       └── PaymentMethods.tsx
│
└── sessions/
    ├── page.tsx
    └── components/
        └── SessionList.tsx

/app/app/cli/
└── auth/
    ├── page.tsx
    ├── [code]/
    │   └── page.tsx
    └── components/
        ├── DeviceCodeDisplay.tsx
        └── AuthorizationForm.tsx

/app/app/dashboard/
└── usage/
    ├── page.tsx
    └── components/
        ├── UsageChart.tsx
        ├── CostBreakdown.tsx
        ├── SessionsTable.tsx
        └── ExportButton.tsx
```

## 🔐 Security Considerations

1. **API Keys:**
   - Use secure random generation (crypto.randomBytes)
   - Hash before storing (bcrypt/argon2)
   - Prefix for identification (`reco_live_`, `reco_test_`)
   - Support key rotation

2. **Device Flow:**
   - Short expiration (15 minutes for device codes)
   - Rate limit authorization attempts
   - Log all auth events
   - Support session revocation

3. **Rate Limiting:**
   - Per-plan limits
   - Per-endpoint limits
   - Token bucket algorithm
   - Graceful degradation

## 📈 Success Metrics

1. **Authentication:**
   - Device flow completion rate > 90%
   - Average auth time < 60 seconds
   - Token refresh success rate > 99%

2. **Usage:**
   - API key generation success rate > 95%
   - Usage tracking accuracy > 99.9%
   - Dashboard load time < 2 seconds

3. **Premium:**
   - Subscription upgrade conversion rate
   - Premium feature adoption rate
   - Churn rate reduction

## 🚀 Deployment Checklist

### Backend
- [ ] Database migration applied
- [ ] Environment variables set
- [ ] Rate limiters configured
- [ ] Monitoring alerts configured
- [ ] Load balancer rules updated

### Frontend
- [ ] All pages built and tested
- [ ] API endpoints verified
- [ ] Error handling implemented
- [ ] Loading states added
- [ ] Mobile responsive verified

### Integration
- [ ] E2E tests passing
- [ ] Security scan completed
- [ ] Performance tests passing
- [ ] Documentation updated

## 📚 Documentation Requirements

1. **CLI User Guide:**
   - Installation instructions
   - Authentication steps
   - API key management
   - Usage examples

2. **API Documentation:**
   - Endpoint specifications
   - Authentication methods
   - Rate limits
   - Error codes

3. **Admin Guide:**
   - Monitoring dashboards
   - User management
   - Billing reconciliation
   - Incident response

## 🔄 Future Enhancements

1. **Phase 6: Advanced Features**
   - Team/organization support
   - SSO integration
   - Custom rate limits
   - Usage alerts

2. **Phase 7: Enterprise Features**
   - Audit logging
   - Compliance reports
   - Custom contracts
   - Dedicated support

## 📞 Support Resources

- **Technical Support:** support@recoder.xyz
- **Documentation:** https://recoder.xyz/docs
- **Status Page:** https://status.recoder.xyz
- **Community:** https://discord.gg/recoder

---

## Implementation Status

- [✅] Phase 1: Database Schema
- [⏳] Phase 2: Backend API
- [⏳] Phase 3: Frontend Pages
- [⏳] Phase 4: API Integration
- [⏳] Phase 5: Testing & Validation

**Last Updated:** 2024-01-18
**Implemented By:** AI Implementation Team
