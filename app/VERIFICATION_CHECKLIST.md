# Phase 6 Implementation Verification Checklist

## ✅ Files Created (11 new files)

### Webhook Handlers
- [x] `app/api/webhooks/dodo/route.ts` - DODO payment webhooks
- [x] `app/api/webhooks/paddle/route.ts` - Paddle payment webhooks

### Dashboard APIs
- [x] `app/api/dashboard/overview/route.ts` - Main dashboard data
- [x] `app/api/dashboard/analytics/route.ts` - Analytics with insights

### Usage APIs
- [x] `app/api/usage/history/route.ts` - Usage history with filters
- [x] `app/api/usage/export/route.ts` - CSV/JSON export

### Billing APIs
- [x] `app/api/billing/upgrade/route.ts` - Plan upgrade
- [x] `app/api/billing/proration/route.ts` - Proration calculation
- [x] `app/api/billing/subscription/cancel/route.ts` - Cancellation

### Billing Pages
- [x] `app/billing/upgrade/page.tsx` - Upgrade flow UI
- [x] `app/billing/cancel/page.tsx` - Cancellation flow UI

---

## 🔍 Quick Verification Steps

### 1. Check File Existence
```bash
cd /Users/arhansubasi/recoder.xyz/app

# Verify all new files exist
ls -la app/api/webhooks/dodo/route.ts
ls -la app/api/webhooks/paddle/route.ts
ls -la app/api/dashboard/overview/route.ts
ls -la app/api/dashboard/analytics/route.ts
ls -la app/api/usage/history/route.ts
ls -la app/api/usage/export/route.ts
ls -la app/api/billing/upgrade/route.ts
ls -la app/api/billing/proration/route.ts
ls -la app/api/billing/subscription/cancel/route.ts
ls -la app/billing/upgrade/page.tsx
ls -la app/billing/cancel/page.tsx
```

### 2. Verify Prisma Client Import
```bash
# Check that all files use correct Prisma import
grep -l "@/lib/prisma" app/api/webhooks/*/route.ts
grep -l "@/lib/prisma" app/api/dashboard/*/route.ts
grep -l "@/lib/prisma" app/api/usage/*/route.ts
grep -l "@/lib/prisma" app/api/billing/*/route.ts
```

### 3. Check TypeScript Compilation
```bash
# Run TypeScript compiler to check for errors
npx tsc --noEmit
```

### 4. Check for Syntax Errors
```bash
# Quick syntax check on all new files
node --check app/api/webhooks/dodo/route.ts 2>&1 | head -1
node --check app/api/webhooks/paddle/route.ts 2>&1 | head -1
# ... etc
```

---

## 🧪 Testing Guide

### Test Webhook Endpoints

#### Test DODO Webhook (Local)
```bash
curl -X POST http://localhost:3000/api/webhooks/dodo \
  -H "Content-Type: application/json" \
  -H "x-dodo-signature: test_signature" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "user_id": "test_user",
      "amount": 20.00,
      "currency": "USD",
      "transaction_id": "txn_123"
    }
  }'
```

#### Test Paddle Webhook (Local)
```bash
curl -X POST http://localhost:3000/api/webhooks/paddle \
  -H "Content-Type: application/json" \
  -d '{
    "alert_name": "payment_succeeded",
    "passthrough": "{\"user_id\":\"test_user\"}",
    "sale_gross": "20.00",
    "currency": "USD",
    "order_id": "order_123"
  }'
```

### Test Dashboard APIs

#### Get Dashboard Overview
```bash
# Requires authentication cookie or token
curl -X GET http://localhost:3000/api/dashboard/overview \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

#### Get Analytics
```bash
curl -X GET "http://localhost:3000/api/dashboard/analytics?period=30d" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

### Test Usage APIs

#### Get Usage History
```bash
curl -X GET "http://localhost:3000/api/usage/history?limit=10" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

#### Export Usage Data
```bash
curl -X POST http://localhost:3000/api/usage/export \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"format":"csv","startDate":"2024-01-01","endDate":"2024-12-31"}' \
  --output usage-export.csv
```

### Test Billing APIs

#### Calculate Proration
```bash
curl -X POST http://localhost:3000/api/billing/proration \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"newPlan":"monthly"}'
```

#### Initiate Upgrade
```bash
curl -X POST http://localhost:3000/api/billing/upgrade \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"plan":"monthly"}'
```

#### Cancel Subscription
```bash
curl -X POST http://localhost:3000/api/billing/subscription/cancel \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "reason":"Too expensive",
    "feedback":"Great product but out of budget",
    "cancelImmediate":false
  }'
```

---

## 🌐 UI Testing

### Test Upgrade Page
1. Navigate to: `http://localhost:3000/billing/upgrade`
2. Verify all three plans display correctly
3. Click "Upgrade Now" on a plan
4. Verify loading state shows
5. Check that redirect to checkout happens

### Test Cancellation Page
1. Navigate to: `http://localhost:3000/billing/cancel`
2. Select a cancellation reason
3. Choose cancellation timing
4. Click "Continue Cancellation"
5. Verify confirmation dialog
6. Complete cancellation
7. Check for success message

---

## 🔒 Security Verification

### Webhook Security
- [ ] DODO webhooks verify HMAC signature
- [ ] Paddle webhooks verify PHP signature
- [ ] Invalid signatures are rejected with 401
- [ ] All webhook events are logged to audit table

### API Security
- [ ] All endpoints require authentication
- [ ] Unauthenticated requests return 401
- [ ] User can only access their own data
- [ ] SQL injection is prevented via Prisma
- [ ] Sensitive data is not exposed in responses

### Data Security
- [ ] API keys are encrypted
- [ ] Passwords are hashed
- [ ] Payment data is not stored (tokenized)
- [ ] Audit logs capture all sensitive operations

---

## 📊 Database Verification

### Check Tables Exist
```sql
-- Run in PostgreSQL
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'users',
  'usage_records',
  'user_quotas',
  'audit_logs',
  'api_keys'
);
```

### Verify Prisma Models
```bash
# Check Prisma schema includes all models
grep "^model" prisma/schema.prisma
```

### Test Database Queries
```bash
# Generate Prisma client
npx prisma generate

# Check for any schema issues
npx prisma validate
```

---

## 🚀 Deployment Verification

### Environment Variables
Ensure these are set in production:

```bash
# Required for webhooks
DODO_WEBHOOK_SECRET=xxxxx
PADDLE_PUBLIC_KEY=xxxxx
PADDLE_API_KEY=xxxxx

# Required for upgrades
PADDLE_VENDOR_ID=xxxxx
PADDLE_WEEKLY_PLAN_ID=xxxxx
PADDLE_MONTHLY_PLAN_ID=xxxxx
PADDLE_ENTERPRISE_PLAN_ID=xxxxx

# Required for general operation
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://recoder.xyz
NEXTAUTH_SECRET=xxxxx
NEXT_PUBLIC_APP_URL=https://recoder.xyz
```

### Build Test
```bash
# Test Next.js build
npm run build

# Check for build errors
echo $?  # Should be 0
```

### Start Production Server
```bash
# Start server
npm run start

# Verify server is running
curl -I http://localhost:3000
```

---

## 📈 Monitoring Setup

### Setup Health Checks
- [ ] Dashboard overview endpoint responding
- [ ] Webhook endpoints accepting POST requests
- [ ] Usage APIs returning data
- [ ] Billing APIs processing requests

### Setup Logging
- [ ] Webhook events are logged
- [ ] Payment events are logged
- [ ] Errors are logged with stack traces
- [ ] Audit logs are being created

### Setup Alerts
- [ ] Alert on webhook failures
- [ ] Alert on payment failures
- [ ] Alert on API errors
- [ ] Alert on database errors

---

## ✅ Final Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Consistent code style
- [ ] All imports resolved
- [ ] No unused variables

### Functionality
- [ ] All APIs return correct data
- [ ] All pages render without errors
- [ ] Loading states work
- [ ] Error handling works
- [ ] Success messages show

### Integration
- [ ] Webhooks integrate with payment providers
- [ ] Frontend calls backend APIs
- [ ] Database operations work
- [ ] Authentication works
- [ ] Authorization works

### Performance
- [ ] API response times < 500ms
- [ ] Database queries are optimized
- [ ] No N+1 query problems
- [ ] Proper indexing used
- [ ] Caching where appropriate

### Security
- [ ] All endpoints authenticated
- [ ] Webhooks verified
- [ ] Data encrypted
- [ ] Audit logs created
- [ ] No sensitive data exposed

---

## 🎉 SUCCESS CRITERIA

Implementation is successful when:

1. ✅ All 11 new files compile without errors
2. ✅ All API endpoints return proper responses
3. ✅ Webhooks process payment events correctly
4. ✅ Dashboard shows real user data
5. ✅ Upgrade flow works end-to-end
6. ✅ Cancellation flow works end-to-end
7. ✅ Export functionality works
8. ✅ All security checks pass
9. ✅ No mock data in production
10. ✅ Production deployment successful

---

## 📞 Support & Troubleshooting

### Common Issues

#### "Module not found: @/lib/db/prisma"
**Solution:** Import path has been fixed to `@/lib/prisma`

#### "User not found" errors
**Solution:** Ensure database has user records and session is valid

#### Webhook signature verification fails
**Solution:** Check that webhook secret environment variables are set correctly

#### TypeScript errors in new files
**Solution:** Run `npm install` to ensure all types are available

### Getting Help
- Check logs: `tail -f .next/server.log`
- Check database: Use Prisma Studio (`npx prisma studio`)
- Check API responses: Use browser DevTools Network tab
- Check webhook logs: Review audit_logs table

---

*Verification checklist created for Phase 6 implementation*
