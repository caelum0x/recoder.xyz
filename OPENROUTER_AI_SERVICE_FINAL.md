# 🤖 OpenRouter AI Service - Final Implementation

## 🎯 Overview

Implemented AI service using **OpenRouter** as a unified gateway to access all major AI providers through a single API. This provides access to the latest and most popular models based on real usage data.

---

## 💰 Pricing Plans

### Pro Plan - $20/month
- **AI Budget:** $17.50/month
- **Daily Limit:** $0.58/day  
- **Requests:** 200/day, 5,000/month
- **Default Model:** Claude Sonnet 4 (Primary)
- **All models available**

### Premium Plan - $100/month
- **AI Budget:** $93.00/month
- **Daily Limit:** $3.10/day
- **Requests:** 1,000/day, 25,000/month
- **Default Model:** Claude Sonnet 4.5 (Latest)
- **All models available**

### Free Plan
- **AI Budget:** $0
- **Requests:** 10/day, 100/month
- **Default Model:** Gemini 2.0 Flash (Free)
- **Only free models**

---

## 🤖 Available AI Models

Based on actual usage data from your analytics:

### Top Tier (Best Quality)
1. **anthropic/claude-sonnet-4.5** - Latest Claude, 498B tokens (10% cost)
   - Pricing: $3/$15 per 1M tokens
   - Best for: Complex reasoning, advanced code generation
   
2. **anthropic/claude-sonnet-4** - Primary model, 179B tokens (30% cost)
   - Pricing: $3/$15 per 1M tokens
   - Best for: Most coding tasks, default choice

### Code Specialists
3. **x-ai/grok-code-fast-1** - 1.2T tokens (2% cost) ⚡
   - Pricing: $0.5/$1.0 per 1M tokens
   - Best for: Fast code generation, high volume
   
4. **qwen/qwen3-coder-480b-a35b** - 48B tokens (2.1% cost)
   - Pricing: $0.8/$2.4 per 1M tokens
   - Best for: Code-specific tasks

### Fast & Economical
5. **x-ai/grok-4-fast** - 177B tokens (8% cost)
   - Pricing: $0.4/$0.8 per 1M tokens
   - Best for: Quick responses, chat
   
6. **google/gemini-2.5-flash** - 313B tokens (10% cost)
   - Pricing: $0.075/$0.3 per 1M tokens
   - Best for: Budget-conscious, fast
   
7. **google/gemini-2.0-flash** - 143B tokens (5% cost) 🆓
   - Pricing: FREE
   - Best for: Free tier users

### Advanced Models
8. **google/gemini-2.5-pro** - 151B tokens (8% cost)
   - Pricing: $1.25/$5 per 1M tokens
   - Best for: Complex multi-modal tasks

9. **openai/gpt-5** - 90.9B tokens (4.1% cost)
   - Pricing: $5/$15 per 1M tokens
   - Best for: Cutting-edge capabilities

10. **openai/gpt-4.1-mini** - 103B tokens (4.6% cost)
    - Pricing: $0.15/$0.6 per 1M tokens
    - Best for: Quick, cost-effective

### Budget Options
11. **deepseek/deepseek-v3-0324** - 115B tokens (1% cost) 💰
    - Pricing: $0.27/$1.10 per 1M tokens
    - Best for: Extremely cost-sensitive

12. **openai/gpt-oss-20b** - 110B tokens (30% cost)
    - Pricing: $0.10/$0.30 per 1M tokens

13. **z-ai/glm-4.6** - 95.8B tokens (11% cost)
    - Pricing: $0.5/$1.5 per 1M tokens

### Specialty
14. **openrouter/sonoma-sky-alpha** - 85.9B tokens (3.8% cost)
    - Pricing: $1.0/$3.0 per 1M tokens
    - Best for: Experimental features

---

## 🔌 API Endpoints

### POST /api/cli/ai/complete
Make an AI completion request.

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
    "cost": 0.0134
  },
  "metadata": {
    "requestId": "gen-abc123",
    "latency": 2341,
    "cached": false
  }
}
```

---

## 🎯 Intelligent Model Selection

When no model is specified, the system automatically selects based on:

### For Code Generation:
```
Budget > $5  → Claude Sonnet 4.5 (best quality)
Budget > $1  → Claude Sonnet 4 (primary)
Budget > $0.5 → Grok Code Fast (fast & cheap)
Budget < $0.5 → Gemini 2.5 Flash (most economical)
```

### For Reasoning:
```
Budget > $5 + Premium → Claude Sonnet 4.5
Budget > $2           → Claude Sonnet 4
Budget > $0.5         → Gemini 2.5 Pro
Budget < $0.5         → Gemini 2.5 Flash
```

### For Chat/Text:
```
Budget > $1  → Grok 4 Fast
Budget > $0.5 → Gemini 2.5 Flash
Budget < $0.5 → DeepSeek V3
```

---

## 💡 Usage Examples

### Example 1: Using Default (Recommended)
```bash
curl -X POST https://api.recoder.xyz/api/cli/ai/complete \
  -H "Authorization: Bearer YOUR_CLI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a todo app in React"
  }'

# System auto-selects: Claude Sonnet 4
# Cost: ~$0.005-0.015
```

### Example 2: Code Generation
```bash
curl -X POST https://api.recoder.xyz/api/cli/ai/complete \
  -H "Authorization: Bearer YOUR_CLI_TOKEN" \
  -d '{
    "prompt": "Build a REST API with authentication",
    "model": "x-ai/grok-code-fast-1"
  }'

# Fast code generation
# Cost: ~$0.001-0.003
```

### Example 3: Complex Reasoning
```bash
curl -X POST https://api.recoder.xyz/api/cli/ai/complete \
  -H "Authorization: Bearer YOUR_CLI_TOKEN" \
  -d '{
    "prompt": "Explain this algorithm and optimize it",
    "model": "anthropic/claude-sonnet-4.5"
  }'

# Best reasoning
# Cost: ~$0.008-0.020
```

---

## 📊 Cost Analysis

### Pro Plan ($20/mo = $17.50 AI budget)

**Typical Monthly Usage:**
```
1,000 × Grok Code Fast:      $1.50
  500 × Claude Sonnet 4:      $7.50
  500 × Gemini 2.5 Flash:     $0.38
2,000 × Gemini 2.0 Flash:     $0.00
─────────────────────────────────
Total:                        $9.38 / $17.50 ✓

Remaining budget: $8.12
Profit margin: 60%+
```

### Premium Plan ($100/mo = $93 AI budget)

**Typical Monthly Usage:**
```
3,000 × Claude Sonnet 4.5:   $45.00
2,000 × Grok Code Fast:       $3.00
5,000 × Gemini 2.5 Flash:     $1.88
5,000 × Grok 4 Fast:          $6.00
─────────────────────────────────
Total:                       $55.88 / $93.00 ✓

Remaining budget: $37.12
Profit margin: 40%+
```

---

## 🔧 Environment Setup

### Required Environment Variable

```bash
# .env
OPENROUTER_API_KEY=sk-or-v1-...

# Get your key at: https://openrouter.ai/keys
```

### Optional (for fallback)
```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

---

## 🚀 CLI Integration Example

```typescript
// recoder-code CLI
class AIClient {
  async complete(prompt: string, options = {}) {
    const response = await fetch('https://api.recoder.xyz/api/cli/ai/complete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model: options.model, // Optional - auto-selects if not provided
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      }),
    });

    const data = await response.json();
    return data.data.content;
  }
}

// Usage
const ai = new AIClient(cliToken);

// Auto model selection
const code = await ai.complete('Build a REST API');

// Specific model
const code = await ai.complete('Build a REST API', {
  model: 'anthropic/claude-sonnet-4'
});
```

---

## ✨ Key Features

1. **Unified API** - One endpoint, all models
2. **Auto Selection** - Smart model choice based on budget
3. **Real-time Tracking** - Accurate cost calculation
4. **Budget Protection** - Hard limits enforced
5. **Latest Models** - Access to newest releases
6. **Fallback Support** - Automatic model switching on failure
7. **Usage Analytics** - Detailed tracking and reporting

---

## 📈 Benefits

### For Users
- ✅ Access to 14 different AI models
- ✅ Automatic cost optimization
- ✅ Latest models (Sonnet 4.5, GPT-5, Gemini 2.5)
- ✅ Budget protection
- ✅ Transparent pricing

### For Business
- ✅ Single API integration (OpenRouter)
- ✅ No need to manage multiple API keys
- ✅ Predictable costs per user
- ✅ 40-60% profit margin
- ✅ Scalable architecture

### For Developers
- ✅ Simple integration
- ✅ OpenAI-compatible API
- ✅ TypeScript support
- ✅ Comprehensive docs

---

## 🎉 Summary

**Complete AI service using OpenRouter:**
- ✅ 14 AI models from 6 providers
- ✅ Single unified API endpoint
- ✅ Automatic model selection
- ✅ Strict budget enforcement
- ✅ Pro ($17.50/mo) and Premium ($93/mo) plans
- ✅ Real-time cost tracking
- ✅ Production-ready

**Status:** ✅ Ready for CLI integration!

---

Generated: $(date)
Version: 2.0 (OpenRouter)
