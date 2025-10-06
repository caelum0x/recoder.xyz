# 🚀 Recoder Web - Setup Guide

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
cd recoder-web
npm install
```

### 2. Setup API Keys

You need at least ONE AI provider key. We recommend starting with **OpenRouter** (easiest):

#### Option A: OpenRouter (Recommended - Easiest)
1. Visit https://openrouter.ai/keys
2. Create a free account
3. Generate an API key
4. Add to `.env.local`:
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

#### Option B: Together AI
1. Visit https://api.together.xyz/settings/api-keys
2. Create account and get API key
3. Add to `.env.local`:
```bash
TOGETHER_API_KEY=your-together-key-here
```

#### Other Providers (Optional)
- **Anthropic Claude**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/api-keys
- **Groq**: https://console.groq.com/
- **Google Gemini**: https://makersuite.google.com/app/apikey

### 3. Database Setup

Your PostgreSQL database is already configured:
```
DATABASE_URL=postgresql://neondb_owner:npg_...@ep-autumn-tree-adj1ug2i-pooler.c-2.us-east-1.aws.neon.tech/neondb
```

### 4. Start Development Server
```bash
npm run dev
```

Visit: **http://localhost:3000**

## ✅ What's Working

- ✅ Clean bolt.new-style UI
- ✅ Database connection to Neon PostgreSQL
- ✅ Session management
- ✅ Multi-AI provider support (OpenRouter, Together, Claude, etc.)
- ✅ Real-time code generation
- ✅ Chat interface

## 🔑 Getting API Keys

### OpenRouter (Easiest - All Models in One)
1. Go to https://openrouter.ai/keys
2. Sign up (free)
3. Click "Create Key"
4. Copy key and add to `.env.local`

**Benefits:**
- Access to 100+ models with one key
- Includes GPT-4, Claude, Gemini, Llama, DeepSeek, etc.
- Pay-as-you-go pricing
- $5 free credit for new users

### Together AI (Fast & Cheap)
1. Go to https://api.together.xyz/
2. Sign up
3. Go to Settings > API Keys
4. Generate key
5. Add to `.env.local`

## 🎯 Usage

1. Open http://localhost:3000
2. Type your app idea: "Build me a todo app with React"
3. Press Enter or click "Build"
4. Wait for AI to generate your app
5. View live preview and code

## 🛠️ Troubleshooting

### Error: "No AI API keys configured"
- Add at least one API key to `.env.local`
- Restart dev server: `npm run dev`

### Error: "Database connection failed"
- DATABASE_URL is already configured
- Check if Neon database is online at https://console.neon.tech/

### Error: "Failed to create chat"
- Check server logs for specific error
- Ensure API key is valid
- Try restarting dev server

## 📚 Next Steps

1. Get your API keys (5 minutes)
2. Add them to `.env.local`
3. Restart server
4. Start building apps!

## 💡 Cost Estimates

**OpenRouter** (Recommended):
- DeepSeek V3: $0.27 / 1M tokens (very cheap)
- GPT-4: $5.00 / 1M tokens
- Claude Sonnet: $3.00 / 1M tokens
- Most apps cost $0.01 - $0.50 to generate

**Together AI**:
- Llama 3.1: $0.20 / 1M tokens
- DeepSeek: $0.27 / 1M tokens
- Very cheap for testing

**Free Credits**:
- OpenRouter: $5 free
- Together: $25 free
- Groq: Free tier available

## 🎉 You're Ready!

With just one API key, you can start building apps instantly.
