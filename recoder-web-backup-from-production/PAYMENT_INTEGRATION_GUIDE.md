# Payment Integration Guide

## Overview

Bolt.new supports **two payment providers** for maximum flexibility and global coverage:

1. **Paddle** - Best for US/EU markets, handles VAT/tax automatically
2. **DodoPay** - Best for Asian markets, supports Alipay/WeChat Pay, lower international fees

The system **automatically selects** the best provider based on user location.

---

## 🌍 Provider Selection Logic

### Paddle (Default for US/EU)

**Best for:**
- United States, Canada
- European Union countries
- United Kingdom, Australia

**Features:**
- Automatic VAT/sales tax handling
- Traditional payment methods (Card, PayPal)
- SaaS-friendly billing
- 5% + $0.50 per transaction

### DodoPay (Best for Asia)

**Best for:**
- China, Japan, Korea
- Singapore, Hong Kong, Taiwan
- Southeast Asia

**Features:**
- Alipay, WeChat Pay support
- Lower international fees (2.9% + $0.30)
- Crypto payment support
- Multi-currency support

**Auto-Selection:**
```typescript
// Automatically selects DodoPay for these countries
const asianCountries = ['CN', 'JP', 'KR', 'SG', 'HK', 'TW', 'MY', 'TH', 'VN'];

// Users can also manually select their preferred provider
```

---

## 💳 Subscription Plans

| Plan | Price | Generations | Key Features |
|------|-------|-------------|--------------|
| **Free** | $0 | 5/month | Basic templates, Community support |
| **Pro** | $20 | 100/month | All templates, Priority support, Custom deployments |
| **Team** | $50 | 500/month | Team collaboration (5 seats), Private templates |
| **Enterprise** | $200 | 2000/month | Unlimited seats, On-premise, SLA guarantee |

---

## 🔧 Environment Setup

### Required Environment Variables

```bash
# Paddle Configuration
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_api_key
PADDLE_PUBLIC_KEY=your_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox  # or 'production'

# DodoPay Configuration
DODOPAY_MERCHANT_ID=your_merchant_id
DODOPAY_API_KEY=your_api_key
DODOPAY_SECRET_KEY=your_secret_key
DODOPAY_WEBHOOK_SECRET=your_webhook_secret
DODOPAY_ENVIRONMENT=sandbox  # or 'production'
```

### Get API Keys

**Paddle:**
1. Sign up at https://paddle.com
2. Navigate to Developer Tools → Authentication
3. Generate API key and get webhook secret

**DodoPay:**
1. Sign up at https://dodopayments.com
2. Go to Dashboard → API Settings
3. Generate API credentials

---

## 🚀 API Usage

### Create Checkout Session

```typescript
// Client-side request
const response = await fetch('/api/subscribe?action=create-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    email: 'user@example.com',
    planId: 'pro',
    userCountry: 'US',  // Optional: auto-detect
    preferredProvider: 'paddle'  // Optional: manual override
  })
});

const { checkoutUrl, provider } = await response.json();
// Redirect user to checkoutUrl
window.location.href = checkoutUrl;
```

### Get Subscription Details

```typescript
const response = await fetch('/api/subscribe?action=get-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscriptionId: 'sub_123',
    provider: 'paddle'
  })
});

const { subscription } = await response.json();
console.log(subscription.status); // 'active', 'cancelled', etc.
```

### Cancel Subscription

```typescript
await fetch('/api/subscribe?action=cancel-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscriptionId: 'sub_123',
    provider: 'paddle',
    immediate: false  // false = cancel at period end
  })
});
```

### Update Subscription Plan

```typescript
await fetch('/api/subscribe?action=update-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscriptionId: 'sub_123',
    provider: 'paddle',
    newPlanId: 'team'
  })
});
```

### Customer Portal (Manage Billing)

```typescript
const response = await fetch('/api/subscribe?action=create-portal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: 'cus_123',
    provider: 'dodopay'
  })
});

const { portalUrl } = await response.json();
window.location.href = portalUrl;
```

---

## 🔔 Webhook Configuration

### Paddle Webhooks

**Webhook URL:** `https://yourdomain.com/api/webhooks/paddle`

**Events to Subscribe:**
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_payment_succeeded`
- `subscription_payment_failed`

**Setup:**
1. Go to Paddle Dashboard → Webhooks
2. Add webhook URL
3. Copy webhook secret to env vars

### DodoPay Webhooks

**Webhook URL:** `https://yourdomain.com/api/webhooks/dodopay`

**Events to Subscribe:**
- `subscription.created`
- `subscription.updated`
- `subscription.deleted`
- `payment.succeeded`
- `payment.failed`
- `invoice.payment_succeeded`

**Setup:**
1. Go to DodoPay Dashboard → Webhooks
2. Add webhook endpoint
3. Copy signing secret to env vars

---

## 🧪 Testing

### Test Mode (Sandbox)

Both providers support sandbox/test mode:

```bash
# Use test API keys
PADDLE_ENVIRONMENT=sandbox
DODOPAY_ENVIRONMENT=sandbox
```

### Test Cards

**Paddle Test Cards:**
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
```

**DodoPay Test Cards:**
```
Success: 4111 1111 1111 1111
3D Secure: 4000 0027 6000 3184
```

### Test Webhooks

Use tools like ngrok for local webhook testing:

```bash
ngrok http 3000

# Update webhook URLs to:
# https://your-ngrok-url.ngrok.io/api/webhooks/paddle
# https://your-ngrok-url.ngrok.io/api/webhooks/dodopay
```

---

## 📊 Database Schema

Store subscription data in your database:

```typescript
interface UserSubscription {
  id: string;
  userId: string;
  provider: 'paddle' | 'dodopay';
  subscriptionId: string;
  customerId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  generationsUsed: number;
  generationsLimit: number;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🔐 Security

### Webhook Verification

Both providers use HMAC signatures:

```typescript
// Automatic verification in unified service
await paymentService.handleWebhook(provider, payload, signature, timestamp);
```

### API Key Security

- **Never** expose API keys in client-side code
- Store in environment variables only
- Use server-side routes for all payment operations
- Rotate keys periodically

---

## 💰 Pricing Comparison

| Feature | Paddle | DodoPay |
|---------|--------|---------|
| **Transaction Fee** | 5% + $0.50 | 2.9% + $0.30 |
| **VAT Handling** | Automatic | Manual |
| **Alipay/WeChat** | ❌ | ✅ |
| **Crypto Payments** | ❌ | ✅ |
| **Best For** | US/EU | Asia |
| **Payout Time** | 15 days | 7 days |

**Recommendation:**
- Use **Paddle** for Western markets (automatic tax handling)
- Use **DodoPay** for Asian markets (better local payment methods)

---

## 🚀 Production Deployment

### Pre-Launch Checklist

- [ ] Set up production Paddle account
- [ ] Set up production DodoPay account
- [ ] Configure webhook endpoints
- [ ] Test both providers in sandbox
- [ ] Update environment variables to production
- [ ] Set up monitoring for failed payments
- [ ] Configure email notifications
- [ ] Test subscription lifecycle (create, update, cancel)
- [ ] Set up customer support process

### Monitoring

Track key metrics:

```typescript
// Subscription metrics to monitor
{
  activeSubscriptions: number;
  mrr: number;  // Monthly Recurring Revenue
  churnRate: number;
  conversionRate: number;
  failedPayments: number;
  averageRevenuePerUser: number;
}
```

---

## 🎯 Next Steps

1. **Week 1:**
   - Set up Paddle sandbox account
   - Implement checkout flow
   - Test basic subscription flow

2. **Week 2:**
   - Set up DodoPay account
   - Add multi-provider support
   - Test both providers

3. **Week 3:**
   - Implement usage tracking
   - Add customer portal
   - Test webhook handling

4. **Week 4:**
   - Production deployment
   - Monitor first transactions
   - Gather user feedback

---

## 📞 Support

**Paddle Support:**
- Email: support@paddle.com
- Docs: https://developer.paddle.com

**DodoPay Support:**
- Email: support@dodopayments.com
- Docs: https://docs.dodopayments.com

**Bolt.new Issues:**
- GitHub: https://github.com/your-repo/issues
