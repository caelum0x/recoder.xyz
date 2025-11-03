# End-to-End Payment Integration Deployment Guide

## 🚀 Complete Real Implementation

This is a **production-ready** payment integration with Paddle and DodoPay, including database, webhooks, and UI components.

---

## 📋 Prerequisites

### 1. Database Setup (Neon/Supabase/PostgreSQL)

**Option A: Neon (Recommended)**
```bash
# 1. Sign up at https://neon.tech
# 2. Create a new project
# 3. Copy the connection string

export DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb"
```

**Option B: Supabase**
```bash
# 1. Sign up at https://supabase.com
# 2. Create project
# 3. Go to Settings → Database → Connection string

export DATABASE_URL="postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres"
```

### 2. Run Database Migrations

```bash
# Install Neon CLI
npm install -g @neondatabase/serverless

# Run schema
psql $DATABASE_URL < app/lib/.server/db/schema.sql

# Or use your preferred migration tool
```

### 3. Payment Provider Setup

**Paddle Setup:**
1. Sign up at https://paddle.com
2. Go to Developer Tools → Authentication
3. Create API key

```bash
export PADDLE_VENDOR_ID="your_vendor_id"
export PADDLE_API_KEY="your_api_key"
export PADDLE_PUBLIC_KEY="your_public_key"
export PADDLE_WEBHOOK_SECRET="your_webhook_secret"
export PADDLE_ENVIRONMENT="sandbox"  # or "production"
```

**DodoPay Setup:**
1. Sign up at https://dodopayments.com
2. Go to Dashboard → API Settings
3. Generate credentials

```bash
export DODOPAY_MERCHANT_ID="your_merchant_id"
export DODOPAY_API_KEY="your_api_key"
export DODOPAY_SECRET_KEY="your_secret_key"
export DODOPAY_WEBHOOK_SECRET="your_webhook_secret"
export DODOPAY_ENVIRONMENT="sandbox"  # or "production"
```

---

## 🔧 Installation

### 1. Install Dependencies

```bash
npm install @neondatabase/serverless
```

### 2. Update Environment Variables

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/database

# Paddle
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_api_key
PADDLE_PUBLIC_KEY=your_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox

# DodoPay
DODOPAY_MERCHANT_ID=your_merchant_id
DODOPAY_API_KEY=your_api_key
DODOPAY_SECRET_KEY=your_secret_key
DODOPAY_WEBHOOK_SECRET=your_webhook_secret
DODOPAY_ENVIRONMENT=sandbox
```

### 3. Configure Cloudflare Workers (if using)

In `wrangler.toml`:

```toml
[vars]
PADDLE_ENVIRONMENT = "sandbox"
DODOPAY_ENVIRONMENT = "sandbox"

[[d1_databases]]
binding = "DB"
database_name = "bolt-subscriptions"
database_id = "your-d1-id"

# Add secrets using wrangler
# wrangler secret put PADDLE_API_KEY
# wrangler secret put DODOPAY_API_KEY
# etc.
```

---

## 🌐 Webhook Configuration

### Paddle Webhooks

1. Go to Paddle Dashboard → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/webhooks/paddle`
3. Subscribe to events:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_payment_succeeded`
   - `subscription_payment_failed`

### DodoPay Webhooks

1. Go to DodoPay Dashboard → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/dodopay`
3. Subscribe to events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - `payment.succeeded`
   - `payment.failed`
   - `invoice.payment_succeeded`

### Local Webhook Testing

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3000

# Update webhook URLs to:
# https://your-ngrok-url.ngrok.io/api/webhooks/paddle
# https://your-ngrok-url.ngrok.io/api/webhooks/dodopay
```

---

## 🎨 Frontend Integration

### 1. Add Pricing Page

In `app/routes/pricing.tsx`:

```typescript
import { PricingPage } from '~/components/subscription/PricingPage';

export default function Pricing() {
  return <PricingPage />;
}
```

### 2. Add Subscription Dashboard

In `app/routes/dashboard.subscription.tsx`:

```typescript
import { SubscriptionDashboard } from '~/components/subscription/SubscriptionDashboard';

export default function SubscriptionRoute() {
  return <SubscriptionDashboard />;
}
```

### 3. Add Usage Check Middleware

In your AI generation route (e.g., `app/lib/.server/llm/stream-text.ts`):

```typescript
import { createSubscriptionDB } from '~/lib/.server/db/subscription-db';

export async function streamText(messages: Messages, env: Env, options?: StreamingOptions) {
  const db = createSubscriptionDB(env);
  const userId = getUserIdFromRequest(options?.request);

  // Check if user can generate
  const { allowed, remaining } = await db.canGenerate(userId);

  if (!allowed) {
    throw new Error(`Generation limit reached. ${remaining} generations remaining.`);
  }

  // ... existing code ...

  // After successful generation, increment usage
  await db.incrementUsage(userId);

  // Log usage for analytics
  await db.logUsage({
    userId,
    actionType: 'generation',
    tokensUsed: result.usage?.totalTokens || 0,
    costEstimated: estimateCost(result.usage),
    modelUsed: selectedModel,
    optimizationStrategy: strategy
  });

  return result;
}
```

---

## 🧪 Testing Flow

### 1. Test Subscription Flow

```bash
# 1. Start your dev server
npm run dev

# 2. Navigate to pricing page
http://localhost:3000/pricing

# 3. Click "Get Started" on Pro plan

# 4. Should redirect to Paddle/DodoPay checkout

# 5. Use test card: 4242 4242 4242 4242

# 6. Complete payment

# 7. Webhook should trigger and create subscription in DB

# 8. Check database:
psql $DATABASE_URL -c "SELECT * FROM subscriptions;"
```

### 2. Test Usage Tracking

```bash
# Make API request to generate
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_123" \
  -d '{"message": "Create a todo app"}'

# Check usage
psql $DATABASE_URL -c "SELECT generations_used, generations_limit FROM subscriptions WHERE user_id = 'user_123';"

# Check usage logs
psql $DATABASE_URL -c "SELECT * FROM usage_logs WHERE user_id = 'user_123' ORDER BY created_at DESC LIMIT 5;"
```

### 3. Test Webhooks Locally

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Terminal 3: Test webhook
curl -X POST https://your-ngrok-url.ngrok.io/api/webhooks/paddle \
  -H "Content-Type: application/json" \
  -H "paddle-signature: test-signature" \
  -d @test/fixtures/paddle-webhook.json
```

---

## 📊 Database Queries

### Check Subscriptions

```sql
-- All active subscriptions
SELECT
  u.email,
  s.plan_id,
  s.status,
  s.generations_used,
  s.generations_limit,
  s.current_period_end
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active';
```

### Usage Statistics

```sql
-- Usage by plan
SELECT
  s.plan_id,
  COUNT(*) as user_count,
  SUM(s.generations_used) as total_generations,
  AVG(s.generations_used) as avg_generations
FROM subscriptions s
WHERE s.status = 'active'
GROUP BY s.plan_id;
```

### Revenue Tracking

```sql
-- Monthly revenue
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as transaction_count,
  SUM(amount) as total_revenue,
  AVG(amount) as avg_transaction
FROM payment_transactions
WHERE status = 'succeeded'
GROUP BY month
ORDER BY month DESC;
```

### Webhook Health

```sql
-- Failed webhooks
SELECT
  event_type,
  error_message,
  retry_count,
  created_at
FROM webhook_events
WHERE processed = FALSE
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔐 Security Checklist

- [ ] All API keys stored in environment variables
- [ ] Webhook signature verification enabled
- [ ] Database connection uses SSL
- [ ] User authentication implemented
- [ ] Rate limiting on API endpoints
- [ ] CORS configured properly
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] Secrets rotation policy in place

---

## 🚀 Production Deployment

### 1. Database Production Setup

```bash
# Create production database
# Neon: Create new branch from main
# Supabase: Create new project

# Update environment variable
export DATABASE_URL="postgresql://prod-url"

# Run migrations
psql $DATABASE_URL < app/lib/.server/db/schema.sql
```

### 2. Switch to Production Mode

```bash
# Update .env
PADDLE_ENVIRONMENT=production
DODOPAY_ENVIRONMENT=production

# Use production API keys
PADDLE_API_KEY=prod_xxx
DODOPAY_API_KEY=prod_xxx
```

### 3. Update Webhook URLs

- Paddle: `https://yourdomain.com/api/webhooks/paddle`
- DodoPay: `https://yourdomain.com/api/webhooks/dodopay`

### 4. Deploy

```bash
# Cloudflare Workers
wrangler publish

# Vercel
vercel --prod

# Your platform
npm run deploy
```

---

## 📈 Monitoring

### Set Up Alerts

```typescript
// Add to webhook handlers
if (event.type === 'payment.failed') {
  // Send alert to Slack/Discord/Email
  await sendAlert({
    type: 'payment_failed',
    userId: event.userId,
    amount: event.amount
  });
}
```

### Analytics Dashboard

Query key metrics:

```typescript
// app/routes/api.analytics.ts
export async function loader({ context }: LoaderFunctionArgs) {
  const db = createSubscriptionDB(context.cloudflare.env);

  const metrics = await db.getAnalytics();

  return json({
    mrr: calculateMRR(metrics),
    activeSubscriptions: metrics.activeCount,
    churnRate: calculateChurn(metrics),
    avgRevenuePerUser: calculateARPU(metrics)
  });
}
```

---

## 🐛 Troubleshooting

### Issue: Webhook not received

```bash
# Check webhook logs
psql $DATABASE_URL -c "SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;"

# Test webhook manually
curl -X POST https://yourdomain.com/api/webhooks/paddle \
  -H "paddle-signature: xxx" \
  -d @webhook-payload.json
```

### Issue: Subscription not created

```bash
# Check database
psql $DATABASE_URL -c "SELECT * FROM subscriptions WHERE subscription_id = 'sub_xxx';"

# Check webhook events
psql $DATABASE_URL -c "SELECT * FROM webhook_events WHERE event_id = 'evt_xxx';"
```

### Issue: Usage not incrementing

```typescript
// Add logging
await db.incrementUsage(userId);
console.log(`✅ Usage incremented for user ${userId}`);

// Check database
SELECT generations_used FROM subscriptions WHERE user_id = 'user_123';
```

---

## ✅ Launch Checklist

- [ ] Database schema applied
- [ ] Environment variables configured
- [ ] Paddle account set up (production)
- [ ] DodoPay account set up (production)
- [ ] Webhooks configured and tested
- [ ] Test subscription flow end-to-end
- [ ] Test webhook processing
- [ ] Test usage tracking
- [ ] Test subscription cancellation
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Document customer support process
- [ ] Train team on subscription management

---

## 📞 Support

### Payment Provider Support

- **Paddle**: support@paddle.com | https://developer.paddle.com
- **DodoPay**: support@dodopayments.com | https://docs.dodopayments.com

### Database Support

- **Neon**: https://neon.tech/docs
- **Supabase**: https://supabase.com/docs

---

## 🎉 You're Ready!

Your end-to-end payment integration is complete with:

✅ Real database schema (PostgreSQL/Neon)
✅ Dual payment providers (Paddle + DodoPay)
✅ Automatic provider selection
✅ Complete webhook handling
✅ Usage tracking and limits
✅ Transaction recording
✅ UI components (Pricing + Dashboard)
✅ Analytics and monitoring

Start processing payments and building your SaaS! 🚀
