# Premium AI Service Plan - Recoder Code

## Overview

Premium users get access to AI models with built-in cost controls to ensure they stay within budget limits:
- **Basic Plan ($20/month)**: Max AI cost $17.50/month (87.5% of plan cost)
- **Pro Plan ($100/month)**: Max AI cost $93/month (93% of plan cost)

## Pricing Tiers

### Free Tier
- **Cost**: $0/month
- **AI Budget**: $0 (user must provide own OpenRouter API key)
- **Features**: Full CLI access, bring your own API key

### Basic Plan ($20/month)
- **Cost**: $20/month
- **AI Budget**: $17.50/month
- **Features**: 
  - Access to all OpenRouter models
  - Automatic cost tracking
  - Daily budget alerts
  - Model recommendations based on cost
  - No API key required

### Pro Plan ($100/month)
- **Cost**: $100/month
- **AI Budget**: $93/month
- **Features**:
  - Access to all OpenRouter models including premium
  - Priority rate limits
  - Advanced cost analytics
  - Model optimization suggestions
  - Bulk operations
  - No API key required

## Cost Control Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Recoder.xyz Backend                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          Cost Tracking Service                     │    │
│  │                                                     │    │
│  │  • Track per-request AI costs                     │    │
│  │  • Monitor monthly spending per user              │    │
│  │  • Alert at 75%, 90%, 95%, 100% usage            │    │
│  │  • Block requests when limit reached              │    │
│  │  • Reset monthly on billing date                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          Model Router & Optimizer                  │    │
│  │                                                     │    │
│  │  • Select cost-efficient models                   │    │
│  │  • Cache prompt results                           │    │
│  │  • Compress context when needed                   │    │
│  │  • Suggest cheaper alternatives                   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          OpenRouter Proxy                          │    │
│  │                                                     │    │
│  │  • Uses RECODER'S OpenRouter API key             │    │
│  │  • Premium users don't need their own key        │    │
│  │  • Track token usage per user                     │    │
│  │  • Calculate costs in real-time                   │    │
│  │  • Return cost metadata to user                   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  FREE USERS: Must provide own OpenRouter key               │
│  PREMIUM USERS: Use Recoder's OpenRouter account           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ API Calls with JWT
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Recoder Code CLI                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  • Authenticates with recoder.xyz                          │
│  • Sends prompts to backend                                │
│  • Backend handles OpenRouter (with Recoder's key)         │
│  • Receives responses + cost info                          │
│  • Shows cost warnings locally                             │
│                                                             │
│  FREE USERS: Set own key via `auth set-api-key`            │
│  PREMIUM USERS: Just login and use!                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints Design

### 1. Generate Code with AI (Protected)

```typescript
POST /api/ai/generate
Authorization: Bearer <user_token>

Request:
{
  "prompt": "Create a React button component",
  "model": "anthropic/claude-3.5-sonnet", // Optional, auto-selected if not provided
  "language": "typescript",
  "maxTokens": 2000,
  "temperature": 0.7
}

Response (Success):
{
  "success": true,
  "data": {
    "code": "...",
    "model": "anthropic/claude-3.5-sonnet",
    "language": "typescript",
    "metadata": {
      "tokensUsed": 1850,
      "costUSD": 0.0185,
      "remainingBudget": 17.32,
      "budgetPercent": 98.94
    }
  }
}

Response (Budget Exceeded):
{
  "success": false,
  "error": "BUDGET_EXCEEDED",
  "message": "Monthly AI budget exhausted. Resets on Nov 1, 2024.",
  "data": {
    "currentSpend": 17.50,
    "monthlyLimit": 17.50,
    "resetDate": "2024-11-01T00:00:00Z",
    "daysUntilReset": 8
  }
}

Response (Budget Warning):
{
  "success": true,
  "warning": "BUDGET_THRESHOLD",
  "data": {
    // ... generated code
    "metadata": {
      "tokensUsed": 1200,
      "costUSD": 0.012,
      "remainingBudget": 0.85,
      "budgetPercent": 95.14,
      "alert": "You have used 95% of your monthly AI budget"
    }
  }
}
```

### 2. Chat with AI (Protected)

```typescript
POST /api/ai/chat
Authorization: Bearer <user_token>

Request:
{
  "messages": [
    { "role": "user", "content": "How do I optimize this code?" }
  ],
  "model": "openai/gpt-4-turbo",
  "stream": false
}

Response:
{
  "success": true,
  "data": {
    "message": "Here are some optimization suggestions...",
    "model": "openai/gpt-4-turbo",
    "metadata": {
      "tokensUsed": 450,
      "costUSD": 0.0045,
      "remainingBudget": 17.15,
      "budgetPercent": 2.00
    }
  }
}
```

### 3. Get Usage Statistics

```typescript
GET /api/user/usage
Authorization: Bearer <user_token>

Response:
{
  "success": true,
  "data": {
    "plan": "basic",
    "monthlyLimit": 17.50,
    "currentSpend": 12.35,
    "remainingBudget": 5.15,
    "percentUsed": 70.57,
    "totalRequests": 145,
    "averageCostPerRequest": 0.0852,
    "resetDate": "2024-11-01T00:00:00Z",
    "daysUntilReset": 8,
    "topModels": [
      { "model": "anthropic/claude-3.5-sonnet", "requests": 85, "cost": 7.50 },
      { "model": "openai/gpt-4-turbo", "requests": 40, "cost": 3.20 },
      { "model": "meta-llama/llama-3-70b", "requests": 20, "cost": 1.65 }
    ]
  }
}
```

### 4. Get Cost-Optimized Model Recommendations

```typescript
GET /api/ai/recommend-models?task=code-generation&budget=0.05
Authorization: Bearer <user_token>

Response:
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "model": "anthropic/claude-3-haiku",
        "estimatedCost": 0.002,
        "quality": "good",
        "speed": "fast",
        "reason": "Best cost/performance for code generation"
      },
      {
        "model": "meta-llama/llama-3-70b",
        "estimatedCost": 0.008,
        "quality": "excellent",
        "speed": "medium",
        "reason": "Higher quality, still within budget"
      }
    ],
    "currentBudget": {
      "remaining": 5.15,
      "percentUsed": 70.57
    }
  }
}
```

## Database Schema

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  subscription_plan VARCHAR(50) DEFAULT 'free', -- free, basic, pro
  subscription_status VARCHAR(50) DEFAULT 'active', -- active, cancelled, expired
  billing_cycle_start DATE,
  billing_cycle_end DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_ai_usage table
```sql
CREATE TABLE user_ai_usage (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  request_type VARCHAR(50), -- generate, chat, etc.
  model VARCHAR(255),
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  request_timestamp TIMESTAMP DEFAULT NOW(),
  billing_month VARCHAR(7), -- YYYY-MM format
  metadata JSONB
);

CREATE INDEX idx_user_ai_usage_user_month ON user_ai_usage(user_id, billing_month);
CREATE INDEX idx_user_ai_usage_timestamp ON user_ai_usage(request_timestamp);
```

### user_ai_quotas table
```sql
CREATE TABLE user_ai_quotas (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  monthly_limit_usd DECIMAL(10, 2),
  current_spend_usd DECIMAL(10, 6) DEFAULT 0,
  billing_month VARCHAR(7), -- YYYY-MM format
  last_reset_date TIMESTAMP,
  alert_75_sent BOOLEAN DEFAULT FALSE,
  alert_90_sent BOOLEAN DEFAULT FALSE,
  alert_95_sent BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, billing_month)
);
```

## Implementation Files

### Backend Service (Node.js/Express)

**File: `backend/services/AIProxyService.js`**

```javascript
const axios = require('axios');
const db = require('../db');

class AIProxyService {
  constructor() {
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY;
    this.openRouterBaseUrl = 'https://openrouter.ai/api/v1';
  }

  /**
   * Check if user has budget remaining
   */
  async checkBudget(userId) {
    const quota = await db.query(
      `SELECT monthly_limit_usd, current_spend_usd, billing_month
       FROM user_ai_quotas
       WHERE user_id = $1 AND billing_month = TO_CHAR(NOW(), 'YYYY-MM')`,
      [userId]
    );

    if (!quota.rows.length) {
      // Initialize quota for new month
      await this.initializeMonthlyQuota(userId);
      return this.checkBudget(userId);
    }

    const { monthly_limit_usd, current_spend_usd } = quota.rows[0];
    const remaining = parseFloat(monthly_limit_usd) - parseFloat(current_spend_usd);

    return {
      hasCredit: remaining > 0,
      remaining,
      currentSpend: parseFloat(current_spend_usd),
      limit: parseFloat(monthly_limit_usd),
      percentUsed: (parseFloat(current_spend_usd) / parseFloat(monthly_limit_usd)) * 100
    };
  }

  /**
   * Generate code via OpenRouter
   */
  async generateCode(userId, options) {
    // Check budget first
    const budget = await this.checkBudget(userId);
    
    if (!budget.hasCredit) {
      throw new Error('BUDGET_EXCEEDED');
    }

    // Select model if not specified
    const model = options.model || await this.selectOptimalModel(userId, 'code-generation');

    // Prepare OpenRouter request
    const response = await axios.post(
      `${this.openRouterBaseUrl}/chat/completions`,
      {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert programmer. Generate clean, production-ready code.'
          },
          {
            role: 'user',
            content: this.buildPrompt(options)
          }
        ],
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'HTTP-Referer': 'https://recoder.xyz',
          'X-Title': 'Recoder Code'
        }
      }
    );

    // Calculate cost
    const usage = response.data.usage;
    const cost = await this.calculateCost(model, usage);

    // Record usage
    await this.recordUsage(userId, {
      requestType: 'generate',
      model,
      tokensUsed: usage.total_tokens,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      costUsd: cost
    });

    // Update quota
    await this.updateQuota(userId, cost);

    // Check if we should send alerts
    const newBudget = await this.checkBudget(userId);
    await this.checkAndSendAlerts(userId, newBudget);

    return {
      code: response.data.choices[0].message.content,
      model,
      metadata: {
        tokensUsed: usage.total_tokens,
        costUSD: cost,
        remainingBudget: newBudget.remaining,
        budgetPercent: newBudget.percentUsed
      },
      warning: this.generateWarning(newBudget)
    };
  }

  /**
   * Calculate cost based on model pricing
   */
  async calculateCost(model, usage) {
    // OpenRouter pricing (approximate - fetch real-time from OpenRouter API)
    const pricing = {
      'anthropic/claude-3.5-sonnet': {
        prompt: 0.003 / 1000,  // $3 per 1M tokens
        completion: 0.015 / 1000  // $15 per 1M tokens
      },
      'anthropic/claude-3-haiku': {
        prompt: 0.00025 / 1000,
        completion: 0.00125 / 1000
      },
      'openai/gpt-4-turbo': {
        prompt: 0.01 / 1000,
        completion: 0.03 / 1000
      },
      'openai/gpt-3.5-turbo': {
        prompt: 0.0005 / 1000,
        completion: 0.0015 / 1000
      },
      'meta-llama/llama-3-70b': {
        prompt: 0.00081 / 1000,
        completion: 0.00081 / 1000
      }
    };

    const modelPricing = pricing[model] || pricing['openai/gpt-3.5-turbo'];
    
    const promptCost = usage.prompt_tokens * modelPricing.prompt;
    const completionCost = usage.completion_tokens * modelPricing.completion;
    
    return promptCost + completionCost;
  }

  /**
   * Record usage in database
   */
  async recordUsage(userId, usage) {
    await db.query(
      `INSERT INTO user_ai_usage 
       (id, user_id, request_type, model, tokens_used, cost_usd, 
        prompt_tokens, completion_tokens, billing_month)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TO_CHAR(NOW(), 'YYYY-MM'))`,
      [
        require('uuid').v4(),
        userId,
        usage.requestType,
        usage.model,
        usage.tokensUsed,
        usage.costUsd,
        usage.promptTokens,
        usage.completionTokens
      ]
    );
  }

  /**
   * Update user's quota
   */
  async updateQuota(userId, cost) {
    await db.query(
      `UPDATE user_ai_quotas
       SET current_spend_usd = current_spend_usd + $2,
           updated_at = NOW()
       WHERE user_id = $1 AND billing_month = TO_CHAR(NOW(), 'YYYY-MM')`,
      [userId, cost]
    );
  }

  /**
   * Initialize monthly quota for user
   */
  async initializeMonthlyQuota(userId) {
    const user = await db.query(
      'SELECT subscription_plan FROM users WHERE id = $1',
      [userId]
    );

    const limits = {
      free: 0,
      basic: 17.50,
      pro: 93.00
    };

    const limit = limits[user.rows[0].subscription_plan] || 0;

    await db.query(
      `INSERT INTO user_ai_quotas 
       (id, user_id, monthly_limit_usd, current_spend_usd, billing_month, last_reset_date)
       VALUES ($1, $2, $3, 0, TO_CHAR(NOW(), 'YYYY-MM'), NOW())
       ON CONFLICT (user_id, billing_month) DO NOTHING`,
      [require('uuid').v4(), userId, limit]
    );
  }

  /**
   * Check and send budget alerts
   */
  async checkAndSendAlerts(userId, budget) {
    const thresholds = [
      { percent: 75, field: 'alert_75_sent' },
      { percent: 90, field: 'alert_90_sent' },
      { percent: 95, field: 'alert_95_sent' }
    ];

    for (const threshold of thresholds) {
      if (budget.percentUsed >= threshold.percent) {
        // Check if alert already sent
        const alertSent = await db.query(
          `SELECT ${threshold.field} FROM user_ai_quotas
           WHERE user_id = $1 AND billing_month = TO_CHAR(NOW(), 'YYYY-MM')`,
          [userId]
        );

        if (!alertSent.rows[0][threshold.field]) {
          // Send alert email/notification
          await this.sendBudgetAlert(userId, threshold.percent, budget);
          
          // Mark alert as sent
          await db.query(
            `UPDATE user_ai_quotas
             SET ${threshold.field} = TRUE
             WHERE user_id = $1 AND billing_month = TO_CHAR(NOW(), 'YYYY-MM')`,
            [userId]
          );
        }
      }
    }
  }

  /**
   * Select optimal model based on budget and task
   */
  async selectOptimalModel(userId, task) {
    const budget = await this.checkBudget(userId);
    
    // If low on budget, prefer cheaper models
    if (budget.remaining < 1) {
      return 'anthropic/claude-3-haiku';
    } else if (budget.remaining < 5) {
      return 'meta-llama/llama-3-70b';
    } else {
      return 'anthropic/claude-3.5-sonnet';
    }
  }

  /**
   * Generate warning message based on budget
   */
  generateWarning(budget) {
    if (budget.percentUsed >= 95) {
      return {
        level: 'critical',
        message: `You have used ${budget.percentUsed.toFixed(1)}% of your monthly AI budget. Consider upgrading your plan.`
      };
    } else if (budget.percentUsed >= 90) {
      return {
        level: 'warning',
        message: `You have used ${budget.percentUsed.toFixed(1)}% of your monthly AI budget.`
      };
    } else if (budget.percentUsed >= 75) {
      return {
        level: 'info',
        message: `You have used ${budget.percentUsed.toFixed(1)}% of your monthly AI budget.`
      };
    }
    return null;
  }

  buildPrompt(options) {
    let prompt = options.prompt;
    
    if (options.language) {
      prompt = `Generate ${options.language} code: ${prompt}`;
    }
    
    if (options.framework) {
      prompt += `\nFramework: ${options.framework}`;
    }
    
    return prompt;
  }
}

module.exports = new AIProxyService();
```

## Cost Control Features

### 1. Pre-Request Budget Check
- Every AI request checks remaining budget first
- Rejects request if budget exhausted
- Returns clear error message with reset date

### 2. Real-Time Cost Tracking
- Calculate cost after each request
- Update user's monthly spend
- Return cost metadata with every response

### 3. Progressive Alerts
- Alert at 75% usage
- Alert at 90% usage
- Alert at 95% usage
- Block at 100% usage

### 4. Smart Model Selection
- Auto-select cheaper models when budget is low
- Recommend cost-effective alternatives
- Show estimated costs before execution

### 5. Monthly Reset
- Automatically reset quota on billing date
- Prorate for mid-month upgrades/downgrades
- Clear alert flags for new month

## Safety Margins

### Basic Plan ($20/month)
- **Plan Cost**: $20.00
- **AI Budget**: $17.50 (87.5%)
- **Safety Margin**: $2.50 (12.5%)
- **Covers**: Infrastructure, support, profit margin

### Pro Plan ($100/month)
- **Plan Cost**: $100.00
- **AI Budget**: $93.00 (93%)
- **Safety Margin**: $7.00 (7%)
- **Covers**: Priority support, advanced features, profit margin

## CLI Integration Points

The CLI will:
1. Authenticate with recoder.xyz
2. Send all AI requests through recoder.xyz backend
3. Display cost information after each request
4. Show budget warnings
5. Recommend cheaper models when needed

```bash
# User's perspective
$ recoder-code "create a react button"

🤖 Generating code...
✅ Code generated successfully!

📊 Cost: $0.0185 | Remaining: $17.32 (98.9%)
🔧 Model: anthropic/claude-3.5-sonnet

[Generated code here...]

💡 Tip: Try 'claude-3-haiku' for 70% cost savings on simple tasks
```

## Next Steps

1. Implement backend AI proxy service
2. Add cost tracking database tables
3. Integrate with OpenRouter
4. Update CLI to use backend API
5. Add budget display in CLI
6. Implement alert system
7. Add usage analytics dashboard

Would you like me to proceed with implementing these components?
