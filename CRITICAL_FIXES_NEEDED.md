# Critical Fixes Needed for recoder.xyz

## Status: Backend Partially Fixed, OAuth Broken, Dashboard Needs Work

### ✅ COMPLETED FIXES

1. **Billing Routes Startup Hang** - FIXED
   - Converted all service imports to lazy loading in `/backend/src/routes/billing.ts`
   - Server now successfully loads past billing routes

2. **Plans API Response Format** - FIXED
   - Changed `/app/app/api/billing/plans/route.ts` to return `{ success, plans }` instead of nested data

3. **Database Schema** - FIXED (previous session)
   - Synced Prisma schema with database
   - All authentication and registration working

### 🔴 CRITICAL ISSUES

#### 1. Backend Server Not Starting (Port 3001)
**Problem**: Server loads billing routes successfully but hangs before completing startup. No listener on port 3001.

**Root Cause**: Likely hanging on subscription routes or webhooks that load after billing.

**Fix Needed**:
```bash
# Kill hung process
pkill -f "tsx watch src/server.ts"

# Start without watch mode to see full error
cd /Users/arhansubasi/recoder.xyz/backend
PORT=3001 node dist/server.js

# OR compile and run
npm run build
PORT=3001 node dist/server.js
```

**Investigation Needed**:
- Check `/backend/src/routes/subscriptions.ts:6` - has `require('../services/dodo-payments')` that may hang
- Check `/backend/src/routes/webhooks/*.ts` for similar module-level imports

#### 2. OAuth Google Authentication BROKEN

**Problem**: Redirect URI is hardcoded to production URL

**File**: `/app/app/api/auth/callback/route.ts:81`

**Current Code**:
```typescript
redirect_uri: 'https://recoder.xyz/api/auth/callback?provider=google',
```

**Fix**:
```typescript
// Dynamic redirect based on environment
const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
redirect_uri: `${baseUrl}/api/auth/callback?provider=google`,
```

**Also Needs**:
- Google OAuth Console must have `http://localhost:3000/api/auth/callback?provider=google` as authorized redirect URI for development
- Check `.env` file has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

#### 3. OAuth GitHub Authentication

**Status**: Code looks correct (uses environment variables properly)

**Needs Verification**:
- `.env` has `GITHUB_ID` and `GITHUB_SECRET`
- GitHub OAuth App has `http://localhost:3000/api/auth/callback?provider=github` as authorized callback URL

#### 4. Dashboard Theme Mismatch

**Problem**: Dashboard doesn't match recoder.xyz website theme

**Location**: Likely `/app/app/dashboard/**` components

**Investigation Needed**:
- Compare `/app/app/page.tsx` (main website) vs `/app/app/dashboard/page.tsx`
- Check Tailwind config for theme consistency
- Verify CSS imports match across pages

#### 5. Dashboard Mock Data

**Problem**: Dashboard shows fake/mock data instead of real user data

**Files to Check**:
- `/app/app/api/dashboard/stats/route.ts:21` - Has production engine URL fallback
- Look for hardcoded mock responses in dashboard components

**Fix**: Ensure API routes return real data from database, not fallback mocks

### 📋 PRIORITY ACTION LIST

1. **IMMEDIATE** - Fix OAuth redirect URI (5 min fix)
   ```bash
   # Edit /app/app/api/auth/callback/route.ts
   # Change line 81 to use dynamic baseUrl
   ```

2. **HIGH** - Get backend fully started (30 min debug)
   ```bash
   # Find which route is hanging after billing
   # Apply lazy import pattern like we did for billing routes
   ```

3. **HIGH** - Fix dashboard theme (1-2 hours)
   ```bash
   # Audit dashboard components
   # Apply same Tailwind classes as main site
   ```

4. **MEDIUM** - Replace dashboard mock data (1 hour)
   ```bash
   # Update dashboard/stats API to use real data
   # Remove fallback mock responses
   ```

### 🔍 DEBUGGING COMMANDS

```bash
# Check if backend is listening
lsof -i :3001

# Check backend process
ps aux | grep "tsx watch"

# Test OAuth callback manually
curl "http://localhost:3000/api/auth/callback?provider=github&code=test123"

# Test plans API
curl http://localhost:3000/api/billing/plans

# Check environment variables
cat .env | grep -E "GITHUB|GOOGLE|NEXTAUTH"
```

### 📝 TEST RESULTS ANALYSIS

From your test run:
- **OAuth**: 10/12 passing (83%) - 2 backend tests fail because backend not running
- **Onboarding**: 10/10 passing (100%) ✅
- **Payments**: 4/13 passing (31%) - Most failures due to auth token extraction issues

**Next Test Run Expected**: After fixing OAuth and backend, should reach 90%+ pass rate.

### 🎯 GOAL

1. Backend listening on port 3001
2. OAuth working for both GitHub and Google
3. Dashboard matches main site theme
4. Dashboard shows real user data
5. 90%+ test pass rate

---

**Generated**: 2025-10-12
**Session Context**: Backend billing routes fixed with lazy imports. OAuth redirect URI hardcoded. Dashboard needs theme + data fixes.
