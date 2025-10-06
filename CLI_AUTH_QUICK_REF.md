# CLI Authentication - Quick Reference Card

## 🎯 The Big Picture

```
USER TERMINAL (recoder CLI)  ←→  RECODER.XYZ (Website)  ←→  DATABASE
     ~/.recoder/auth.json         /api/auth/cli              users, sessions
```

**Goal:** Let users authenticate from terminal to use their recoder.xyz account

---

## ✅ Status: What's Done

### CLI Package (100% Complete)
- ✅ 4 authentication methods implemented
- ✅ Token refresh & session management
- ✅ All commands (`auth login`, `auth status`, etc.)
- ✅ Secure local storage
- ✅ Ready to use!

### Website (Needs Implementation)
- ❌ API endpoints at `/api/auth/cli`
- ❌ Authorization pages
- ❌ Database tables
- ❌ Token generation/validation

---

## 🔑 4 Authentication Methods

### 1. Web OAuth (Best for Desktop)
```bash
recoder auth login --web
```
- Opens browser → user signs in on website → CLI gets token
- Most secure, supports GitHub/Google/Discord
- **Requires:** `/api/auth/cli` endpoint, `/auth/cli` page

### 2. Device Flow (Best for SSH/Headless)
```bash
recoder auth login --device-flow
```
- Shows code → user enters on website → CLI polls for approval
- Perfect for servers without browser
- **Requires:** Device flow endpoints, `/device` page

### 3. API Key (Best for CI/CD)
```bash
recoder auth login --api-key rcli_...
```
- Long-lived token, no user interaction
- Great for automation
- **Requires:** API key validation, management UI

### 4. Email/Password (Legacy)
```bash
recoder auth login
```
- Traditional username/password
- Works everywhere
- **Requires:** Basic auth endpoint

---

## 📋 Implementation Priority

### Week 1: Core OAuth ⚡ CRITICAL
```
1. POST /api/auth/cli (code exchange)
2. GET  /auth/cli (authorization page)
3. Database: AuthCode table
4. Test with: recoder auth login --web
```

### Week 2: Device Flow
```
1. POST /api/auth/cli (device flow)
2. GET  /device (device auth page)  
3. Database: DeviceCode table
4. Test with: recoder auth login --device-flow
```

### Week 3: API Keys
```
1. POST /api/auth/cli (validate token)
2. GET  /settings/api-keys (management UI)
3. Database: ApiKey table
4. Test with: recoder auth login --api-key
```

---

## 🗄️ Database Tables Needed

```sql
AuthCode     - OAuth codes (temp, 10 min)
DeviceCode   - Device flow codes (temp, 15 min)
ApiKey       - API keys (long-lived)
Session      - User sessions (30 days)
```

Add to Prisma schema, then:
```bash
prisma migrate dev --name add_cli_auth
prisma generate
```

---

## 🔌 API Endpoints Required

### Main Endpoint: `/api/auth/cli`
```typescript
POST /api/auth/cli
  Actions:
  - exchange_code    → OAuth code → tokens
  - device_flow      → Generate device code
  - device_token     → Poll device authorization
  - validate_token   → Validate API key
  - refresh_token    → Refresh access token
  - revoke_token     → Logout

GET /api/auth/cli
  → OAuth authorization page
```

### Supporting Endpoints
```
GET  /auth/cli               → Authorization UI
GET  /device                 → Device code entry
GET  /settings/api-keys      → API key management
POST /api/auth/keys/generate → Generate API key
POST /api/auth/keys/revoke   → Revoke API key
```

---

## 🧪 Testing Commands

```bash
# Test Web OAuth
recoder auth login --web

# Test Device Flow  
recoder auth login --device-flow

# Test API Key
recoder auth login --api-key rcli_...

# Check Status
recoder auth status

# View Sessions
recoder auth sessions --list

# Logout
recoder auth logout
```

---

## 📁 Files to Create

### API Routes
```
/app/api/auth/cli/route.ts           ← Main CLI auth endpoint
/app/api/auth/device/authorize/route.ts
/app/api/auth/keys/route.ts
/app/api/auth/keys/generate/route.ts
/app/api/auth/keys/revoke/route.ts
```

### Pages
```
/app/app/auth/cli/page.tsx           ← OAuth authorization UI
/app/app/device/page.tsx             ← Device code entry
/app/app/settings/api-keys/page.tsx  ← API key management
```

### Helper Functions
```
/app/lib/auth/auth-codes.ts          ← OAuth code helpers
/app/lib/auth/device-flow.ts         ← Device flow helpers
/app/lib/auth/api-keys.ts            ← API key helpers
/app/lib/auth/tokens.ts              ← JWT token helpers
```

---

## 🎨 User Experience

### First Time User
```
$ recoder generate "React app"

⚠️  You are not logged in!
💡 Run: recoder auth login --web

$ recoder auth login --web

🌐 Opening recoder.xyz...
⏳ Waiting for authentication...
✅ Logged in as john@example.com!
```

### Returning User
```
$ recoder generate "Next.js app"

📊 Using your PRO plan
🤖 Model: Claude Sonnet
⚡ Generating...
```

### Quota Warning
```
$ recoder generate "another app"

⚠️  Quota: 9,800/10,000 (98% used)
💡 Upgrade: recoder auth upgrade --plan pro
```

---

## 🔒 Security Checklist

- ✅ JWT tokens (signed & verified)
- ✅ HTTPS only in production
- ✅ State parameter (CSRF protection)
- ✅ Token expiration (30 days)
- ✅ Refresh tokens (90 days)
- ✅ Secure file permissions (0600)
- ✅ API key hashing (bcrypt)
- ✅ Rate limiting per plan

---

## 🚀 3-Hour Quick Start

### Hour 1: Basic OAuth
```bash
# 1. Create main endpoint
touch app/api/auth/cli/route.ts

# 2. Implement code exchange
# 3. Create authorization page
touch app/app/auth/cli/page.tsx

# 4. Test
recoder auth login --web
```

### Hour 2: Device Flow
```bash
# 1. Add device flow to endpoint
# 2. Create device page
touch app/app/device/page.tsx

# 3. Test
recoder auth login --device-flow
```

### Hour 3: API Keys
```bash
# 1. Add API key validation
# 2. Create management UI
touch app/app/settings/api-keys/page.tsx

# 3. Test
# Generate key → Test login
```

---

## 📊 Success Metrics

After implementation, you should see:

✅ Users can authenticate from CLI
✅ Quota syncs between website & CLI  
✅ Sessions work across platforms
✅ API keys enable automation
✅ Device flow works on SSH servers

---

## 💡 Pro Tips

1. **Start with OAuth** - Most users will use this
2. **Test as you go** - Don't wait until end
3. **Copy from NextAuth** - You already have similar code
4. **Use existing DB** - Leverage current user table
5. **Add logging** - Track auth attempts for debugging

---

## 📚 Reference Docs

- **Your CLI code:** `/packages/cli/src/services/auth-service.ts`
- **Your auth lib:** `/lib/auth.ts`, `/lib/api-auth.ts`
- **OAuth 2.0:** https://oauth.net/2/
- **Device Flow:** https://oauth.net/2/device-flow/
- **NextAuth:** https://next-auth.js.org/

---

## 🎯 Summary

**CLI is ready!** You just need to build the website endpoints.

**Minimum to launch:**
1. POST /api/auth/cli with code exchange
2. GET /auth/cli authorization page
3. Token generation & validation

That's it! The rest can be added incrementally.

**Estimated Time:** 
- Minimum viable: 3-4 hours
- Full implementation: 1-2 weeks
- Production ready: 2-3 weeks

🚀 **Your CLI already has everything it needs - now connect it to your website!**
