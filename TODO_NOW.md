# ✅ TODO NOW - Action Items

## 🔥 DO THESE RIGHT NOW (Critical - 1 Hour)

### 1. Update OAuth Redirect URIs (5 minutes)

**GitHub:**
1. Go to: https://github.com/settings/developers
2. Click your OAuth app (Client ID: `Iv23liwzwgaRkVKkGlpu`)
3. Under "Authorization callback URL", add:
   - `http://localhost:3002/api/auth/callback/github`
   - `https://recoder.xyz/api/auth/callback/github`
4. Save

**Google:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client
3. Under "Authorized redirect URIs", add:
   - `http://localhost:3002/api/auth/callback/google`
   - `https://recoder.xyz/api/auth/callback/google`
4. Save

### 2. Test OAuth Flows (5 minutes)

```bash
# Open browser to:
http://localhost:3002/auth/signin

# Click "Continue with GitHub"
# Should redirect to GitHub → authorize → redirect back

# Click "Continue with Google"  
# Should redirect to Google → authorize → redirect back
```

### 3. Fix Remaining API Routes (30 minutes)

**Run this to find all files:**
```bash
cd /Users/arhansubasi/recoder.xyz/app
grep -r "getServerSession" app/api --include="*.ts" | cut -d: -f1 | sort -u
```

**For each file, replace:**
```typescript
// OLD:
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const session = await getServerSession(authOptions);
if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// NEW:
import { requireAuth } from '@/lib/auth-helpers';

const authResult = await requireAuth();
if (authResult.error) {
  return authResult.response;
}

const { user } = authResult;
// Now use: user.id, user.email, user.name
```

### 4. Test Backend Connection (10 minutes)

```bash
# Terminal 1: Start backend
cd /Users/arhansubasi/recoder.xyz/backend
npm run dev

# Terminal 2: App is already running
# (on port 3002)

# Terminal 3: Test health
curl http://localhost:3001/health
curl http://localhost:3002/api/health
```

### 5. Test Complete User Flow (10 minutes)

1. Go to: http://localhost:3002/auth/signup
2. Sign up with email
3. Complete onboarding
4. Check dashboard loads
5. Check database for new user:
```bash
# Connect to database and check
SELECT email, "subscriptionPlan", "onboardingStep" FROM users ORDER BY "createdAt" DESC LIMIT 1;
```

---

## 📋 DO TODAY (Important - 2-3 Hours)

### Update Settings Pages

**Files to update:**
```
app/settings/api-keys/page.tsx
app/settings/profile/page.tsx
app/settings/security/page.tsx
app/settings/account/page.tsx
```

**Pattern:**
```typescript
// Add at top:
import { useSession } from '@/lib/auth-client';

// In component:
const { data: session, isPending } = useSession();

if (isPending) return <Loading />;
if (!session) redirect('/auth/signin');
```

### Implement API Key Management

**Complete flow:**
1. User goes to `/settings/api-keys`
2. Clicks "Create New Key"
3. Modal opens, user enters name
4. Frontend calls `/api/user/api-keys` POST
5. App API calls backend via `backendClient`
6. Backend generates key, encrypts, stores
7. Backend returns key (only time shown)
8. Frontend displays key with "copy" button
9. User copies key, modal shows warning
10. Key list refreshes

### Test Subscription Flow

1. Sign in as a user
2. Go to `/pricing`
3. Click "Start Monthly"
4. Should redirect to `/checkout?plan=monthly`
5. Page should load with plan details
6. (Will need Paddle credentials to test actual payment)

---

## 🎯 DO THIS WEEK (1-2 Days Each)

### Monday: Backend Integration
- [ ] Update all API routes to use `backendClient`
- [ ] Test each endpoint end-to-end
- [ ] Verify error handling
- [ ] Add logging

### Tuesday: API Key System
- [ ] Complete API key management UI
- [ ] Test key generation
- [ ] Test key usage in CLI (when ready)
- [ ] Add key usage stats

### Wednesday: Subscription System
- [ ] Get Paddle credentials
- [ ] Test Paddle checkout
- [ ] Implement webhook handler
- [ ] Test subscription updates
- [ ] Verify database updates

### Thursday: Device Management
- [ ] Create device management page
- [ ] Test device registration
- [ ] Test remote logout
- [ ] Add device nicknames

### Friday: Usage Tracking
- [ ] Implement usage tracking API
- [ ] Create usage dashboard
- [ ] Add cost calculation
- [ ] Test quota enforcement

---

## 🔧 MAINTENANCE TASKS

### Daily
- [ ] Check error logs
- [ ] Monitor API response times
- [ ] Review new signups
- [ ] Test critical flows

### Weekly
- [ ] Review usage stats
- [ ] Check subscription renewals
- [ ] Update dependencies
- [ ] Backup database

---

## 📝 NOTES

### Working Right Now ✅
- Better Auth (email/password)
- Sign up flow
- Onboarding
- Dashboard
- Database persistence
- Session management

### Needs OAuth URIs ⚠️
- GitHub OAuth
- Google OAuth

### Needs Implementation ⚠️
- API key management (UI complete, backend integration needed)
- Subscription webhooks
- Usage tracking dashboard
- Device management
- Cost analytics

### Ready for Testing 🧪
- Paddle checkout (needs credentials)
- Backend client (needs endpoint testing)
- Settings pages (needs auth updates)

---

## 🚀 QUICK COMMANDS

### Start Development
```bash
# Terminal 1
cd /Users/arhansubasi/recoder.xyz/backend && npm run dev

# Terminal 2
cd /Users/arhansubasi/recoder.xyz/app && npm run dev
```

### Check Logs
```bash
# App logs
tail -f /Users/arhansubasi/recoder.xyz/app/.next/trace

# Backend logs
tail -f /Users/arhansubasi/recoder.xyz/backend/src/logs/combined.log
```

### Database
```bash
# Prisma Studio (view/edit data)
cd /Users/arhansubasi/recoder.xyz/app
npx prisma studio

# Run migrations
npx prisma migrate dev

# Generate client
npx prisma generate
```

### Testing
```bash
# Test API endpoint
curl http://localhost:3002/api/health

# Test with auth
curl http://localhost:3002/api/user/profile \
  -H "Cookie: your-session-cookie"
```

---

## ❓ IF YOU GET STUCK

### NextAuth Error?
→ Check `CURRENT_STATUS.md` "Known Issues"
→ Run: `grep -r "next-auth" app/ | wc -l` (should be 0)

### OAuth Not Working?
→ Check redirect URIs match exactly
→ Check client ID and secret in `.env`
→ Check browser console for errors

### API Route 401?
→ Check using `requireAuth()` not `getServerSession()`
→ Check session exists: `console.log(authResult)`
→ Check Better Auth setup in `lib/auth-config.ts`

### Backend Connection Failed?
→ Check backend is running: `curl http://localhost:3001/health`
→ Check `BACKEND_URL` in `.env`
→ Check `backendClient` import

### Database Error?
→ Run `npx prisma generate`
→ Check `DATABASE_URL` in `.env`
→ Run `npx prisma db push`

---

## 📚 REFERENCE

### Key Files
- `IMPLEMENTATION_ROADMAP.md` - Full plan
- `CURRENT_STATUS.md` - What's done/todo
- `BETTER_AUTH_IMPLEMENTATION.md` - Auth details

### Documentation
- Better Auth: https://better-auth.com/docs
- Next.js: https://nextjs.org/docs
- Prisma: https://prisma.io/docs

---

**START WITH #1 (OAuth URIs) - Takes 5 minutes!**
