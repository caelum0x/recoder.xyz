/**
 * Local-First Web AI Integration
 * Prioritizes free local AI models (Ollama/LM Studio) over cloud APIs for recoder-web
 * This matches the recoder-chat local-first approach
 */

// import { createOpenAI } from 'ai'; // TODO: Install ai package if needed
import type { ProviderSettings, TaskContext } from './types';

// Create Ollama provider (local AI)
const ollamaConfig = {
  baseURL: process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  apiKey: 'ollama', // Ollama doesn't need real API key
};

// Create LM Studio provider (local AI)
const lmStudioConfig = {
  baseURL: process.env.NEXT_PUBLIC_LM_STUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
  apiKey: 'lmstudio', // LM Studio doesn't need real API key
};

// Check if local AI is available (client-side compatible)
const isOllamaAvailable = (): boolean => {
  try {
    const url = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL;
    return Boolean(url && url !== '');
  } catch {
    return false;
  }
};

const isLMStudioAvailable = (): boolean => {
  try {
    const url = process.env.NEXT_PUBLIC_LM_STUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL;
    return Boolean(url && url !== '');
  } catch {
    return false;
  }
};

// Check if cloud providers are available (compatible with Next.js)
const isAnthropicAvailable = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
const isGroqAvailable = (): boolean => Boolean(process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY);
const isOpenAIAvailable = (): boolean => Boolean(process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
const isXAIAvailable = (): boolean => Boolean(process.env.XAI_API_KEY);
const isGeminiAvailable = (): boolean => Boolean(process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY);
const isOpenRouterAvailable = (): boolean => Boolean(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY);

/**
 * Smart provider selection for recoder-web with local-first priority
 * 1. Try local models (free)
 * 2. Fall back to cloud models (premium)
 */
export const getLocalFirstWebProvider = (taskType?: 'web' | 'backend' | 'mobile' | 'blockchain' | 'security' | 'general'): ProviderSettings | null => {
  const type = taskType || 'web';
  
  // 1st Priority: Local models (FREE)
  if (isOllamaAvailable()) {
    return {
      apiProvider: 'ollama',
      apiKey: 'ollama',
      ollamaBaseUrl: ollamaConfig.baseURL,
      ollamaModelId: getOptimalOllamaModel(type),
      // ollamaUseMiddleOutTransform: true
    };
  } 

  if (isLMStudioAvailable()) {
    return {
      apiProvider: 'lmstudio',
      //lmStudioApiKey: 'lmstudio',
      //lmStudioBaseUrl: lmStudioConfig.baseURL,
      //lmStudioModelId: 'local-model', // User's loaded model
      //lmStudioUseMiddleOutTransform: true
    };
  }

  // 2nd Priority: Fast and cheap cloud models
  if (isOpenRouterAvailable()) {
    return {
      apiProvider: 'openrouter',
      openRouterApiKey: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
      openRouterModelId: getOptimalOpenRouterModel(type),
      openRouterUseMiddleOutTransform: true
    };
  }

  if (isGroqAvailable()) {
    return {
      apiProvider: 'groq',
      groqApiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY,
      groqModelId: getOptimalGroqModel(type),
      openRouterUseMiddleOutTransform: true
    };
  }

  if (isGeminiAvailable()) {
    return {
      apiProvider: 'gemini',
      geminiApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY,
      geminiModelId: 'gemini-2.0-flash-exp'
    };
  }

  // 3rd Priority: High-quality premium models
  if (isAnthropicAvailable()) {
    return {
      apiProvider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      apiModelId: 'claude-3-5-sonnet-20241022'
    };
  }

  if (isOpenAIAvailable()) {
    return {
      apiProvider: 'openai',
      openAiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      openAiModelId: 'gpt-4o'
    };
  }

  // 4th Priority: XAI as last resort (maintaining compatibility)
  if (isXAIAvailable()) {
    return {
      apiProvider: 'xai',
      apiKey: process.env.XAI_API_KEY,
      //xaiModelId: 'grok-2-vision-1212'
    };
  }

  return null;
};

/**
 * Get optimal Ollama model for task type
 */
const getOptimalOllamaModel = (taskType: string): string => {
  switch (taskType) {
    case 'web':
    case 'backend':
      return 'qwen2.5-coder:7b'; // Best local coding model
    case 'mobile':
      return 'codellama:13b-instruct'; // Good for mobile frameworks
    case 'blockchain':
      return 'mistral:7b-instruct'; // Better reasoning for smart contracts
    case 'security':
      return 'llama3.1:8b-instruct'; // Security-focused
    default:
      return 'qwen2.5-coder:7b';
  }
};

/**
 * Get optimal OpenRouter model for task type - Updated with latest rankings
 * Based on OpenRouter leaderboard: Claude Sonnet 4 #1 (57% usage), Gemini 2.5 Flash #3 (331% growth)
 */
const getOptimalOpenRouterModel = (taskType: string): string => {
  switch (taskType) {
    case 'web':
      return 'anthropic/claude-sonnet-4'; // #1 Most popular model - 57% usage, best for web development
    case 'backend':
      return 'anthropic/claude-sonnet-4'; // #1 Most popular - great for APIs and complex logic
    case 'mobile':
      return 'google/gemini-2.5-flash'; // #3 Fastest model - 331% growth, excellent for mobile UI
    case 'blockchain':
      return 'deepseek/deepseek-v3-0324'; // #6 Best reasoning model for smart contracts
    case 'security':
      return 'anthropic/claude-sonnet-4'; // #1 Most trusted for security analysis
    case 'coding':
      return 'qwen/qwen3-coder'; // #16 Specialist coding model
    default:
      return 'anthropic/claude-sonnet-4'; // Default to #1 most popular
  }
};

/**
 * Get optimal Groq model for task type
 */
const getOptimalGroqModel = (taskType: string): string => {
  switch (taskType) {
    case 'web':
    case 'backend':
      return 'llama-3.1-70b-versatile'; // Fast and capable
    case 'mobile':
      return 'llama-3.1-8b-instant'; // Very fast
    case 'blockchain':
      return 'llama-3.1-70b-versatile'; // Better reasoning
    case 'security':
      return 'llama-3.1-8b-instant'; // Fast security checks
    default:
      return 'llama-3.1-70b-versatile';
  }
};

/**
 * Get current AI provider status for web platform
 */
export const getWebProviderStatus = () => {
  const status = {
    local: {
      ollama: isOllamaAvailable(),
      lmstudio: isLMStudioAvailable(),
    },
    cloud: {
      openrouter: isOpenRouterAvailable(),
      groq: isGroqAvailable(),
      gemini: isGeminiAvailable(),
      anthropic: isAnthropicAvailable(),
      openai: isOpenAIAvailable(),
      xai: isXAIAvailable(),
    },
    priority: [] as string[],
  };

  // Build priority list for web with latest model rankings
  if (status.local.ollama) status.priority.push('Ollama (FREE - qwen2.5-coder:7b)');
  if (status.local.lmstudio) status.priority.push('LM Studio (FREE - Custom Models)');
  if (status.cloud.openrouter) status.priority.push('OpenRouter (Claude Sonnet 4 + Latest Models)');
  if (status.cloud.groq) status.priority.push('Groq (Fast & Cheap)');
  if (status.cloud.gemini) status.priority.push('Gemini (Multimodal)');
  if (status.cloud.anthropic) status.priority.push('Claude Direct (Sonnet 3.5)');
  if (status.cloud.openai) status.priority.push('OpenAI (GPT-4o)');
  if (status.cloud.xai) status.priority.push('xAI (Grok-2)');

  if (status.priority.length === 0) {
    status.priority.push('❌ No providers available');
  }

  return status;
};

/**
 * Get setup instructions for web platform users
 */
export const getWebSetupInstructions = () => {
  const status = getWebProviderStatus();
  const instructions: string[] = [];

  if (!status.local.ollama && !status.local.lmstudio) {
    instructions.push(
      '🆓 **Get Started Free (Web Platform):**',
      '1. Install Ollama: https://ollama.ai',
      '2. Run: `ollama pull qwen2.5-coder:7b`',
      '3. Set NEXT_PUBLIC_OLLAMA_BASE_URL=http://localhost:11434',
      '4. Or install LM Studio: https://lmstudio.ai',
      '5. Set NEXT_PUBLIC_LM_STUDIO_BASE_URL=http://localhost:1234/v1',
      ''
    );
  }

  if (!status.cloud.openrouter && !status.cloud.groq) {
    instructions.push(
      '🚀 **Upgrade to Latest AI Models (Web):**',
      '1. Add NEXT_PUBLIC_OPENROUTER_API_KEY for Claude Sonnet 4 (57% market leader)',
      '2. Access 400+ models: Gemini 2.5 Flash, DeepSeek V3, Qwen3 Coder',
      '3. Add NEXT_PUBLIC_GROQ_API_KEY for fast inference',
      '4. Add ANTHROPIC_API_KEY for direct Claude access (server-side only)',
      '5. Visit Settings to configure API keys',
      ''
    );
  }

  if (instructions.length === 0) {
    instructions.push('✅ All systems ready! Web platform has both local and cloud AI available.');
  }

  return instructions.join('\n');
};

/**
 * Build unified web provider configurations with local-first priority
 */
export const buildLocalFirstWebConfigs = (): Map<string, ProviderSettings> => {
  const configs = new Map<string, ProviderSettings>();

  // Add available providers in priority order
  const taskTypes = ['web', 'backend', 'mobile', 'blockchain', 'security'];
  
  for (const taskType of taskTypes) {
    const provider = getLocalFirstWebProvider(taskType as any);
    if (provider) {
      configs.set(`${taskType}-provider`, provider);
    }
  }

  // Add fallback general provider
  const generalProvider = getLocalFirstWebProvider('general');
  if (generalProvider) {
    configs.set('general-provider', generalProvider);
  }

  return configs;
};

/**
 * Check if any AI provider is available
 */
export const hasAnyWebProvider = (): boolean => {
  return isOllamaAvailable() || 
         isLMStudioAvailable() || 
         isOpenRouterAvailable() || 
         isGroqAvailable() || 
         isGeminiAvailable() || 
         isAnthropicAvailable() || 
         isOpenAIAvailable() || 
         isXAIAvailable();
};

/**
 * Get provider recommendation based on task
 */
export const getWebProviderRecommendation = (taskType: string = 'web'): {
  provider: string;
  model: string;
  reason: string;
  cost: 'free' | 'cheap' | 'premium';
} => {
  if (isOllamaAvailable()) {
    return {
      provider: 'Ollama',
      model: getOptimalOllamaModel(taskType),
      reason: 'Free local AI - best for privacy and unlimited usage',
      cost: 'free'
    };
  }

  if (isLMStudioAvailable()) {
    return {
      provider: 'LM Studio',
      model: 'local-model',
      reason: 'Free local AI with custom model support',
      cost: 'free'
    };
  }

  if (isOpenRouterAvailable()) {
    return {
      provider: 'OpenRouter',
      model: getOptimalOpenRouterModel(taskType),
      reason: '#1 most popular AI models (Claude Sonnet 4 57% usage) + 400+ model access',
      cost: 'cheap'
    };
  }

  if (isGroqAvailable()) {
    return {
      provider: 'Groq',
      model: getOptimalGroqModel(taskType),
      reason: 'Lightning fast inference at low cost',
      cost: 'cheap'
    };
  }

  if (isAnthropicAvailable()) {
    return {
      provider: 'Claude (Anthropic)',
      model: 'claude-3.5-sonnet',
      reason: 'Highest quality code generation',
      cost: 'premium'
    };
  }

  return {
    provider: 'None',
    model: 'N/A',
    reason: 'No AI providers configured. Install Ollama for free local AI.',
    cost: 'free'
  };
};