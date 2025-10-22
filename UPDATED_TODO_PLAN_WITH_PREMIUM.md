# 📋 UPDATED TODO PLAN - Premium Features & CLI Integration

**Project**: Recoder.xyz Web Platform + Backend API  
**Paths**: `/Users/arhansubasi/recoder.xyz/app` and `/Users/arhansubasi/recoder.xyz/backend`  
**Updated**: October 17, 2025  
**Focus**: Premium subscription features + CLI authentication completion

---

## 🎯 WHAT'S ALREADY DONE

### ✅ CLI Authentication (90% Complete)
- ✅ Backend API: 10+ CLI auth endpoints
- ✅ Database: CLISession, DeviceCode, ApiKey models
- ✅ Services: CLIAuthService fully implemented
- ✅ OAuth Device Code Flow: Complete
- ✅ Token management: Access + Refresh tokens
- ✅ API key generation for CLI users

### ✅ Basic Billing (80% Complete)
- ✅ Pages: `/billing`, `/billing/subscription`, `/billing/upgrade`, `/billing/invoices`
- ✅ Payment integration: DODO Payments
- ✅ Database: Subscription model
- ✅ Plan definitions: Free, Weekly, Monthly, Pro, Enterprise

### ❌ MISSING: Premium User Experience
- ❌ No `/settings/premium` page (manage premium features)
- ❌ No premium usage dashboard
- ❌ No CLI API key management UI
- ❌ No usage analytics for premium users
- ❌ No rate limiting UI
- ❌ No cost tracking dashboard
- ❌ No premium-only features section

---

## 🚀 NEW PRIORITY 0: PREMIUM FEATURES (URGENT)

These are **critical missing features** for premium users:

---

### Task 0.1: Premium Settings Page ⭐ CRITICAL

**Location**: Create `/app/app/settings/premium/page.tsx`  
**Status**: Does not exist  
**Purpose**: Central hub for premium users to manage their subscription benefits

**What to Build**:

1. **Premium Dashboard Overview**:
   ```tsx
   - Current plan display (Pro, Enterprise, etc.)
   - Subscription status badge
   - Usage summary (requests this month, cost, limits)
   - Quick actions (upgrade, manage API keys, view invoices)
   ```

2. **API Key Management Section**:
   ```tsx
   - Display active CLI API keys
   - Generate new API key button
   - Revoke existing keys
   - Copy key to clipboard
   - Show key permissions and scopes
   - Last used timestamp
   ```

3. **Usage & Limits Section**:
   ```tsx
   - Current usage vs. plan limits
   - Progress bars for requests, tokens, cost
   - Historical usage chart (last 30 days)
   - Estimated cost for current period
   - Overage warnings if applicable
   ```

4. **Premium Features List**:
   ```tsx
   - Show features enabled for current plan
   - Compare with higher tiers
   - Upgrade CTA if on lower tier
   ```

**API Endpoints Needed**:
```typescript
GET  /api/user/premium-status    // Get premium plan, limits, usage
GET  /api/user/api-keys           // List CLI API keys (already exists)
POST /api/user/api-keys           // Generate new key (already exists)
DELETE /api/user/api-keys/:id     // Revoke key (already exists)
GET  /api/user/usage-analytics    // Detailed usage data
```

**Database Queries**:
```typescript
// Already have:
- User.subscription
- User.apiKeys
- CLISession (for CLI usage)

// Need to add:
- UsageRecord aggregation
- Cost calculation
- Rate limit tracking
```

**Acceptance Criteria**:
- [ ] Premium page accessible at `/settings/premium`
- [ ] Shows current plan and benefits
- [ ] Can generate/revoke CLI API keys
- [ ] Displays usage statistics
- [ ] Shows cost tracking
- [ ] Upgrade CTA for non-premium users
- [ ] Mobile responsive

**Files to Create**:
```
/app/app/settings/premium/
  ├── page.tsx                 # Main premium settings page
  └── components/
      ├── PlanOverview.tsx     # Current plan display
      ├── ApiKeyManager.tsx    # API key CRUD
      ├── UsageMetrics.tsx     # Usage charts and stats
      └── PremiumFeatures.tsx  # Feature comparison
```

**Implementation Priority**: 🔴 **HIGHEST** (Premium users need this!)

---

### Task 0.2: Premium Usage Dashboard ⭐ CRITICAL

**Location**: Create `/app/app/dashboard/usage/page.tsx`  
**Status**: Does not exist  
**Purpose**: Detailed analytics for premium users' CLI and API usage

**What to Build**:

1. **Real-Time Usage Overview**:
   ```tsx
   - Requests today/this week/this month
   - Token consumption
   - Cost breakdown by model
   - Active CLI sessions
   ```

2. **Historical Analytics**:
   ```tsx
   - Usage timeline chart (daily/weekly/monthly)
   - Model performance comparison
   - Cost trends
   - Peak usage times
   ```

3. **CLI Session Management**:
   ```tsx
   - Active CLI sessions list
   - Device information (name, type, last used)
   - Revoke individual sessions
   - Session activity logs
   ```

4. **Cost Analysis**:
   ```tsx
   - Cost per model (Claude, GPT-4, etc.)
   - Cost per project
   - Cost predictions
   - Export cost reports (CSV, PDF)
   ```

**API Endpoints Needed**:
```typescript
GET  /api/analytics/usage           // Usage over time
GET  /api/analytics/cost             // Cost breakdown
GET  /api/analytics/sessions         // Active CLI sessions
GET  /api/analytics/models           // Model usage stats
POST /api/analytics/export           // Export reports
```

**Database Additions**:
```prisma
model UsageRecord {
  id          String   @id @default(cuid())
  userId      String
  sessionId   String?  // CLI session or web session
  modelName   String   // claude-3-5-sonnet, gpt-4, etc.
  requestType String   // generate, chat, analyze
  tokensUsed  Int
  cost        Float    // in dollars
  timestamp   DateTime @default(now())
  metadata    Json?    // Request details
  
  user    User        @relation(fields: [userId], references: [id])
  session CLISession? @relation(fields: [sessionId], references: [id])
  
  @@index([userId, timestamp])
  @@index([sessionId])
}
```

**Acceptance Criteria**:
- [ ] Usage dashboard at `/dashboard/usage`
- [ ] Real-time usage metrics
- [ ] Historical charts and analytics
- [ ] CLI session management
- [ ] Cost tracking and export
- [ ] Filter by date range, model, project

**Files to Create**:
```
/app/app/dashboard/usage/
  ├── page.tsx                    # Main usage dashboard
  └── components/
      ├── UsageOverview.tsx       # Summary cards
      ├── UsageChart.tsx          # Timeline visualization
      ├── CostBreakdown.tsx       # Cost analysis
      ├── SessionsTable.tsx       # Active CLI sessions
      └── ExportButton.tsx        # Export functionality
```

**Implementation Priority**: 🔴 **HIGHEST**

---

### Task 0.3: CLI API Key UI Enhancement ⭐ HIGH

**Location**: Update `/app/app/settings/api-keys/page.tsx`  
**Status**: Exists but needs premium features  
**Purpose**: Better UI for managing CLI authentication keys

**What to Enhance**:

1. **Better Key Display**:
   ```tsx
   - Show key type (CLI, Web, Mobile)
   - Display permissions/scopes
   - Last used indicator
   - Usage statistics per key
   ```

2. **Advanced Key Management**:
   ```tsx
   - Set expiration dates
   - Configure rate limits per key
   - Restrict by IP address
   - Enable/disable without deleting
   ```

3. **Security Features**:
   ```tsx
   - Key rotation (regenerate)
   - Activity logs per key
   - Suspicious activity alerts
   - 2FA requirement for key generation
   ```

**API Enhancements**:
```typescript
PUT  /api/user/api-keys/:id       // Update key settings
POST /api/user/api-keys/:id/rotate // Rotate key
GET  /api/user/api-keys/:id/logs  // Key usage logs
```

**Database Updates**:
```prisma
model ApiKey {
  // Existing fields...
  
  // Add these:
  expiresAt     DateTime?
  lastUsedAt    DateTime?
  usageCount    Int          @default(0)
  rateLimit     Int?         // Requests per hour
  ipWhitelist   String[]     @default([])
  isActive      Boolean      @default(true)
  rotatedFrom   String?      // Previous key ID if rotated
  scopes        String[]     @default([])
}
```

**Acceptance Criteria**:
- [ ] Enhanced API key list with details
- [ ] Can set expiration and rate limits
- [ ] Key rotation functionality
- [ ] Usage logs per key
- [ ] Security alerts

**Implementation Priority**: 🟡 **HIGH**

---

### Task 0.4: Premium Features Section ⭐ MEDIUM

**Location**: Create `/app/app/premium/page.tsx`  
**Status**: Does not exist  
**Purpose**: Showcase and manage premium-only features

**What to Build**:

1. **Feature Showcase**:
   ```tsx
   - List of premium features (CLI access, advanced models, etc.)
   - Usage instructions for each feature
   - Video tutorials or documentation links
   ```

2. **CLI Setup Guide**:
   ```tsx
   - Step-by-step CLI installation
   - Authentication walkthrough
   - Example commands
   - Troubleshooting common issues
   ```

3. **Advanced Features**:
   ```tsx
   - Custom model fine-tuning (if implemented)
   - Team collaboration tools
   - Advanced analytics
   - Priority support access
   ```

**Acceptance Criteria**:
- [ ] Premium features page at `/premium`
- [ ] Clear documentation for each feature
- [ ] CLI setup guide
- [ ] Accessible only to premium users

**Files to Create**:
```
/app/app/premium/
  ├── page.tsx                # Premium features overview
  ├── cli-guide/
  │   └── page.tsx           # CLI setup guide
  └── components/
      ├── FeatureCard.tsx    # Individual feature showcase
      └── CLIInstructions.tsx # CLI setup steps
```

**Implementation Priority**: 🟡 **MEDIUM**

---

### Task 0.5: Subscription Management Enhancement ⭐ MEDIUM

**Location**: Update `/app/app/billing/subscription/page.tsx`  
**Status**: Exists but needs enhancements  
**Purpose**: Better subscription management UI

**What to Enhance**:

1. **Plan Comparison**:
   ```tsx
   - Side-by-side plan comparison
   - Highlight current plan
   - Show what's included/excluded
   - Clear upgrade/downgrade paths
   ```

2. **Usage-Based Recommendations**:
   ```tsx
   - "You're using X% of your limit"
   - "Based on usage, we recommend Plan Y"
   - Cost savings calculator
   ```

3. **Billing Cycle Options**:
   ```tsx
   - Switch between monthly/yearly
   - Show annual savings
   - Proration calculator
   ```

**Acceptance Criteria**:
- [ ] Enhanced plan comparison
- [ ] Usage-based recommendations
- [ ] Flexible billing cycle switching
- [ ] Clear pricing display

**Implementation Priority**: 🟡 **MEDIUM**

---

## 🔧 PRIORITY 0.5: CLI INTEGRATION POLISH

These complete the CLI authentication experience:

---

### Task 0.6: CLI Authorization Page Enhancement

**Location**: `/app/app/cli/auth/page.tsx`  
**Status**: Exists but needs polish  
**Purpose**: Better UX for CLI device code authorization

**What to Enhance**:

1. **User-Friendly Design**:
   ```tsx
   - Clear instructions
   - Large code display
   - Auto-copy code button
   - Success animation
   ```

2. **Security Information**:
   ```tsx
   - Show device information (if available)
   - Location and IP
   - "Not you?" denial option
   - Session expiry countdown
   ```

3. **Post-Authorization Actions**:
   ```tsx
   - Success confirmation
   - Quick links to premium features
   - CLI usage tips
   ```

**Acceptance Criteria**:
- [ ] Polished authorization UI
- [ ] Clear security information
- [ ] Success confirmation flow
- [ ] Mobile-friendly

**Files to Update**:
```
/app/app/cli/auth/page.tsx       # Main authorization page
/app/app/cli/auth/components/    # UI components
```

**Implementation Priority**: 🟡 **MEDIUM**

---

### Task 0.7: CLI Session Management UI

**Location**: `/app/app/settings/sessions/page.tsx`  
**Status**: Does not exist  
**Purpose**: Manage active CLI and web sessions

**What to Build**:

1. **Active Sessions List**:
   ```tsx
   - Device name and type (CLI, Browser, Mobile)
   - IP address and location
   - Last active timestamp
   - Current session indicator
   ```

2. **Session Actions**:
   ```tsx
   - Revoke individual sessions
   - Revoke all except current
   - View session details
   ```

3. **Security Alerts**:
   ```tsx
   - Unusual activity warnings
   - Multiple concurrent sessions alert
   - Failed login attempts
   ```

**API Endpoints**:
```typescript
GET    /api/auth/sessions        // List all active sessions
DELETE /api/auth/sessions/:id    // Revoke specific session
DELETE /api/auth/sessions/all    // Revoke all except current
```

**Acceptance Criteria**:
- [ ] Sessions page at `/settings/sessions`
- [ ] List all active sessions
- [ ] Revoke functionality
- [ ] Security alerts

**Files to Create**:
```
/app/app/settings/sessions/
  └── page.tsx                   # Session management
```

**Implementation Priority**: 🟢 **NICE TO HAVE**

---

## 📊 UPDATED PRIORITY STRUCTURE

### 🔴 PRIORITY 0: Premium Features (NEW - URGENT)
1. **Task 0.1**: Premium Settings Page ⭐ CRITICAL
2. **Task 0.2**: Premium Usage Dashboard ⭐ CRITICAL
3. **Task 0.3**: CLI API Key UI Enhancement ⭐ HIGH
4. **Task 0.4**: Premium Features Section
5. **Task 0.5**: Subscription Management Enhancement
6. **Task 0.6**: CLI Authorization Page Polish
7. **Task 0.7**: CLI Session Management UI

**Why Priority 0?**: Premium users are paying customers who lack essential features!

---

### 🔴 PRIORITY 1: Critical (Pre-Launch)
1. Task 1.1: Configure SendGrid
2. Task 1.2: Configure Sentry
3. Task 1.3: Run full E2E test suite
4. Task 1.4: Performance load testing
5. Task 1.5: Database backup strategy

---

### 🟡 PRIORITY 2: Important (Week 1)
1. Task 2.1: Expand E2E test coverage
2. Task 2.2: API integration tests
3. Task 2.3: Monitoring dashboards
4. Task 2.4: Database query optimization
5. Task 2.5: CDN setup

---

### 🟢 PRIORITY 3: Nice to Have (Month 1)
1. Task 3.1: Unit tests for services
2. Task 3.2: Visual regression testing
3. Task 3.3: API documentation
4. Task 3.4: Advanced analytics features
5. Task 3.5: Feature flags system
6. Task 3.6: User feedback system

---

## 🔄 CLI + PREMIUM INTEGRATION FLOW

### Complete User Journey:

```
1. User Signs Up (Free Tier)
   ↓
2. User Browses Premium Features (/premium)
   ↓
3. User Upgrades to Pro (/billing/upgrade)
   ↓
4. User Gets Premium Benefits (/settings/premium)
   ├─ Generates CLI API Key
   ├─ Downloads recoder-code CLI
   └─ Authenticates CLI (device code flow)
   ↓
5. User Uses CLI
   ├─ `recoder auth login` → Device code flow
   ├─ `recoder generate "code"` → API call with key
   └─ Usage tracked in UsageRecord
   ↓
6. User Monitors Usage (/dashboard/usage)
   ├─ Sees requests, tokens, cost
   ├─ Manages CLI sessions
   └─ Exports reports
   ↓
7. User Manages Subscription (/billing/subscription)
   ├─ Upgrades/downgrades
   ├─ Updates payment method
   └─ Views invoices
```

---

## 🛠️ IMPLEMENTATION CHECKLIST

### Phase 1: Core Premium Features (Week 1)
- [ ] Create `/settings/premium/page.tsx`
- [ ] Build API key management components
- [ ] Create usage metrics display
- [ ] Add UsageRecord database model
- [ ] Implement usage tracking APIs

### Phase 2: Analytics Dashboard (Week 1-2)
- [ ] Create `/dashboard/usage/page.tsx`
- [ ] Build usage charts and visualizations
- [ ] Implement cost tracking
- [ ] Add CLI session management
- [ ] Create export functionality

### Phase 3: Polish & Integration (Week 2)
- [ ] Enhance `/settings/api-keys/page.tsx`
- [ ] Polish CLI auth page
- [ ] Create premium features showcase
- [ ] Add session management page
- [ ] Improve subscription page

### Phase 4: Testing & Deployment (Week 3)
- [ ] E2E tests for premium flow
- [ ] Test CLI integration end-to-end
- [ ] Load testing with usage tracking
- [ ] Security audit
- [ ] Deploy to production

---

## 📋 DATABASE MIGRATIONS NEEDED

### New Models:

```prisma
// Add to schema.prisma

model UsageRecord {
  id          String   @id @default(cuid())
  userId      String
  sessionId   String?
  modelName   String
  requestType String
  tokensUsed  Int
  cost        Float
  timestamp   DateTime @default(now())
  metadata    Json?
  
  user    User        @relation(fields: [userId], references: [id])
  session CLISession? @relation(fields: [sessionId], references: [id])
  
  @@index([userId, timestamp])
  @@index([sessionId])
}

// Enhance existing ApiKey model
model ApiKey {
  id            String    @id @default(cuid())
  userId        String
  key           String    @unique
  name          String
  expiresAt     DateTime?
  lastUsedAt    DateTime?
  usageCount    Int       @default(0)
  rateLimit     Int?
  ipWhitelist   String[]  @default([])
  isActive      Boolean   @default(true)
  rotatedFrom   String?
  scopes        String[]  @default([])
  createdAt     DateTime  @default(now())
  
  user User @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([key])
}
```

### Migration Command:
```bash
cd /Users/arhansubasi/recoder.xyz/app
npx prisma migrate dev --name add-premium-features
```

---

## 🎯 SUCCESS METRICS

### After Implementing Priority 0:

**Premium User Experience**:
- [ ] Premium users can access `/settings/premium`
- [ ] Can generate and manage CLI API keys
- [ ] Can view usage and cost analytics
- [ ] Can manage CLI sessions
- [ ] Clear upgrade path from free tier

**Technical**:
- [ ] UsageRecord tracking working
- [ ] Cost calculation accurate
- [ ] API key management functional
- [ ] CLI integration seamless

**Business**:
- [ ] Premium feature visibility improved
- [ ] Upgrade conversion rate tracked
- [ ] Usage-based pricing possible
- [ ] Customer retention metrics

---

## 💡 QUICK WINS

These can be done quickly to show immediate value:

1. **Task 0.1** (1-2 days): Premium Settings Page
2. **Task 0.3** (1 day): API Key UI Enhancement  
3. **Task 0.6** (0.5 days): CLI Auth Page Polish

**Total**: 2.5-3.5 days for major premium improvements!

---

## 🚀 RECOMMENDED APPROACH

### Week 1: Premium Essentials
1. Build `/settings/premium` page
2. Enhance API key management
3. Add basic usage tracking

### Week 2: Analytics & Monitoring
1. Build `/dashboard/usage` page
2. Implement cost tracking
3. Add CLI session management

### Week 3: Polish & Production
1. Polish all UI components
2. Complete testing
3. Deploy to production

---

**This plan gives premium users the features they're paying for!** 🎯

**Focus**: Premium experience first, then existing TODO tasks.

**Impact**: Immediate value for paying customers + better conversion rates.

---

**Last Updated**: October 17, 2025  
**Status**: Ready for implementation  
**Priority**: Start with Task 0.1 and 0.2 (Premium Settings + Usage Dashboard)
