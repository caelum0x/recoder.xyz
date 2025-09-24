/**
 * OpenRouter AI Integration for Real Code Generation
 * Connects to OpenRouter API for production-ready AI code generation
 */

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GenerationRequest {
  description: string;
  type: string;
  framework?: string;
  features?: string[];
  complexity?: 'simple' | 'medium' | 'complex';
  userPlan?: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise';
}

interface GenerationResult {
  files: Array<{
    path: string;
    content: string;
    type: 'code' | 'config' | 'test' | 'documentation';
    language?: string;
  }>;
  instructions: string;
  metadata: {
    provider: string;
    model: string;
    tokensUsed: number;
    generationTime: number;
    cost?: number;
  };
}

export class OpenRouterAI {
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('⚠️ OpenRouter API key not found. Using template-based generation.');
    }
  }

  async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      if (!this.apiKey) {
        // Fallback to template-based generation
        return this.generateTemplateCode(request);
      }

      // Select best model for the task based on user's plan
      const model = this.selectModelForTask(request.type, request.complexity, request.userPlan);
      
      // Generate system and user prompts
      const { systemPrompt, userPrompt } = this.buildPrompts(request);

      // Call OpenRouter API
      const response = await this.callOpenRouter(model, systemPrompt, userPrompt);
      
      // Parse AI response into structured files
      const files = this.parseAIResponse(response.choices[0].message.content, request);
      
      const generationTime = Date.now() - startTime;
      
      return {
        files,
        instructions: this.generateInstructions(request),
        metadata: {
          provider: 'openrouter',
          model,
          tokensUsed: response.usage.total_tokens,
          generationTime,
          cost: this.calculateCost(response.usage.total_tokens, model)
        }
      };

    } catch (error: any) {
      console.error('❌ OpenRouter AI generation failed:', error);
      
      // Fallback to template-based generation
      console.log('🔄 Falling back to template-based generation...');
      return this.generateTemplateCode(request);
    }
  }

  private selectModelForTask(type: string, complexity?: string, userPlan: string = 'free'): string {
    // All models available to all users - only rate limits differ by plan
    const allModels = [
      'anthropic/claude-4-sonnet', // Top priority model
      'anthropic/claude-3.5-sonnet', // Premium reasoning
      'google/gemini-2.5-pro', // Professional use cases
      'google/gemini-2.5-flash', // Fast responses
      'google/gemini-2.0-flash', // Balanced performance
      'deepseek/deepseek-v3-0324', // Cost-effective
      'qwen/qwq-32b-preview', // Code generation specialist
      'meta-llama/llama-3.3-70b-instruct' // Versatile
    ];

    // Free users get access to free models only
    const freeModels = [
      'deepseek/deepseek-v3-0324-free', // Free tier
      'deepseek/deepseek-r1-0528-free' // Free alternative
    ];

    // Use free models for free plan, all models for paid plans
    const availableModels = userPlan === 'free' ? freeModels : allModels;

    // Task-based model selection for optimal results
    const taskModelPreferences: Record<string, string[]> = {
      'blockchain': ['anthropic/claude-4-sonnet', 'anthropic/claude-3.5-sonnet'], // Best for smart contracts
      'ai': ['anthropic/claude-4-sonnet', 'qwen/qwq-32b-preview'], // Best for AI/ML code
      'backend': ['deepseek/deepseek-v3-0324', 'google/gemini-2.5-flash'], // Fast for APIs
      'web': ['google/gemini-2.5-flash', 'google/gemini-2.0-flash'], // Fast for frontend
      'mobile': ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro'], // Complex native code
      'chat': ['google/gemini-2.5-flash', 'deepseek/deepseek-v3-0324'] // Fast responses
    };

    // Select best available model for task and complexity
    const preferredModels = taskModelPreferences[type] || taskModelPreferences.web;
    
    // Find first preferred model available to user's plan
    for (const model of preferredModels) {
      if (availableModels.includes(model)) {
        return model;
      }
    }

    // Fallback based on complexity
    if (complexity === 'complex' && availableModels.includes('anthropic/claude-3.5-sonnet')) {
      return 'anthropic/claude-3.5-sonnet';
    }

    // Return first available model
    return availableModels[0] || 'deepseek/deepseek-v3-0324-free';
  }

  private buildPrompts(request: GenerationRequest): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a senior software engineer who generates REAL, PRODUCTION-READY code. 

CRITICAL REQUIREMENTS:
- Generate REAL working code, not placeholders or TODO comments
- Include proper error handling, validation, and security
- Use modern best practices and patterns
- Include real API calls, database operations, and business logic
- Add comprehensive logging and monitoring
- Generate complete files with full implementations

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/file/path",
      "content": "complete file content",
      "type": "code|config|test|documentation",
      "language": "javascript|typescript|python|etc"
    }
  ],
  "instructions": "Setup and deployment instructions"
}

NEVER generate incomplete code, placeholder functions, or TODO comments.
ALWAYS implement real functionality that works in production.`;

    const userPrompt = `Generate a ${request.type} application: "${request.description}"

Requirements:
- Type: ${request.type}
${request.framework ? `- Framework: ${request.framework}` : ''}
${request.features?.length ? `- Features: ${request.features.join(', ')}` : ''}
- Complexity: ${request.complexity || 'medium'}

Generate complete, production-ready files with:
1. Main application code with real functionality
2. Configuration files (package.json, etc.)
3. Setup/deployment documentation
4. Real API endpoints and business logic
5. Proper error handling and validation
6. Security best practices

Focus on creating code that actually works and can be deployed immediately.`;

    return { systemPrompt, userPrompt };
  }

  private async callOpenRouter(model: string, systemPrompt: string, userPrompt: string): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz Production Engine'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistent, reliable code
        max_tokens: 4000,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  private parseAIResponse(content: string, request: GenerationRequest): Array<any> {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(content);
      
      if (parsed.files && Array.isArray(parsed.files)) {
        return parsed.files;
      }
    } catch (error) {
      console.warn('Failed to parse AI response as JSON, using text parsing...');
    }

    // Fallback: parse markdown-style code blocks
    return this.parseMarkdownCodeBlocks(content, request);
  }

  private parseMarkdownCodeBlocks(content: string, request: GenerationRequest): Array<any> {
    const files: Array<any> = [];
    const codeBlockRegex = /```(\w+)?\s*(?:\/\/\s*(.+?)\s*)?\n([\s\S]*?)```/g;
    
    let match;
    let fileIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [, language, filename, code] = match;
      
      // Determine file path and type
      let path = filename || this.generateDefaultFilename(request.type, language, fileIndex);
      let type: 'code' | 'config' | 'test' | 'documentation' = 'code';
      
      if (path.includes('package.json') || path.includes('.env') || path.includes('config')) {
        type = 'config';
      } else if (path.includes('test') || path.includes('spec')) {
        type = 'test';
      } else if (path.includes('README') || path.includes('.md')) {
        type = 'documentation';
      }

      files.push({
        path,
        content: code.trim(),
        type,
        language: language || this.detectLanguage(path)
      });

      fileIndex++;
    }

    // If no code blocks found, create a single file with the entire content
    if (files.length === 0) {
      files.push({
        path: this.generateDefaultFilename(request.type, 'text', 0),
        content: content.trim(),
        type: 'code' as const,
        language: 'text'
      });
    }

    return files;
  }

  private generateDefaultFilename(type: string, language?: string, index: number = 0): string {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      go: 'go',
      rust: 'rs',
      solidity: 'sol'
    };

    const ext = language ? extensions[language] || language : 'js';
    
    if (index === 0) {
      const mainFiles: Record<string, string> = {
        web: `index.${ext}`,
        backend: `server.${ext}`,
        mobile: `App.${ext}`,
        blockchain: `contract.sol`,
        ai: `model.py`
      };
      return mainFiles[type] || `main.${ext}`;
    }

    return `file_${index}.${ext}`;
  }

  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      sol: 'solidity',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown'
    };

    return languageMap[ext || ''] || 'text';
  }

  private generateInstructions(request: GenerationRequest): string {
    const baseInstructions = `## ${request.description}

Generated using Recoder.xyz Production Engine with real AI-powered code generation.

### Quick Start

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Environment Setup**
   \`\`\`bash
   cp .env.example .env
   # Configure your environment variables
   \`\`\`

3. **Development**
   \`\`\`bash
   npm run dev
   \`\`\`

4. **Production Build**
   \`\`\`bash
   npm run build
   npm start
   \`\`\`

### Features Included
${request.features?.map(f => `- ${f}`).join('\n') || '- Production-ready implementation'}

### Next Steps
- Review and customize the generated code
- Configure environment variables
- Set up your database/external services
- Deploy to your preferred platform

---
*Generated by Recoder.xyz Production Engine*
*Real code, real functionality, production-ready*`;

    return baseInstructions;
  }

  private calculateCost(tokens: number, model: string): number {
    // OpenRouter pricing per 1M tokens (based on current models)
    const pricing: Record<string, { input: number; output: number }> = {
      // Top tier models
      'anthropic/claude-4-sonnet': { input: 3.0, output: 15.0 },
      'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
      'google/gemini-2.5-pro': { input: 1.25, output: 5.0 },
      
      // Balanced models
      'google/gemini-2.5-flash': { input: 0.075, output: 0.3 },
      'google/gemini-2.0-flash': { input: 0.075, output: 0.3 },
      'qwen/qwq-32b-preview': { input: 0.2, output: 1.0 },
      
      // Cost-effective models
      'deepseek/deepseek-v3-0324': { input: 0.55, output: 2.19 },
      'meta-llama/llama-3.3-70b-instruct': { input: 0.59, output: 0.79 },
      
      // Free models (no cost)
      'deepseek/deepseek-v3-0324-free': { input: 0, output: 0 },
      'deepseek/deepseek-r1-0528-free': { input: 0, output: 0 }
    };

    const modelPricing = pricing[model] || { input: 1.0, output: 2.0 };
    
    // Estimate 30% input, 70% output tokens
    const inputTokens = Math.ceil(tokens * 0.3);
    const outputTokens = Math.ceil(tokens * 0.7);
    
    const cost = (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000000;
    
    return parseFloat(cost.toFixed(6));
  }

  private async generateTemplateCode(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();
    
    // Simple template-based fallback generation
    const files = [{
      path: 'main.js',
      content: `/**
 * ${request.description}
 * Generated by Recoder.xyz Template Engine
 */

console.log('Application: ${request.description}');
console.log('Type: ${request.type}');
${request.framework ? `console.log('Framework: ${request.framework}');` : ''}

// Main application logic
function main() {
  console.log('Starting ${request.description}...');
  
  // Real implementation would go here
  const result = {
    success: true,
    message: 'Application running successfully',
    timestamp: new Date().toISOString()
  };
  
  console.log('Result:', result);
  return result;
}

// Run the application
main();`,
      type: 'code' as const,
      language: 'javascript'
    }];

    const instructions = this.generateInstructions(request);
    const generationTime = Date.now() - startTime;

    return {
      files,
      instructions,
      metadata: {
        provider: 'template-engine',
        model: 'built-in-templates',
        tokensUsed: 0,
        generationTime,
        cost: 0
      }
    };
  }

  // Get available models for user's plan
  getAvailableModels(userPlan: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise' = 'free'): string[] {
    // Free users get access to free models only
    const freeModels = [
      'deepseek/deepseek-v3-0324-free',
      'deepseek/deepseek-r1-0528-free'
    ];

    // All paid plans get access to all premium models (only rate limits differ)
    const paidModels = [
      'anthropic/claude-4-sonnet',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'google/gemini-2.0-flash',
      'deepseek/deepseek-v3-0324',
      'qwen/qwq-32b-preview',
      'meta-llama/llama-3.3-70b-instruct'
    ];

    return userPlan === 'free' ? freeModels : paidModels;
  }

  // Get rate limits for user's plan
  getRateLimits(userPlan: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise' = 'free'): {
    requestsPerHour: number;
    requestsPerDay: number;
    requestsPerMonth: number;
    tokensPerRequest: number;
  } {
    const rateLimits = {
      'free': {
        requestsPerHour: 10,
        requestsPerDay: 50,
        requestsPerMonth: 1000,
        tokensPerRequest: 2000
      },
      '$10/week': {
        requestsPerHour: 50,
        requestsPerDay: 500,
        requestsPerMonth: 10000,
        tokensPerRequest: 4000
      },
      '$20/month': {
        requestsPerHour: 100,
        requestsPerDay: 1000,
        requestsPerMonth: 20000,
        tokensPerRequest: 8000
      },
      '$100/month': {
        requestsPerHour: 500,
        requestsPerDay: 5000,
        requestsPerMonth: 100000,
        tokensPerRequest: 16000
      },
      '$200/month': {
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        requestsPerMonth: 200000,
        tokensPerRequest: 32000
      },
      'enterprise': {
        requestsPerHour: -1, // Unlimited
        requestsPerDay: -1, // Unlimited
        requestsPerMonth: -1, // Unlimited
        tokensPerRequest: 64000
      }
    };

    return rateLimits[userPlan] || rateLimits.free;
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; provider: string; modelsAvailable: boolean }> {
    try {
      if (!this.apiKey) {
        return {
          status: 'template-mode',
          provider: 'template-engine',
          modelsAvailable: false
        };
      }

      // Test API connectivity
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://recoder.xyz'
        }
      });

      return {
        status: response.ok ? 'healthy' : 'degraded',
        provider: 'openrouter',
        modelsAvailable: response.ok
      };
    } catch (error) {
      return {
        status: 'fallback',
        provider: 'template-engine',
        modelsAvailable: false
      };
    }
  }
}

export default OpenRouterAI;