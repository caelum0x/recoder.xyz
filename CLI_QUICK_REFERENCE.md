# 🎯 CLI Auth & Premium - Quick Reference Card

## 📊 Current Status

| Component | Status | Location |
|-----------|--------|----------|
| Backend API | ✅ 100% Complete | `/backend/src/routes/cli-*.ts` |
| Budget System | ✅ 100% Complete | `/backend/src/services/cli-ai-service.ts` |
| Frontend Pages | ✅ Exist | `/app/app/{cli/auth, settings/premium, dashboard/usage}` |
| CLI Tool | 🔨 Needs Build | Not created yet |
| Documentation | ✅ Complete | 3 markdown files created |

---

## 💰 Plan Pricing (What You Asked For)

```
┌─────────────┬──────────────┬─────────────┬──────────────┬──────────────┐
│    Plan     │ Price/Month  │ AI Budget   │ Daily Limit  │ Monthly Req  │
├─────────────┼──────────────┼─────────────┼──────────────┼──────────────┤
│ Free        │ $0           │ $0          │ 10 req       │ 100 req      │
│ Pro         │ $20          │ $17.50      │ 200 req      │ 5,000 req    │
│ Premium     │ $100         │ $93.00      │ 1,000 req    │ 25,000 req   │
└─────────────┴──────────────┴─────────────┴──────────────┴──────────────┘

Pro Plan:     87.5% of $20 = $17.50 for AI ✅
Premium Plan: 93% of $100 = $93.00 for AI ✅
```

---

## 🔌 API Endpoints (15 Ready)

### Authentication (9 endpoints)
```bash
POST   /api/auth/cli/authorize           # Start device flow
GET    /api/auth/cli/token               # Poll for token  
POST   /api/auth/cli/verify-code         # Verify code
POST   /api/auth/cli/authorize-session   # Approve
POST   /api/auth/cli/deny-session        # Deny
GET    /api/auth/cli/verify              # Verify token
GET    /api/auth/cli/sessions            # List sessions
DELETE /api/auth/cli/session/:id         # Revoke one
DELETE /api/auth/cli/sessions/all        # Revoke all
```

### AI Service (5 endpoints)
```bash
POST   /api/cli/ai/complete              # Generate code
GET    /api/cli/ai/budget                # Check budget
GET    /api/cli/ai/usage                 # Usage stats
GET    /api/cli/ai/models                # Available models
GET    /api/cli/ai/pricing               # Get pricing
```

---

## 🤖 AI Models (13 via OpenRouter)

### Recommended for Pro Plan ($17.50 budget)
```
claude-sonnet-4       $3/$15   Primary model, best balance
grok-code-fast-1      $0.5/$1  Fast code generation
gemini-2.5-flash      $0.075/$0.3  Great value
deepseek-v3           $0.27/$1.10  Ultra cheap
```

### Recommended for Premium Plan ($93 budget)
```
claude-sonnet-4.5     $3/$15   Latest, highest quality
claude-sonnet-4       $3/$15   Proven excellent
gemini-2.5-pro        $1.25/$5 Advanced Google
gpt-5                 $5/$15   Latest OpenAI
```

### Free Plan
```
gemini-2.0-flash      FREE     Only free model available
```

---

## 🔐 Auth Flow (Simple)

```
1. CLI: recoder auth login

2. Backend: Returns device_code + user_code ("ABCD-1234")

3. User: Opens https://recoder.xyz/cli-auth?code=ABCD-1234

4. User: Logs in, authorizes

5. CLI: Gets JWT token

6. CLI: Saves to ~/.recoder/config.json

7. Done! Authenticated ✅
```

---

## 🚀 Quick Test Commands

### Test Backend
```bash
# Start
cd backend && npm start

# Test auth endpoint
curl -X POST http://localhost:3001/api/auth/cli/authorize \
  -H "Content-Type: application/json" \
  -d '{"deviceInfo":{"platform":"darwin"}}'

# Should return device_code and user_code
```

### Test Frontend
```bash
# Start
cd app && npm run dev

# Visit
http://localhost:3000/cli/auth
http://localhost:3000/settings/premium
http://localhost:3000/dashboard/usage
```

### Test Full Flow (with token)
```bash
# Get budget status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/cli/ai/budget

# Make AI request
curl -X POST http://localhost:3001/api/cli/ai/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello world"}'
```

---

## 📦 CLI Tool Structure (To Build)

```
recoder-code/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Main entry
    ├── commands/
    │   ├── auth.ts          # login, logout
    │   ├── generate.ts      # code generation
    │   └── usage.ts         # view stats
    └── lib/
        ├── api.ts           # API client
        └── config.ts        # Save tokens

Commands to implement:
  recoder auth login
  recoder auth logout
  recoder generate "<prompt>"
  recoder usage
  recoder models
```

---

## 💾 Database Tables

```sql
-- CLI Sessions (auth state)
cli_sessions
  - device_code (unique)
  - user_code (unique)
  - access_token (JWT)
  - status (pending/authorized/expired)
  - expires_at

-- CLI Usage (cost tracking)
cli_usage
  - user_id
  - session_id
  - model
  - tokens
  - cost
  - timestamp
```

---

## 🎯 Implementation Steps

### ✅ Already Done
1. Backend API (15 endpoints)
2. Budget system ($17.50/$93 limits)
3. Cost tracking
4. Frontend pages

### 🔨 To Do (Priority Order)

**1. Test Current System (2 hours)**
```bash
cd backend && npm start
cd app && npm run dev
# Test all pages work
```

**2. Database Setup (30 min)**
```bash
cd backend
npx prisma migrate deploy
# Insert subscription plans
```

**3. Build CLI Tool (2-4 days)**
```bash
mkdir recoder-code
# Copy code from CLI_PREMIUM_ACTION_PLAN.md
npm install
npm run build
npm link
# Test locally
```

**4. Deploy (1-2 days)**
```bash
# Deploy backend to production
# Deploy frontend to production
# Publish CLI to npm
```

---

## 🛡️ Budget Safety

### How Limits Are Enforced

```
User makes request
    ↓
Check budget BEFORE AI call
    ↓
Budget OK? → Make AI request
Budget exceeded? → Reject with error
    ↓
Track cost immediately
    ↓
Update database (atomic)
    ↓
Return result + cost
```

### Multiple Safety Layers
✅ Monthly cost limit ($17.50 / $93)
✅ Daily cost limit ($0.58 / $3.10)
✅ Monthly request limit (5K / 25K)
✅ Daily request limit (200 / 1K)

**Cannot exceed budget!** ✅

---

## 📚 Documentation Files

| File | Purpose | Size |
|------|---------|------|
| `CLI_EXECUTIVE_SUMMARY.md` | Quick overview | 12KB |
| `CLI_PREMIUM_ACTION_PLAN.md` | Step-by-step guide + code | 18KB |
| `CLI_AUTH_PREMIUM_COMPLETE_GUIDE.md` | Full technical reference | 19KB |
| `CLI_QUICK_REFERENCE.md` | **This file** | Quick lookup |

---

## 🔑 Environment Variables

### Backend `.env`
```bash
DATABASE_URL=postgresql://...
OPENROUTER_API_KEY=sk-or-v1-...
JWT_SECRET=your-secret-key
FRONTEND_URL=https://recoder.xyz
NODE_ENV=production
```

### CLI Config
```bash
~/.recoder/config.json
{
  "accessToken": "eyJhbGciOiJ...",
  "refreshToken": "eyJhbGciOiJ...",
  "user": {
    "email": "user@example.com",
    "subscription": "pro"
  }
}
```

---

## 💡 Cost Examples

### Pro Plan ($17.50 budget)

**Light use (100 requests/month):**
```
Model: claude-sonnet-4
Avg: 2000 tokens/request
Cost: ~$0.024/request
Total: $2.40/month
✅ 14% of budget
```

**Heavy use (1000 requests/month):**
```
Mix of models:
  - 500× grok-code-fast: $0.75
  - 300× claude-sonnet-4: $7.20
  - 200× gemini-flash: $0.04
Total: $7.99/month
✅ 46% of budget
```

**Max sustainable:**
```
Using gemini-flash only:
$17.50 / $0.0002 per request
= ~87,500 requests possible!
```

### Premium Plan ($93 budget)

**Professional use (5000 requests/month):**
```
Mix: claude-sonnet-4 + fast models
Average: $0.015/request
Total: $75/month
✅ 81% of budget
✅ Sustainable with room for spikes
```

---

## 🚨 Common Errors & Solutions

### "Budget limit exceeded"
```json
{
  "error": "rate_limit_exceeded",
  "message": "Monthly budget of $17.50 exceeded"
}
```
**Solution**: Wait for reset or upgrade plan

### "Invalid token"
```json
{
  "error": "invalid_token",
  "message": "CLI session expired"
}
```
**Solution**: Run `recoder auth login`

### "Model not available"
```json
{
  "error": "model_not_available",
  "message": "gpt-5 not available on free plan"
}
```
**Solution**: Upgrade plan or use free models

---

## 📞 Quick Links

- **Backend code**: `/backend/src/routes/cli-*.ts`
- **Frontend pages**: `/app/app/{cli/auth, settings/premium, dashboard/usage}`
- **Services**: `/backend/src/services/cli*.ts`
- **Schema**: `/backend/prisma/schema.prisma`

---

## ✅ Checklist

### Before You Start
- [ ] Read `CLI_EXECUTIVE_SUMMARY.md` (5 min)
- [ ] Understand the flow (above)
- [ ] Check backend runs: `cd backend && npm start`
- [ ] Check frontend runs: `cd app && npm run dev`

### To Complete Implementation
- [ ] Test existing pages work
- [ ] Insert subscription plans in DB
- [ ] Build CLI tool (use action plan)
- [ ] Test end-to-end
- [ ] Deploy to production
- [ ] Publish CLI to npm

---

## 🎬 Getting Started Now

```bash
# 1. Start backend
cd /Users/arhansubasi/recoder.xyz/backend
npm install
npm start
# Runs on :3001

# 2. Test auth endpoint
curl -X POST http://localhost:3001/api/auth/cli/authorize \
  -H "Content-Type: application/json" \
  -d '{"deviceInfo":{"platform":"test"}}'

# 3. Start frontend
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
# Runs on :3000

# 4. Visit pages
open http://localhost:3000/settings/premium
open http://localhost:3000/dashboard/usage

# 5. Read full action plan for CLI build
cat CLI_PREMIUM_ACTION_PLAN.md
```

---

**Backend is ready. Frontend exists. Just build the CLI tool! 🚀**

**Total implementation time: 3-5 days**
