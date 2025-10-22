# 🌐 API Endpoints Reference - api.recoder.xyz

## 📍 Base URL
```
Production: https://api.recoder.xyz
Development: http://localhost:3001
```

All endpoints use JSON for request/response bodies.
All authenticated endpoints require `Authorization: Bearer {token}` header.

---

## 🔐 CLI Authentication Endpoints

### 1. Start Device Authorization
**Initiates the device code flow for CLI authentication**

```http
POST https://api.recoder.xyz/api/auth/cli/authorize
Content-Type: application/json

{
  "deviceInfo": {
    "platform": "darwin",
    "arch": "arm64",
    "hostname": "MacBook-Pro",
    "version": "1.0.0"
  }
}
```

**Response:**
```json
{
  "device_code": "abc123-def456",
  "user_code": "ABCD-1234",
  "verification_uri": "https://recoder.xyz/cli/auth",
  "verification_uri_complete": "https://recoder.xyz/cli/auth?code=ABCD-1234",
  "expires_in": 900,
  "interval": 5
}
```

---

### 2. Poll for Token
**CLI polls this endpoint until user authorizes**

```http
GET https://api.recoder.xyz/api/auth/cli/token?deviceCode={device_code}
```

**Response (Pending):**
```json
{
  "status": "pending",
  "message": "Authorization pending"
}
```

**Response (Success):**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription": "pro"
  }
}
```

---

### 3. Verify Token
**Check if CLI token is valid and get user info**

```http
GET https://api.recoder.xyz/api/auth/cli/verify
Authorization: Bearer {cli_token}
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "subscription": "pro"
  },
  "usage": {
    "today": 45,
    "month": 1234
  },
  "limits": {
    "dailyRequests": 200,
    "monthlyRequests": 5000
  }
}
```

---

### 4. List CLI Sessions
**Get all active CLI sessions for user**

```http
GET https://api.recoder.xyz/api/auth/cli/sessions
Authorization: Bearer {web_token}
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session_123",
      "deviceInfo": {
        "platform": "darwin",
        "hostname": "MacBook-Pro"
      },
      "status": "authorized",
      "createdAt": "2024-01-15T10:30:00Z",
      "lastUsedAt": "2024-01-15T14:20:00Z"
    }
  ]
}
```

---

### 5. Revoke Session
**Revoke a specific CLI session**

```http
DELETE https://api.recoder.xyz/api/auth/cli/session/{sessionId}
Authorization: Bearer {web_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

---

### 6. Revoke All Sessions
**Revoke all CLI sessions**

```http
DELETE https://api.recoder.xyz/api/auth/cli/sessions/all
Authorization: Bearer {web_token}
```

**Response:**
```json
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```

---

## 🤖 AI Service Endpoints

### 7. AI Completion
**Generate code or text using AI**

```http
POST https://api.recoder.xyz/api/cli/ai/complete
Authorization: Bearer {cli_token}
Content-Type: application/json

{
  "prompt": "Create a React login form",
  "systemPrompt": "You are an expert React developer",
  "model": "anthropic/claude-sonnet-4",
  "maxTokens": 4096,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "import React...",
    "model": "anthropic/claude-sonnet-4",
    "usage": {
      "inputTokens": 150,
      "outputTokens": 850,
      "totalTokens": 1000
    },
    "cost": 0.0135
  },
  "metadata": {
    "requestId": "req_abc123",
    "latency": 2350
  }
}
```

**Error (Budget Exceeded):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Monthly budget limit of $17.50 exceeded",
  "current": { "daily": 0.45, "monthly": 17.52 },
  "limits": { "daily": 0.58, "monthly": 17.50 },
  "resetAt": "2024-02-01T00:00:00Z"
}
```

---

### 8. Check Budget
**Check current budget status**

```http
GET https://api.recoder.xyz/api/cli/ai/budget
Authorization: Bearer {cli_token}
```

**Response:**
```json
{
  "success": true,
  "budget": {
    "allowed": true,
    "plan": "pro",
    "current": {
      "daily": 0.23,
      "monthly": 4.56
    },
    "remaining": {
      "daily": 0.35,
      "monthly": 12.94
    }
  }
}
```

---

### 9. Get Usage Stats
**Get detailed usage statistics**

```http
GET https://api.recoder.xyz/api/cli/ai/usage
Authorization: Bearer {cli_token}
```

**Response:**
```json
{
  "success": true,
  "usage": {
    "plan": "pro",
    "limits": {
      "monthlyCostLimit": 17.50,
      "dailyCostLimit": 0.58,
      "requestsPerDay": 200,
      "requestsPerMonth": 5000
    },
    "monthly": {
      "requests": 245,
      "tokens": 1250000,
      "cost": 4.56,
      "remaining": 12.94
    },
    "daily": {
      "requests": 12,
      "tokens": 45000,
      "cost": 0.23,
      "remaining": 0.35
    }
  }
}
```

---

### 10. List Available Models
**Get all AI models available for user's plan**

```http
GET https://api.recoder.xyz/api/cli/ai/models
Authorization: Bearer {cli_token}
```

**Response:**
```json
{
  "success": true,
  "plan": "pro",
  "defaultModel": "anthropic/claude-sonnet-4",
  "models": [
    {
      "id": "anthropic/claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "category": "pro",
      "pricing": { "input": 3.0, "output": 15.0 }
    },
    {
      "id": "google/gemini-2.0-flash",
      "name": "Gemini 2.0 Flash (Free)",
      "category": "free",
      "pricing": { "input": 0.0, "output": 0.0 }
    }
  ]
}
```

---

### 11. Get Pricing Info
**Get pricing for all models and plans**

```http
GET https://api.recoder.xyz/api/cli/ai/pricing
```

**Response:**
```json
{
  "success": true,
  "pricing": {
    "anthropic/claude-sonnet-4": { "input": 3.0, "output": 15.0 },
    "google/gemini-2.0-flash": { "input": 0.0, "output": 0.0 }
  },
  "plans": {
    "pro": {
      "monthlyCostLimit": 17.50,
      "dailyCostLimit": 0.58,
      "requestsPerDay": 200,
      "requestsPerMonth": 5000
    }
  }
}
```

---

## 📊 Plan Limits

| Plan | Price | AI Budget | Daily Limit | Requests/Day | Models |
|------|-------|-----------|-------------|--------------|--------|
| Free | $0 | $0 | $0 | 10 | gemini-2.0-flash only |
| Pro | $20 | **$17.50** | $0.58 | 200 | All 13 models |
| Premium | $100 | **$93.00** | $3.10 | 1,000 | All 13 models |

---

## 🤖 Available AI Models

### Top Tier
- `anthropic/claude-sonnet-4.5` - $3/$15 per 1M tokens
- `anthropic/claude-sonnet-4` - $3/$15 per 1M tokens

### Code Specialists
- `x-ai/grok-code-fast-1` - $0.5/$1 per 1M tokens
- `qwen/qwen3-coder-480b-a35b` - $0.8/$2.4 per 1M tokens

### Fast & Economical
- `x-ai/grok-4-fast` - $0.4/$0.8 per 1M tokens
- `google/gemini-2.5-flash` - $0.075/$0.3 per 1M tokens
- `google/gemini-2.0-flash` - **FREE**

### Advanced
- `google/gemini-2.5-pro` - $1.25/$5 per 1M tokens
- `openai/gpt-5` - $5/$15 per 1M tokens
- `openai/gpt-4.1-mini` - $0.15/$0.6 per 1M tokens

### Budget
- `deepseek/deepseek-v3-0324` - $0.27/$1.10 per 1M tokens
- `openai/gpt-oss-20b` - $0.10/$0.30 per 1M tokens
- `z-ai/glm-4.6` - $0.5/$1.5 per 1M tokens

---

## 🧪 Example Usage

### cURL Examples

**Start auth flow:**
```bash
curl -X POST https://api.recoder.xyz/api/auth/cli/authorize \
  -H "Content-Type: application/json" \
  -d '{"deviceInfo":{"platform":"darwin","arch":"arm64"}}'
```

**Make AI request:**
```bash
curl -X POST https://api.recoder.xyz/api/cli/ai/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a hello world in Python"}'
```

**Check budget:**
```bash
curl https://api.recoder.xyz/api/cli/ai/budget \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.recoder.xyz',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Generate code
const response = await client.post('/api/cli/ai/complete', {
  prompt: 'Create a login form',
  model: 'anthropic/claude-sonnet-4'
});

console.log(response.data.data.content);
console.log(`Cost: $${response.data.data.cost}`);
```

---

### Python

```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

response = requests.post(
    'https://api.recoder.xyz/api/cli/ai/complete',
    headers=headers,
    json={
        'prompt': 'Create a login form',
        'model': 'anthropic/claude-sonnet-4'
    }
)

data = response.json()
print(data['data']['content'])
print(f"Cost: ${data['data']['cost']}")
```

---

## ❌ Error Responses

### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing token"
}
```

### 429 Too Many Requests
```json
{
  "error": "rate_limit_exceeded",
  "message": "Daily budget limit exceeded",
  "resetAt": "2024-01-16T00:00:00Z"
}
```

### 500 Server Error
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred"
}
```

---

## 🔒 Authentication

All endpoints (except `/pricing`) require JWT token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token expires**: 30 days
**Refresh token expires**: 90 days

---

## 📈 Rate Limiting

Rate limits are enforced at multiple levels:
- Request count (per day/month)
- Cost (per day/month)
- Model availability (by plan)

**Response headers:**
```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 155
X-RateLimit-Reset: 1705363200
X-Cost-Remaining: 0.35
```

---

## ✅ Complete Endpoint List

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/cli/authorize` | No | Start device flow |
| GET | `/api/auth/cli/token` | No | Poll for token |
| POST | `/api/auth/cli/verify-code` | Web | Verify user code |
| POST | `/api/auth/cli/authorize-session` | Web | Authorize session |
| POST | `/api/auth/cli/deny-session` | Web | Deny session |
| GET | `/api/auth/cli/verify` | CLI | Verify CLI token |
| GET | `/api/auth/cli/sessions` | Web | List sessions |
| DELETE | `/api/auth/cli/session/:id` | Web | Revoke session |
| DELETE | `/api/auth/cli/sessions/all` | Web | Revoke all |
| POST | `/api/auth/cli/track-usage` | CLI | Track usage |
| GET | `/api/auth/cli/usage-stats` | Web | Usage stats |
| POST | `/api/cli/ai/complete` | CLI | AI completion |
| GET | `/api/cli/ai/budget` | CLI | Check budget |
| GET | `/api/cli/ai/usage` | CLI | Get usage |
| GET | `/api/cli/ai/models` | CLI | List models |
| GET | `/api/cli/ai/pricing` | No | Get pricing |

**Total: 16 endpoints**

---

**All endpoints are production-ready! 🚀**

For implementation details, see: `CLI_PREMIUM_ACTION_PLAN.md`
