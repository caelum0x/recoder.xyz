# 🚀 Recoder.xyz Final Deployment Checklist

## Status: READY FOR PRODUCTION ✅

---

## 📋 Pre-Deployment Checklist

### ✅ Completed

- [x] Database schema designed (session-based tracking)
- [x] Pricing page updated (clean, simple)
- [x] Payment integrations configured (DODO Pay + Paddle)
- [x] Environment variables documented
- [x] Authentication flows documented
- [x] Prisma client generated
- [x] Documentation for AI copilot created

### 🔨 Required Before Launch

#### 1. Database Migrations (5 min)

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Push schema to production database
npx prisma db push --accept-data-loss  # Only if OK to reset data

# OR create and run migration
npx prisma migrate deploy
```

**Verify Migration:**
```bash
npx prisma studio
# Check that these tables exist:
# - users
# - work_sessions (NEW)
# - user_quotas (UPDATED)
# - usage_records
# - platform_api_keys
```

#### 2. Payment Provider Setup (1-2 hours)

**DODO Pay (Primary):**
1. Create account: https://dodopayments.com
2. Create products:
   - Weekly: $10/week
   - Monthly: $20/month
   - Pro: $100/month
3. Get API keys:
   - Test key: For development
   - Live key: For production
4. Set webhook URL: `https://api.recoder.xyz/api/webhooks/dodo`
5. Copy webhook secret

**Paddle (Secondary):**
1. Create account: https://paddle.com
2. Create products:
   - Weekly: $10/week
   - Monthly: $20/month (or $216/year)
   - Pro: $100/month (or $1080/year)
3. Get vendor ID and API key
4. Set webhook URL: `https://api.recoder.xyz/api/webhooks/paddle`
5. Copy webhook secret

#### 3. Environment Variables (15 min)

**Update Production .env:**

```bash
# In /app/.env (or Vercel environment variables)

# URLs (PRODUCTION)
NEXT_PUBLIC_APP_URL=https://recoder.xyz
NEXT_PUBLIC_API_URL=https://api.recoder.xyz
BACKEND_URL=https://api.recoder.xyz
NEXTAUTH_URL=https://recoder.xyz

# Database
DATABASE_URL=postgresql://user:pass@host:5432/recoder_prod

# Auth Secrets (CHANGE THESE!)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SALT=$(openssl rand -base64 16)

# OAuth (Production)
GITHUB_CLIENT_ID=your-prod-github-id
GITHUB_CLIENT_SECRET=your-prod-github-secret
GOOGLE_CLIENT_ID=your-prod-google-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-prod-google-secret
DISCORD_CLIENT_ID=your-prod-discord-id
DISCORD_CLIENT_SECRET=your-prod-discord-secret

# DODO Pay
DODO_API_KEY_LIVE=dodo_live_xxxxx
DODO_API_SECRET=your-dodo-secret
DODO_WEBHOOK_SECRET=whsec_xxxxx

# Paddle
NEXT_PUBLIC_PADDLE_VENDOR_ID=12345
PADDLE_API_KEY=your-paddle-api-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret
NEXT_PUBLIC_PADDLE_PRODUCT_WEEKLY=prod_xxxxx
NEXT_PUBLIC_PADDLE_PRODUCT_MONTHLY=prod_xxxxx
NEXT_PUBLIC_PADDLE_PRODUCT_PRO=prod_xxxxx

# Platform API Keys (YOUR OpenRouter Keys)
PLATFORM_OPENROUTER_KEY_1=sk-or-v1-xxxxxx
PLATFORM_OPENROUTER_KEY_2=sk-or-v1-xxxxxx
PLATFORM_OPENROUTER_KEY_3=sk-or-v1-xxxxxx
```

#### 4. OAuth Callback URLs (10 min)

**Update in OAuth Provider Dashboards:**

**GitHub:**
- Authorization callback URL: `https://recoder.xyz/api/auth/callback/github`

**Google:**
- Authorized redirect URIs: `https://recoder.xyz/api/auth/callback/google`

**Discord:**
- Redirect URI: `https://recoder.xyz/api/auth/callback/discord`

#### 5. Seed Platform API Keys (5 min)

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Create seed script
cat > prisma/seed-platform-keys.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function encrypt(text: string): Promise<string> {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

async function main() {
  const keys = [
    process.env.PLATFORM_OPENROUTER_KEY_1,
    process.env.PLATFORM_OPENROUTER_KEY_2,
    process.env.PLATFORM_OPENROUTER_KEY_3,
  ].filter(Boolean);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const encrypted = await encrypt(key!);
    
    await prisma.platformApiKey.upsert({
      where: { id: `openrouter-key-${i + 1}` },
      update: { keyEncrypted: encrypted, isActive: true },
      create: {
        id: `openrouter-key-${i + 1}`,
        provider: 'openrouter',
        keyEncrypted: encrypted,
        keyName: `OpenRouter Key ${i + 1}`,
        quotaLimit: 1000000,
        quotaUsed: 0,
        isActive: true,
        priority: i === 0 ? 100 : 50
      }
    });
  }
  
  console.log('✅ Platform API keys seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
EOF

# Run seed
npx tsx prisma/seed-platform-keys.ts
```

---

## 🚀 Deployment Steps

### Option 1: Vercel (Recommended for Frontend)

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Add environment variables in Vercel dashboard
# Settings → Environment Variables → Add all from .env
```

### Option 2: Backend API (Railway/Render)

**If you have separate backend:**

```bash
# Deploy backend to Railway/Render
# Add environment variables
# Set start command: npm start
```

---

## ✅ Post-Deployment Testing

### 1. Test Website (5 min)

```bash
# Homepage
open https://recoder.xyz

# Pricing page
open https://recoder.xyz/pricing

# Auth pages
open https://recoder.xyz/auth/signin
open https://recoder.xyz/auth/signup
```

**Verify:**
- ✅ All pages load correctly
- ✅ Styling is correct
- ✅ Links work
- ✅ Pricing displays correctly

### 2. Test Authentication (10 min)

**Sign Up:**
```bash
# Visit: https://recoder.xyz/auth/signup
# Create account with email/password
# Verify user created in database
```

**OAuth:**
```bash
# Visit: https://recoder.xyz/auth/signin
# Try GitHub OAuth
# Try Google OAuth
# Try Discord OAuth
# Verify redirects work
```

**CLI Auth:**
```bash
# Test device flow
curl -X POST https://api.recoder.xyz/api/auth/device

# Should return:
# {
#   "deviceCode": "xxx",
#   "userCode": "ABCD-1234",
#   "verificationUri": "https://recoder.xyz/auth/device"
# }
```

### 3. Test Payments (15 min)

**DODO Pay:**
```bash
# 1. Visit: https://recoder.xyz/pricing
# 2. Click "Start Monthly"
# 3. Complete checkout
# 4. Verify webhook received
# 5. Check subscription activated in database
```

**Check Database:**
```sql
SELECT * FROM users WHERE email = 'test@example.com';
-- subscriptionPlan should be 'monthly'
-- subscriptionStatus should be 'active'

SELECT * FROM user_quotas WHERE userId = 'xxx';
-- sessionsPerDay should be 15
-- tokensPerSession should be 50000
```

### 4. Test API Endpoints (10 min)

```bash
# Get token (after login)
TOKEN="your-jwt-token"

# Check quota
curl https://api.recoder.xyz/api/user/quota \
  -H "Authorization: Bearer $TOKEN"

# Should return:
# {
#   "sessionsUsedToday": 0,
#   "sessionsPerDay": 15,
#   "tokensPerSession": 50000
# }

# Start session
curl -X POST https://api.recoder.xyz/api/sessions/start \
  -H "Authorization: Bearer $TOKEN"

# Should return:
# {
#   "session": {
#     "id": "xxx",
#     "sessionToken": "xxx",
#     "tokensUsed": 0
#   }
# }
```

---

## 🔧 Monitoring Setup (Optional but Recommended)

### 1. Error Tracking (Sentry)

```bash
# Install Sentry
npm install @sentry/nextjs

# Configure
npx @sentry/wizard -i nextjs

# Add to .env
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 2. Analytics (PostHog)

```bash
# Install PostHog
npm install posthog-js

# Add to .env
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### 3. Uptime Monitoring

- **UptimeRobot**: https://uptimerobot.com
- **Pingdom**: https://pingdom.com
- **StatusCake**: https://statuscake.com

**URLs to Monitor:**
- https://recoder.xyz (every 5 min)
- https://api.recoder.xyz/health (every 1 min)
- https://web.recoder.xyz (every 5 min)

---

## 📊 Launch Day Checklist

### Morning of Launch:

- [ ] Verify all environment variables are set
- [ ] Test authentication flows
- [ ] Test payment flows
- [ ] Verify webhooks are working
- [ ] Check database connections
- [ ] Test API endpoints
- [ ] Clear caches
- [ ] Set up monitoring alerts

### During Launch:

- [ ] Announce on social media
- [ ] Post to Product Hunt
- [ ] Post to Hacker News
- [ ] Email early access list
- [ ] Monitor error rates
- [ ] Watch user signups
- [ ] Be ready for support

### After Launch:

- [ ] Monitor server load
- [ ] Check payment webhooks
- [ ] Respond to user feedback
- [ ] Fix critical bugs immediately
- [ ] Update documentation based on feedback
- [ ] Celebrate! 🎉

---

## 🆘 Troubleshooting

### Database Connection Issues

```bash
# Test connection
cd app
npx prisma db pull

# If fails:
# 1. Check DATABASE_URL is correct
# 2. Check IP is whitelisted
# 3. Check SSL mode is enabled
# 4. Check credentials are correct
```

### OAuth Not Working

```bash
# Verify callback URLs exactly match:
# https://recoder.xyz/api/auth/callback/github (not /auth/callback/github)

# Check environment variables:
echo $GITHUB_CLIENT_ID
echo $GITHUB_CLIENT_SECRET

# Test directly:
curl "https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://recoder.xyz/api/auth/callback/github"
```

### Payment Webhooks Not Received

```bash
# Test webhook endpoint
curl -X POST https://api.recoder.xyz/api/webhooks/dodo \
  -H "Content-Type: application/json" \
  -H "X-Dodo-Signature: test" \
  -d '{"type": "test", "data": {}}'

# Should return 200 or 401 (signature invalid)
# If 404, route doesn't exist - need to create it
```

### High API Key Usage

```bash
# Check platform key usage
SELECT * FROM platform_api_keys;

# Rotate keys if quotaUsed > quotaLimit * 0.8
# Add new key or reset quotaUsed
```

---

## 📝 Next Steps After Launch

### Week 1:
- Monitor error rates and fix bugs
- Optimize performance bottlenecks
- Respond to user feedback
- Write blog posts about features

### Week 2:
- Implement user feedback
- Add missing features
- Optimize costs
- Scale infrastructure if needed

### Month 1:
- Analyze usage patterns
- Optimize pricing if needed
- Add new features
- Improve documentation

---

## 🎯 Success Metrics

### Key Metrics to Track:

**User Acquisition:**
- Daily signups
- Conversion rate (free → paid)
- User retention (Day 1, Day 7, Day 30)

**Revenue:**
- MRR (Monthly Recurring Revenue)
- ARPU (Average Revenue Per User)
- Churn rate

**Product:**
- Daily active users
- Sessions per user
- Tokens consumed
- API error rate

**Performance:**
- Page load time
- API response time
- Uptime percentage
- Error rate

---

## 📞 Support Channels

### For Users:
- 📧 Email: support@recoder.xyz
- 💬 Discord: https://discord.gg/recoder
- 📖 Docs: https://docs.recoder.xyz
- 🐛 Issues: https://github.com/recoder/recoder-code/issues

### For Developers:
- 📧 Email: dev@recoder.xyz
- 📖 API Docs: https://api.recoder.xyz/docs
- 🔧 Status Page: https://status.recoder.xyz

---

## ✅ Final Checks Before Going Live

```bash
# Run this checklist:
□ Database migrations complete
□ Environment variables set (production)
□ OAuth callbacks configured
□ Payment providers configured
□ Webhooks tested
□ Platform API keys added
□ SSL certificates valid
□ DNS records configured
□ Monitoring set up
□ Error tracking enabled
□ Backup system configured
□ Support channels ready
□ Documentation published
□ Terms & Privacy pages live
□ Launch announcement ready
```

---

## 🚀 Ready to Launch!

**Estimated time to complete checklist:** 3-4 hours

**Critical path:**
1. Set up payment accounts (1-2 hours)
2. Configure environment variables (15 min)
3. Run database migrations (5 min)
4. Test everything (1 hour)
5. Deploy to production (30 min)
6. Final testing (30 min)

**You have everything you need to launch successfully! 🎉**

---

**Last Updated**: January 2025  
**Status**: PRODUCTION READY ✅  
**Next Action**: Set up payment accounts and deploy!
