# 🚀 recoder-code CLI Integration Guide - Quick Start

## For CLI Developers

This guide shows how to integrate the AI API service into the recoder-code CLI tool.

---

## 📡 API Endpoint

```
Base URL: https://api.recoder.xyz (or http://localhost:3001 for local dev)
```

---

## 🔑 Authentication

All requests require CLI authentication token in header:

```typescript
headers: {
  'Authorization': `Bearer ${cliToken}`
}
```

Get token from: `recoder auth login` flow (already implemented)

---

## 💻 Example Implementation

### 1. Basic AI Request

```typescript
import fetch from 'node-fetch';

class AIClient {
  private baseUrl = 'https://api.recoder.xyz';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async complete(prompt: string, options: {
    provider?: 'auto' | 'anthropic' | 'groq' | 'google' | 'openai';
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  } = {}) {
    const response = await fetch(`${this.baseUrl}/api/cli/ai/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        provider: options.provider || 'auto',
        model: options.model,
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        systemPrompt: options.systemPrompt,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'AI request failed');
    }

    const data = await response.json();
    return data.data;
  }

  async checkBudget() {
    const response = await fetch(`${this.baseUrl}/api/cli/ai/budget`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    
    const data = await response.json();
    return data.budget;
  }

  async getUsage() {
    const response = await fetch(`${this.baseUrl}/api/cli/ai/usage`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    
    const data = await response.json();
    return data.usage;
  }
}
```

---

### 2. CLI Commands

```typescript
// generate.ts
import { Command } from 'commander';
import { AIClient } from './ai-client';
import { getStoredToken } from './auth';

export const generateCommand = new Command('generate')
  .description('Generate code using AI')
  .argument('<prompt>', 'What to generate')
  .option('-p, --provider <provider>', 'AI provider (auto, anthropic, groq, google, openai)')
  .option('-m, --model <model>', 'Specific model to use')
  .action(async (prompt, options) => {
    try {
      const token = getStoredToken();
      if (!token) {
        console.error('Not authenticated. Run: recoder auth login');
        process.exit(1);
      }

      const client = new AIClient(token);
      
      // Check budget first
      const budget = await client.checkBudget();
      if (!budget.allowed) {
        console.error('❌ Budget limit exceeded!');
        console.error(budget.reason);
        console.log('\n💡 Upgrade at: https://recoder.xyz/pricing');
        process.exit(1);
      }

      console.log('🤖 Generating code...');
      
      const result = await client.complete(prompt, {
        provider: options.provider,
        model: options.model,
        systemPrompt: 'You are an expert programmer. Generate clean, well-documented code.',
      });

      console.log('\n✨ Generated Code:\n');
      console.log(result.content);
      console.log('\n📊 Usage:');
      console.log(`   Provider: ${result.provider}`);
      console.log(`   Model: ${result.model}`);
      console.log(`   Tokens: ${result.usage.totalTokens}`);
      console.log(`   Cost: $${result.cost.toFixed(4)}`);

    } catch (error: any) {
      console.error('Error:', error.message);
      
      if (error.message.includes('budget limit')) {
        console.log('\n💡 Your plan limits have been reached.');
        console.log('   Upgrade for more usage: https://recoder.xyz/pricing');
      }
      
      process.exit(1);
    }
  });
```

---

## 📊 API Endpoints

### POST `/api/cli/ai/complete` - Make AI Request
### GET `/api/cli/ai/budget` - Check Budget
### GET `/api/cli/ai/usage` - Get Usage Stats
### GET `/api/cli/ai/models` - List Available Models
### GET `/api/cli/ai/pricing` - Get Pricing Info

See full documentation in CLI_AI_SERVICE_COMPLETE.md

---

**Status:** Ready for integration! 🎉

All backend APIs are live and waiting for CLI implementation.
