# 🚀 Pre-Launch Fix Plan

## Current Status

### ✅ What's REAL and Working
1. **Settings System** ✅
   - Database persistence (8 tables in PostgreSQL)
   - API endpoints for profile, editor, AI, appearance, security, notifications
   - Settings UI in both app folder and recoder-web
   - Cross-platform sync working
   - Load/save functionality complete

2. **Authentication** ✅
   - Better-auth integration
   - Session management
   - User profiles in database

3. **Basic Features** ✅
   - User registration/login
   - Profile management
   - API key management (AI providers)

### ❌ What's MOCK (Must Fix Before Launch)

#### 1. Settings Pages with Fake Functionality
- **Integrations Page** - Shows Slack, Discord, webhooks but doesn't actually connect
- **Data Export** - Button exists but doesn't export anything
- **2FA Settings** - Toggle exists but no TOTP/QR code implementation
- **Session Management** - Shows mock sessions, not real active sessions
- **Connected Accounts** - Shows GitHub/Google toggles but no OAuth flow

#### 2. CLI Commands Not Implemented
- **Agent system** - `recoder agent create @expert` doesn't exist
- **File operations** - `recoder file create` not implemented
- **Sandbox mode** - `recoder sandbox enable` doesn't exist

---

## 🎯 Priority Fix List

### Priority 1: Remove/Hide Mock Features (1 hour)
**Impact:** HIGH - Prevents user confusion and broken promises

**Tasks:**
1. **Remove fake integrations**
   - Delete Slack, Discord, webhooks from integrations page
   - Keep only GitHub/Google (which you have API keys for)
   - Add "Coming Soon" section for future integrations

2. **Remove data export button**
   - Hide export functionality until implemented
   - Or show "Coming Soon" message

3. **Simplify 2FA**
   - Remove 2FA toggle from settings
   - Add to roadmap as "Coming Soon"
   - Or implement basic email 2FA (simpler than TOTP)

4. **Fix session management**
   - Either show real active sessions from database
   - Or remove the "Active Sessions" section entirely

5. **Fix connected accounts**
   - Either implement GitHub/Google OAuth properly
   - Or remove the toggles and show "OAuth Coming Soon"

**Files to modify:**
- `/app/app/settings/integrations/page.tsx` - Simplify to show only what exists
- `/app/app/settings/security/page.tsx` - Remove 2FA or implement simple version
- `/app/app/settings/account/page.tsx` - Fix or remove data export

---

### Priority 2: Implement GitHub/Google OAuth (2-3 hours)
**Impact:** HIGH - You already have API keys, just need to wire it up

**Tasks:**
1. **GitHub OAuth Flow**
   - Create `/api/auth/github/callback` route
   - Handle OAuth token exchange
   - Store GitHub token in database
   - Show connected status in settings

2. **Google OAuth Flow**
   - Create `/api/auth/google/callback` route
   - Handle OAuth token exchange
   - Store Google token in database
   - Show connected status in settings

3. **Update Settings Page**
   - Show real connection status
   - Allow disconnect/reconnect
   - Display connected account info (username, email)

**Better-auth likely has built-in OAuth support - check docs**

---

### Priority 3: Make Sessions Real (1 hour)
**Impact:** MEDIUM - Shows professional security features

**Tasks:**
1. Query actual sessions from Better-auth session table
2. Show device/browser info from user agent
3. Show IP address and location
4. Allow session revocation (sign out other devices)

**Implementation:**
```typescript
// Get real sessions from database
const sessions = await prisma.session.findMany({
  where: { userId: session.user.id },
  orderBy: { createdAt: 'desc' }
});

// Parse user agent for device info
const parser = new UAParser(session.userAgent);
const device = parser.getBrowser().name + ' on ' + parser.getOS().name;
```

---

### Priority 4: Implement Basic Data Export (1-2 hours)
**Impact:** MEDIUM - Good for compliance (GDPR)

**Tasks:**
1. Create `/api/user/export` endpoint
2. Export user data as JSON:
   - Profile information
   - Settings
   - Usage history
   - API keys (masked)
3. Download as `recoder-data-YYYY-MM-DD.json`

**Implementation:**
```typescript
// Export user data
const userData = {
  profile: await getUserProfile(userId),
  settings: await getAllSettings(userId),
  usage: await getUsageHistory(userId),
  createdAt: user.createdAt,
  exportedAt: new Date()
};

return new Response(JSON.stringify(userData, null, 2), {
  headers: {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="recoder-data-${date}.json"`
  }
});
```

---

### Priority 5: Simplify Integrations Page (30 minutes)
**Impact:** HIGH - Sets realistic expectations

**Current:** Shows 6 integrations (GitHub, Slack, Discord, GitLab, VS Code, Webhooks)

**Proposed:**

```tsx
// Show only what exists
const realIntegrations = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect your GitHub account',
    icon: Github,
    connected: true, // Real OAuth status
    canConnect: true
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Sign in with Google',
    icon: Chrome,
    connected: false, // Real OAuth status
    canConnect: true
  }
];

const comingSoon = [
  { name: 'Slack', icon: MessageSquare },
  { name: 'Discord', icon: MessageSquare },
  { name: 'GitLab', icon: GitBranch },
  { name: 'Webhooks', icon: Webhook }
];
```

---

## 🔧 CLI Commands Implementation (Optional for Launch)

### Option A: Implement Full CLI Commands (6-8 hours)
Build out the full agent system, file operations, and sandbox mode as described in your original plan.

### Option B: Defer to Post-Launch (Recommended)
Focus on making the web platform solid, ship it, then add CLI features based on user feedback.

**Reasoning:**
- CLI features are advanced/power-user features
- Web platform is what most users will see first
- Better to ship a polished core than rush advanced features
- Can add CLI features in v1.1, v1.2, etc.

---

## 📋 Recommended Launch Checklist

### Must Fix Before Launch ✅
- [ ] Remove fake integrations (Slack, Discord, webhooks)
- [ ] Remove or implement 2FA properly
- [ ] Fix session management (show real sessions or remove)
- [ ] Implement GitHub OAuth (you have the keys)
- [ ] Implement Google OAuth (you have the keys)
- [ ] Implement data export or remove button
- [ ] Test all settings save/load correctly
- [ ] Verify cross-platform sync works

### Nice to Have (Can Ship Without) ⚠️
- [ ] CLI agent system
- [ ] CLI file operations
- [ ] Sandbox mode
- [ ] Webhook support
- [ ] Additional OAuth providers
- [ ] TOTP-based 2FA

### Post-Launch Roadmap 🗺️
1. **Week 1-2:** Monitor usage, fix bugs
2. **Week 3-4:** Implement top user requests
3. **Month 2:** Add CLI advanced features
4. **Month 3:** Add integrations based on demand

---

## 🎯 My Recommendation

**Focus on these 4 tasks (4-5 hours total):**

1. **Clean up integrations page** (30 min)
   - Remove Slack, Discord, webhooks
   - Keep GitHub/Google with "Connect" buttons
   - Add "More integrations coming soon" section

2. **Implement GitHub OAuth** (1.5 hours)
   - Wire up your existing GitHub API keys
   - Complete OAuth flow
   - Show connected status

3. **Implement Google OAuth** (1.5 hours)
   - Wire up your existing Google API keys
   - Complete OAuth flow
   - Show connected status

4. **Fix sessions + data export** (1.5 hours)
   - Show real sessions from database
   - Implement basic JSON data export
   - Remove 2FA section (add to roadmap)

**Result:** Clean, honest platform ready to launch with real features only.

---

## 🚀 Shipping Philosophy

> "Ship features that work, not features that pretend to work."

- Real GitHub/Google OAuth > Fake Slack integration
- Real data export > Fake webhook config
- Real settings persistence > Mock everything

Better to have **5 real features** than **15 fake ones**.

---

## Next Steps

**Tell me which approach you prefer:**

1. **Quick Clean** (1 hour) - Just remove all mock features, ship minimal but honest
2. **OAuth Implementation** (4-5 hours) - Remove mocks + implement real GitHub/Google OAuth
3. **Full Polish** (8-10 hours) - Everything above + CLI commands + 2FA

I recommend **Option 2** for a solid launch. What do you think?
