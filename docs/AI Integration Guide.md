# AI Integration Guide - Recoder.xyz

> **Quick Reference**: How recoder.xyz connects to and intelligently routes between multiple AI providers.

## 🧠 AI Provider Setup

### Environment Variables
```bash
# Required API Keys
export ANTHROPIC_API_KEY="your_claude_key"
export GROQ_API_KEY="your_groq_key" 
export GOOGLE_API_KEY="your_gemini_key"

# Optional
export OLLAMA_BASE_URL="http://localhost:11434"  # Local models
export OPENAI_API_KEY="your_openai_key"          # Backup only
```

### Provider Integration Code
```typescript
// packages/cli/src/services/ai-hub.ts
import { AnthropicAPI } from '@anthropic-ai/sdk';
import { GoogleGenAIAPI } from '@google/generative-ai';
import { GroqAPI } from 'groq-sdk';
import { OllamaAPI } from 'ollama';

export class AIHub {
  private providers = {
    claude: new AnthropicAPI({
      apiKey: process.env.ANTHROPIC_API_KEY
    }),
    groq: new GroqAPI({
      apiKey: process.env.GROQ_API_KEY
    }),
    gemini: new GoogleGenAIAPI(
      process.env.GOOGLE_API_KEY
    ),
    ollama: new OllamaAPI({
      host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    }),
    openai: new OpenAIAPI({
      apiKey: process.env.OPENAI_API_KEY
    })
  };

  // Smart model selection based on task type
  selectModel(taskType: string, complexity: string): string {
    if (taskType === 'blockchain' || taskType === 'security') {
      return 'claude-3-sonnet'; // Best reasoning
    }
    if (taskType === 'fast-coding' || taskType === 'ui-components') {
      return 'groq/llama-70b'; // Fastest inference
    }
    if (taskType === 'multimodal' || taskType === 'large-codebase') {
      return 'gemini-2.5-pro'; // Best for images + context
    }
    if (taskType === 'local' || taskType === 'privacy') {
      return 'ollama/codellama'; // Local execution
    }
    return 'claude-3-sonnet'; // Default
  }
}
```

## 🎯 Model Specialization

### Claude (Anthropic) - Complex Reasoning
**Best for:**
- Blockchain smart contracts & DeFi protocols
- Security audits & vulnerability analysis
- Complex business logic & algorithms  
- Code architecture & system design
- Planning & requirement analysis

**Models:**
- `claude-3-sonnet`: Balanced reasoning and speed
- `claude-3-opus`: Maximum reasoning capability
- `claude-3-haiku`: Fast responses for simple tasks

**Usage Example:**
```typescript
const response = await aiHub.query({
  provider: 'claude',
  model: 'claude-3-sonnet',
  prompt: 'Design a secure Solana staking pool with reentrancy protection',
  taskType: 'blockchain'
});
```

### Groq - Fast Coding & Iteration
**Best for:**
- React/Next.js components & pages
- API endpoints & backend services
- Quick bug fixes & optimizations
- Rapid prototyping & MVPs
- UI/UX implementation

**Models:**
- `llama-70b-8192`: Best coding performance
- `mixtral-8x7b-32768`: Good for complex tasks
- `gemma-7b-it`: Lightweight and fast

**Usage Example:**
```typescript
const response = await aiHub.query({
  provider: 'groq', 
  model: 'llama-70b-8192',
  prompt: 'Create a React component for user authentication',
  taskType: 'fast-coding'
});
```

### Gemini (Google) - Multimodal & Large Context
**Best for:**
- Analyzing huge codebases (1M+ tokens)
- Processing design mockups & images
- Research & web-enhanced development  
- Documentation generation from code
- Large project understanding

**Models:**
- `gemini-2.5-pro`: Best overall performance
- `gemini-2.5-flash`: Faster for simple tasks
- `gemini-pro-vision`: Multimodal capabilities

**Usage Example:**
```typescript
const response = await aiHub.query({
  provider: 'gemini',
  model: 'gemini-2.5-pro', 
  prompt: 'Analyze this entire codebase and suggest improvements',
  taskType: 'large-codebase',
  context: fullProjectCode
});
```

### Ollama - Local & Privacy
**Best for:**
- Sensitive enterprise projects
- Air-gapped development environments
- Custom fine-tuned models
- No API costs or data sharing
- Offline development

**Models:**
- `codellama:34b`: Best coding performance
- `llama2:70b`: General purpose
- `mistral:7b`: Lightweight option

**Usage Example:**
```typescript
const response = await aiHub.query({
  provider: 'ollama',
  model: 'codellama:34b',
  prompt: 'Review this code for security issues',
  taskType: 'local'
});
```

### OpenAI - Limited Use
**Why limited:** OpenAI models are not optimal for coding tasks compared to alternatives.

**Used only for:**
- Natural language tasks 
- Non-coding queries
- Fallback when other models unavailable

## 🔄 Intelligent Routing Logic

### Task Classification
```typescript
export function classifyTask(prompt: string, context?: ProjectContext): TaskType {
  const lowerPrompt = prompt.toLowerCase();
  
  // Blockchain/DeFi keywords
  if (lowerPrompt.includes('solana') || lowerPrompt.includes('smart contract') || 
      lowerPrompt.includes('defi') || lowerPrompt.includes('web3')) {
    return 'blockchain';
  }
  
  // Security keywords  
  if (lowerPrompt.includes('security') || lowerPrompt.includes('audit') ||
      lowerPrompt.includes('vulnerability')) {
    return 'security';
  }
  
  // Fast coding keywords
  if (lowerPrompt.includes('react') || lowerPrompt.includes('component') ||
      lowerPrompt.includes('quick') || lowerPrompt.includes('fix')) {
    return 'fast-coding';
  }
  
  // Multimodal keywords
  if (lowerPrompt.includes('image') || lowerPrompt.includes('design') ||
      lowerPrompt.includes('screenshot') || lowerPrompt.includes('mockup')) {
    return 'multimodal';
  }
  
  // Large codebase analysis
  if (lowerPrompt.includes('analyze') || lowerPrompt.includes('codebase') ||
      lowerPrompt.includes('architecture') || context?.isLargeProject) {
    return 'large-codebase';
  }
  
  return 'general';
}
```

### Model Selection Strategy
```typescript
export function selectOptimalModel(taskType: TaskType, userPreferences?: UserPrefs): ModelConfig {
  // Check user preferences first
  if (userPreferences?.preferredModel?.[taskType]) {
    return userPreferences.preferredModel[taskType];
  }
  
  // Default intelligent routing
  const modelMap: Record<TaskType, ModelConfig> = {
    'blockchain': { provider: 'claude', model: 'claude-3-sonnet' },
    'security': { provider: 'claude', model: 'claude-3-opus' },
    'fast-coding': { provider: 'groq', model: 'llama-70b-8192' },
    'ui-components': { provider: 'groq', model: 'llama-70b-8192' },
    'multimodal': { provider: 'gemini', model: 'gemini-2.5-pro' },
    'large-codebase': { provider: 'gemini', model: 'gemini-2.5-pro' },
    'local': { provider: 'ollama', model: 'codellama:34b' },
    'general': { provider: 'claude', model: 'claude-3-sonnet' }
  };
  
  return modelMap[taskType] || modelMap['general'];
}
```

## 📊 Usage Analytics & Optimization

### Cost Tracking
```typescript
export class UsageTracker {
  trackAPICall(provider: string, model: string, tokens: number, cost: number) {
    // Track costs by provider for optimization
    this.updateProviderStats(provider, { tokens, cost });
  }
  
  getCostOptimizationSuggestions(): OptimizationTip[] {
    // Suggest using Groq for tasks currently using Claude
    // Recommend local models for privacy-sensitive tasks
    // Identify opportunities to use free tiers
  }
}
```

### Performance Monitoring
```typescript
export class PerformanceMonitor {
  trackResponseTime(provider: string, model: string, responseTime: number) {
    // Monitor which models are fastest for different tasks
  }
  
  trackSuccessRate(provider: string, model: string, wasSuccessful: boolean) {
    // Track which models produce the best results
  }
}
```

## 🔧 Configuration

### User Preferences (recoder.md)
```markdown
# My Recoder Preferences

## AI Model Preferences
- **Security tasks**: Always use Claude-3-Opus for maximum accuracy
- **UI development**: Prefer Groq for speed, fallback to Claude
- **Large analysis**: Use Gemini-2.5-Pro for 1M+ token context
- **Local development**: Use Ollama when working on sensitive projects

## Agent Configurations  
- **Blockchain Agent**: Claude-3-Sonnet, security-focused prompts
- **Web Agent**: Groq/Llama-70B, modern React patterns
- **Security Agent**: Claude-3-Opus, comprehensive audit approach

## Code Style Preferences
- TypeScript strict mode always
- Prefer functional components over class components
- Use Tailwind CSS for styling
- Include comprehensive error handling
```

### Project Context (knowledge.md)
```markdown
# Project Knowledge

## Architecture
This is a Solana DeFi yield farming protocol using:
- Anchor framework for smart contracts
- Next.js 14 for frontend
- TypeScript throughout
- Deployed on devnet, planning mainnet

## Preferences
- Focus on user experience and gas optimization
- Security is paramount - always audit smart contracts
- Use real market data, never mock values
- Maintain backwards compatibility with existing contracts
```

---

**This intelligent multi-AI approach is what makes recoder.xyz superior to single-model CLI tools!** 🚀