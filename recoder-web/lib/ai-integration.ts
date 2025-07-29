/**
 * Enhanced AI Integration for Recoder Web Platform
 * 
 * Multi-AI provider system with intelligent model selection,
 * real code generation, and integration with recoder.xyz CLI ecosystem.
 * Now uses the unified API system from the extension.
 */

import { buildApiHandler, type ApiHandler } from './api';
import type { ProviderSettings } from './api/providers/types';

export interface AIProvider {
  name: string;
  models: string[];
  useCases: string[];
  generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult>;
  isAvailable(): Promise<boolean>;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  language?: string;
  framework?: string;
  includeTests?: boolean;
  includeDocs?: boolean;
  realCode?: boolean;
  context?: ProjectContext;
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  confidence: number;
  provider: string;
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  metadata: {
    language: string;
    framework?: string;
    dependencies: string[];
    realFunctionality: boolean;
  };
}

export interface ProjectContext {
  files: Array<{ name: string; content: string }>;
  dependencies: Record<string, string>;
  framework: string;
  language: string;
  description?: string;
}

/**
 * Claude AI Provider
 */
class ClaudeProvider implements AIProvider {
  name = 'claude';
  models = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'];
  useCases = ['complex-logic', 'architecture', 'code-review', 'security'];

  async generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Claude API key not configured');
    }

    try {
      // Enhanced prompt for real code generation
      const enhancedPrompt = this.buildEnhancedPrompt(prompt, options);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.model || 'claude-3-5-sonnet-20241022',
          max_tokens: options.maxTokens || 4000,
          temperature: options.temperature || 0.1,
          messages: [
            {
              role: 'user',
              content: enhancedPrompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const generatedCode = this.extractCodeFromResponse(data.content[0].text);

      return {
        code: generatedCode,
        explanation: this.extractExplanation(data.content[0].text),
        confidence: 0.9, // Claude is highly reliable for complex tasks
        provider: 'claude',
        model: options.model || 'claude-3-5-sonnet-20241022',
        tokens: {
          input: data.usage?.input_tokens || 0,
          output: data.usage?.output_tokens || 0
        },
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework,
          dependencies: this.extractDependencies(generatedCode),
          realFunctionality: true
        }
      };
    } catch (error) {
      throw new Error(`Claude generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private buildEnhancedPrompt(prompt: string, options: GenerationOptions): string {
    const systemPrompt = `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations or placeholder functions.

CRITICAL REQUIREMENTS:
- Generate ACTUAL working code with real functionality
- Include proper error handling and validation
- Use real API integrations (Stripe for payments, real auth systems, etc.)
- Include comprehensive TypeScript types
- Generate working database operations with Prisma
- Create responsive UIs with Tailwind CSS
- Include real environment variable usage
- Add proper security measures

${options.includeTests ? '- Include comprehensive test suites with Jest/Vitest' : ''}
${options.includeDocs ? '- Include detailed documentation and README' : ''}`;

    return `${systemPrompt}

User Request: ${prompt}

${options.context ? `
Project Context:
- Language: ${options.context.language}
- Framework: ${options.context.framework}
- Dependencies: ${JSON.stringify(options.context.dependencies, null, 2)}
- Description: ${options.context.description}
` : ''}

Generate a complete, production-ready implementation. Structure your response as:

## Explanation
[Brief explanation of the approach and architecture]

## Code
\`\`\`${options.language || 'typescript'}
[Complete, working code here]
\`\`\`

## Dependencies
[List any new dependencies needed]

## Environment Variables
[List required environment variables]

## Setup Instructions
[Brief setup instructions if needed]`;
  }

  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      // Return the largest code block (most likely the main implementation)
      return matches
        .map(match => match.replace(/```(?:\w+)?\n/, '').replace(/\n```$/, ''))
        .sort((a, b) => b.length - a.length)[0];
    }
    
    return response; // Fallback if no code blocks found
  }

  private extractExplanation(response: string): string {
    const lines = response.split('\n');
    const explanationStart = lines.findIndex(line => line.includes('## Explanation'));
    const codeStart = lines.findIndex(line => line.includes('## Code'));
    
    if (explanationStart >= 0 && codeStart > explanationStart) {
      return lines.slice(explanationStart + 1, codeStart).join('\n').trim();
    }
    
    return 'Code generated successfully with Claude AI';
  }

  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
    
    // Extract import statements
    const importRegex = /import.*from ['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      const packageName = match[1];
      if (!packageName.startsWith('.') && !packageName.startsWith('/')) {
        dependencies.push(packageName.split('/')[0]);
      }
    }
    
    return [...new Set(dependencies)];
  }
}

/**
 * Together AI Provider (supports many models including new ones)
 */
class TogetherProvider implements AIProvider {
  name = 'together';
  models = [
    'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-V3', 
    'Qwen/QwenQwen2.5-Coder-32B-Instruct',
    'moonshot-ai/moonshot-v1-128k',
    'DeepSeek-AI/deepseek-r1-0528'
  ];
  useCases = ['multi-model', 'cost-effective', 'variety', 'latest-models'];

  async generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    if (!process.env.TOGETHER_API_KEY) {
      throw new Error('Together API key not configured');
    }

    try {
      const response = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`
        },
        body: JSON.stringify({
          model: options.model || 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
          messages: [
            {
              role: 'system',
              content: 'You are Recoder, an AI that generates real, production-ready code. Never create mock implementations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature || 0.2,
          max_tokens: options.maxTokens || 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Together API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      return {
        code: this.extractCodeFromResponse(content),
        explanation: 'Generated with Together AI multi-model platform',
        confidence: 0.85,
        provider: 'together',
        model: options.model || 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
        tokens: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0
        },
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework,
          dependencies: this.extractDependencies(content),
          realFunctionality: true
        }
      };
    } catch (error) {
      throw new Error(`Together generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.TOGETHER_API_KEY;
  }

  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      return matches[0].replace(/```(?:\w+)?\n/, '').replace(/\n```$/, '');
    }
    
    return response;
  }

  private extractDependencies(code: string): string[] {
    // Similar to Claude implementation
    return [];
  }
}

/**
 * Hugging Face Provider
 */
class HuggingFaceProvider implements AIProvider {
  name = 'huggingface';
  models = ['codellama/CodeLlama-7b-Instruct-hf', 'codellama/CodeLlama-13b-Instruct-hf'];
  useCases = ['open-source', 'cost-effective', 'code-generation'];

  async generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error('Hugging Face API key not configured');
    }

    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${options.model || 'codellama/CodeLlama-7b-Instruct-hf'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        },
        body: JSON.stringify({
          inputs: `Generate REAL, PRODUCTION-READY code for: ${prompt}

Requirements:
- Must be fully functional, not placeholder code
- Include actual implementations with real logic
- Proper error handling and validation
- Production-ready code quality

Code:`,
          parameters: {
            max_new_tokens: options.maxTokens || 4000,
            temperature: options.temperature || 0.3,
            return_full_text: false,
            do_sample: true
          },
          options: {
            wait_for_model: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Hugging Face API error: ${response.status}`);
      }

      const data = await response.json();
      let content = '';
      if (Array.isArray(data) && data[0]?.generated_text) {
        content = data[0].generated_text;
      } else if (data?.generated_text) {
        content = data.generated_text;
      } else {
        content = JSON.stringify(data);
      }

      return {
        code: content.trim(),
        explanation: 'Generated with Hugging Face open-source models',
        confidence: 0.75,
        provider: 'huggingface',
        model: options.model || 'codellama/CodeLlama-7b-Instruct-hf',
        tokens: {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(content.length / 4)
        },
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework,
          dependencies: this.extractDependencies(content),
          realFunctionality: true
        }
      };
    } catch (error) {
      throw new Error(`Hugging Face generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.HUGGINGFACE_API_KEY;
  }

  private extractDependencies(code: string): string[] {
    return [];
  }
}

/**
 * OpenRouter Provider
 */
class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  models = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4', 'meta-llama/llama-3.1-405b'];
  useCases = ['multi-model-access', 'cost-optimization', 'model-variety'];

  async generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://recoder.xyz',
          'X-Title': 'Recoder.xyz'
        },
        body: JSON.stringify({
          model: options.model || 'anthropic/claude-3.5-sonnet',
          messages: [
            {
              role: 'system',
              content: 'You are Recoder, an AI that generates real, production-ready code. Never create mock implementations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature || 0.3,
          max_tokens: options.maxTokens || 4000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      return {
        code: this.extractCodeFromResponse(content),
        explanation: 'Generated via OpenRouter multi-model platform',
        confidence: 0.85,
        provider: 'openrouter',
        model: options.model || 'anthropic/claude-3.5-sonnet',
        tokens: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0
        },
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework,
          dependencies: this.extractDependencies(content),
          realFunctionality: true
        }
      };
    } catch (error) {
      throw new Error(`OpenRouter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENROUTER_API_KEY;
  }

  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      return matches[0].replace(/```(?:\w+)?\n/, '').replace(/\n```$/, '');
    }
    
    return response;
  }

  private extractDependencies(code: string): string[] {
    return [];
  }
}

/**
 * Groq AI Provider  
 */
class GroqProvider implements AIProvider {
  name = 'groq';
  models = ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];
  useCases = ['fast-generation', 'api-endpoints', 'prototyping'];

  async generateCode(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Groq API key not configured');
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: options.model || 'llama-3.1-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are Recoder, an AI that generates real, production-ready code. Never create mock implementations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature || 0.2,
          max_tokens: options.maxTokens || 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      return {
        code: this.extractCodeFromResponse(content),
        explanation: 'Fast code generation with Groq LLaMA',
        confidence: 0.8,
        provider: 'groq',
        model: options.model || 'llama-3.1-70b-versatile',
        tokens: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0
        },
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework,
          dependencies: this.extractDependencies(content),
          realFunctionality: true
        }
      };
    } catch (error) {
      throw new Error(`Groq generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GROQ_API_KEY;
  }

  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      return matches[0].replace(/```(?:\w+)?\n/, '').replace(/\n```$/, '');
    }
    
    return response;
  }

  private extractDependencies(code: string): string[] {
    // Similar to Claude implementation
    return [];
  }
}

/**
 * Intelligent AI Router
 * 
 * Routes requests to the optimal AI provider based on the task,
 * user preferences, and system availability.
 */
export class IntelligentAIRouter {
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private async initializeProviders() {
    // Initialize available providers
    const claude = new ClaudeProvider();
    const groq = new GroqProvider();
    const together = new TogetherProvider();
    const huggingface = new HuggingFaceProvider();
    const openrouter = new OpenRouterProvider();

    if (await claude.isAvailable()) {
      this.providers.set('claude', claude);
    }
    
    if (await groq.isAvailable()) {
      this.providers.set('groq', groq);
    }
    
    if (await together.isAvailable()) {
      this.providers.set('together', together);
    }
    
    if (await huggingface.isAvailable()) {
      this.providers.set('huggingface', huggingface);
    }
    
    if (await openrouter.isAvailable()) {
      this.providers.set('openrouter', openrouter);
    }
  }

  async generateCode(prompt: string, options: GenerationOptions = {}): Promise<GenerationResult> {
    // Intelligent provider selection
    const selectedProvider = await this.selectOptimalProvider(prompt, options);
    
    if (!selectedProvider) {
      throw new Error('No AI providers available. Please configure API keys.');
    }

    try {
      const result = await selectedProvider.generateCode(prompt, {
        ...options,
        realCode: true // Always enforce real code generation
      });

      // Validate the result
      if (!this.validateCodeQuality(result.code)) {
        throw new Error('Generated code failed quality validation');
      }

      return result;
    } catch (error) {
      // Fallback to another provider if available
      const fallbackProvider = await this.getFallbackProvider(selectedProvider.name);
      
      if (fallbackProvider) {
        console.warn(`Primary provider failed, falling back to ${fallbackProvider.name}`);
        return await fallbackProvider.generateCode(prompt, options);
      }
      
      throw error;
    }
  }

  private async selectOptimalProvider(prompt: string, options: GenerationOptions): Promise<AIProvider | null> {
    const availableProviders = Array.from(this.providers.values());
    
    if (availableProviders.length === 0) {
      return null;
    }

    // If user specified a provider, use it
    if (options.model && this.providers.has(this.getProviderFromModel(options.model))) {
      return this.providers.get(this.getProviderFromModel(options.model)) || null;
    }

    // Intelligent selection based on prompt analysis
    const taskType = this.analyzeTaskType(prompt);
    const bestProvider = this.getBestProviderForTask(taskType, availableProviders);
    
    return bestProvider;
  }

  private analyzeTaskType(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('security') || lowerPrompt.includes('auth') || lowerPrompt.includes('complex')) {
      return 'complex-logic';
    }
    
    if (lowerPrompt.includes('api') || lowerPrompt.includes('endpoint') || lowerPrompt.includes('fast')) {
      return 'fast-generation';
    }
    
    if (lowerPrompt.includes('review') || lowerPrompt.includes('analyze')) {
      return 'code-review';
    }
    
    if (lowerPrompt.includes('reasoning') || lowerPrompt.includes('step-by-step') || lowerPrompt.includes('logic')) {
      return 'reasoning';
    }
    
    if (lowerPrompt.includes('code') || lowerPrompt.includes('function') || lowerPrompt.includes('class')) {
      return 'code-generation';
    }
    
    if (lowerPrompt.includes('multiple') || lowerPrompt.includes('variety') || lowerPrompt.includes('latest')) {
      return 'multi-model';
    }
    
    return 'general';
  }

  private getBestProviderForTask(taskType: string, providers: AIProvider[]): AIProvider {
    // Find provider that specializes in this task type
    const specialist = providers.find(provider => 
      provider.useCases.includes(taskType)
    );
    
    if (specialist) {
      return specialist;
    }
    
    // Task-specific provider preferences
    const taskPreferences: { [key: string]: string[] } = {
      'reasoning': ['together', 'claude', 'openrouter', 'groq', 'huggingface'],
      'code-generation': ['together', 'huggingface', 'groq', 'claude', 'openrouter'],
      'multi-model': ['openrouter', 'together', 'claude', 'groq', 'huggingface'],
      'fast-generation': ['groq', 'together', 'huggingface', 'claude', 'openrouter'],
      'complex-logic': ['claude', 'openrouter', 'together', 'groq', 'huggingface'],
      'code-review': ['claude', 'openrouter', 'together', 'groq', 'huggingface'],
      'open-source': ['huggingface', 'together', 'groq', 'claude', 'openrouter'],
      'cost-effective': ['huggingface', 'together', 'groq', 'openrouter', 'claude']
    };
    
    const preferences = taskPreferences[taskType] || ['claude', 'together', 'groq'];
    
    // Find first available provider from preferences
    for (const preferredName of preferences) {
      const provider = providers.find(p => p.name === preferredName);
      if (provider) return provider;
    }
    
    return providers[0];
  }

  private async getFallbackProvider(failedProviderName: string): Promise<AIProvider | null> {
    const availableProviders = Array.from(this.providers.values());
    return availableProviders.find(p => p.name !== failedProviderName) || null;
  }

  private getProviderFromModel(model: string): string {
    if (model.includes('claude')) return 'claude';
    if (model.includes('llama')) return 'groq';
    if (model.includes('gemini')) return 'gemini';
    return 'claude'; // Default
  }

  private validateCodeQuality(code: string): boolean {
    // Basic quality checks
    if (code.length < 10) return false;
    
    // Check for mock implementations (red flags)
    const mockIndicators = [
      'TODO:',
      'placeholder',
      'mock implementation',
      'not implemented',
      'throw new Error("Not implemented")'
    ];
    
    const lowerCode = code.toLowerCase();
    const hasMockImplementation = mockIndicators.some(indicator => 
      lowerCode.includes(indicator.toLowerCase())
    );
    
    return !hasMockImplementation;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Import unified web AI system
import { unifiedWebAI, generateWebCode, type WebGenerationOptions, type WebGenerationResult } from './unified-web-ai';

// Legacy router for backward compatibility
export const aiRouter = new IntelligentAIRouter();

// NEW: Enhanced utility functions using unified API
export const generateCode = async (prompt: string, options?: GenerationOptions): Promise<GenerationResult> => {
  try {
    // Try unified API first
    const webOptions: WebGenerationOptions = {
      preferredProvider: options?.model ? getProviderFromModel(options.model) : undefined,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      language: options?.language,
      framework: options?.framework,
      includeTests: options?.includeTests,
      includeDocs: options?.includeDocs,
      costOptimized: true
    };

    const webResult = await generateWebCode(prompt, webOptions);
    
    // Convert to legacy format
    return {
      code: webResult.code,
      explanation: webResult.explanation,
      confidence: 0.9,
      provider: webResult.provider,
      model: webResult.model,
      tokens: webResult.tokens,
      metadata: webResult.metadata
    };
    
  } catch (error) {
    console.warn('Unified API failed, falling back to legacy router:', error);
    // Fallback to legacy router
    return await aiRouter.generateCode(prompt, options);
  }
};

export const generateCodeUnified = async (prompt: string, options?: WebGenerationOptions): Promise<WebGenerationResult> => {
  return await generateWebCode(prompt, options);
};

export const getAvailableAIProviders = (): string[] => {
  const unifiedProviders = unifiedWebAI.getAvailableProviders().map(p => p.name);
  const legacyProviders = aiRouter.getAvailableProviders();
  
  // Combine and deduplicate
  return [...new Set([...unifiedProviders, ...legacyProviders])];
};

export const getProviderCapabilities = () => {
  return unifiedWebAI.getAvailableProviders();
};

// Helper function to map models to providers
function getProviderFromModel(model: string): string {
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('gemini')) return 'gemini';
  if (model.includes('llama') || model.includes('groq')) return 'groq';
  return 'openrouter';
}

// Export both systems
export { unifiedWebAI, aiRouter as legacyRouter };
export default unifiedWebAI;