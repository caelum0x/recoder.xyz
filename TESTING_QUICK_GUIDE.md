# 🧪 Quick Testing Guide - CLI Auth & Premium Features

## 🚀 Start Services

### Terminal 1: Backend
```bash
cd /Users/arhansubasi/recoder.xyz/backend
npm run dev
# Should start on port 3001
```

### Terminal 2: Frontend
```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
# Should start on port 3000
```

---

## ✅ Test Checklist

### 1. Premium Settings Page
```bash
# Open in browser
open http://localhost:3000/settings/premium

✓ Page loads without errors
✓ Shows "Premium Settings" header
✓ Displays plan overview
✓ Shows usage metrics
✓ API Keys section visible
✓ CLI Sessions section visible
✓ Quick action cards visible
```

### 2. API Key Generation
```
1. Click "New Key" button
2. Enter name: "Test Key 1"
3. Click "Create"

✓ Loading state shows
✓ Success message appears (green background)
✓ Full key displayed with rck_live_ prefix
✓ Copy button present
✓ Show/hide eye icon works
✓ Click copy - "Copied!" feedback
✓ Click "Done" - key hides
✓ Key appears in list with prefix only
✓ Shows "Used 0 times"
```

### 3. API Key Revocation
```
1. Find key in list
2. Click trash icon (red)
3. Confirm dialog appears
4. Click "OK"

✓ Key disappears from list
✓ Page refreshes automatically
✓ Key count decrements
```

### 4. Premium Status API
```bash
# Test API endpoint directly
curl http://localhost:3000/api/premium/status \
  -H "Cookie: $(cat cookies.txt)" \
  -H "Content-Type: application/json"

✓ Returns JSON response
✓ Includes user data
✓ Includes subscription info
✓ Includes apiKeys array
✓ Includes cliSessions array
✓ Includes usage stats
```

### 5. CLI Authentication (if CLI installed)
```bash
# In terminal
recoder auth login

✓ Shows device code
✓ Shows user code
✓ Shows browser URL
✓ "Waiting for authorization..." message

# In browser
✓ URL opens /cli/auth page
✓ Shows device info
✓ "Approve" button visible
✓ Click approve - success message

# Back in terminal
✓ "Authenticated successfully!" message
✓ Token saved locally
✓ Can now run CLI commands

# In browser /settings/premium
✓ New session appears in CLI Sessions
✓ Shows device name
✓ Shows "Active" badge
✓ Shows last used time
```

### 6. Session Management
```
# In browser /settings/premium

1. Find session in CLI Sessions list
2. Click trash icon
3. Confirm

✓ Session disappears
✓ Count updates

# Click "Revoke All" button
✓ Confirmation dialog appears
✓ All sessions removed
✓ Shows "No CLI sessions" message
```

---

## 🐛 Common Issues & Fixes

### Issue 1: "Unauthorized" on API calls
**Fix:**
- Make sure you're logged in
- Check browser cookies
- Verify NEXTAUTH_SECRET is set
- Clear browser cache and re-login

### Issue 2: Backend not responding
**Fix:**
```bash
cd backend
# Check if running
lsof -i :3001

# Check logs
npm run dev 2>&1 | tee backend.log

# Restart
npm run dev
```

### Issue 3: Frontend build errors
**Fix:**
```bash
cd app
# Clear cache
rm -rf .next
rm -rf node_modules
npm install
npm run dev
```

### Issue 4: Database errors
**Fix:**
```bash
cd backend
# Run migrations
npx prisma migrate dev
npx prisma generate

# Check connection
npx prisma studio
```

### Issue 5: TypeScript errors
**Fix:**
```bash
cd app
# Check for errors
npx tsc --noEmit

# Fix import paths
# Make sure all components use correct imports
```

---

## 📝 Manual Test Scenarios

### Scenario 1: Free User Limits
```
1. Sign up new account (free plan)
2. Visit /settings/premium
3. Try to create 2 API keys

Expected:
✓ First key created successfully
✓ Second key blocked with error
✓ "Upgrade" prompt shown
✓ Click upgrade → redirects to /pricing
```

### Scenario 2: Pro User Features
```
1. Upgrade account to Pro
2. Visit /settings/premium
3. Create multiple API keys

Expected:
✓ Can create up to 10 keys
✓ No upgrade prompt
✓ Premium badge visible
✓ Enhanced features available
```

### Scenario 3: Session Expiry
```
1. Create CLI session
2. Wait 30 days (or manually update DB)
3. Refresh /settings/premium

Expected:
✓ Session shows "Expired" badge
✓ Gray background instead of white
✓ Cannot be used for API calls
✓ CLI must re-authenticate
```

### Scenario 4: Multiple Devices
```
1. Authenticate CLI on Mac
2. Authenticate CLI on PC
3. Visit /settings/premium

Expected:
✓ Two sessions shown
✓ Different device names
✓ Different IP addresses
✓ Can revoke individually
✓ Can revoke all at once
```

---

## 🔍 Debug Commands

### Check API Keys in Database
```bash
cd backend
npx prisma studio
# Navigate to ApiKey table
# Verify keys are stored with hashes
```

### Check CLI Sessions in Database
```bash
# In Prisma Studio
# Navigate to CLISession table
# Check status, device info, expiry
```

### Test Backend Endpoints Directly
```bash
# Get premium status
curl http://localhost:3001/api/premium/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# List API keys
curl http://localhost:3001/api/premium/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN"

# Start CLI auth
curl -X POST http://localhost:3001/api/auth/cli/authorize \
  -H "Content-Type: application/json" \
  -d '{"deviceInfo": {"platform": "darwin"}}'
```

### Check Frontend API Routes
```bash
# Premium status
curl http://localhost:3000/api/premium/status \
  -H "Cookie: next-auth.session-token=YOUR_SESSION"

# List API keys
curl http://localhost:3000/api/user/api-keys \
  -H "Cookie: next-auth.session-token=YOUR_SESSION"
```

---

## 📊 Expected Behavior

### On Fresh Install
- No API keys
- No CLI sessions
- Free plan selected
- Usage: 0/100 requests
- Can create 1 API key

### After Creating API Key
- Key shown once with full value
- After "Done", only prefix visible
- Copy button works
- Revoke button appears
- Key usable immediately

### After CLI Authentication
- Session appears in list
- Shows correct device info
- Status: "Active"
- Can be revoked
- Token stored in CLI

### After Usage
- Usage count increments
- Last used time updates
- Cost calculated
- Visible in usage metrics

---

## 🎯 Success Criteria

✅ All pages load without errors
✅ All API calls succeed
✅ API keys generate correctly
✅ Keys stored securely (hashed)
✅ CLI authentication works
✅ Sessions tracked properly
✅ Revocation works immediately
✅ UI responsive on mobile
✅ Loading states visible
✅ Error messages user-friendly
✅ No console errors
✅ TypeScript compiles without errors

---

## 📞 Need Help?

### Quick Fixes
1. Restart both services
2. Clear browser cache
3. Delete .next folder
4. Run `npm install` in both app and backend
5. Check DATABASE_URL is set
6. Verify all .env variables

### Still Issues?
- Check IMPLEMENTATION_COMPLETE_CLI_PREMIUM.md
- Review API_ENDPOINTS_COMPLETE.md
- See CLI_AUTH_PREMIUM_MASTER_PLAN.md

---

## 🚀 Ready to Test!

**Start here:**
1. ✅ Start backend (port 3001)
2. ✅ Start frontend (port 3000)
3. ✅ Open http://localhost:3000/settings/premium
4. ✅ Create an API key
5. ✅ Test CLI authentication (if installed)
6. ✅ Verify sessions appear
7. ✅ Test revocation
8. ✅ Check all features work!

**Good luck! 🎉**
