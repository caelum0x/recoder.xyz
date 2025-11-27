# 🚀 Recoder.xyz REVISED Launch Strategy
## Free Platform + BYOK → Monetize Later

**Created:** January 17, 2025
**Status:** READY TO EXECUTE
**Strategy:** Growth First, Revenue Later

---

## 💡 The Winning Strategy: FREE + BYOK

### Why This Works
You're absolutely right - **nobody will pay just to use their own API keys**. That's like charging someone to use their own Netflix account on your TV.

**Instead:**
1. ✅ Make EVERYTHING free
2. ✅ Require users to bring API keys (zero cost for you)
3. ✅ Get 1,000+ users FAST
4. ✅ Build community and prove value
5. ✅ Monetize later when you have leverage

---

## 🎯 Phase 1: Free Launch (NOW - 3 Weeks)

### What Users Get (100% FREE)
- ✅ **Unlimited projects**
- ✅ **Full Web IDE access**
- ✅ **Complete CLI integration**
- ✅ **Web ↔ CLI sync** (your unique feature!)
- ✅ **All 40+ AI models** (via their OpenRouter/Anthropic/OpenAI keys)
- ✅ **Team collaboration** (share projects)
- ✅ **Priority features** (everything you built)
- ✅ **Community support** (Discord)

### What They Bring
- Just their API key from OpenRouter (~$5 credit = 500+ requests)
- Or use platform without AI (as a code editor)-- we do not have this functionality

### Value Proposition
```
"The only platform that combines Web IDE + Terminal CLI.
Start in browser. Download locally. Sync seamlessly.
100% Free. Forever."
```

---



## 🛠️ Critical Fixes Before Launch (FREE VERSION)

### Priority 1: Auth Routing (2-3 hours) 🔴
**TEST RIGHT NOW:**
```bash
# 1. Start both apps
cd app && npm run dev              # Port 3000
cd recoder-web && npm run dev      # Port 5173

# 2. Test flow:
# - Sign up at localhost:3000
# - Click "Open Web IDE"
# - Should land on localhost:5173 with session
```

**If broken, fix:**
- Session cookie sharing
- Redirect URLs
- Token passing

---

### Priority 2: API Key Management (4-5 hours) 🔴
**BUILD THIS:**

**1. Settings Page (`app/app/settings/api-keys/page.tsx`):**
```tsx
export default function ApiKeysPage() {
  return (
    <div>
      <h1>API Keys</h1>

      <Alert>
        Recoder.xyz is 100% free! You just need to bring your own API key
        from OpenRouter, Anthropic, or OpenAI.
      </Alert>

      <Tabs>
        <Tab label="OpenRouter (Recommended)">
          <OpenRouterSetup />
          {/* Links to openrouter.ai, shows how to get key */}
        </Tab>
        <Tab label="Anthropic">
          <AnthropicSetup />
        </Tab>
        <Tab label="OpenAI">
          <OpenAISetup />
        </Tab>
      </Tabs>

      <ApiKeyForm />
      <ApiKeyList />
    </div>
  );
}
```

**2. Backend Endpoints:**
```typescript
// app/app/api/user/api-keys/route.ts

POST /api/user/api-keys
{
  provider: 'openrouter' | 'anthropic' | 'openai',
  apiKey: 'sk-...',
  name?: 'My OpenRouter Key'
}

GET /api/user/api-keys
Response: [
  {
    id: '1',
    provider: 'openrouter',
    name: 'My OpenRouter Key',
    keyPrefix: 'sk-or-***',
    createdAt: '2025-01-17',
    lastUsed: '2025-01-17'
  }
]

DELETE /api/user/api-keys/:id
```

**3. Encryption:**
```typescript
// lib/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 chars
const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(encryptedData: string): string {
  const buffer = Buffer.from(encryptedData, 'base64');

  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
}
```

**4. Database Schema (add to Prisma):**
```prisma
model user_api_keys {
  id           String   @id @default(cuid())
  userId       String
  provider     String   // 'openrouter' | 'anthropic' | 'openai'
  name         String?
  keyPrefix    String   // First 8 chars for display
  encryptedKey String   // Encrypted full key
  lastUsed     DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  users        users    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**5. Integration with recoder-web:**
```typescript
// recoder-web: Before AI request
async function makeAIRequest(prompt: string) {
  // 1. Fetch user's API key from main app
  const response = await fetch(`${MAIN_APP_URL}/api/user/api-keys`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });

  const keys = await response.json();
  const userKey = keys[0]?.decryptedKey; // Backend decrypts

  if (!userKey) {
    // Prompt user to add key
    showApiKeySetupModal();
    return;
  }

  // 2. Use their key for AI request
  const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    headers: {
      'Authorization': `Bearer ${userKey}`,
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder.xyz'
    },
    body: JSON.stringify({...})
  });

  return aiResponse;
}
```

---

### Priority 3: Remove Payment System (1 hour) 🟢
**SIMPLIFY:**
- Remove Stripe integration (for now)
- Remove subscription tiers from UI
- Remove payment history pages
- Keep database schema (for future)

**OR keep it dormant:**
- Just hide payment UI
- Don't delete code
- Can re-enable later for managed keys tier

---

### Priority 4: Onboarding Flow (2-3 hours) 🟡
**After user signs up:**

```
Step 1: Welcome
"Welcome to Recoder.xyz! The free platform that combines Web IDE + Terminal CLI."
[Next]

Step 2: Add API Key
"To use AI features, add your API key from OpenRouter (recommended)."

Don't have one? [Get OpenRouter Key] (opens openrouter.ai)
Already have one? [Enter Key]

[Skip - I'll add it later]

Step 3: Quick Tour
"Here's how Recoder.xyz works..."
- Web IDE: Start projects in browser
- CLI: Download to local machine
- Sync: Push changes back seamlessly

[Start Building]
```

---

## 📋 Launch Checklist (Before Going Live)

### Technical
- [ ] Auth routing works (recoder.xyz ↔ recoder-web)
- [ ] API key management works (add, encrypt, use)
- [ ] Web IDE functional with user's API key
- [ ] CLI commands work (list, download, upload, sync)
- [ ] All links work (no 404s)
- [ ] Database backups enabled
- [ ] Error tracking (Sentry) configured
- [ ] Performance monitoring

### Content
- [ ] Landing page updated ("100% Free" messaging)
- [ ] Pricing page removed or shows "Free Forever"
- [ ] Documentation: How to get OpenRouter key
- [ ] FAQ: Why BYOK? How does it work?
- [ ] Tutorial video (3-5 min demo)
- [ ] Blog post announcing launch

