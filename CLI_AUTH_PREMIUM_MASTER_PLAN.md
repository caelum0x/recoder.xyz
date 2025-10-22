# 🚀 CLI Authentication & Premium Features Master Implementation Plan

## 📊 Current Status Analysis

### ✅ What's Already Implemented

#### Backend (Complete)
- ✅ CLI auth routes (`/backend/src/routes/cli-auth.ts`)
  - Device code flow endpoints
  - Token polling and verification
  - Session management (list, revoke, revoke all)
  - Usage tracking
- ✅ Premium routes (`/backend/src/routes/premium.ts`)
  - Status endpoint
  - API key generation
- ✅ Database schema (Prisma)
  - `CLISession` model with device codes
  - `CLIUsage` tracking model
  - `ApiKey` model with rate limits
  - `Subscription` and `SubscriptionPlan` models
  - `SubscriptionPlanLimits` with usage quotas

#### Frontend (Partial)
- ✅ Premium settings page (`/app/app/settings/premium/page.tsx`)
- ✅ Premium components:
  - `PlanOverview.tsx`
  - `ApiKeyManager.tsx`
  - `UsageMetrics.tsx`
  - `PremiumFeatures.tsx`
- ✅ Usage dashboard exists (`/app/app/dashboard/usage/`)
- ✅ CLI auth page (`/app/app/cli/auth/`)

### ❌ What's Missing

#### Frontend API Routes
- ❌ `/app/app/api/premium/status/route.ts` - Frontend API for premium status
- ❌ `/app/app/api/user/api-keys/route.ts` - API key CRUD operations
- ❌ `/app/app/api/user/usage-analytics/route.ts` - Usage analytics endpoint
- ❌ `/app/app/api/subscription/manage/route.ts` - Subscription management

#### Enhanced Pages
- ❌ Complete usage dashboard with charts and export
- ❌ Subscription management page (`/app/app/billing/subscription/`)
- ❌ Enhanced CLI auth flow page with better UX

#### Integration
- ❌ Connect frontend to backend premium/CLI auth APIs
- ❌ API key generation and management UI flow
- ❌ Usage analytics visualization

---

## 🎯 Implementation Plan

### Phase 1: Frontend API Routes (1 day)

**Goal:** Create Next.js API routes that proxy to backend services

#### 1.1 Premium Status API Route
**File:** `/app/app/api/premium/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/premium/status`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch premium status' },
      { status: 500 }
    );
  }
}
```

#### 1.2 API Key Management Routes
**File:** `/app/app/api/user/api-keys/route.ts`

```typescript
// GET - List all API keys
// POST - Create new API key
// DELETE - Revoke API key
```

#### 1.3 Usage Analytics Route
**File:** `/app/app/api/user/usage-analytics/route.ts`

```typescript
// GET - Get usage data with optional date range filters
// Params: startDate, endDate, groupBy (day/week/month)
```

#### 1.4 Subscription Management Route
**File:** `/app/app/api/subscription/manage/route.ts`

```typescript
// GET - Get subscription details
// POST - Update subscription plan
// DELETE - Cancel subscription
```

---

### Phase 2: Enhanced UI Components (2 days)

#### 2.1 Usage Dashboard Components

**Files to Create:**
- `/app/app/dashboard/usage/page.tsx` (enhance existing)
- `/app/app/dashboard/usage/components/UsageChart.tsx`
- `/app/app/dashboard/usage/components/CostBreakdown.tsx`
- `/app/app/dashboard/usage/components/SessionsTable.tsx`
- `/app/app/dashboard/usage/components/ExportButton.tsx`

**Features:**
- Interactive charts (Recharts/Chart.js)
- Date range selector
- Cost breakdown by provider/model
- Active sessions list
- Export to CSV/PDF

#### 2.2 Enhanced API Key Manager

**Enhancements to:** `/app/app/settings/premium/components/ApiKeyManager.tsx`

**Features:**
- Copy to clipboard with visual feedback
- QR code generation for easy mobile setup
- Usage per key visualization
- Rate limit configuration
- Expiry date setting
- Permission scopes (read/write/admin)

#### 2.3 Subscription Management Page

**File:** `/app/app/settings/subscription/page.tsx`

**Features:**
- Current plan overview with benefits
- Upgrade/downgrade flow
- Billing history
- Payment method management
- Usage forecasting
- Cost projections

---

### Phase 3: CLI Integration Experience (1.5 days)

#### 3.1 Enhanced CLI Auth Page

**File:** `/app/app/cli/auth/page.tsx` (enhance existing)

**Features:**
- Step-by-step instructions with code snippets
- Device code verification with auto-refresh
- Success/error states with animations
- Quick start guide
- Video tutorial link
- Troubleshooting section

#### 3.2 CLI Session Manager Component

**File:** `/app/app/settings/premium/components/CLISessionManager.tsx`

**Features:**
- List all active CLI sessions
- Show device info (OS, location, last used)
- Revoke individual sessions
- Revoke all sessions
- Session activity timeline

---

### Phase 4: Premium Features & Onboarding (1 day)

#### 4.1 Premium Onboarding Flow

**File:** `/app/app/onboarding/premium/page.tsx`

**Features:**
- Welcome screen for new premium users
- Quick setup guide (CLI + API keys)
- Feature showcase
- Interactive tutorial
- Skip option

#### 4.2 Premium Feature Showcase

**Enhancement:** `/app/app/settings/premium/components/PremiumFeatures.tsx`

**Features:**
- Feature comparison table (Free vs Pro vs Enterprise)
- Usage examples with code snippets
- Benefits calculator
- ROI estimator
- Testimonials

#### 4.3 Upgrade CTA Components

**Files:**
- `/app/components/premium/UpgradePrompt.tsx`
- `/app/components/premium/UsageLimitWarning.tsx`
- `/app/components/premium/FeatureLockedCard.tsx`

---

### Phase 5: Analytics & Monitoring (1 day)

#### 5.1 Usage Analytics Service

**File:** `/app/lib/analytics/usage-analytics.ts`

**Features:**
- Aggregate usage data by time period
- Calculate costs per provider/model
- Track rate limit approaching warnings
- Generate usage reports
- Export functionality

#### 5.2 Real-time Usage Monitoring

**File:** `/app/app/dashboard/usage/components/RealtimeUsage.tsx`

**Features:**
- WebSocket connection to backend
- Live usage updates
- Current rate limit status
- Active requests counter
- Cost meter

---

## 📋 Detailed Implementation Tasks

### Priority 0: Critical Pre-Launch (4-5 days)

#### Day 1: API Routes Foundation
- [ ] Create `/app/app/api/premium/status/route.ts`
- [ ] Create `/app/app/api/user/api-keys/route.ts` (full CRUD)
- [ ] Create `/app/app/api/user/usage-analytics/route.ts`
- [ ] Test all API routes with Postman/Thunder Client
- [ ] Add error handling and validation

#### Day 2: API Key Management Polish
- [ ] Enhance `ApiKeyManager.tsx` component
- [ ] Add key generation modal with options
- [ ] Implement copy-to-clipboard with toast notification
- [ ] Add key revocation confirmation dialog
- [ ] Add usage stats per key
- [ ] Test key lifecycle (create → use → revoke)

#### Day 3: Usage Dashboard Implementation
- [ ] Create `UsageChart.tsx` with Recharts
- [ ] Create `CostBreakdown.tsx` component
- [ ] Create `SessionsTable.tsx` component
- [ ] Add date range picker
- [ ] Implement data export (CSV/JSON)
- [ ] Add loading states and error handling

#### Day 4: Subscription Management
- [ ] Create `/app/app/settings/subscription/page.tsx`
- [ ] Build plan comparison component
- [ ] Implement upgrade flow
- [ ] Add payment method management
- [ ] Create billing history table
- [ ] Add cancel subscription flow

#### Day 5: Testing & Polish
- [ ] End-to-end testing: CLI login → usage → monitoring
- [ ] Mobile responsiveness testing
- [ ] Error scenario testing
- [ ] Performance optimization
- [ ] Documentation updates

---

## 🔄 Complete User Flow

### Flow 1: New User Upgrades to Premium

```
1. User visits /pricing
   ↓
2. Clicks "Upgrade to Pro" ($49/mo)
   ↓
3. Redirected to /checkout with plan=pro
   ↓
4. Completes payment (Stripe/Dodo)
   ↓
5. Subscription created in database
   ↓
6. Redirected to /settings/premium
   ├─ Sees premium badge ✨
   ├─ Subscription status: Active
   ├─ Usage limits: 5,000 req/mo
   └─ "Generate CLI Key" button enabled
```

### Flow 2: User Sets Up CLI Authentication

```
1. User clicks "CLI Authentication" in premium settings
   ↓
2. Redirected to /cli/auth
   ↓
3. Sees instructions:
   - Install: npm install -g recoder-code
   - Run: recoder auth login
   ↓
4. User runs `recoder auth login` in terminal
   ├─ CLI calls: POST /api/auth/cli/authorize
   ├─ Gets device code + user code
   ├─ Shows: "Go to https://recoder.xyz/cli/auth?code=ABC123"
   └─ CLI polls: GET /api/auth/cli/token
   ↓
5. User opens browser URL with code
   ↓
6. Web page:
   ├─ Verifies user is logged in
   ├─ Shows device info from session
   ├─ Asks: "Authorize this device?"
   └─ User clicks "Approve"
   ↓
7. Browser calls: POST /api/auth/cli/authorize-session
   ↓
8. CLI receives access token on next poll
   ↓
9. CLI stores token locally
   ↓
10. Success! CLI is authenticated
```

### Flow 3: User Makes AI Request via CLI

```
1. User runs: recoder generate "build a todo app"
   ↓
2. CLI sends request with Bearer token
   ↓
3. Backend:
   ├─ Verifies token: GET /api/auth/cli/verify
   ├─ Checks subscription limits
   ├─ Checks rate limits
   └─ Returns user info + limits
   ↓
4. If within limits:
   ├─ Routes to appropriate AI provider
   ├─ Generates code
   ├─ Tracks usage: POST /api/auth/cli/track-usage
   └─ Returns result to CLI
   ↓
5. CLI displays generated code
   ↓
6. Usage recorded in database:
   ├─ CLIUsage table updated
   ├─ User's monthly count incremented
   └─ Cost calculated and stored
```

### Flow 4: User Monitors Usage

```
1. User visits /dashboard/usage
   ↓
2. Page loads:
   ├─ Fetches: GET /api/user/usage-analytics
   ├─ Shows interactive charts
   ├─ Displays cost breakdown
   └─ Lists active sessions
   ↓
3. User can:
   ├─ Filter by date range
   ├─ View by provider/model
   ├─ Export report (CSV)
   └─ See real-time usage
   ↓
4. If approaching limit:
   ├─ Warning banner shown
   └─ Upgrade prompt appears
```

---

## 🗂️ File Structure

```
recoder.xyz/
├── app/
│   ├── app/
│   │   ├── api/
│   │   │   ├── premium/
│   │   │   │   └── status/
│   │   │   │       └── route.ts ⭐ NEW
│   │   │   ├── user/
│   │   │   │   ├── api-keys/
│   │   │   │   │   └── route.ts ⭐ NEW
│   │   │   │   └── usage-analytics/
│   │   │   │       └── route.ts ⭐ NEW
│   │   │   └── subscription/
│   │   │       └── manage/
│   │   │           └── route.ts ⭐ NEW
│   │   ├── settings/
│   │   │   ├── premium/
│   │   │   │   ├── page.tsx ✅ EXISTS
│   │   │   │   └── components/
│   │   │   │       ├── ApiKeyManager.tsx ✅ (enhance)
│   │   │   │       ├── PlanOverview.tsx ✅
│   │   │   │       ├── UsageMetrics.tsx ✅
│   │   │   │       ├── PremiumFeatures.tsx ✅
│   │   │   │       └── CLISessionManager.tsx ⭐ NEW
│   │   │   └── subscription/
│   │   │       └── page.tsx ⭐ NEW
│   │   ├── dashboard/
│   │   │   └── usage/
│   │   │       ├── page.tsx ✅ (enhance)
│   │   │       └── components/
│   │   │           ├── UsageChart.tsx ⭐ NEW
│   │   │           ├── CostBreakdown.tsx ⭐ NEW
│   │   │           ├── SessionsTable.tsx ⭐ NEW
│   │   │           ├── ExportButton.tsx ⭐ NEW
│   │   │           └── RealtimeUsage.tsx ⭐ NEW
│   │   └── cli/
│   │       └── auth/
│   │           └── page.tsx ✅ (enhance)
│   └── components/
│       └── premium/
│           ├── UpgradePrompt.tsx ⭐ NEW
│           ├── UsageLimitWarning.tsx ⭐ NEW
│           └── FeatureLockedCard.tsx ⭐ NEW
└── backend/
    └── src/
        ├── routes/
        │   ├── cli-auth.ts ✅ COMPLETE
        │   └── premium.ts ✅ EXISTS
        └── services/
            ├── cliAuth.service.ts ✅
            └── premium.service.ts ✅
```

---

## 🔌 API Reference

### Backend APIs (Already Implemented)

#### CLI Authentication
```
POST   /api/auth/cli/authorize          - Start device code flow
GET    /api/auth/cli/token              - Poll for authorization token  
POST   /api/auth/cli/verify-code        - Verify user code
POST   /api/auth/cli/authorize-session  - Approve CLI session
POST   /api/auth/cli/deny-session       - Deny CLI session
GET    /api/auth/cli/verify             - Verify CLI token + get limits
GET    /api/auth/cli/sessions           - List user's sessions
DELETE /api/auth/cli/session/:id        - Revoke specific session
DELETE /api/auth/cli/sessions/all       - Revoke all sessions
POST   /api/auth/cli/track-usage        - Track CLI usage
GET    /api/auth/cli/usage-stats        - Get usage statistics
```

#### Premium Features
```
GET    /api/premium/status              - Get premium status
POST   /api/premium/api-key             - Generate API key
```

### Frontend APIs (To Be Created)

```
GET    /api/premium/status              - Proxy to backend
GET    /api/user/api-keys               - List API keys
POST   /api/user/api-keys               - Create API key
DELETE /api/user/api-keys/:id           - Revoke API key
GET    /api/user/usage-analytics        - Get usage data
GET    /api/subscription/manage         - Get subscription
POST   /api/subscription/manage         - Update subscription
DELETE /api/subscription/manage         - Cancel subscription
```

---

## 🎨 UI/UX Enhancements

### Premium Settings Page Improvements

#### Current State
- Basic plan overview
- Simple API key list
- Usage metrics

#### Enhanced State
- Premium badge with animation
- Interactive feature showcase
- One-click API key generation
- QR code for mobile setup
- Session management table
- Quick action cards
- Upgrade CTA for free users

### Usage Dashboard Improvements

#### Charts to Add
1. **Requests Over Time** (Line chart)
   - Daily/weekly/monthly views
   - Multiple providers overlay
   - Hover tooltips with details

2. **Cost Breakdown** (Pie/Donut chart)
   - By provider (Claude, Groq, Gemini, etc.)
   - By model type
   - By request type

3. **Usage Distribution** (Bar chart)
   - Requests per day
   - Peak usage times
   - Success/failure rates

4. **Rate Limit Status** (Progress bars)
   - Daily limit usage
   - Monthly limit usage
   - Visual warnings at 80%/90%

#### Interactivity
- Click on chart elements to drill down
- Export chart as image
- Share usage report link
- Schedule email reports

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] API route handlers
- [ ] Component rendering
- [ ] Data formatting utilities
- [ ] Error handling

### Integration Tests
- [ ] CLI auth flow end-to-end
- [ ] API key creation and usage
- [ ] Usage tracking accuracy
- [ ] Subscription limit enforcement

### E2E Tests
- [ ] Complete user journey: signup → upgrade → CLI setup → usage
- [ ] Payment flow integration
- [ ] Session revocation
- [ ] Export functionality

### Performance Tests
- [ ] Large dataset rendering (1000+ usage records)
- [ ] API response times
- [ ] Chart render performance
- [ ] Real-time updates

---

## 📊 Success Metrics

### Technical Metrics
- API response time < 200ms
- Chart render time < 1s
- Zero failed CLI authentications
- 100% usage tracking accuracy

### Business Metrics
- Premium conversion rate
- CLI adoption rate
- API key generation rate
- Average usage per premium user
- Churn rate reduction

### User Experience Metrics
- Time to first CLI authentication < 2 minutes
- User satisfaction score > 4.5/5
- Support ticket reduction
- Feature discovery rate

---

## 🚨 Known Issues & Solutions

### Issue 1: Backend TypeScript Errors
**Status:** ⚠️ Mentioned in BUILD-STATUS.md

**Solution:**
```bash
cd backend
npm install
npm run build
# Fix any remaining TypeScript errors
```

### Issue 2: Missing API Routes
**Status:** ❌ Frontend API routes don't exist

**Solution:** Implement Phase 1 tasks

### Issue 3: Usage Data Visualization
**Status:** ⚠️ Basic metrics exist, but no charts

**Solution:** Implement Phase 2.1 tasks

---

## 🎯 Next Steps

### Immediate (Today)
1. Create frontend API routes (Phase 1)
2. Test premium status endpoint
3. Verify CLI auth flow works end-to-end

### Short-term (This Week)
1. Build usage dashboard with charts
2. Enhance API key manager
3. Add subscription management page
4. Write comprehensive documentation

### Medium-term (This Month)
1. Add advanced analytics features
2. Implement cost forecasting
3. Build admin dashboard
4. Create video tutorials

---

## 📚 Documentation Needed

### For Users
- [ ] CLI authentication guide
- [ ] API key management guide
- [ ] Usage monitoring guide
- [ ] Subscription management guide
- [ ] Troubleshooting FAQ

### For Developers
- [ ] API integration guide
- [ ] Authentication flow diagram
- [ ] Database schema documentation
- [ ] Code generation examples

---

## 💰 Pricing & Limits

### Free Plan
- 100 requests/month
- 10 requests/day
- Basic models only
- 1 API key
- Community support

### Pro Plan ($49/mo)
- 5,000 requests/month
- 200 requests/day
- All models
- 5 API keys
- Priority support
- Advanced analytics

### Enterprise Plan (Custom)
- Unlimited requests
- Custom rate limits
- Dedicated models
- Unlimited API keys
- 24/7 support
- SLA guarantee
- Custom integrations

---

## 🔐 Security Considerations

### API Key Security
- Keys hashed in database (bcrypt)
- Only show full key once during creation
- Support key rotation
- Automatic expiry
- Audit log for all key operations

### Session Security
- Device fingerprinting
- IP address tracking
- Suspicious activity detection
- Automatic session timeout (30 days)
- User notification on new sessions

### Rate Limiting
- Per-user limits
- Per-API-key limits
- Per-IP limits
- Exponential backoff on abuse

---

## 🎉 Launch Checklist

### Pre-Launch
- [ ] All API routes functional
- [ ] Frontend components complete
- [ ] End-to-end testing passed
- [ ] Documentation complete
- [ ] Performance optimized
- [ ] Security audit passed

### Launch Day
- [ ] Monitor error rates
- [ ] Track conversion metrics
- [ ] Support team ready
- [ ] Rollback plan ready

### Post-Launch
- [ ] Gather user feedback
- [ ] Monitor usage patterns
- [ ] Optimize based on data
- [ ] Plan next features

---

## 📞 Support & Resources

### Internal Documentation
- `CLI_AUTH_GUIDE.md` - CLI authentication details
- `PREMIUM_FEATURES_QUICK_START.md` - Quick start guide
- `RECODER_CODE_CLI_IMPLEMENTATION_GUIDE.md` - CLI client guide

### External Resources
- [Stripe Documentation](https://stripe.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Prisma Client](https://www.prisma.io/docs/concepts/components/prisma-client)

---

## 🎨 Design System

### Colors
- Premium Gold: `#FFD700`
- Success Green: `#10B981`
- Warning Yellow: `#F59E0B`
- Error Red: `#EF4444`
- Primary Blue: `#3B82F6`
- Secondary Purple: `#8B5CF6`

### Typography
- Headings: Inter Bold
- Body: Inter Regular
- Code: JetBrains Mono

### Spacing
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

---

## 🏁 Summary

This plan provides a complete roadmap for implementing CLI authentication and premium features. The backend is already solid, and we need to focus on:

1. **Frontend API routes** to connect UI to backend
2. **Enhanced UI components** for better UX
3. **Usage analytics** with visualizations
4. **Subscription management** interface

**Total Estimated Time:** 4-5 days

**Priority Order:**
1. API routes (critical path)
2. API key management (user-facing)
3. Usage dashboard (value delivery)
4. Subscription management (business critical)
5. Polish and testing (quality assurance)

---

**Status:** Ready to implement 🚀
**Last Updated:** {{current_date}}
**Version:** 1.0
