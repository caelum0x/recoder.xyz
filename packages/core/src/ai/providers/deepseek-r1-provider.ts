/**
 * DeepSeek R1 Provider for Recoder.xyz
 * 
 * Supports DeepSeek R1 0528 - #8 on leaderboard with 6.82B tokens
 * Excellent reasoning capabilities and cost-effective coding solutions
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface DeepSeekR1Config extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'deepseek-r1' | 'deepseek-r1-distill-llama-70b' | 'deepseek-r1-distill-qwen-32b';
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekRequestBody {
  model: string;
  messages: DeepSeekMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

export interface DeepSeekChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
}

export interface DeepSeekStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekR1Provider extends BaseAIProvider {
  private config: DeepSeekR1Config;
  private baseUrl: string;

  constructor(config: DeepSeekR1Config) {
    super('deepseek-r1', 'DeepSeek R1', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
  }

  /**
   * Send request to DeepSeek R1 API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const deepseekRequest = this.buildDeepSeekRequest(request);
      const response = await this.makeAPIRequest('/chat/completions', deepseekRequest);
      const deepseekResponse = response as DeepSeekResponse;

      if (!deepseekResponse.choices || deepseekResponse.choices.length === 0) {
        throw new Error('No response choices received from DeepSeek R1');
      }

      const choice = deepseekResponse.choices[0];
      const content = choice.message.content;

      const aiResponse: AIResponse = {
        id: request.id,
        content,
        usage: {
          inputTokens: deepseekResponse.usage.prompt_tokens,
          outputTokens: deepseekResponse.usage.completion_tokens,
          totalTokens: deepseekResponse.usage.total_tokens,
          cost: this.calculateCost(
            deepseekResponse.usage.prompt_tokens,
            deepseekResponse.usage.completion_tokens
          )
        },
        metadata: {
          model: deepseekResponse.model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(choice.finish_reason),
          confidence: this.calculateConfidence(choice),
          toolCalls: [],
          cacheHit: deepseekResponse.usage.prompt_cache_hit_tokens ? 
            deepseekResponse.usage.prompt_cache_hit_tokens > 0 : false
        }
      };

      this.trackRequestComplete(request, aiResponse);
      return aiResponse;

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }
  }

  /**
   * Send streaming request to DeepSeek R1 API
   */
  async* sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finishReason: string | null = null;

    try {
      const deepseekRequest = this.buildDeepSeekRequest(request, true);
      const stream = await this.makeStreamingAPIRequest('/chat/completions', deepseekRequest);

      for await (const chunk of stream) {
        if (chunk.startsWith('data: ')) {
          const data = chunk.slice(6);
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const streamResponse = JSON.parse(data) as DeepSeekStreamResponse;
            
            if (streamResponse.choices && streamResponse.choices.length > 0) {
              const choice = streamResponse.choices[0];
              
              if (choice.delta.content) {
                const streamChunk: StreamChunk = {
                  id: request.id,
                  delta: choice.delta.content,
                  isComplete: false
                };

                fullContent += choice.delta.content;
                yield streamChunk;
              }

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }

            // Capture final usage data
            if (streamResponse.usage) {
              totalInputTokens = streamResponse.usage.prompt_tokens;
              totalOutputTokens = streamResponse.usage.completion_tokens;
            }
          } catch (parseError) {
            // Skip invalid JSON chunks
            continue;
          }
        }
      }

      // Estimate tokens if not provided
      if (totalInputTokens === 0) {
        totalInputTokens = Math.ceil(request.prompt.length / 4);
        totalOutputTokens = Math.ceil(fullContent.length / 4);
      }

      const finalResponse: AIResponse = {
        id: request.id,
        content: fullContent,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          cost: this.calculateCost(totalInputTokens, totalOutputTokens)
        },
        metadata: {
          model: request.options.model || this.config.defaultModel || 'deepseek-r1',
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(finishReason)
        },
        streaming: {
          isComplete: true,
          streamId: request.id
        }
      };

      this.trackRequestComplete(request, finalResponse);
      return finalResponse;

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }
  }

  /**
   * Get available DeepSeek R1 models
   */
  async getAvailableModels(): Promise<string[]> {
    return [
      'deepseek-r1',                      // Full R1 model with reasoning
      'deepseek-r1-distill-llama-70b',   // Distilled version on LLaMA
      'deepseek-r1-distill-qwen-32b'     // Distilled version on Qwen
    ];
  }

  /**
   * Test DeepSeek R1 API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: DeepSeekRequestBody = {
        model: this.config.defaultModel || 'deepseek-r1',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeAPIRequest('/chat/completions', testRequest);
      return true;
    } catch (error) {
      console.error('DeepSeek R1 connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'deepseek-r1': 65536,                      // 64K context with reasoning
      'deepseek-r1-distill-llama-70b': 32768,   // 32K context
      'deepseek-r1-distill-qwen-32b': 32768     // 32K context
    };

    const model = this.config.defaultModel || 'deepseek-r1';
    return modelLimits[model] || 65536;
  }

  /**
   * Calculate cost based on DeepSeek R1 pricing
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.defaultModel || 'deepseek-r1';
    
    // DeepSeek R1 pricing per 1M tokens (extremely cost-effective)
    const pricingMap: { [key: string]: { input: number; output: number } } = {
      'deepseek-r1': { input: 0.55, output: 2.19 },                      // Reasoning model
      'deepseek-r1-distill-llama-70b': { input: 0.27, output: 1.10 },   // Distilled version
      'deepseek-r1-distill-qwen-32b': { input: 0.14, output: 0.55 }     // Most cost-effective
    };

    const pricing = pricingMap[model] || pricingMap['deepseek-r1'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Build DeepSeek R1 API request
   */
  private buildDeepSeekRequest(request: AIRequest, streaming: boolean = false): DeepSeekRequestBody {
    const messages: DeepSeekMessage[] = [];

    // Add system prompt optimized for R1's reasoning capabilities
    const systemPrompt = request.options.systemPrompt || this.buildR1SystemPrompt(request);
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Add context messages if provided
    if (request.context?.previousMessages) {
      for (const msg of request.context.previousMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    // Add current prompt with R1-specific enhancements
    messages.push({
      role: 'user',
      content: this.buildEnhancedPrompt(request)
    });

    const deepseekRequest: DeepSeekRequestBody = {
      model: request.options.model || this.config.defaultModel || 'deepseek-r1',
      messages,
      max_tokens: request.options.maxTokens || 4096,
      temperature: request.options.temperature || 0.7,
      top_p: 0.9,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      stream: streaming
    };

    return deepseekRequest;
  }

  /**
   * Build system prompt optimized for R1's reasoning capabilities
   */
  private buildR1SystemPrompt(request: AIRequest): string {
    const basePrompt = "You are DeepSeek R1, an advanced reasoning model. Think step-by-step and provide clear, logical solutions.";

    const taskPrompts = {
      'code-generation': `${basePrompt} For coding tasks:
1. Analyze requirements carefully
2. Design the solution architecture
3. Implement with proper error handling
4. Include tests and documentation
5. Ensure production readiness`,

      'debugging': `${basePrompt} For debugging:
1. Examine the code systematically
2. Identify potential issues and root causes
3. Test hypotheses methodically
4. Provide working solutions with explanations
5. Suggest prevention strategies`,

      'security-audit': `${basePrompt} For security analysis:
1. Review code for common vulnerabilities
2. Analyze attack vectors and entry points
3. Assess data flow and access controls
4. Provide detailed remediation steps
5. Recommend security best practices`,

      'analysis': `${basePrompt} For analysis tasks:
1. Break down complex problems systematically
2. Examine all relevant factors
3. Draw logical conclusions from evidence
4. Provide actionable insights
5. Support recommendations with reasoning`
    };

    return taskPrompts[request.metadata.taskType as keyof typeof taskPrompts] || basePrompt;
  }

  /**
   * Build enhanced prompt leveraging R1's reasoning strengths
   */
  private buildEnhancedPrompt(request: AIRequest): string {
    let content = request.prompt;

    // For complex tasks, encourage step-by-step reasoning
    if (request.metadata.taskType === 'debugging' || request.metadata.taskType === 'security-audit') {
      content = `REASONING_MODE: Please think through this step-by-step:

<thinking>
1. What is the core problem?
2. What are the contributing factors?
3. What are potential solutions?
4. What is the best approach and why?
</thinking>

${content}

Please show your reasoning process and provide a comprehensive solution.`;
    }

    // For code generation, emphasize systematic approach
    if (request.metadata.taskType === 'code-generation') {
      content = `CODE_GENERATION: Approach this systematically:
1. Understand requirements
2. Plan the implementation
3. Write production-ready code
4. Include error handling and validation
5. Add tests and documentation

${content}`;
    }

    // Add structured context
    if (request.context?.projectContext) {
      content = `## Project Context\n${request.context.projectContext}\n\n## Task\n${content}`;
    }

    // Add code context with analysis hints
    if (request.context?.codeContext) {
      content = `## Current Code\n\`\`\`\n${request.context.codeContext}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Make API request to DeepSeek R1
   */
  private async makeAPIRequest(endpoint: string, body: DeepSeekRequestBody): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`DeepSeek R1 API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Make streaming API request to DeepSeek R1
   */
  private async makeStreamingAPIRequest(endpoint: string, body: DeepSeekRequestBody): AsyncGenerator<string> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`DeepSeek R1 API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            yield line;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Map DeepSeek finish reason to standard format
   */
  private mapFinishReason(finishReason: string | null): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'stop': 'completed',
      'length': 'length',
      'content_filter': 'content_filter',
      'tool_calls': 'tool_calls'
    };

    return finishReason ? (mapping[finishReason] || 'completed') : 'completed';
  }

  /**
   * Calculate confidence score for DeepSeek R1 responses
   */
  private calculateConfidence(choice: DeepSeekChoice): number {
    let confidence = 0.91; // R1 is excellent for reasoning and coding

    if (choice.finish_reason === 'stop') {
      confidence += 0.05;
    }

    // Check for reasoning indicators
    const content = choice.message.content;
    if (content) {
      // Higher confidence for responses with reasoning
      if (content.includes('<thinking>') || content.includes('step-by-step') || content.includes('reasoning')) {
        confidence += 0.04;
      }
      
      // Check for code quality
      if (content.includes('```') && content.length > 200) {
        confidence += 0.03;
      }
      
      // Check for completeness
      if (content.length > 150 && !content.includes('I cannot') && !content.includes('I\'m not able')) {
        confidence += 0.02;
      }
    }

    return Math.min(1.0, confidence);
  }
}

export default DeepSeekR1Provider;