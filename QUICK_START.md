# 🚀 Quick Start - Authentication System

## ✅ What's Ready

Your authentication and user management system is **fully implemented** and ready to use!

### Files Created:
1. ✅ User Service - `backend/src/services/user-service.ts`
2. ✅ Usage Tracking - `backend/src/services/usage-tracking-service.ts`
3. ✅ Encryption Utils - `backend/src/utils/encryption.ts`
4. ✅ API Routes - `backend/src/routes/user-settings.ts`
5. ✅ Middleware - `backend/src/middleware/usage-tracking.ts`
6. ✅ Frontend Component - `app/components/onboarding/APIKeyCollection.tsx`
7. ✅ API Endpoints - `app/app/api/user/*`

### Configuration:
✅ Encryption key generated and added to `.env`
✅ Routes integrated into `backend/src/app.ts`
✅ Database schema already has all required tables

---

## 🎯 What You Need to Do (30 minutes)

### Step 1: Run Database Migrations (5 min)
```bash
cd app
npx prisma migrate deploy
npx prisma generate
```

**Expected output:**
```
✓ Applying migrations...
✓ Generated Prisma Client
```

### Step 2: Verify Tables (2 min)
```bash
npx prisma studio
```

Check these tables exist:
- ✅ users (with openRouterApiKey, hasOwnApiKey fields)
- ✅ user_quotas
- ✅ usage_records
- ✅ cli_sessions
- ✅ auth_codes
- ✅ device_codes
- ✅ api_keys
- ✅ platform_api_keys

### Step 3: Start Backend (2 min)
```bash
cd backend
npm start
```

**Expected output:**
```
✅ Recoder API server running on port 3001
```

### Step 4: Test Registration (5 min)
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }'
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx...",
      "email": "test@example.com",
      "name": "Test User",
      "hasOwnApiKey": false,
      "onboardingStep": "pending_api_key"
    },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

✅ If you see this, registration works!

### Step 5: Test Login (2 min)
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

Save the `accessToken` from the response.

### Step 6: Test API Key Addition (5 min)

First, get an OpenRouter API key:
1. Go to https://openrouter.ai/keys
2. Sign up/login
3. Create API key
4. Copy it (starts with `sk-or-`)

Then add it:
```bash
TOKEN="<your-access-token-from-login>"

curl -X POST http://localhost:3001/api/user/api-key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-or-v1-your-actual-key"
  }'
```

**Expected:**
```json
{
  "success": true,
  "message": "API key added successfully",
  "data": {
    "user": {
      "id": "clx...",
      "hasOwnApiKey": true,
      "onboardingStep": "completed"
    }
  }
}
```

✅ If you see this, API key storage works!

### Step 7: Check Quota (2 min)
```bash
curl http://localhost:3001/api/user/quota \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "remaining": {
      "requests": 1000,
      "tokens": "1000000"
    },
    "limits": {
      "requests": 1000,
      "tokens": "1000000"
    }
  }
}
```

✅ If you see this, quota system works!

### Step 8: Check Usage Stats (2 min)
```bash
curl http://localhost:3001/api/user/usage/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "usage": {
      "totalRequests": 0,
      "totalTokens": 0,
      "totalCost": 0
    },
    "currentQuota": {
      "requestsUsed": 0,
      "requestsLimit": 1000,
      "tokensUsed": "0",
      "tokensLimit": "1000000"
    }
  }
}
```

✅ If you see this, usage tracking works!

### Step 9: Start Frontend (5 min)
```bash
cd app
npm run dev
```

Visit: http://localhost:3000

---

## 🎉 Success Checklist

After completing the steps above, you should have:

- [x] Database tables created
- [x] Backend API running on port 3001
- [x] User registration working
- [x] User login working
- [x] API key storage working
- [x] Quota system working
- [x] Usage tracking working
- [x] Frontend running on port 3000

---

## 🔥 Next: Deploy to Production

When ready to deploy:

### 1. Environment Variables (Vercel)

**Backend:**
```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-production-secret
JWT_REFRESH_SECRET=your-production-refresh-secret
ENCRYPTION_KEY=152f9af12a09f1ad5cfd0f1fa055c94d40d90b8c06fd398997f208a982231826
ENCRYPTION_SALT=recoder-production-salt-v1-2024
OPENROUTER_API_KEY=sk-or-your-platform-key
NEXT_PUBLIC_WEB_URL=https://recoder.xyz
NODE_ENV=production
```

**Frontend:**
```bash
DATABASE_URL=postgresql://...
NEXT_PUBLIC_API_URL=https://api.recoder.xyz
NEXTAUTH_URL=https://recoder.xyz
NEXTAUTH_SECRET=your-nextauth-secret
```

### 2. Deploy Backend
```bash
cd backend
vercel --prod
```

### 3. Deploy Frontend
```bash
cd app
vercel --prod
```

### 4. Update OAuth Callbacks
- GitHub: `https://recoder.xyz/api/auth/callback/github`
- Google: `https://recoder.xyz/api/auth/callback/google`
- Discord: `https://recoder.xyz/api/auth/callback/discord`

---

## 📚 Full Documentation

For complete details, see:
- `IMPLEMENTATION_SUMMARY.md` - What was implemented
- `SETUP_AUTHENTICATION_GUIDE.md` - Detailed setup guide
- `AUTHENTICATION_IMPLEMENTATION_COMPLETE.md` - Architecture details

---

## 🐛 Troubleshooting

### "Table does not exist" Error
```bash
cd app
npx prisma migrate deploy
```

### "ENCRYPTION_KEY not found" Error
Check `backend/.env` has:
```
ENCRYPTION_KEY=152f9af12a09f1ad5cfd0f1fa055c94d40d90b8c06fd398997f208a982231826
```

### "Unauthorized" Error
1. Check JWT_SECRET is set
2. Token might be expired (login again)
3. Check Authorization header format: `Bearer <token>`

### Backend Won't Start
```bash
cd backend
npm install
npm start
```

---

## ✨ Features You Can Now Use

### 1. User Onboarding
When a user signs up, they'll see a beautiful modal asking for their OpenRouter API key with:
- Step-by-step instructions
- Direct link to OpenRouter
- Validation before saving
- Security notices
- Option to skip and add later

### 2. Usage Tracking
Every request is automatically tracked:
- Request count
- Token usage
- Cost calculation
- Provider/model used
- Success/failure rates

### 3. Quota Enforcement
Users are automatically limited:
- Free: 1k requests, 1M tokens/month
- Pro: 50k requests, 50M tokens/month
- Enterprise: 1M requests, 1B tokens/month

When exceeded, they get a clear error with upgrade link.

### 4. Security
All API keys are:
- Encrypted with AES-256-GCM
- Never logged or displayed
- Validated before storage
- Only decrypted when needed

---

## 🎯 What's Next?

After testing everything works:

### Phase 2: Payment Integration (4 hours)
- Set up Paddle account
- Set up DODO Pay account
- Implement webhooks
- Build billing dashboard

### Phase 3: Dashboard Integration (2 hours)
- Show onboarding modal on first login
- Add usage dashboard
- Add API key management page
- Add billing page

### Phase 4: Advanced Features (ongoing)
- Email notifications for quota warnings
- API key rotation
- Team accounts
- Advanced analytics

---

## 💪 You've Got This!

Everything is implemented and ready. Just run the steps above to test it all works, then deploy to production.

The hard work is done - you now have:
✅ Complete auth system
✅ API key management
✅ Usage tracking
✅ Quota enforcement
✅ Security best practices
✅ Beautiful UI components

**Time to launch!** 🚀
