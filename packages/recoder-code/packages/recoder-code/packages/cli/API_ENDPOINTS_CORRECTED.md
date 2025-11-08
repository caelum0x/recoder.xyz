# ✅ CORRECTED API Endpoint Mapping

## Backend API: https://api.recoder.xyz

---

## Authentication Endpoints (UPDATED)

| CLI Method | Endpoint | Method | Status |
|------------|----------|--------|--------|
| `requestDeviceCode()` | `/api/auth/cli/authorize` | POST | ✅ **CORRECTED** |
| `pollDeviceAuthorization()` | `/api/auth/cli/token` | GET | ✅ **CORRECTED** |
| `setOpenRouterApiKey()` | `/api/user/openrouter` | PUT | ✅ **CORRECTED** |
| `getQuota()` | `/api/user/quota` | GET | ✅ UNCHANGED |

---

## AI Service Endpoints (UPDATED)

| CLI Method | Endpoint | Method | Status |
|------------|----------|--------|--------|
| `complete()` | `/api/cli/ai/complete` | POST | ✅ CORRECT |
| `generateCode()` | `/api/cli/ai/complete` | POST | ✅ CORRECT |
| `chat()` | `/api/cli/ai/complete` | POST | ✅ CORRECT |
| `getUsageStats()` | `/api/cli/ai/usage` | GET | ✅ **CORRECTED** |
| `getModelRecommendations()` | `/api/cli/ai/models` | GET | ✅ **CORRECTED** |
| `hasBudget()` | `/api/cli/ai/budget` | GET | ✅ **NEW** |

---

## Changes Made

### 1. Base URL
```diff
- const RECODER_API_BASE = 'https://recoder.xyz';
+ const RECODER_API_BASE = 'https://api.recoder.xyz';
```

### 2. Device Flow - Request Code
```diff
- POST /api/auth/cli (action: device_flow)
+ POST /api/auth/cli/authorize
```

**Request:**
```json
{
  "client_id": "recoder-code",
  "scope": "cli:full profile",
  "deviceInfo": {
    "platform": "darwin",
    "hostname": "users-macbook"
  }
}
```

### 3. Device Flow - Poll Token
```diff
- POST /api/auth/cli (action: device_token)
+ GET /api/auth/cli/token
```

**Headers:**
```
X-Device-Code: <device_code>
X-Client-Id: recoder-code
```

**Response:**
```json
{
  "token": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "..."
  },
  "user": {
    "id": "...",
    "email": "...",
    "subscription_plan": "pro"
  },
  "status": "pending|approved|denied"
}
```

### 4. Set OpenRouter API Key
```diff
- POST /api/user/openrouter
+ PUT /api/user/openrouter
```

### 5. Get Usage Stats
```diff
- GET /api/user/usage
+ GET /api/cli/ai/usage
```

### 6. Get Model Recommendations
```diff
- GET /api/ai/recommend-models
+ GET /api/cli/ai/models
```

### 7. Check Budget (NEW)
```
+ GET /api/cli/ai/budget
```

**Response:**
```json
{
  "hasBudget": true,
  "remainingBudget": 17.23,
  "monthlyLimit": 17.50,
  "percentUsed": 1.5
}
```

---

## Complete Endpoint List

### Authentication (Your Backend)

```
POST   /api/auth/cli/authorize           ✅ Device flow start
GET    /api/auth/cli/token               ✅ Poll for token
POST   /api/auth/cli/verify-code         
GET    /api/auth/cli/verify              
GET    /api/auth/cli/sessions            
DELETE /api/auth/cli/session/:id         
DELETE /api/auth/cli/sessions/all        
PUT    /api/user/openrouter              ✅ Set API key
GET    /api/user/quota                   ✅ Get quota
```

### AI Service (Your Backend)

```
POST   /api/cli/ai/complete              ✅ Generate code
GET    /api/cli/ai/budget                ✅ Check budget
GET    /api/cli/ai/usage                 ✅ Usage stats
GET    /api/cli/ai/models                ✅ List models
GET    /api/cli/ai/pricing               
```

---

## Code Verification

### RecoderAuthService.ts

```typescript
// Line 13
const RECODER_API_BASE = 'https://api.recoder.xyz';

// Line 494 - requestDeviceCode()
await fetch(`${RECODER_API_BASE}/api/auth/cli/authorize`, {
  method: 'POST',
  body: JSON.stringify({
    client_id: CLIENT_ID,
    scope: 'cli:full profile',
    deviceInfo: { platform: process.platform, hostname: os.hostname() }
  })
});

// Line 522 - pollDeviceAuthorization()
await fetch(`${RECODER_API_BASE}/api/auth/cli/token`, {
  method: 'GET',
  headers: {
    'X-Device-Code': deviceCode,
    'X-Client-Id': CLIENT_ID,
  }
});

// Line 330 - setOpenRouterApiKey()
await fetch(`${RECODER_API_BASE}/api/user/openrouter`, {
  method: 'PUT',  // Changed from POST
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ openRouterApiKey: apiKey })
});
```

### RecoderAIService.ts

```typescript
// Line 8
const RECODER_API_BASE = 'https://api.recoder.xyz';

// Line 124, 185, 235 - All AI methods
await fetch(`${RECODER_API_BASE}/api/cli/ai/complete`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ prompt, systemPrompt, model, maxTokens, temperature })
});

// Line 280 - getUsageStats()
await fetch(`${RECODER_API_BASE}/api/cli/ai/usage`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Line 310 - getModelRecommendations()
await fetch(`${RECODER_API_BASE}/api/cli/ai/models?task=${task}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// NEW - hasBudget()
await fetch(`${RECODER_API_BASE}/api/cli/ai/budget`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Test Commands

```bash
# Test base URL is correct
curl https://api.recoder.xyz/api/health

# Test device flow
curl -X POST https://api.recoder.xyz/api/auth/cli/authorize \
  -H "Content-Type: application/json" \
  -d '{"client_id":"recoder-code","scope":"cli:full profile","deviceInfo":{"platform":"darwin"}}'

# Test AI complete (with token)
curl -X POST https://api.recoder.xyz/api/cli/ai/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt":"test","maxTokens":100}'

# Test usage
curl -X GET https://api.recoder.xyz/api/cli/ai/usage \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test budget
curl -X GET https://api.recoder.xyz/api/cli/ai/budget \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test models
curl -X GET https://api.recoder.xyz/api/cli/ai/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✅ Status

**All endpoints now correctly mapped to:**
- **Base URL**: `https://api.recoder.xyz` ✅
- **Auth endpoints**: `/api/auth/cli/*` ✅
- **AI endpoints**: `/api/cli/ai/*` ✅
- **User endpoints**: `/api/user/*` ✅

**Files Updated:**
- ✅ `src/services/RecoderAIService.ts`
- ✅ `src/services/RecoderAuthService.ts`

**Date**: 2024-10-19  
**Version**: 2.5.0 (corrected)
