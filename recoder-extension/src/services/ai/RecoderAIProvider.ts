/**
 * Recoder AI Provider Integration
 * 
 * Integrates the VS Code extension with the recoder.xyz multi-AI ecosystem,
 * providing access to Claude, Groq, Gemini, and Ollama through intelligent routing.
 */

import * as vscode from 'vscode';

export interface RecoderAIConfig {
  providers: {
    claude: {
      enabled: boolean;
      apiKey?: string;
      models: string[];
    };
    groq: {
      enabled: boolean;
      apiKey?: string;
      models: string[];
    };
    gemini: {
      enabled: boolean;
      apiKey?: string;
      models: string[];
    };
    ollama: {
      enabled: boolean;
      baseUrl?: string;
      models: string[];
    };
  };
  defaultProvider: string;
  qualityValidation: boolean;
  realCodeOnly: boolean;
}

export interface GenerationRequest {
  prompt: string;
  context?: {
    files: Array<{ name: string; content: string }>;
    language: string;
    framework?: string;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
    includeTests?: boolean;
    includeDocs?: boolean;
  };
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  confidence: number;
  provider: string;
  model: string;
  metadata: {
    language: string;
    dependencies: string[];
    realFunctionality: boolean;
  };
}

/**
 * Main Recoder AI Provider class
 */
export class RecoderAIProvider {
  private config: RecoderAIConfig;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Recoder AI');
    this.config = this.loadConfiguration();
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfiguration(): RecoderAIConfig {
    const config = vscode.workspace.getConfiguration('recoder');
    
    return {
      providers: {
        claude: {
          enabled: !!config.get('apiKeys.anthropic') || !!process.env.ANTHROPIC_API_KEY,
          apiKey: config.get('apiKeys.anthropic') || process.env.ANTHROPIC_API_KEY,
          models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
        },
        groq: {
          enabled: !!config.get('apiKeys.groq') || !!process.env.GROQ_API_KEY,
          apiKey: config.get('apiKeys.groq') || process.env.GROQ_API_KEY,
          models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
        },
        gemini: {
          enabled: !!config.get('apiKeys.google') || !!process.env.GOOGLE_API_KEY,
          apiKey: config.get('apiKeys.google') || process.env.GOOGLE_API_KEY,
          models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro']
        },
        ollama: {
          enabled: !!config.get('apiKeys.ollama') || !!process.env.OLLAMA_BASE_URL,
          baseUrl: config.get('apiKeys.ollama') || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          models: ['llama3.2', 'codellama', 'deepseek-coder']
        }
      },
      defaultProvider: config.get('defaultProvider') || 'claude',
      qualityValidation: config.get('qualityValidation') !== false,
      realCodeOnly: config.get('realCodeOnly') !== false
    };
  }

  /**
   * Generate code using the optimal AI provider
   */
  async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    this.outputChannel.appendLine(`[Recoder] Generating code with multi-AI routing...`);
    
    try {
      // Intelligent provider selection
      const selectedProvider = await this.selectOptimalProvider(request);
      this.outputChannel.appendLine(`[Recoder] Selected provider: ${selectedProvider}`);

      // Generate code with the selected provider
      const result = await this.callProvider(selectedProvider, request);

      // Validate quality if enabled
      if (this.config.qualityValidation) {
        await this.validateCodeQuality(result);
      }

      this.outputChannel.appendLine(`[Recoder] Code generation completed successfully`);
      return result;

    } catch (error) {
      this.outputChannel.appendLine(`[Recoder] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Select the optimal AI provider based on the request
   */
  private async selectOptimalProvider(request: GenerationRequest): Promise<string> {
    const availableProviders = Object.entries(this.config.providers)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);

    if (availableProviders.length === 0) {
      throw new Error('No AI providers configured. Please set up API keys in settings.');
    }

    // Analyze the prompt to determine the best provider
    const promptLower = request.prompt.toLowerCase();
    
    // Complex logic, security, architecture -> Claude
    if (promptLower.includes('security') || promptLower.includes('auth') || 
        promptLower.includes('complex') || promptLower.includes('architecture')) {
      if (availableProviders.includes('claude')) {
        return 'claude';
      }
    }

    // Fast prototyping, API endpoints -> Groq
    if (promptLower.includes('api') || promptLower.includes('endpoint') || 
        promptLower.includes('fast') || promptLower.includes('react')) {
      if (availableProviders.includes('groq')) {
        return 'groq';
      }
    }

    // Large codebases, multimodal -> Gemini
    if (promptLower.includes('large') || promptLower.includes('scale') ||
        promptLower.includes('documentation')) {
      if (availableProviders.includes('gemini')) {
        return 'gemini';
      }
    }

    // Privacy, offline -> Ollama
    if (promptLower.includes('private') || promptLower.includes('offline') ||
        promptLower.includes('local')) {
      if (availableProviders.includes('ollama')) {
        return 'ollama';
      }
    }

    // Default priority: Claude > Groq > Gemini > Ollama
    const priorityOrder = ['claude', 'groq', 'gemini', 'ollama'];
    for (const provider of priorityOrder) {
      if (availableProviders.includes(provider)) {
        return provider;
      }
    }

    return availableProviders[0];
  }

  /**
   * Call the specific AI provider
   */
  private async callProvider(provider: string, request: GenerationRequest): Promise<GenerationResult> {
    const providerConfig = this.config.providers[provider as keyof typeof this.config.providers];
    
    switch (provider) {
      case 'claude':
        return await this.callClaude(providerConfig as any, request);
      case 'groq':
        return await this.callGroq(providerConfig as any, request);
      case 'gemini':
        return await this.callGemini(providerConfig as any, request);
      case 'ollama':
        return await this.callOllama(providerConfig as any, request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call Claude API
   */
  private async callClaude(config: any, request: GenerationRequest): Promise<GenerationResult> {
    const enhancedPrompt = this.buildProductionPrompt(request);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.models[0],
        max_tokens: request.options?.maxTokens || 4000,
        temperature: request.options?.temperature || 0.1,
        messages: [{ role: 'user', content: enhancedPrompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseClaudeResponse(data, request);
  }

  /**
   * Call Groq API
   */
  private async callGroq(config: any, request: GenerationRequest): Promise<GenerationResult> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.models[0],
        messages: [
          {
            role: 'system',
            content: 'You are Recoder, an AI that generates real, production-ready code. Never create mock implementations.'
          },
          {
            role: 'user',
            content: request.prompt
          }
        ],
        temperature: request.options?.temperature || 0.2,
        max_tokens: request.options?.maxTokens || 4000
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseGroqResponse(data, request);
  }

  /**
   * Call Gemini API (placeholder - implement based on actual API)
   */
  private async callGemini(config: any, request: GenerationRequest): Promise<GenerationResult> {
    // Placeholder implementation
    throw new Error('Gemini integration coming soon');
  }

  /**
   * Call Ollama API
   */
  private async callOllama(config: any, request: GenerationRequest): Promise<GenerationResult> {
    const response = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.models[0],
        prompt: request.prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseOllamaResponse(data, request);
  }

  /**
   * Build enhanced prompt for production code generation
   */
  private buildProductionPrompt(request: GenerationRequest): string {
    const systemPrompt = `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

CRITICAL REQUIREMENTS:
- Generate ACTUAL working code with real functionality
- Include proper error handling and validation
- Use real API integrations and database operations
- Include comprehensive TypeScript types
- Generate working implementations, not placeholders
- Add proper security measures
- Use environment variables for configuration

${request.options?.includeTests ? '- Include comprehensive test suites' : ''}
${request.options?.includeDocs ? '- Include detailed documentation' : ''}`;

    let contextInfo = '';
    if (request.context) {
      contextInfo = `\n\nProject Context:
- Language: ${request.context.language}
- Framework: ${request.context.framework || 'Not specified'}
- Files: ${request.context.files.length} files in context`;
    }

    return `${systemPrompt}${contextInfo}\n\nUser Request: ${request.prompt}\n\nGenerate complete, production-ready code:`;
  }

  /**
   * Parse Claude API response
   */
  private parseClaudeResponse(data: any, request: GenerationRequest): GenerationResult {
    const content = data.content[0]?.text || '';
    const code = this.extractCodeFromResponse(content);

    return {
      code,
      explanation: this.extractExplanation(content),
      confidence: 0.9,
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      metadata: {
        language: request.context?.language || 'typescript',
        dependencies: this.extractDependencies(code),
        realFunctionality: true
      }
    };
  }

  /**
   * Parse Groq API response
   */
  private parseGroqResponse(data: any, request: GenerationRequest): GenerationResult {
    const content = data.choices[0]?.message?.content || '';
    const code = this.extractCodeFromResponse(content);

    return {
      code,
      explanation: 'Fast code generation with Groq LLaMA',
      confidence: 0.8,
      provider: 'groq',
      model: 'llama-3.1-70b-versatile',
      metadata: {
        language: request.context?.language || 'typescript',
        dependencies: this.extractDependencies(code),
        realFunctionality: true
      }
    };
  }

  /**
   * Parse Ollama API response
   */
  private parseOllamaResponse(data: any, request: GenerationRequest): GenerationResult {
    const content = data.response || '';
    const code = this.extractCodeFromResponse(content);

    return {
      code,
      explanation: 'Local code generation with Ollama',
      confidence: 0.7,
      provider: 'ollama',
      model: 'llama3.2',
      metadata: {
        language: request.context?.language || 'typescript',
        dependencies: this.extractDependencies(code),
        realFunctionality: true
      }
    };
  }

  /**
   * Extract code from response
   */
  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      return matches
        .map(match => match.replace(/```(?:\w+)?\n/, '').replace(/\n```$/, ''))
        .sort((a, b) => b.length - a.length)[0];
    }
    
    return response;
  }

  /**
   * Extract explanation from response
   */
  private extractExplanation(response: string): string {
    const lines = response.split('\n');
    const explanationStart = lines.findIndex(line => line.includes('## Explanation'));
    const codeStart = lines.findIndex(line => line.includes('```'));
    
    if (explanationStart >= 0 && codeStart > explanationStart) {
      return lines.slice(explanationStart + 1, codeStart).join('\n').trim();
    }
    
    return 'Code generated successfully with Recoder AI';
  }

  /**
   * Extract dependencies from code
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
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

  /**
   * Validate code quality
   */
  private async validateCodeQuality(result: GenerationResult): Promise<void> {
    const mockIndicators = [
      'TODO:',
      'placeholder',
      'mock implementation',
      'not implemented',
      'throw new Error("Not implemented")'
    ];
    
    const lowerCode = result.code.toLowerCase();
    const hasMockImplementation = mockIndicators.some(indicator => 
      lowerCode.includes(indicator.toLowerCase())
    );
    
    if (hasMockImplementation) {
      throw new Error('Generated code contains mock implementations. Recoder only generates real, production-ready code.');
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Object.entries(this.config.providers)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Update configuration
   */
  updateConfiguration(): void {
    this.config = this.loadConfiguration();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Export singleton instance
export const recoderAI = new RecoderAIProvider();