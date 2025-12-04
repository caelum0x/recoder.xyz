# Recoder.xyz API Documentation

Base URL: `https://recoder.xyz/api`

## Authentication

### POST /auth/login
Login with email/password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`
```json
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "token": "jwt_token"
}
```

### POST /auth/register
Create new account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### GET /auth/session
Get current session. Requires auth cookie.

### POST /auth/logout
End current session.

---

## CLI Authentication

### POST /auth/cli
Start CLI device flow authentication.

**Response:**
```json
{
  "deviceCode": "ABC123",
  "userCode": "XXXX-XXXX",
  "verificationUri": "https://recoder.xyz/auth/cli/verify",
  "expiresIn": 900
}
```

### GET /auth/cli/token
Poll for CLI token after user authorizes.

**Query:** `?device_code=ABC123`

### POST /auth/cli/validate
Validate CLI token.

**Headers:** `Authorization: Bearer <token>`

---

## User

### GET /user/profile
Get user profile.

### PATCH /user/profile
Update profile.

**Request:**
```json
{
  "name": "New Name",
  "avatar": "https://..."
}
```

### GET /user/quota
Get usage quota.

**Response:**
```json
{
  "used": 1500,
  "limit": 10000,
  "resetAt": "2025-01-01T00:00:00Z"
}
```

### GET /user/subscription
Get subscription status.

### GET /user/api-keys
List API keys.

### POST /user/api-keys
Create new API key.

### DELETE /user/api-keys/:id
Revoke API key.

---

## AI Provider Keys

### GET /user/ai-provider-keys
List configured AI provider keys.

### POST /user/ai-provider-keys
Add/update provider key.

**Request:**
```json
{
  "provider": "openai|anthropic|groq|google",
  "apiKey": "sk-..."
}
```

### DELETE /user/ai-provider-keys/:provider
Remove provider key.

---

## Projects

### GET /projects
List user projects.

### POST /projects
Create project.

**Request:**
```json
{
  "name": "My Project",
  "description": "...",
  "template": "nextjs"
}
```

### GET /projects/:id
Get project details.

### DELETE /projects/:id
Delete project.

---

## AI Chat

### POST /ai/chat
Send chat message (streaming).

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Build a todo app" }
  ],
  "model": "claude-3-sonnet",
  "projectId": "optional"
}
```

**Response:** Server-Sent Events stream

### GET /ai/models
List available AI models.

---

## MCP (Model Context Protocol)

### GET /mcp/servers
List available MCP servers.

### POST /mcp/servers/install
Install MCP server.

**Request:**
```json
{
  "serverId": "filesystem",
  "config": {}
}
```

### GET /mcp/tools
List tools from installed servers.

### POST /mcp/tools/call
Execute MCP tool.

**Request:**
```json
{
  "serverId": "filesystem",
  "toolName": "read_file",
  "arguments": { "path": "/src/index.ts" }
}
```

---

## Billing

### GET /billing/plans
List available plans.

### GET /billing/subscription
Get current subscription.

### POST /billing/create-checkout
Create checkout session.

**Request:**
```json
{
  "planId": "pro_monthly"
}
```

### POST /billing/subscription/cancel
Cancel subscription.

### POST /billing/subscription/reactivate
Reactivate cancelled subscription.

---

## Dashboard

### GET /dashboard/overview
Get dashboard stats.

**Response:**
```json
{
  "projects": 5,
  "tokensUsed": 15000,
  "tokensLimit": 100000,
  "recentActivity": [...]
}
```

### GET /dashboard/analytics
Get usage analytics.

---

## Health

### GET /health
API health check.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T00:00:00Z"
}
```

---

## Error Responses

All errors return:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Server Error
