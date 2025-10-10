# Complete Authentication Setup Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Generate Encryption Key
```bash
cd backend
node -e "const crypto = require('crypto'); console.log('ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'));"
```

### Step 2: Set Up Environment Variables

Create or update `.env` files in both `backend/` and `app/`:

**backend/.env:**
```bash
# Database (Vercel Postgres)
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"

# JWT Secrets
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-too"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Encryption (Generated from Step 1)
ENCRYPTION_KEY="your-generated-encryption-key-from-step-1"
ENCRYPTION_SALT="recoder-production-salt-change-this"

# OAuth Providers
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"

# Platform API Keys (for premium users)
OPENROUTER_API_KEY_1="sk-or-platform-key-1"
OPENROUTER_API_KEY_2="sk-or-platform-key-2"
OPENROUTER_API_KEY_3="sk-or-platform-key-3"

# URLs
NEXT_PUBLIC_WEB_URL="https://recoder.xyz"
BACKEND_URL="https://api.recoder.xyz"

# Node Environment
NODE_ENV="production"
PORT="3001"
```

**app/.env.local:**
```bash
# Database (same as backend)
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"

# NextAuth
NEXTAUTH_URL="https://recoder.xyz"
NEXTAUTH_SECRET="your-nextauth-secret-key"

# OAuth (same as backend)
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."

# Backend API
NEXT_PUBLIC_API_URL="https://api.recoder.xyz"
```

### Step 3: Set Up Database

1. **Create Vercel Postgres Database:**
   - Go to Vercel Dashboard → Storage → Create Database
   - Select Postgres
   - Copy the `DATABASE_URL`

2. **Run Migrations:**
```bash
cd app
npx prisma migrate deploy
npx prisma generate
```

3. **Verify Connection:**
```bash
npx prisma studio
# Should open database browser
```

### Step 4: Configure OAuth Providers

#### GitHub OAuth:
1. Go to: https://github.com/settings/developers
2. New OAuth App
3. Set:
   - Application name: `Recoder`
   - Homepage URL: `https://recoder.xyz`
   - Authorization callback URL: `https://recoder.xyz/api/auth/callback/github`
4. Copy Client ID and Secret

#### Google OAuth:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create OAuth Client ID
3. Set:
   - Application type: Web application
   - Authorized redirect URIs: `https://recoder.xyz/api/auth/callback/google`
4. Copy Client ID and Secret

#### Discord OAuth:
1. Go to: https://discord.com/developers/applications
2. New Application
3. OAuth2 → Add Redirect: `https://recoder.xyz/api/auth/callback/discord`
4. Copy Client ID and Secret

### Step 5: Deploy Backend

```bash
cd backend

# Install dependencies
npm install

# Build
npm run build

# Deploy to Vercel
vercel --prod

# Or deploy to Railway/Render
# Just connect your repo and it will auto-deploy
```

### Step 6: Deploy Frontend

```bash
cd app

# Install dependencies
npm install

# Build
npm run build

# Deploy to Vercel
vercel --prod
```

### Step 7: Test Authentication

```bash
# Test registration
curl -X POST https://api.recoder.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }'

# Test login
curl -X POST https://api.recoder.xyz/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'

# Test OAuth (visit in browser)
open https://recoder.xyz/api/auth/signin
```

---

## 📦 What You Created

### Backend Services
1. **User Service** (`backend/src/services/user-service.ts`)
   - User registration & login
   - API key management
   - Profile updates
   - Quota initialization

2. **Usage Tracking Service** (`backend/src/services/usage-tracking-service.ts`)
   - Quota checking
   - Usage recording
   - Statistics generation
   - Limit enforcement

3. **Encryption Utilities** (`backend/src/utils/encryption.ts`)
   - API key encryption/decryption
   - Secure token generation
   - Key validation

### API Routes
1. **User Settings** (`backend/src/routes/user-settings.ts`)
   - `GET /api/user/profile` - Get user profile
   - `PUT /api/user/profile` - Update profile
   - `POST /api/user/api-key` - Add API key
   - `DELETE /api/user/api-key` - Remove API key
   - `GET /api/user/api-key/status` - Check API key status
   - `GET /api/user/usage/stats` - Get usage statistics
   - `GET /api/user/usage/recent` - Get recent usage
   - `GET /api/user/quota` - Check quota status
   - `GET /api/user/onboarding/status` - Get onboarding status

### Frontend Components
1. **API Key Collection** (`app/components/onboarding/APIKeyCollection.tsx`)
   - Beautiful modal for API key collection
   - Step-by-step instructions
   - Validation & security notices
   - Pro plan upsell

### Middleware
1. **Usage Tracking** (`backend/src/middleware/usage-tracking.ts`)
   - Automatic quota checking
   - Usage recording after requests
   - Token estimation
   - Error handling

---

## 🔐 Security Checklist

### Before Going Live:
- [ ] Change all default secrets in `.env`
- [ ] Use strong, random values for JWT secrets
- [ ] Generate new encryption key (don't reuse example)
- [ ] Enable HTTPS only (no HTTP)
- [ ] Set up rate limiting (already included)
- [ ] Configure CORS properly
- [ ] Enable database connection pooling
- [ ] Set up backup system
- [ ] Configure monitoring (Sentry, etc.)
- [ ] Test OAuth callbacks work in production

### Environment Variables to Change:
```bash
# ⚠️  CRITICAL - Change these:
JWT_SECRET
JWT_REFRESH_SECRET
ENCRYPTION_KEY
ENCRYPTION_SALT
NEXTAUTH_SECRET

# ✅ Get from providers:
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET

# ✅ Get your own:
OPENROUTER_API_KEY_1
OPENROUTER_API_KEY_2
OPENROUTER_API_KEY_3
```

---

## 🧪 Testing Guide

### 1. Test User Registration
```bash
curl -X POST https://api.recoder.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "name": "New User"
  }'
```

Expected Response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "...",
      "email": "newuser@example.com",
      "name": "New User",
      "hasOwnApiKey": false,
      "onboardingStep": "pending_api_key"
    },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

### 2. Test API Key Addition
```bash
# First, login to get token
TOKEN="your-access-token"

curl -X POST https://api.recoder.xyz/api/user/api-key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-or-your-openrouter-key"
  }'
```

Expected Response:
```json
{
  "success": true,
  "message": "API key added successfully",
  "data": {
    "user": {
      "id": "...",
      "hasOwnApiKey": true,
      "onboardingStep": "completed"
    }
  }
}
```

### 3. Test Usage Tracking
```bash
# Make a request (this will auto-track usage)
curl https://api.recoder.xyz/api/code/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a React button component"
  }'

# Check usage stats
curl https://api.recoder.xyz/api/user/usage/stats \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "since": "2024-01-01T00:00:00.000Z"
    },
    "usage": {
      "totalRequests": 1,
      "totalTokens": 150,
      "totalCost": 0.003
    },
    "currentQuota": {
      "requestsUsed": 1,
      "requestsLimit": 1000,
      "tokensUsed": "150",
      "tokensLimit": "1000000"
    }
  }
}
```

### 4. Test Quota Enforcement
```bash
# Try to exceed quota (will be blocked)
# First, manually update quota in database to be at limit

curl https://api.recoder.xyz/api/code/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a component"
  }'
```

Expected Response (when quota exceeded):
```json
{
  "success": false,
  "error": "Quota exceeded",
  "message": "You have exceeded your request limit...",
  "code": "REQUEST_LIMIT_EXCEEDED",
  "upgradeUrl": "https://recoder.xyz/pricing"
}
```

---

## 🎯 User Flows

### Free User Flow:
1. User signs up → Account created
2. User logs in → Redirected to dashboard
3. Onboarding modal appears → "Add your OpenRouter API key"
4. User adds API key → Validated & encrypted
5. Onboarding complete → Can use all features
6. Usage tracked → Counts against 1k requests/month

### Pro User Flow:
1. User signs up → Account created
2. User upgrades to Pro → Payment processed
3. Subscription activated → Plan set to "pro"
4. User logs in → NO API key required
5. Platform API keys used → Higher limits (50k requests/month)
6. Usage tracked → Different quotas

---

## 🔧 Troubleshooting

### Database Connection Failed
```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
cd app
npx prisma db pull

# If fails, verify:
# - Database exists
# - Credentials are correct
# - IP is whitelisted (Vercel auto-whitelists)
# - SSL mode is enabled
```

### OAuth Not Working
```bash
# Verify callback URLs match exactly:
# GitHub: https://recoder.xyz/api/auth/callback/github
# Google: https://recoder.xyz/api/auth/callback/google
# Discord: https://recoder.xyz/api/auth/callback/discord

# Check environment variables:
echo $GITHUB_CLIENT_ID
echo $GITHUB_CLIENT_SECRET

# Test OAuth URL directly:
open https://recoder.xyz/api/auth/signin
```

### API Key Encryption Failed
```bash
# Verify ENCRYPTION_KEY is set and is 64 hex chars
echo $ENCRYPTION_KEY | wc -c  # Should be 65 (64 + newline)

# Regenerate if needed:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Test encryption:
cd backend
npm run test:encryption
```

### Usage Not Tracking
```bash
# Check if usage middleware is applied
# Should be in backend/src/app.ts or server.ts

# Verify user is authenticated
curl https://api.recoder.xyz/api/user/profile \
  -H "Authorization: Bearer $TOKEN"

# Check database for usage_records table
cd app
npx prisma studio
# Navigate to usage_records table
```

---

## 📊 Monitoring & Analytics

### Key Metrics to Track:
1. **User Registrations** - Daily signups
2. **API Key Additions** - Onboarding completion rate
3. **Usage Per User** - Average tokens/requests
4. **Quota Violations** - Users hitting limits
5. **Error Rates** - Failed authentications
6. **Response Times** - API performance

### Recommended Tools:
- **Vercel Analytics** - Frontend performance
- **Sentry** - Error tracking
- **LogTail** - Log aggregation
- **Uptime Robot** - Availability monitoring
- **PostHog** - User analytics

---

## 🚀 Next Steps

### Phase 2: Payments (After Auth Works)
1. Set up Paddle account
2. Set up DODO Pay account
3. Create subscription plans in DB
4. Implement webhook handlers
5. Build billing dashboard
6. Test subscription flows

### Phase 3: Advanced Features
1. Team accounts
2. Usage alerts via email
3. API key rotation
4. Advanced analytics
5. Custom rate limits
6. Webhook notifications

---

## 📞 Support

### Getting Help:
- **Documentation**: https://docs.recoder.xyz
- **Discord**: https://discord.gg/recoder
- **Email**: support@recoder.xyz
- **GitHub Issues**: https://github.com/yourusername/recoder.xyz/issues

### Common Issues:
- Check our troubleshooting guide above
- Search existing GitHub issues
- Ask in Discord #support channel
- Email us with logs and error messages

---

## ✅ Launch Checklist

Before launching to production:

### Authentication:
- [ ] All OAuth providers configured
- [ ] JWT secrets are strong and unique
- [ ] Encryption key is secure
- [ ] Database migrations complete
- [ ] Test registration works
- [ ] Test login works
- [ ] Test OAuth works
- [ ] Test CLI auth works

### API Keys:
- [ ] API key collection modal works
- [ ] Validation with OpenRouter works
- [ ] Encryption/decryption works
- [ ] Keys stored securely
- [ ] Test key addition
- [ ] Test key deletion

### Usage Tracking:
- [ ] Quotas created for new users
- [ ] Usage recorded accurately
- [ ] Quota checks work
- [ ] Limits enforced
- [ ] Statistics accurate
- [ ] Dashboard shows data

### Security:
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Rate limiting active
- [ ] SQL injection prevented
- [ ] XSS protection enabled
- [ ] CSRF protection active

### Monitoring:
- [ ] Error tracking set up
- [ ] Logs aggregated
- [ ] Alerts configured
- [ ] Uptime monitoring active
- [ ] Performance tracking enabled

---

**Ready to launch! 🎉**

For questions or issues, refer to the troubleshooting section or contact support.
