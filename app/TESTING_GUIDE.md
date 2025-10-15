# Testing Guide: Phase 3 & 4 Implementation

## Quick Start Testing

### 1. Start the Development Server

```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
```

The app will be available at `http://localhost:3000`

### 2. Test Dashboard Pages

#### Dashboard Overview
```
URL: http://localhost:3000/dashboard/overview
Tests:
- ✅ Statistics cards load with real data
- ✅ Usage metrics display correctly
- ✅ Projects count shows
- ✅ API keys count shows
- ✅ Subscription status displays
- ✅ Quick actions work
- ✅ Recent activity feed populates
```

#### Usage Dashboard
```
URL: http://localhost:3000/dashboard/usage
Tests:
- ✅ Monthly usage displays
- ✅ Cost calculations correct
- ✅ Token usage shows
- ✅ Charts render
- ✅ Model breakdowns display
- ✅ Export functionality works
```

#### Projects Dashboard
```
URL: http://localhost:3000/dashboard/projects
Tests:
- ✅ Projects list loads
- ✅ Search works
- ✅ Filters work
- ✅ Create project button
- ✅ Project details display
```

#### API Keys Dashboard
```
URL: http://localhost:3000/dashboard/api-keys
Tests:
- ✅ Keys list loads
- ✅ Create new key works
- ✅ Revoke key works
- ✅ Usage stats display
- ✅ Copy key functionality
```

#### Team Dashboard
```
URL: http://localhost:3000/dashboard/team
Tests:
- ✅ Team members load
- ✅ Invite member works
- ✅ Role management works
- ✅ Remove member works
```

#### Billing Dashboard
```
URL: http://localhost:3000/dashboard/billing
Tests:
- ✅ Current plan displays
- ✅ Usage shows
- ✅ Upgrade buttons work
- ✅ Invoice history loads
```

### 3. Test Settings Pages

#### Account Settings
```
URL: http://localhost:3000/settings/account
Tests:
- ✅ Account data loads from API
- ✅ Email update works
- ✅ Name update works
- ✅ Organization update works
- ✅ Timezone selection works
- ✅ Language selection works
- ✅ Export data button works
- ✅ Delete account confirmation
- ✅ Success messages display
- ✅ Error handling works
```

#### Profile Settings
```
URL: http://localhost:3000/settings/profile
Tests:
- ✅ Profile loads
- ✅ Avatar upload works
- ✅ Bio update works
- ✅ Social links work
```

#### Security Settings
```
URL: http://localhost:3000/settings/security
Tests:
- ✅ Password change works
- ✅ 2FA setup works
- ✅ Active sessions display
- ✅ Logout other sessions works
```

#### Notification Settings
```
URL: http://localhost:3000/settings/notifications
Tests:
- ✅ Email preferences load
- ✅ Push notifications toggle
- ✅ Webhook settings work
- ✅ Save changes works
```

#### Integrations
```
URL: http://localhost:3000/settings/integrations
Tests:
- ✅ Connected apps display
- ✅ OAuth connections work
- ✅ Disconnect works
- ✅ Integration settings
```

#### API Configuration
```
URL: http://localhost:3000/settings/api
Tests:
- ✅ Model preferences load
- ✅ Default parameters work
- ✅ Rate limits display
- ✅ Save changes works
```

### 4. Test Billing Flow

#### Billing Page
```
URL: http://localhost:3000/billing
Tests:
- ✅ Plans load from API
- ✅ Current subscription displays
- ✅ Plan features show correctly
- ✅ Upgrade with Card button works
- ✅ Pay with Crypto button works
- ✅ Invoice history displays
- ✅ Download invoice works
- ✅ Cancel subscription works
- ✅ Reactivate subscription works
```

#### Checkout Flow (Card)
```
1. Click "Upgrade with Card"
2. Redirects to Paddle checkout
3. Complete payment (test mode)
4. Redirects back with success
5. Subscription updates
```

#### Checkout Flow (Crypto)
```
1. Click "Pay with Crypto"
2. Redirects to DODO Pay
3. Select cryptocurrency
4. Complete payment
5. Redirects back with success
6. Subscription updates
```

### 5. Test API Endpoints

#### Using curl or Postman

**Get Dashboard Stats:**
```bash
curl -X GET http://localhost:3000/api/dashboard/overview/stats \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

**Get Account Info:**
```bash
curl -X GET http://localhost:3000/api/user/account \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

**Update Account:**
```bash
curl -X PUT http://localhost:3000/api/user/account \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{"name": "Test User", "timezone": "America/New_York"}'
```

**Get Billing Plans:**
```bash
curl -X GET http://localhost:3000/api/billing/plans
```

**Get Current Subscription:**
```bash
curl -X GET http://localhost:3000/api/billing/subscription \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

**Export User Data:**
```bash
curl -X GET http://localhost:3000/api/user/export \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -o user-data-export.json
```

### 6. Test Database Integration

Check that data persists correctly:

```bash
# Connect to your database
psql $DATABASE_URL

# Check users
SELECT id, email, name, subscription FROM users LIMIT 5;

# Check usage records
SELECT * FROM usage_records ORDER BY timestamp DESC LIMIT 10;

# Check subscriptions
SELECT * FROM subscriptions WHERE status = 'active';

# Check audit logs
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;

# Check invoices
SELECT * FROM invoices ORDER BY created_at DESC LIMIT 10;
```

### 7. Test Error Handling

#### Network Errors
1. Disconnect from internet
2. Try to load dashboard
3. Should show error message
4. Reconnect
5. Retry button should work

#### Invalid Data
1. Submit empty form fields
2. Should show validation errors
3. Fix errors
4. Should submit successfully

#### Permission Errors
1. Try to access another user's data
2. Should show 401/403 error
3. Should not expose sensitive data

### 8. Test Loading States

#### Dashboard
1. Load dashboard page
2. Should show loading spinner
3. Data should populate
4. Spinner should disappear

#### Settings
1. Load settings page
2. Should show loading state
3. Form should populate
4. Should be editable

### 9. Test Responsive Design

#### Desktop (1920x1080)
- ✅ All elements visible
- ✅ Proper spacing
- ✅ No horizontal scroll

#### Tablet (768x1024)
- ✅ Grid collapses properly
- ✅ Navigation accessible
- ✅ Forms usable

#### Mobile (375x667)
- ✅ Single column layout
- ✅ Touch-friendly buttons
- ✅ Readable text

### 10. Test Performance

#### Page Load Times
- Dashboard overview: < 2s
- Settings pages: < 1s
- Billing page: < 2s
- API responses: < 500ms

#### Memory Usage
Monitor in Chrome DevTools:
1. Open Performance tab
2. Record session
3. Navigate through pages
4. Check memory usage
5. Should not leak memory

### 11. Integration Testing

#### Complete User Flow
```
1. Sign up new user
   - POST /api/auth/signup
   - Verify email received
   - Click verification link

2. Complete onboarding
   - Add API key
   - Set preferences
   - Create first project

3. Use the platform
   - Make API requests
   - Check usage dashboard
   - View statistics

4. Upgrade subscription
   - Go to billing page
   - Select plan
   - Complete checkout
   - Verify subscription active

5. Update settings
   - Change account info
   - Update preferences
   - Verify changes saved

6. Export data
   - Request data export
   - Download file
   - Verify contents

7. Cancel subscription
   - Go to billing
   - Click cancel
   - Confirm cancellation
   - Verify status updated
```

## Automated Testing

### Run Tests
```bash
# Unit tests
npm run test

# E2E tests (if available)
npm run test:e2e

# Type checking
npx tsc --noEmit --skipLibCheck
```

### Test Coverage
```bash
npm run test:coverage
```

## Common Issues & Solutions

### Issue: Dashboard shows no data
**Solution:** 
1. Check database connection
2. Verify user has usage records
3. Check API endpoint returns data
4. Check browser console for errors

### Issue: Settings not saving
**Solution:**
1. Check network tab for failed requests
2. Verify authentication token valid
3. Check API endpoint logs
4. Verify database write permissions

### Issue: Billing checkout fails
**Solution:**
1. Check Paddle/DODO API keys configured
2. Verify webhook URLs set up
3. Check payment provider status
4. Review server logs

### Issue: Images/Assets not loading
**Solution:**
1. Check Next.js static file serving
2. Verify file paths correct
3. Check CDN configuration (if using)
4. Clear browser cache

### Issue: TypeScript errors
**Solution:**
1. Run `npm install` to update types
2. Check tsconfig.json configuration
3. Verify all imports correct
4. Use `skipLibCheck` if needed

## Performance Optimization

### Database Queries
```sql
-- Add indexes for common queries
CREATE INDEX idx_usage_records_user_timestamp ON usage_records(user_id, timestamp DESC);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_invoices_user_created ON invoices(user_id, created_at DESC);
```

### API Response Caching
```typescript
// Example: Cache dashboard stats for 5 minutes
const stats = await cache.getOrSet('dashboard-stats-' + userId, async () => {
  return await fetchDashboardStats(userId);
}, 300); // 5 minutes
```

### Frontend Optimization
```typescript
// Use React.memo for expensive components
const DashboardCard = React.memo(({ data }) => {
  return <Card>{/* ... */}</Card>;
});

// Use useMemo for expensive calculations
const chartData = useMemo(() => {
  return processChartData(rawData);
}, [rawData]);
```

## Monitoring & Logging

### Server Logs
```bash
# Watch backend logs
tail -f /var/log/recoder/backend.log

# Watch application logs
tail -f .next/trace
```

### Error Tracking
```typescript
// Log errors to monitoring service
try {
  await updateAccount(data);
} catch (error) {
  console.error('Account update failed:', error);
  // Send to Sentry, Datadog, etc.
  trackError(error, { userId, action: 'account_update' });
  throw error;
}
```

### Analytics
```typescript
// Track user actions
trackEvent('dashboard_viewed', {
  userId,
  timestamp: new Date(),
  page: 'overview'
});

trackEvent('subscription_upgraded', {
  userId,
  planId,
  amount,
  provider: 'paddle'
});
```

## Security Testing

### Authentication
- [ ] Login with valid credentials works
- [ ] Login with invalid credentials fails
- [ ] Session expires after timeout
- [ ] Refresh token works
- [ ] Logout clears session

### Authorization
- [ ] User can only access own data
- [ ] Admin routes require admin role
- [ ] API keys have correct permissions
- [ ] Rate limiting works

### Data Protection
- [ ] Sensitive data encrypted
- [ ] Passwords hashed
- [ ] API keys stored securely
- [ ] SQL injection prevented
- [ ] XSS attacks prevented

## Next Steps

After testing is complete:

1. **Fix any bugs found** during testing
2. **Optimize performance** based on metrics
3. **Add E2E tests** for critical flows
4. **Set up monitoring** for production
5. **Prepare deployment** checklist
6. **Document** any new findings
7. **Create** user documentation

---

**Testing Status**: Ready for QA
**Coverage**: Phase 3 & 4 Complete
**Date**: October 15, 2025
