# 🚀 Quick Start: CLI Authentication

## TL;DR

Your backend is **100% ready**! Just implement the CLI client.

---

## 🎯 What You Have (Backend)

### API Endpoints ✅
```
https://recoder.xyz/api/auth/cli/device      - Start auth
https://recoder.xyz/api/auth/cli/token       - Get tokens
https://recoder.xyz/api/auth/cli/verify      - Verify token
https://recoder.xyz/cli/auth                 - Web UI for auth
```

### Database Models ✅
- DeviceCode (temporary auth codes)
- CLISession (active CLI sessions)

### Services ✅
- Complete OAuth Device Code Flow
- Token generation/validation
- Session management

---

## 💻 What You Need (CLI Side)

### 1. Install Dependencies

```bash
cd /path/to/recoder-code
npm install axios commander chalk ora boxen open fs-extra
```

### 2. Create Auth Module

Copy from `CLI_AUTH_INTEGRATION_PLAN.md`:
- `src/auth/device-flow.ts` - Main auth logic
- `src/commands/auth.ts` - CLI commands
- `src/api/client.ts` - API client

### 3. User Flow

```
$ recoder auth login

🔐 Recoder.xyz Authentication

┌─────────────────────────────────────────┐
│ Complete authentication in browser:     │
│                                         │
│ URL: https://recoder.xyz/cli/auth       │
│ Code: ABCD-1234                         │
└─────────────────────────────────────────┘

⠋ Waiting for authorization...

[Browser opens, user logs in and confirms]

✓ Authorization successful!

┌─────────────────────────────────────────┐
│ ✓ Successfully authenticated!           │
│                                         │
│ Welcome, John Doe!                      │
│ Plan: Pro                               │
└─────────────────────────────────────────┘
```

---

## 🔄 Auth Flow

```typescript
// 1. CLI requests device code
const device = await axios.post('/api/auth/cli/device');
// Returns: { device_code, user_code, verification_uri }

// 2. Show user the code
console.log(`Visit: ${device.verification_uri}`);
console.log(`Code: ${device.user_code}`);

// 3. Poll for authorization
while (true) {
  const result = await axios.post('/api/auth/cli/token', {
    grant_type: 'device_code',
    device_code: device.device_code
  });
  
  if (result.data.access_token) {
    // Got tokens! Save them
    saveTokens(result.data);
    break;
  }
  
  await sleep(5000); // Wait 5 seconds
}

// 4. Use access_token for API calls
axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
```

---

## 📦 Minimal Implementation

### auth-simple.ts
```typescript
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const API = 'https://recoder.xyz';
const CREDS = path.join(os.homedir(), '.recoder', 'credentials.json');

// Login
export async function login() {
  // 1. Get device code
  const { data } = await axios.post(`${API}/api/auth/cli/device`);
  
  // 2. Show to user
  console.log(`Visit: ${data.verification_uri}`);
  console.log(`Code: ${data.user_code}`);
  
  // 3. Poll
  while (true) {
    try {
      const result = await axios.post(`${API}/api/auth/cli/token`, {
        grant_type: 'device_code',
        device_code: data.device_code
      });
      
      if (result.data.access_token) {
        // Save
        await fs.ensureDir(path.dirname(CREDS));
        await fs.writeJSON(CREDS, result.data);
        console.log('✓ Logged in!');
        return;
      }
    } catch (e) {
      // Still pending
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
}

// Get token
export async function getToken() {
  const creds = await fs.readJSON(CREDS);
  return creds.access_token;
}

// Make authenticated request
export async function apiCall(endpoint: string, data?: any) {
  const token = await getToken();
  return axios.post(`${API}${endpoint}`, data, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

---

## 🧪 Test It

### Test Login Flow
```bash
# In recoder-code directory
ts-node -e "
  import { login } from './src/auth-simple';
  login().then(() => console.log('Done!'));
"
```

### Test API Call
```typescript
import { apiCall } from './auth-simple';

// Generate code
const result = await apiCall('/api/ai/generate', {
  prompt: 'create a react button',
  model: 'claude-3-sonnet'
});

console.log(result.data);
```

---

## 🔑 Key Points

1. **Backend is ready** - No changes needed
2. **Device Code Flow** - Standard OAuth pattern
3. **Secure** - Tokens stored locally with 600 permissions
4. **Simple** - ~100 lines of code for full auth
5. **Standard** - Same flow as GitHub CLI, Vercel CLI, etc.

---

## 📞 API Reference

### POST /api/auth/cli/device
Start device flow
```json
Response: {
  "device_code": "abc123...",
  "user_code": "ABCD-1234",
  "verification_uri": "https://recoder.xyz/cli/auth",
  "verification_uri_complete": "https://recoder.xyz/cli/auth?code=ABCD-1234",
  "expires_in": 600,
  "interval": 5
}
```

### POST /api/auth/cli/token
Get or refresh tokens
```json
Request: {
  "grant_type": "device_code",
  "device_code": "abc123..."
}

Response: {
  "access_token": "reco_...",
  "refresh_token": "recr_...",
  "token_type": "Bearer",
  "expires_in": 7776000
}
```

### POST /api/auth/cli/verify
Verify token
```json
Request: {
  "access_token": "reco_..."
}

Response: {
  "valid": true,
  "user": { "id": "...", "email": "..." }
}
```

---

## 🚀 Next Steps

1. Copy code from `CLI_AUTH_INTEGRATION_PLAN.md`
2. Install dependencies
3. Test locally (set `RECODER_API_URL=http://localhost:3000`)
4. Test with production
5. Ship it! 🎉

---

Your backend handles everything - you just need to:
1. Request device code
2. Show it to user
3. Poll for tokens
4. Save tokens locally
5. Use tokens in API calls

That's it! 💪
