# Recoder Code CLI - Backend Integration Guide

> Complete integration guide for the Recoder Code CLI with recoder.xyz backend API

---

## 🎯 Overview

The Recoder Code CLI integrates with the recoder.xyz backend to provide:
- **AI-powered code generation** via OpenRouter (14 AI models)
- **Authentication** with OAuth, device flow, and API key support
- **Usage tracking** with budget limits and cost monitoring
- **Model recommendations** based on task and budget

---

## 🔌 API Endpoints

### Base URL
```
RECODER_API_BASE = https://recoder.xyz
```

Can be overridden with environment variable:
```bash
export RECODER_API_URL=https://your-custom-url.com
```

### Authentication Endpoints

#### 1. OAuth/Device Flow Login
```
POST /api/auth/cli
```

**Request (OAuth):**
```json
{
  "flow": "oauth",
  "code": "authorization_code",
  "code_verifier": "pkce_verifier"
}
```

**Request (Device Flow):**
```json
{
  "flow": "device",
  "device_code": "device_code_from_init"
}
```

**Request (API Key):**
```json
{
  "flow": "api-key",
  "api_key": "rcli_xxx"
}
```

**Response:**
```json
{
  "access_token": "token",
  "refresh_token": "refresh",
  "expires_at": "2024-12-31T23:59:59Z",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "has_own_api_key": false,
    "quota": {
      "requests_remaining": 4500,
      "requests_limit": 5000,
      "reset_date": "2024-11-01T00:00:00Z"
    }
  }
}
```

#### 2. Get User Info
```
GET /api/user/quota
```

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "pro"
  },
  "quota": {
    "requests_remaining": 4500,
    "requests_limit": 5000,
    "reset_date": "2024-11-01T00:00:00Z"
  }
}
```

#### 3. Set OpenRouter API Key (Free Tier)
```
PUT /api/user/openrouter
```

**Request:**
```json
{
  "api_key": "sk-or-v1-xxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OpenRouter API key saved successfully"
}
```

---

### AI Service Endpoints

#### 1. Unified Completion Endpoint
```
POST /api/cli/ai/complete
```

**Request:**
```json
{
  "prompt": "Write a REST API in Express.js",
  "systemPrompt": "You are an expert programmer",
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
    "content": "// Generated code here...",
    "model": "anthropic/claude-sonnet-4",
    "usage": {
      "inputTokens": 156,
      "outputTokens": 892,
      "totalTokens": 1048
    },
    "cost": 0.0134,
    "metadata": {
      "costUSD": 0.0134,
      "remainingBudget": 17.4866,
      "budgetPercent": 0.077,
      "requestId": "gen-abc123",
      "latency": 2341,
      "cached": false
    }
  }
}
```

**Error Response (Budget Exceeded):**
```json
{
  "success": false,
  "error": "BUDGET_EXCEEDED",
  "message": "Monthly AI budget exceeded",
  "data": {
    "currentSpend": 17.50,
    "monthlyLimit": 17.50,
    "resetDate": "2024-11-01T00:00:00Z",
    "daysUntilReset": 5
  }
}
```

#### 2. Usage Statistics
```
GET /api/user/usage
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "pro",
    "monthlyLimit": 17.50,
    "currentSpend": 9.38,
    "remainingBudget": 8.12,
    "percentUsed": 53.6,
    "totalRequests": 2000,
    "averageCostPerRequest": 0.00469,
    "resetDate": "2024-11-01T00:00:00Z",
    "daysUntilReset": 5,
    "topModels": [
      {
        "model": "anthropic/claude-sonnet-4",
        "requests": 500,
        "cost": 7.50
      },
      {
        "model": "x-ai/grok-code-fast-1",
        "requests": 1000,
        "cost": 1.50
      }
    ]
  }
}
```

#### 3. Model Recommendations
```
GET /api/ai/recommend-models?task=code-generation&budget=5.00
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "model": "anthropic/claude-sonnet-4",
        "estimatedCost": 0.015,
        "quality": "excellent",
        "speed": "medium",
        "reason": "Best balance of quality and cost for code generation"
      },
      {
        "model": "x-ai/grok-code-fast-1",
        "estimatedCost": 0.003,
        "quality": "good",
        "speed": "fast",
        "reason": "Fast and economical for simple code tasks"
      }
    ]
  }
}
```

---

## 🤖 Available AI Models

### Default Models by Plan

| Plan | Default Model | Monthly Budget |
|------|---------------|----------------|
| Free | `google/gemini-2.0-flash` | $0 (requires own OpenRouter key) |
| Pro | `anthropic/claude-sonnet-4` | $17.50 |
| Premium | `anthropic/claude-sonnet-4.5` | $93.00 |

### All Available Models

1. **anthropic/claude-sonnet-4.5** - Latest Claude ($3/$15 per 1M tokens)
2. **anthropic/claude-sonnet-4** - Primary model ($3/$15 per 1M tokens)
3. **x-ai/grok-code-fast-1** - Fast code generation ($0.5/$1.0 per 1M tokens)
4. **qwen/qwen3-coder-480b-a35b** - Code specialist ($0.8/$2.4 per 1M tokens)
5. **x-ai/grok-4-fast** - Quick responses ($0.4/$0.8 per 1M tokens)
6. **google/gemini-2.5-flash** - Budget-friendly ($0.075/$0.3 per 1M tokens)
7. **google/gemini-2.0-flash** - Free tier (FREE)
8. **google/gemini-2.5-pro** - Complex tasks ($1.25/$5 per 1M tokens)
9. **openai/gpt-5** - Cutting-edge ($5/$15 per 1M tokens)
10. **openai/gpt-4.1-mini** - Cost-effective ($0.15/$0.6 per 1M tokens)
11. **deepseek/deepseek-v3-0324** - Ultra-budget ($0.27/$1.10 per 1M tokens)
12. **openai/gpt-oss-20b** - Open source ($0.10/$0.30 per 1M tokens)
13. **z-ai/glm-4.6** - Alternative ($0.5/$1.5 per 1M tokens)
14. **openrouter/sonoma-sky-alpha** - Experimental ($1.0/$3.0 per 1M tokens)

---

## 💻 CLI Implementation

### File Structure

```
packages/cli/src/
├── commands/
│   ├── auth.ts              # Auth command module
│   ├── auth/
│   │   ├── login.ts         # Login subcommand
│   │   ├── logout.ts        # Logout subcommand
│   │   ├── status.ts        # Status subcommand
│   │   ├── whoami.ts        # User info subcommand
│   │   ├── quota.ts         # Quota subcommand
│   │   └── set-api-key.ts   # API key subcommand
│   ├── ai.ts                # AI command module
│   └── ai/
│       ├── generate.ts      # Code generation
│       ├── chat.ts          # Interactive chat
│       ├── usage.ts         # Usage statistics
│       └── models.ts        # List models
└── services/
    ├── RecoderAuthService.ts    # Auth service client
    └── RecoderAIService.ts      # AI service client
```

### Service Methods

#### RecoderAuthService

```typescript
class RecoderAuthService {
  // Authentication
  async loginWithOAuth(): Promise<RecoderSession>
  async loginWithDeviceFlow(): Promise<RecoderSession>
  async loginWithApiKey(apiKey: string): Promise<RecoderSession>
  async logout(): Promise<void>
  
  // Session management
  async isAuthenticated(): Promise<boolean>
  async getAccessToken(): Promise<string | null>
  async getUser(): Promise<RecoderUser | null>
  async refreshToken(): Promise<void>
  
  // User operations
  async setOpenRouterApiKey(apiKey: string): Promise<void>
  async getQuota(): Promise<QuotaInfo>
}
```

#### RecoderAIService

```typescript
class RecoderAIService {
  // AI operations
  async complete(options: AICompleteOptions): Promise<AIResponse>
  async generateCode(options: AIGenerateOptions): Promise<AIResponse>
  async chat(options: AIChatOptions): Promise<AIResponse>
  
  // Usage & recommendations
  async getUsageStats(): Promise<UsageStats>
  async getModelRecommendations(task: string, budget?: number): Promise<ModelRecommendation[]>
  async hasBudget(): Promise<boolean>
  
  // Display utilities
  formatCost(costUSD: number): string
  formatBudget(stats: UsageStats): string
  getBudgetEmoji(percentUsed: number): string
  displayCostInfo(metadata: any): void
  displayWarning(warning?: any): void
  handleBudgetExceeded(error: any): void
}
```

---

## 🔧 CLI Commands

### Authentication Commands

```bash
# Login with web OAuth (default)
recoder-code auth login

# Login with device flow (SSH/headless)
recoder-code auth login --device

# Login with API key
recoder-code auth login --api-key rcli_xxx

# Logout
recoder-code auth logout

# Show status
recoder-code auth status

# Show user info
recoder-code auth whoami

# Show quota details
recoder-code auth quota

# Set OpenRouter API key (free tier)
recoder-code auth set-api-key sk-or-v1-xxx
```

### AI Commands

```bash
# Generate code
recoder-code ai generate "Create a REST API with Express.js"

# Generate with specific model
recoder-code ai gen "Build a todo app" --model anthropic/claude-sonnet-4

# Generate with language/framework
recoder-code ai gen "Create auth system" --language typescript --framework nestjs

# Save to file
recoder-code ai gen "Write sorting algorithm" --output sort.js

# Interactive chat
recoder-code ai chat

# Chat with specific model
recoder-code ai chat --model x-ai/grok-4-fast

# View usage statistics
recoder-code ai usage

# List available models
recoder-code ai models

# Get model recommendations
recoder-code ai models --task code-generation
```

---

## 🔒 Security & Storage

### Credentials Storage

Credentials are stored in `~/.recoder/auth.json` with restricted permissions (0600):

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": "2024-12-31T23:59:59Z",
  "user_id": "user_123",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscription_plan": "pro",
    "has_own_api_key": false,
    "quota": {
      "requests_remaining": 4500,
      "requests_limit": 5000,
      "reset_date": "2024-11-01T00:00:00Z"
    }
  }
}
```

### Token Refresh

Tokens are automatically refreshed when:
- Token is expired
- Token expires within 5 minutes
- API request returns 401 Unauthorized

### Environment Variables

```bash
# Backend API URL (optional)
export RECODER_API_URL=https://recoder.xyz

# OpenRouter configuration (for local development)
export OPENROUTER_API_KEY=sk-or-v1-xxx
export OPENROUTER_SITE_NAME=Recoder-Code
export OPENROUTER_SITE_URL=https://github.com/recoder-code
```

---

## 📊 Cost Management

### Budget Limits by Plan

| Plan | Monthly Budget | Daily Limit | Requests/Month |
|------|---------------|-------------|----------------|
| Free | $0 (own key) | - | Unlimited* |
| Pro | $17.50 | $0.58 | 5,000 |
| Premium | $93.00 | $3.10 | 25,000 |

*With own OpenRouter API key

### Cost Tracking

Every AI request returns cost information:

```typescript
{
  "metadata": {
    "costUSD": 0.0134,          // Cost of this request
    "remainingBudget": 17.4866, // Remaining monthly budget
    "budgetPercent": 0.077,     // Percentage used
    "requestId": "gen-abc123",  // Request identifier
    "latency": 2341,            // Response time (ms)
    "cached": false             // Whether response was cached
  }
}
```

### Budget Warnings

- 🟢 **0-75%** - Normal usage
- 🟡 **75-90%** - Warning (suggest cheaper models)
- 🟠 **90-95%** - High usage warning
- 🔴 **95-100%** - Critical, approaching limit
- 🚨 **100%** - Budget exceeded, requests blocked

---

## 🚀 Integration Testing

### 1. Test Authentication

```bash
# Test OAuth login
recoder-code auth login

# Verify status
recoder-code auth status

# Check quota
recoder-code auth quota
```

### 2. Test AI Generation

```bash
# Simple generation
recoder-code ai generate "Write a hello world function"

# Check usage
recoder-code ai usage
```

### 3. Test Error Handling

```bash
# Test without authentication
recoder-code auth logout
recoder-code ai generate "test"
# Expected: Authentication error

# Test budget exceeded (if at limit)
# Expected: Budget exceeded message with options
```

### 4. Test Model Selection

```bash
# List models
recoder-code ai models

# Get recommendations
recoder-code ai models --task code-generation

# Use specific model
recoder-code ai gen "test" --model google/gemini-2.5-flash
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Not authenticated" error
```bash
# Solution: Login first
recoder-code auth login
```

#### 2. "Budget exceeded" error
```bash
# Options:
# 1. Wait for monthly reset
recoder-code auth quota  # Check reset date

# 2. Upgrade plan
open https://recoder.xyz/pricing

# 3. Use own OpenRouter key (free tier)
recoder-code auth set-api-key sk-or-v1-xxx
```

#### 3. "Invalid API key" error
```bash
# Ensure API key starts with sk-or-v1-
# Get new key at: https://openrouter.ai/keys
```

#### 4. Connection errors
```bash
# Check backend URL
echo $RECODER_API_URL

# Test connectivity
curl https://recoder.xyz/api/health
```

---

## 📦 Build & Deploy

### Build CLI Package

```bash
cd packages/cli
npm run build
```

### Test Locally

```bash
# Link globally
npm link

# Test commands
recoder-code auth --help
recoder-code ai --help
```

### Publish to npm

```bash
# Update version
npm version patch|minor|major

# Publish
npm publish
```

---

## 🔄 Changelog

### Version 2.5.0 (Current)
- ✅ Unified `/api/cli/ai/complete` endpoint
- ✅ Support for 14 AI models via OpenRouter
- ✅ Automatic model selection based on budget
- ✅ Enhanced cost tracking with request metadata
- ✅ Budget warnings and recommendations
- ✅ Improved error handling

### Version 2.4.0
- ✅ Initial AI commands implementation
- ✅ Authentication system
- ✅ Basic cost tracking

---

## 📞 Support

- **Documentation**: https://github.com/recoder-code/recoder-code
- **Issues**: https://github.com/recoder-code/recoder-code/issues
- **Backend API**: https://recoder.xyz
- **OpenRouter**: https://openrouter.ai

---

**Last Updated**: 2024-10-19  
**Status**: ✅ Production Ready
