# 🎯 RECODER.XYZ IMPLEMENTATION ROADMAP

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                          │
├──────────────┬──────────────┬───────────────┬──────────────┤
│ recoder-code │ recoder-web  │ VS Code Ext   │  Mobile App  │
│   (CLI)      │  (bolt.new)  │               │              │
└──────┬───────┴──────┬───────┴───────┬───────┴──────┬───────┘
       │              │               │              │
       └──────────────┴───────────────┴──────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   APP (Next.js)    │
                    │  Central Hub       │
                    │  - Auth            │
                    │  - API Keys        │
                    │  - Settings        │
                    │  - Billing         │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  BACKEND (Express) │
                    │  - AI Routing      │
                    │  - Usage Tracking  │
                    │  - Cost Management │
                    │  - Device Mgmt     │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │    DATABASE        │
                    │   (PostgreSQL)     │
                    └────────────────────┘
```

---

## ✅ PHASE 1: AUTHENTICATION & CORE (DONE)

### Completed
- ✅ Better Auth implementation
- ✅ Email/Password authentication
- ✅ GitHub OAuth
- ✅ Google OAuth
- ✅ Session management
- ✅ Database schema (Prisma)
- ✅ Onboarding flow (4 steps)
- ✅ Professional dashboard

---

## 🔧 PHASE 2: APP ↔ BACKEND CONNECTION (CRITICAL - DO FIRST)

### 2.1 Fix API Route Authentication

**Files to Update:**
```
app/app/api/user/api-keys/route.ts     ✅ Fix getServerSession → requireAuth()
app/app/api/billing/*/route.ts         ⚠️  Fix authentication
app/app/api/usage/*/route.ts           ⚠️  Fix authentication
app/app/api/user/*/route.ts            ⚠️  Fix authentication
```

**Pattern to Use:**
```typescript
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.response;
  
  const { user } = authResult;
  
  // Use user.id, user.email, etc.
}
```

### 2.2 Backend Connection Configuration

**Create: `app/lib/backend-client.ts`**
```typescript
// Centralized backend API client
export class BackendClient {
  private baseURL: string;
  
  constructor() {
    this.baseURL = process.env.BACKEND_URL || 'http://localhost:3001';
  }
  
  async request(endpoint: string, options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    userId?: string;
    userEmail?: string;
  }) {
    // Make request to backend with proper auth headers
  }
  
  // Typed methods for each backend endpoint
  async getApiKeys(userId: string) { }
  async createApiKey(userId: string, data: any) { }
  async trackUsage(userId: string, data: any) { }
  async getUsageStats(userId: string) { }
  async manageBilling(userId: string, action: string) { }
}
```

### 2.3 Environment Configuration

**Update: `.env`**
```env
# Backend Connection
BACKEND_URL=http://localhost:3001
BACKEND_API_KEY=your-internal-api-key

# Production
PRODUCTION_BACKEND_URL=https://api.recoder.xyz
```

---

## 🔑 PHASE 3: API KEY MANAGEMENT (REAL IMPLEMENTATION)

### 3.1 Complete API Key Flow

**Frontend → App API → Backend**

```
User creates key → /app/api/user/api-keys (POST)
                 → Backend /api/premium/api-key (POST)
                 → Database insert
                 → Return encrypted key
                 → Display once to user
```

### 3.2 Files to Implement

1. **`app/app/api/user/api-keys/route.ts`** ✅ FIXED
   - GET: List all keys
   - POST: Create new key
   - DELETE: Revoke key
   - PATCH: Update key metadata

2. **`app/app/settings/api-keys/page.tsx`** ⚠️ UPDATE NEEDED
   - Professional UI
   - Create key modal
   - Copy to clipboard
   - Show key once warning
   - Usage statistics
   - Revoke confirmation

3. **`backend/src/routes/api-keys.ts`** ⚠️ CHECK & UPDATE
   - Generate unique key
   - Encrypt and store
   - Track usage per key
   - Rate limiting per key
   - Expire old keys

### 3.3 Key Format
```
recoder_prod_1a2b3c4d5e6f7g8h9i0j
│      │    │
│      │    └─ 20 char random
│      └────── Environment
└─────────────── Prefix
```

---

## 💳 PHASE 4: SUBSCRIPTION & BILLING (CRITICAL)

### 4.1 Paddle Integration

**Files:**
```
app/app/api/paddle/checkout/route.ts    ✅ DONE (needs testing)
app/app/api/paddle/webhook/route.ts     ⚠️ IMPLEMENT
app/app/checkout/page.tsx               ✅ DONE
```

### 4.2 Subscription Management

**Create: `app/app/api/user/subscription/route.ts`**
```typescript
GET    /api/user/subscription        - Get current subscription
POST   /api/user/subscription/cancel  - Cancel subscription
POST   /api/user/subscription/resume  - Resume subscription
PATCH  /api/user/subscription/upgrade - Upgrade plan
```

### 4.3 Paddle Webhook Handler

**Implement: `app/app/api/paddle/webhook/route.ts`**
```typescript
// Handle Paddle events:
// - subscription.created
// - subscription.updated
// - subscription.cancelled
// - payment.succeeded
// - payment.failed
```

**Update Database on Events:**
- `users.subscriptionPlan`
- `users.subscriptionStatus`
- Create `Invoice` record
- Send email notification

---

## 📊 PHASE 5: USAGE TRACKING & COST MANAGEMENT

### 5.1 Real-Time Usage Tracking

**Flow:**
```
CLI/Web makes request → Backend receives
                     → Track in database
                     → Increment counters
                     → Calculate cost
                     → Check quotas
                     → Return response
```

### 5.2 Files to Implement

1. **`backend/src/services/usage-tracker.ts`**
```typescript
class UsageTracker {
  async trackRequest(data: {
    userId: string;
    model: string;
    tokensUsed: number;
    cost: number;
    source: 'cli' | 'web' | 'vscode' | 'mobile';
  })
  
  async getUsageStats(userId: string, period: string)
  async checkQuota(userId: string): Promise<boolean>
  async resetDailyQuota(userId: string)
}
```

2. **`app/app/api/usage/track/route.ts`**
   - Receives usage data from backend
   - Updates user quotas
   - Triggers alerts if near limit

3. **`app/app/dashboard/usage/page.tsx`**
   - Charts showing usage over time
   - Cost breakdown by model
   - Quota visualization
   - Export to CSV

### 5.3 Cost Calculation

**Model Pricing (per 1M tokens):**
```typescript
const MODEL_PRICING = {
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gemini-pro': { input: 0.50, output: 1.50 },
  'groq-llama': { input: 0.05, output: 0.10 }
};
```

---

## 🖥️ PHASE 6: DEVICE MANAGEMENT

### 6.1 Device Registration

**When User Logs In:**
```
CLI: recoder auth login
  → Opens browser
  → User authenticates
  → Device registered in database
  → Token saved locally
```

**Tables:**
```sql
cli_sessions
  - userId
  - deviceId (UUID)
  - deviceName (user's computer name)
  - deviceType (cli/extension/mobile)
  - lastUsedAt
  - ipAddress
  - userAgent
```

### 6.2 Device Management Page

**`app/app/settings/devices/page.tsx`**
- List all logged-in devices
- See last used time
- Remote logout (revoke session)
- Device nickname editing

### 6.3 Security Features
- Max 10 devices per user
- Auto-logout after 30 days inactive
- Suspicious activity detection
- Email alerts for new devices

---

## ⚙️ PHASE 7: SETTINGS PAGES (PROFESSIONAL UI)

### 7.1 Settings Structure

```
/settings
  ├── /profile          - Name, email, avatar
  ├── /account          - Password, 2FA, delete account
  ├── /api-keys         - API key management
  ├── /devices          - Device management  
  ├── /subscription     - Plan, billing, invoices
  ├── /usage            - Usage stats, quotas
  ├── /integrations     - GitHub, VS Code, etc.
  ├── /notifications    - Email, push preferences
  └── /appearance       - Theme, language
```

### 7.2 Each Settings Page Needs:
- ✅ Professional design matching dashboard
- ✅ Loading states
- ✅ Error handling
- ✅ Success notifications
- ✅ Confirmation modals for destructive actions
- ✅ Real-time updates
- ✅ Mobile responsive

---

## 🔌 PHASE 8: PLATFORM INTEGRATIONS

### 8.1 CLI (recoder-code)

**Authentication Flow:**
```bash
$ recoder auth login
Opening browser for authentication...
✓ Authenticated as user@example.com
✓ Device registered: MacBook Pro
✓ Session saved
```

**Configuration File:** `~/.recoder/config.json`
```json
{
  "userId": "user_abc123",
  "email": "user@example.com",
  "token": "encrypted_session_token",
  "deviceId": "device_xyz789",
  "apiUrl": "https://api.recoder.xyz"
}
```

### 8.2 VS Code Extension

**Features:**
- Sign in with OAuth
- Access user's API keys
- Track usage in extension
- Sync settings
- Show quota in status bar

**Configuration:**
```json
{
  "recoder.apiKey": "from_settings",
  "recoder.autoComplete": true,
  "recoder.model": "claude-3-5-sonnet"
}
```

### 8.3 recoder-web (bolt.new style)

**Features:**
- Sign in required
- Create projects
- Real-time AI chat
- Live preview
- Deploy to production
- Share projects

**Tech Stack:**
- Next.js 15
- WebContainers API
- Real-time streaming
- AI code generation
- Git integration

---

## 📈 PHASE 9: ANALYTICS & MONITORING

### 9.1 User Analytics Dashboard

**Metrics to Track:**
```
- Total API calls
- Tokens used per model
- Cost per day/week/month
- Most used features
- Error rate
- Average response time
- Popular models
```

### 9.2 Admin Dashboard

**For Platform Owners:**
```
- Total users
- Active subscriptions
- Revenue (MRR, ARR)
- Usage by plan
- Popular models
- System health
- Cost vs revenue
```

### 9.3 Implementation

**Tools:**
- PostHog for product analytics
- Prometheus for metrics
- Grafana for dashboards
- Sentry for error tracking

---

## 🚀 PHASE 10: DEPLOYMENT & SCALING

### 10.1 Environment Setup

**Development:**
```
App:     http://localhost:3000
Backend: http://localhost:3001
Database: localhost:5432
Redis:   localhost:6379
```

**Staging:**
```
App:     https://staging.recoder.xyz
Backend: https://api-staging.recoder.xyz
Database: staging-db.neon.tech
Redis:   staging-redis.upstash.com
```

**Production:**
```
App:     https://recoder.xyz
Backend: https://api.recoder.xyz
Database: prod-db.neon.tech
Redis:   prod-redis.upstash.com
CDN:     Cloudflare
```

### 10.2 Deployment Strategy

**App (Next.js):**
- Deploy to Vercel
- Automatic deployments from main branch
- Preview deployments for PRs
- Edge functions for API routes

**Backend (Express):**
- Deploy to Railway/Render
- Auto-scaling enabled
- Health checks
- Rolling deployments

**Database:**
- Neon PostgreSQL (already setup)
- Automatic backups
- Point-in-time recovery

---

## 🔒 PHASE 11: SECURITY HARDENING

### 11.1 API Security
- ✅ Rate limiting per user
- ✅ Rate limiting per API key
- ✅ Input validation
- ✅ SQL injection prevention (Prisma)
- ✅ XSS protection
- ✅ CORS configuration
- ⚠️ API key rotation
- ⚠️ Audit logging

### 11.2 Authentication Security
- ✅ Password hashing (bcrypt)
- ✅ Session tokens
- ⚠️ 2FA implementation
- ⚠️ Brute force protection
- ⚠️ Session hijacking prevention
- ⚠️ OAuth token refresh

### 11.3 Data Security
- ⚠️ Encrypt sensitive data at rest
- ⚠️ Encrypt API keys in database
- ⚠️ GDPR compliance
- ⚠️ Data export functionality
- ⚠️ Account deletion

---

## 📋 IMPLEMENTATION PRIORITY

### Week 1: Critical Path
1. ✅ Fix all NextAuth → Better Auth migrations
2. ⚠️ Connect App API routes to Backend
3. ⚠️ Implement API key management end-to-end
4. ⚠️ Test Paddle payment flow
5. ⚠️ Device management basics

### Week 2: Core Features
1. ⚠️ Usage tracking implementation
2. ⚠️ Cost calculation
3. ⚠️ Quota enforcement
4. ⚠️ Settings pages completion
5. ⚠️ CLI authentication flow

### Week 3: Integrations
1. ⚠️ VS Code extension auth
2. ⚠️ recoder-web scaffold
3. ⚠️ Mobile app auth
4. ⚠️ Webhook handlers
5. ⚠️ Email notifications

### Week 4: Polish & Deploy
1. ⚠️ UI/UX improvements
2. ⚠️ Performance optimization
3. ⚠️ Security audit
4. ⚠️ Documentation
5. ⚠️ Production deployment

---

## 🎯 SUCCESS CRITERIA

### For Launch:
- [ ] Users can sign up and authenticate
- [ ] Users can subscribe to paid plans
- [ ] Payments process correctly
- [ ] API keys work for CLI
- [ ] Usage is tracked accurately
- [ ] Quotas are enforced
- [ ] Settings pages are functional
- [ ] All platforms can authenticate
- [ ] No critical security vulnerabilities
- [ ] Performance is acceptable (<500ms API response)

### For Growth:
- [ ] Analytics dashboard working
- [ ] Admin tools functional
- [ ] Cost tracking accurate
- [ ] Scaling infrastructure ready
- [ ] Documentation complete
- [ ] Support system in place

---

## 📝 NEXT IMMEDIATE ACTIONS

1. **Run this command to see all NextAuth references:**
```bash
cd /Users/arhansubasi/recoder.xyz/app
grep -r "getServerSession\|useSession.*next-auth" app/ --include="*.ts" --include="*.tsx" | wc -l
```

2. **Fix remaining authentication:**
```bash
# Use the helper function everywhere
import { requireAuth, getSession } from '@/lib/auth-helpers';
```

3. **Test backend connection:**
```bash
curl http://localhost:3001/health
```

4. **Start both services:**
```bash
# Terminal 1: App
cd app && npm run dev

# Terminal 2: Backend  
cd backend && npm run dev
```

---

**This is the complete roadmap. Let's execute phase by phase!**
