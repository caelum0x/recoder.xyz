# 🚀 Production Deployment Guide

## Complete guide to deploying your optimized bolt.new to production

---

## ✅ Pre-Deployment Checklist

### 1. System Verification (Run These Commands)

```bash
# Test template system
npm run test:templates
# Expected: ✅ 100% pass rate, 40 templates loaded

# Test OpenRouter integration
npm run test:openrouter
# Expected: ✅ Model routing working

# Verify database
psql 'postgresql://...' -c "SELECT COUNT(*) FROM users;"
# Expected: 4+ users

# Type check
npm run typecheck
# Expected: No errors

# Build test
npm run build
# Expected: Build succeeds
```

### 2. Environment Variables Required

```bash
# Core (REQUIRED)
ANTHROPIC_API_KEY="sk-ant-xxxx"  # Or use OpenRouter only

# OpenRouter (HIGHLY RECOMMENDED - one key for all models)
OPENROUTER_API_KEY="sk-or-v1-xxxx"

# Database
DATABASE_URL="postgresql://..."

# Payment Providers (Optional - for subscription system)
PADDLE_VENDOR_ID="your_vendor_id"
PADDLE_API_KEY="your_api_key"
PADDLE_WEBHOOK_SECRET="your_webhook_secret"
DODOPAY_MERCHANT_ID="your_merchant_id"
DODOPAY_API_KEY="your_api_key"
```

---

## 🌐 OpenRouter Setup (CRITICAL for Cost Savings)

### Why OpenRouter is Essential

**Without OpenRouter:**
- ❌ Need 5-6 separate API keys
- ❌ Can't use free models (Gemini, DeepSeek)
- ❌ Miss out on 93% cost savings
- ❌ Limited to Anthropic models only

**With OpenRouter:**
- ✅ One API key for ALL 17 models
- ✅ Access to free models
- ✅ 93% cost savings
- ✅ No vendor lock-in

### Setup Steps

1. **Create Account**
   - Go to https://openrouter.ai/
   - Sign up (free)
   - Verify email

2. **Get API Key**
   - Go to "Keys" section
   - Click "Create Key"
   - Copy key (starts with `sk-or-v1-`)

3. **Add Credits**
   - Go to "Credits" section
   - Add $10-20 to start
   - This will last for 1,000-2,000 requests

4. **Configure Environment**
   ```bash
   # Add to your deployment environment
   OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxx"
   ```

5. **Verify**
   ```bash
   # Test that it works
   curl https://openrouter.ai/api/v1/models \
     -H "Authorization: Bearer $OPENROUTER_API_KEY"
   ```

---

## 🏗️ Deployment Platforms

### Option 1: Cloudflare Pages (Recommended)

**Why Cloudflare:**
- ✅ Built for Remix apps
- ✅ Global CDN
- ✅ Zero cold starts
- ✅ Free tier generous

**Deploy Steps:**

1. **Install Wrangler**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Configure Secrets**
   ```bash
   # Add environment variables
   wrangler secret put OPENROUTER_API_KEY
   wrangler secret put DATABASE_URL
   wrangler secret put ANTHROPIC_API_KEY
   ```

3. **Deploy**
   ```bash
   npm run build
   npx wrangler pages deploy
   ```

4. **Configure Custom Domain** (Optional)
   ```bash
   wrangler pages domains add yourdomain.com
   ```

### Option 2: Vercel

**Deploy Steps:**

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Configure Environment**
   ```bash
   vercel env add OPENROUTER_API_KEY production
   vercel env add DATABASE_URL production
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Option 3: Railway

**Deploy Steps:**

1. **Create Railway Project**
   - Go to railway.app
   - Create new project
   - Connect GitHub repo

2. **Add Environment Variables**
   - In Railway dashboard
   - Add all env vars from checklist

3. **Deploy**
   - Automatic on git push

---

## 📊 Post-Deployment Monitoring

### 1. Verify System Health

Visit your deployment URL + `/api/system-health`:

```bash
curl https://yourdomain.com/api/system-health
```

**Expected Response:**
```json
{
  "success": true,
  "health": {
    "status": "operational",
    "components": {
      "templateSystem": { "status": "operational" },
      "modelRouting": { "status": "operational" },
      "openrouter": { "status": "operational" }
    }
  }
}
```

### 2. Test Optimization Flow

**Make a Test Request:**
```bash
curl https://yourdomain.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a Next.js dashboard"}'
```

**Check Logs for:**
```
🎯 REAL TEMPLATE MATCH: Nextjs Shadcn (85% confidence)
🌐 OpenRouter: gemini-2.5-flash → google/gemini-2.0-flash-exp:free
💰 Cost: $0.0000, Savings: 85%
```

### 3. Monitor OpenRouter Dashboard

1. Go to https://openrouter.ai/activity
2. Check requests are appearing
3. Verify costs are low ($0 for free models)
4. Set up usage alerts

---

## 💰 Cost Monitoring Setup

### 1. OpenRouter Alerts

```bash
# Set spending alerts
1. Go to OpenRouter → Settings → Alerts
2. Set alert at $10 (10% of $100)
3. Set alert at $50 (50% of $100)
4. Set alert at $90 (90% of $100)
```

### 2. Database Monitoring

```bash
# Monitor usage logs
psql "$DATABASE_URL" -c "
  SELECT
    DATE(created_at) as date,
    COUNT(*) as requests,
    SUM(cost_estimated) as total_cost,
    AVG(cost_estimated) as avg_cost
  FROM usage_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC;
"
```

### 3. Custom Monitoring Dashboard

Add to your app:

```typescript
// app/routes/admin.analytics.tsx
import { OptimizationDashboard } from '~/components/analytics/OptimizationDashboard';

export default function AdminAnalytics() {
  return <OptimizationDashboard />;
}
```

Visit: `https://yourdomain.com/admin/analytics`

---

## 🔒 Security Best Practices

### 1. API Key Rotation

```bash
# Rotate OpenRouter key monthly
1. Create new key in OpenRouter dashboard
2. Update environment variable
3. Delete old key after 24h
```

### 2. Rate Limiting

Add rate limiting to prevent abuse:

```typescript
// app/middleware/rate-limit.ts
export function rateLimit(req: Request) {
  const ip = req.headers.get('cf-connecting-ip');
  // Limit to 100 requests per hour per IP
  return checkRateLimit(ip, 100, 3600);
}
```

### 3. Webhook Security

```typescript
// Verify webhook signatures
import { verifyWebhookSignature } from '~/lib/.server/payments';

export async function action({ request }: ActionFunctionArgs) {
  const signature = request.headers.get('webhook-signature');
  const isValid = verifyWebhookSignature(body, signature);

  if (!isValid) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }
  // Process webhook...
}
```

---

## 📈 Scaling Strategy

### Phase 1: 0-1,000 Users

**Infrastructure:**
- Single Cloudflare Pages deployment
- Neon Postgres free tier
- OpenRouter pay-as-you-go

**Expected Costs:**
- AI: $40-100/month
- Database: $0 (free tier)
- Hosting: $0 (Cloudflare free tier)
- **Total: $40-100/month**

### Phase 2: 1,000-10,000 Users

**Infrastructure:**
- Cloudflare Pages (still free)
- Neon Postgres Pro ($20/month)
- OpenRouter credits ~$200/month

**Expected Costs:**
- AI: $200-400/month
- Database: $20/month
- Hosting: $0
- **Total: $220-420/month**

**Revenue**: 10,000 users × $20/month = $200,000/month
**Profit Margin**: 99.8%

### Phase 3: 10,000-100,000 Users

**Infrastructure:**
- Cloudflare Workers (scaling)
- Neon Postgres Scale ($100/month)
- OpenRouter credits ~$2,000/month

**Expected Costs:**
- AI: $2,000-4,000/month
- Database: $100/month
- Hosting: $200/month
- **Total: $2,300-4,300/month**

**Revenue**: 100,000 users × $20/month = $2,000,000/month
**Profit Margin**: 99.8%

---

## 🚨 Common Issues & Solutions

### Issue 1: "No API keys configured"

**Symptom:**
```
⚠️  No API keys configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)
```

**Solution:**
```bash
# Add OpenRouter key to production environment
wrangler secret put OPENROUTER_API_KEY
# Or via your platform's dashboard
```

### Issue 2: High costs despite optimization

**Symptom:**
- OpenRouter dashboard shows high costs
- Free model usage is low

**Solution:**
```bash
# Check template matching is working
npm run test:templates

# Verify logs show template matches
grep "REAL TEMPLATE MATCH" production.log

# Check free model usage %
# Should be 60-70% of requests
```

### Issue 3: Database connection errors

**Symptom:**
```
Error: Connection timeout
```

**Solution:**
```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Check Neon dashboard for connection limits
```

### Issue 4: Slow response times

**Symptom:**
- Requests taking >5 seconds

**Solution:**
```bash
# Check if using cached templates
# Template responses should be <1s

# Monitor OpenRouter latency
# Free models (Gemini) are fastest

# Consider adding Redis cache for prompts
```

---

## 📋 Daily Operations Checklist

### Morning Check (5 minutes)

```bash
# 1. Check system health
curl https://yourdomain.com/api/system-health

# 2. Check OpenRouter costs
# Visit: https://openrouter.ai/activity
# Expected: $0-5/day

# 3. Check error logs
# In your hosting platform dashboard

# 4. Verify database is healthy
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
```

### Weekly Review (30 minutes)

```bash
# 1. Review analytics
# Visit: https://yourdomain.com/admin/analytics

# 2. Check cost trends
# OpenRouter dashboard → Last 7 days

# 3. Review top templates used
npm run test:templates

# 4. Check for errors
# Review application logs

# 5. Update dependencies if needed
npm outdated
```

### Monthly Tasks

```bash
# 1. Rotate API keys
# OpenRouter → Create new key
# Update environment variables

# 2. Review and optimize
# Analyze which models are used most
# Adjust routing if needed

# 3. Database maintenance
# Check usage logs size
# Archive old logs if needed

# 4. Backup important data
# Export analytics
# Backup database
```

---

## 🎯 Success Metrics

### Week 1

- [ ] System deployed and operational
- [ ] OpenRouter integration working
- [ ] Template matching at 40-50%
- [ ] Free model usage at 60-70%
- [ ] Average cost <$0.02 per request

### Month 1

- [ ] 100+ active users
- [ ] 93% cost savings vs baseline
- [ ] <0.5% error rate
- [ ] Template system covering 45%+ of requests
- [ ] Profitable on $20/month pricing

### Quarter 1

- [ ] 1,000+ active users
- [ ] $40-100/month AI costs
- [ ] 99% uptime
- [ ] Sustainable unit economics
- [ ] Proven cost model

---

## 📞 Support Resources

### Documentation

- **OpenRouter Docs**: https://openrouter.ai/docs
- **Neon Docs**: https://neon.tech/docs
- **Cloudflare Docs**: https://developers.cloudflare.com/pages

### Monitoring

- **OpenRouter Dashboard**: https://openrouter.ai/activity
- **Neon Dashboard**: https://console.neon.tech
- **System Health**: https://yourdomain.com/api/system-health

### Emergency Contacts

1. **OpenRouter Issues**
   - Discord: https://discord.gg/openrouter
   - Email: support@openrouter.ai

2. **Database Issues**
   - Neon Support: https://neon.tech/docs/support

3. **Hosting Issues**
   - Cloudflare Support (depends on plan)

---

## 🎉 You're Ready to Deploy!

### Final Pre-Deploy Checklist

- [ ] OpenRouter API key added to environment
- [ ] Database URL configured
- [ ] All tests passing
- [ ] Build succeeds
- [ ] Environment variables set
- [ ] Monitoring configured
- [ ] First backup completed

### Deploy Command

```bash
# Final test
npm run test:templates && npm run test:openrouter

# Build
npm run build

# Deploy (choose your platform)
npx wrangler pages deploy  # Cloudflare
# OR
vercel --prod              # Vercel
# OR
git push                   # Railway (auto-deploy)
```

### Post-Deploy

1. Visit your URL
2. Check system health endpoint
3. Make a test request
4. Verify in OpenRouter dashboard
5. Monitor for 1 hour
6. Celebrate! 🎉

---

**Your optimized bolt.new is now live with 93% lower AI costs!** 🚀

For questions, refer to:
- `IMPLEMENTATION_COMPLETE.md` - Full system overview
- `OPENROUTER_SETUP.md` - OpenRouter details
- `QUICK_START_OPTIMIZATION.md` - Quick reference
