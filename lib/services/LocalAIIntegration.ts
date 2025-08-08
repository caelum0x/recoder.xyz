/**
 * Local AI Integration Service
 * Integrates local AI capabilities with web and chat platforms
 */

import { unifiedAIRouter, AIRequest, AIResponse } from './UnifiedAIRouter';
import { modelManager } from './ModelManager';
import { ollamaService } from './OllamaService';

export interface LocalAIConfig {
  preferLocal: boolean;
  maxCostPerRequest: number;
  autoDownloadRecommended: boolean;
  fallbackToCloud: boolean;
  qualityThreshold: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  timestamp: Date;
  usage?: {
    tokens: number;
    cost: number;
  };
}

export interface CodeGenerationRequest {
  prompt: string;
  language?: string;
  framework?: string;
  style?: 'clean' | 'commented' | 'minimal';
  complexity?: 'simple' | 'intermediate' | 'advanced';
  includeTests?: boolean;
}

export interface CodeGenerationResponse {
  code: string;
  explanation: string;
  language: string;
  model: string;
  provider: string;
  usage: {
    tokens: number;
    cost: number;
    responseTime: number;
  };
  suggestions?: string[];
  tests?: string;
}

export class LocalAIIntegration {
  private static instance: LocalAIIntegration;
  private config: LocalAIConfig = {
    preferLocal: true,
    maxCostPerRequest: 0.10,
    autoDownloadRecommended: false,
    fallbackToCloud: true,
    qualityThreshold: 7.5
  };
  private initialized = false;

  private constructor() {}

  static getInstance(): LocalAIIntegration {
    if (!LocalAIIntegration.instance) {
      LocalAIIntegration.instance = new LocalAIIntegration();
    }
    return LocalAIIntegration.instance;
  }

  /**
   * Initialize local AI system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if Ollama is available
      const isOllamaInstalled = await ollamaService.isOllamaInstalled();
      
      if (!isOllamaInstalled) {
        console.log('Ollama not found, attempting auto-installation...');
        const installed = await ollamaService.autoInstallOllama();
        
        if (!installed) {
          console.warn('Ollama auto-installation failed, using cloud-only mode');
          this.config.preferLocal = false;
          this.initialized = true;
          return;
        }
      }

      // Start Ollama server
      const started = await ollamaService.startOllama();
      if (!started) {
        console.warn('Failed to start Ollama server, using cloud-only mode');
        this.config.preferLocal = false;
        this.initialized = true;
        return;
      }

      // Check for installed models
      const installedModels = await modelManager.getInstalledModels();
      
      if (installedModels.length === 0 && this.config.autoDownloadRecommended) {
        console.log('No local models found, downloading recommended model...');
        await this.downloadRecommendedModel();
      }

      // Update router preferences
      unifiedAIRouter.updatePreferences({
        preferLocal: this.config.preferLocal,
        maxCostPerRequest: this.config.maxCostPerRequest,
        qualityThreshold: this.config.qualityThreshold
      });

      this.initialized = true;
      console.log('Local AI integration initialized successfully');

    } catch (error) {
      console.error('Failed to initialize local AI:', error);
      this.config.preferLocal = false;
      this.initialized = true;
    }
  }

  /**
   * Download and setup the best recommended model
   */
  private async downloadRecommendedModel(): Promise<void> {
    try {
      const recommendations = await modelManager.getRecommendations('developer', 'coding');
      
      if (recommendations.length === 0) {
        console.warn('No model recommendations available');
        return;
      }

      // Get the top recommendation
      const topRecommendation = recommendations[0];
      
      if (topRecommendation.model.status !== 'installed') {
        console.log(`Downloading recommended model: ${topRecommendation.model.displayName}`);
        await modelManager.downloadModel(topRecommendation.model.id);
        console.log('Recommended model downloaded successfully');
      }
    } catch (error) {
      console.error('Failed to download recommended model:', error);
    }
  }

  /**
   * Chat with AI using optimal routing
   */
  async chat(messages: ChatMessage[], options: {
    model?: string;
    provider?: string;
    taskType?: 'coding' | 'general' | 'reasoning';
    stream?: boolean;
  } = {}): Promise<ChatMessage> {
    await this.ensureInitialized();

    // Convert messages to prompt
    const prompt = this.messagesToPrompt(messages);

    const request: AIRequest = {
      prompt,
      model: options.model,
      provider: options.provider,
      taskType: options.taskType || 'general',
      priority: 'quality',
      stream: options.stream || false
    };

    try {
      const response = await unifiedAIRouter.routeRequest(request);
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.content,
        model: response.model,
        provider: response.provider,
        timestamp: new Date(),
        usage: {
          tokens: response.usage.totalTokens,
          cost: response.usage.cost
        }
      };

      return assistantMessage;
    } catch (error) {
      console.error('Chat request failed:', error);
      throw new Error(`AI chat failed: ${error.message}`);
    }
  }

  /**
   * Generate code with AI
   */
  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    await this.ensureInitialized();

    // Build specialized prompt for code generation
    let prompt = `Generate ${request.language || 'code'} code for: ${request.prompt}\n\n`;
    
    if (request.language) {
      prompt += `Language: ${request.language}\n`;
    }
    
    if (request.framework) {
      prompt += `Framework: ${request.framework}\n`;
    }
    
    if (request.style) {
      prompt += `Style: ${request.style}\n`;
    }
    
    if (request.complexity) {
      prompt += `Complexity: ${request.complexity}\n`;
    }

    prompt += `\nRequirements:
- Provide clean, working code
- Add brief comments explaining key parts
- Follow best practices
- Make it production-ready${request.includeTests ? '\n- Include unit tests' : ''}

Response format:
\`\`\`${request.language || 'javascript'}
// Your code here
\`\`\`

Brief explanation of the code and key features.`;

    const aiRequest: AIRequest = {
      prompt,
      taskType: 'coding',
      priority: 'quality',
      temperature: 0.3, // Lower temperature for more focused code generation
      maxTokens: 4000
    };

    try {
      const response = await unifiedAIRouter.routeRequest(aiRequest);
      
      // Extract code from response
      const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)\n```/);
      const code = codeMatch ? codeMatch[1] : response.content;
      
      // Extract explanation (content after code block)
      const explanation = response.content.replace(/```[\w]*\n[\s\S]*?\n```/, '').trim();

      return {
        code,
        explanation: explanation || 'Code generated successfully',
        language: request.language || 'javascript',
        model: response.model,
        provider: response.provider,
        usage: {
          tokens: response.usage.totalTokens,
          cost: response.usage.cost,
          responseTime: response.metadata.responseTime
        },
        suggestions: this.extractSuggestions(explanation),
        tests: request.includeTests ? this.extractTests(response.content) : undefined
      };
    } catch (error) {
      console.error('Code generation failed:', error);
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  /**
   * Stream chat responses for real-time experience
   */
  async *streamChat(messages: ChatMessage[], options: {
    model?: string;
    provider?: string;
    taskType?: 'coding' | 'general' | 'reasoning';
  } = {}): AsyncGenerator<string, void, unknown> {
    await this.ensureInitialized();

    const prompt = this.messagesToPrompt(messages);
    
    // For now, use the local Ollama streaming if available
    const installedModels = await modelManager.getInstalledModels();
    const targetModel = options.model || (installedModels.length > 0 ? installedModels[0].id : null);
    
    if (targetModel && installedModels.some(m => m.id === targetModel)) {
      try {
        const streamResponse = await ollamaService.generateStream(targetModel, prompt);
        
        for await (const chunk of streamResponse) {
          yield chunk;
        }
        return;
      } catch (error) {
        console.error('Local streaming failed, falling back to regular chat:', error);
      }
    }

    // Fallback to non-streaming response
    const response = await this.chat(messages, options);
    yield response.content;
  }

  /**
   * Get available models with real-time status
   */
  async getAvailableModels(): Promise<{
    local: Array<{ id: string; name: string; status: string; provider: string }>;
    cloud: Array<{ id: string; name: string; status: string; provider: string }>;
  }> {
    await this.ensureInitialized();

    const installedModels = await modelManager.getInstalledModels();
    const availableModels = modelManager.getAvailableModels();
    const allModels = await unifiedAIRouter.getAllModels();

    const local = installedModels.map(model => ({
      id: model.id,
      name: model.displayName,
      status: model.status,
      provider: model.provider
    }));

    const cloud = allModels
      .filter(model => model.cost > 0)
      .map(model => ({
        id: model.id,
        name: model.displayName,
        status: 'available',
        provider: model.provider
      }));

    return { local, cloud };
  }

  /**
   * Get system health and recommendations
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    localAI: boolean;
    cloudAI: boolean;
    recommendations: string[];
    usage: {
      localRequests: number;
      cloudRequests: number;
      totalCost: number;
    };
  }> {
    await this.ensureInitialized();

    const installedModels = await modelManager.getInstalledModels();
    const routerStatus = await unifiedAIRouter.getRouterStatus();
    
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    const recommendations: string[] = [];

    // Check local AI
    const localAI = installedModels.length > 0;
    if (!localAI) {
      status = 'warning';
      recommendations.push('Install local models for free AI assistance');
    }

    // Check cloud AI
    const cloudAI = routerStatus.cost.paidModels > 0;
    if (!cloudAI && !localAI) {
      status = 'error';
      recommendations.push('Configure AI providers to use Recoder');
    }

    // Add router recommendations
    recommendations.push(...routerStatus.recommendations);

    return {
      status,
      localAI,
      cloudAI,
      recommendations,
      usage: {
        localRequests: 0, // Would track actual usage
        cloudRequests: 0,
        totalCost: 0
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LocalAIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update router preferences
    unifiedAIRouter.updatePreferences({
      preferLocal: this.config.preferLocal,
      maxCostPerRequest: this.config.maxCostPerRequest,
      qualityThreshold: this.config.qualityThreshold
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): LocalAIConfig {
    return { ...this.config };
  }

  // Private helper methods

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private messagesToPrompt(messages: ChatMessage[]): string {
    return messages
      .map(msg => {
        switch (msg.role) {
          case 'system':
            return `System: ${msg.content}`;
          case 'user':
            return `Human: ${msg.content}`;
          case 'assistant':
            return `Assistant: ${msg.content}`;
          default:
            return msg.content;
        }
      })
      .join('\n\n');
  }

  private extractSuggestions(text: string): string[] {
    // Extract suggestions from explanation text
    const suggestions = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.includes('suggest') || line.includes('consider') || line.includes('improve')) {
        suggestions.push(line.trim());
      }
    }
    
    return suggestions.slice(0, 3); // Max 3 suggestions
  }

  private extractTests(content: string): string | undefined {
    // Look for test code blocks
    const testMatch = content.match(/```[\w]*\n([\s\S]*?test[\s\S]*?)\n```/i);
    return testMatch ? testMatch[1] : undefined;
  }
}

// Export singleton instance
export const localAI = LocalAIIntegration.getInstance();

// Export convenience functions for easy integration
export const chatWithAI = (messages: ChatMessage[], options?: any) => 
  localAI.chat(messages, options);

export const generateCode = (request: CodeGenerationRequest) => 
  localAI.generateCode(request);

export const streamChatWithAI = (messages: ChatMessage[], options?: any) => 
  localAI.streamChat(messages, options);

export const getAIModels = () => 
  localAI.getAvailableModels();

export const getAIHealth = () => 
  localAI.getSystemHealth();