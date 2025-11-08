# Recoder AI Service - Quick Start Guide

> Get started with the Recoder AI service in 5 minutes

---

## 🚀 Quick Setup

### 1. Install CLI

```bash
npm install -g recoder-code
```

### 2. Login

```bash
# Web OAuth (recommended)
recoder-code auth login

# Or device flow for SSH
recoder-code auth login --device

# Or API key
recoder-code auth login --api-key rcli_xxx
```

### 3. Generate Code

```bash
recoder-code ai generate "Create a REST API with Express.js"
```

---

## 💎 Plans & Pricing

| Plan | Cost | AI Budget | Default Model |
|------|------|-----------|---------------|
| **Free** | $0/mo | $0 (own key*) | Gemini 2.0 Flash |
| **Pro** | $20/mo | $17.50/mo | Claude Sonnet 4 |
| **Premium** | $100/mo | $93/mo | Claude Sonnet 4.5 |

*Free users need their own OpenRouter API key (free at https://openrouter.ai)

---

## 🤖 Best Models for Each Task

### Code Generation
```bash
# Best quality
recoder-code ai gen "build auth system" --model anthropic/claude-sonnet-4

# Fast & cheap
recoder-code ai gen "simple function" --model x-ai/grok-code-fast-1

# Free
recoder-code ai gen "helper function" --model google/gemini-2.0-flash
```

### Chat / Q&A
```bash
# Interactive chat
recoder-code ai chat --model x-ai/grok-4-fast
```

### Complex Reasoning
```bash
# Best for complex problems
recoder-code ai gen "optimize algorithm" --model anthropic/claude-sonnet-4.5
```

---

## 📊 Monitor Usage

```bash
# Check your usage
recoder-code ai usage

# Check quota
recoder-code auth quota

# View available models
recoder-code ai models
```

---

## 💡 Pro Tips

### 1. Choose the Right Model

```bash
# Get recommendations
recoder-code ai models --task code-generation

# Use cheaper models for simple tasks
recoder-code ai gen "add comments" --model google/gemini-2.5-flash
```

### 2. Save Generated Code

```bash
# Save to file
recoder-code ai gen "express server" --output server.js

# Specify language
recoder-code ai gen "http client" --language python --output client.py
```

### 3. Use Interactive Chat

```bash
# Start chat session
recoder-code ai chat

# Chat with specific model
recoder-code ai chat --model anthropic/claude-sonnet-4
```

---

## 🔧 Configuration

### Set OpenRouter API Key (Free Tier)

```bash
# Get key at https://openrouter.ai/keys
recoder-code auth set-api-key sk-or-v1-xxx
```

### Custom Backend URL

```bash
export RECODER_API_URL=https://your-backend.com
```

---

## 📖 Common Commands

```bash
# Authentication
recoder-code auth login              # Login
recoder-code auth status             # Check status
recoder-code auth quota              # View quota
recoder-code auth logout             # Logout

# AI Generation
recoder-code ai generate <prompt>    # Generate code
recoder-code ai gen <prompt> -m MODEL # With model
recoder-code ai gen <prompt> -o FILE  # Save to file

# AI Chat
recoder-code ai chat                 # Start chat
recoder-code ai chat -m MODEL        # Chat with model

# Usage & Models
recoder-code ai usage                # Usage stats
recoder-code ai models               # List models
```

---

## 🎯 Example Workflows

### Full-Stack App Development

```bash
# 1. Generate backend
recoder-code ai gen "Express.js REST API with MongoDB" \
  --language typescript \
  --output backend/server.ts

# 2. Generate frontend
recoder-code ai gen "React component for user dashboard" \
  --framework react \
  --output frontend/Dashboard.tsx

# 3. Generate tests
recoder-code ai gen "Jest tests for API endpoints" \
  --output backend/__tests__/api.test.ts
```

### Cost-Effective Development

```bash
# Use fast model for simple tasks
recoder-code ai gen "add JSDoc comments" \
  --model x-ai/grok-code-fast-1

# Use premium model for complex tasks
recoder-code ai gen "implement OAuth2 flow" \
  --model anthropic/claude-sonnet-4.5
```

### Learning & Debugging

```bash
# Interactive learning
recoder-code ai chat --model anthropic/claude-sonnet-4

# In chat:
You: Explain how async/await works in JavaScript
AI: [Detailed explanation...]

You: Show me an example with error handling
AI: [Code example...]
```

---

## 🆘 Need Help?

```bash
# Command help
recoder-code --help
recoder-code auth --help
recoder-code ai --help

# Specific command help
recoder-code ai generate --help
recoder-code auth login --help
```

---

## 🔗 Links

- **CLI Docs**: [GitHub Repository](https://github.com/recoder-code/recoder-code)
- **Backend API**: https://recoder.xyz
- **OpenRouter**: https://openrouter.ai
- **Pricing**: https://recoder.xyz/pricing

---

## 📝 Response Format

Every AI request returns structured data:

```json
{
  "success": true,
  "data": {
    "content": "// Your generated code",
    "model": "anthropic/claude-sonnet-4",
    "usage": {
      "inputTokens": 156,
      "outputTokens": 892,
      "totalTokens": 1048
    },
    "metadata": {
      "costUSD": 0.0134,
      "remainingBudget": 17.4866,
      "budgetPercent": 0.077,
      "requestId": "gen-abc123",
      "latency": 2341
    }
  }
}
```

---

**Status**: ✅ Ready to Use  
**Last Updated**: 2024-10-19
