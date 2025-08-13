// RAG-Enhanced AI Service
// Integrate retrieval-augmented generation with AI router for superior code generation

import { EventEmitter } from 'events';
import { aiRouter } from './ai-router';
import { semanticSearch } from './semantic-search';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

interface RAGEnhancedRequest {
  userId: string;
  prompt: string;
  taskType: 'code-generation' | 'explanation' | 'refactoring' | 'debugging' | 'documentation';
  knowledgeBaseId?: string;
  context?: {
    projectId?: string;
    filePath?: string;
    language?: string;
    framework?: string;
    existingCode?: string;
  };
  ragOptions?: {
    retrievalThreshold?: number;
    maxRetrievalResults?: number;
    includeContext?: boolean;
    enhancePrompt?: boolean;
    useCodeExamples?: boolean;
  };
  aiOptions?: {
    maxLatency?: number;
    maxCost?: number;
    qualityRequired?: 'basic' | 'good' | 'excellent';
    creativity?: 'conservative' | 'balanced' | 'creative';
  };
}

interface RAGEnhancedResponse {
  response: string;
  retrievedContext: {
    chunks: Array<{
      content: string;
      filePath: string;
      similarity: number;
      relevance: string;
    }>;
    totalRetrieved: number;
    retrievalTime: number;
  };
  aiGeneration: {
    provider: string;
    model: string;
    tokensUsed: number;
    cost: number;
    generationTime: number;
  };
  enhancement: {
    contextInjected: boolean;
    promptEnhanced: boolean;
    codeExamplesIncluded: number;
    qualityScore: number;
  };
  metadata: {
    sessionId: string;
    totalTime: number;
    retrievalStrategy: string;
    confidenceScore: number;
  };
}

interface CodeContext {
  relevantCode: string[];
  patterns: string[];
  bestPractices: string[];
  dependencies: string[];
  examples: string[];
  documentation: string[];
}

export class RAGEnhancedAIService extends EventEmitter {
  private activeSessions: Map<string, any> = new Map();
  
  constructor() {
    super();
  }

  /**
   * Generate enhanced response using RAG + AI
   */
  async generateEnhanced(request: RAGEnhancedRequest): Promise<RAGEnhancedResponse> {
    const startTime = Date.now();
    const sessionId = this.generateSessionId();

    try {
      logger.info('Starting RAG-enhanced AI generation', {
        sessionId,
        userId: request.userId,
        taskType: request.taskType,
        hasKnowledgeBase: !!request.knowledgeBaseId
      });

      // Start RAG session
      const ragSession = await this.startRAGSession(sessionId, request);
      this.activeSessions.set(sessionId, ragSession);

      // Step 1: Retrieve relevant context if knowledge base is provided
      let retrievedContext = null;
      if (request.knowledgeBaseId) {
        retrievedContext = await this.retrieveRelevantContext(request);
      }

      // Step 2: Enhance prompt with retrieved context
      const enhancedPrompt = await this.enhancePromptWithContext(
        request.prompt,
        retrievedContext,
        request
      );

      // Step 3: Route to optimal AI provider
      const aiRequest = {
        userId: request.userId,
        taskType: this.mapRAGTaskTypeToAITaskType(request.taskType),
        prompt: enhancedPrompt.prompt,
        context: {
          ...request.context,
          hasRAGContext: !!retrievedContext,
          contextComplexity: retrievedContext ? 'high' : 'medium'
        },
        constraints: {
          maxLatency: request.aiOptions?.maxLatency,
          maxCost: request.aiOptions?.maxCost,
          qualityRequired: request.aiOptions?.qualityRequired || 'good'
        }
      };

      const routingResult = await aiRouter.routeRequest(aiRequest);

      // Step 4: Generate AI response (placeholder - would integrate with actual AI providers)
      const aiResponse = await this.generateAIResponse(enhancedPrompt.prompt, routingResult);

      // Step 5: Post-process and enhance response
      const finalResponse = await this.postProcessResponse(
        aiResponse,
        retrievedContext,
        request
      );

      // Step 6: Calculate quality metrics
      const qualityScore = this.calculateQualityScore(
        finalResponse,
        retrievedContext,
        enhancedPrompt
      );

      // Step 7: Store interaction for learning
      await this.storeRAGInteraction(ragSession.id, {
        input: request.prompt,
        output: finalResponse,
        retrievalResults: retrievedContext?.results.length || 0,
        aiProvider: routingResult.providerId,
        aiModel: routingResult.modelId,
        qualityScore
      });

      const totalTime = Date.now() - startTime;

      const response: RAGEnhancedResponse = {
        response: finalResponse,
        retrievedContext: {
          chunks: retrievedContext?.results.slice(0, 5).map(result => ({
            content: result.content.substring(0, 200) + '...',
            filePath: result.filePath,
            similarity: result.similarity,
            relevance: result.explanation || 'High relevance to query'
          })) || [],
          totalRetrieved: retrievedContext?.results.length || 0,
          retrievalTime: retrievedContext?.processingTime || 0
        },
        aiGeneration: {
          provider: routingResult.providerId,
          model: routingResult.modelId,
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
          generationTime: aiResponse.generationTime
        },
        enhancement: {
          contextInjected: !!retrievedContext,
          promptEnhanced: enhancedPrompt.enhanced,
          codeExamplesIncluded: enhancedPrompt.examplesIncluded,
          qualityScore
        },
        metadata: {
          sessionId,
          totalTime,
          retrievalStrategy: retrievedContext ? 'semantic_search' : 'no_retrieval',
          confidenceScore: this.calculateConfidenceScore(qualityScore, routingResult.confidence)
        }
      };

      // End session
      await this.endRAGSession(ragSession.id, {
        totalTime,
        qualityScore,
        success: true
      });

      this.activeSessions.delete(sessionId);

      logger.info('RAG-enhanced generation completed', {
        sessionId,
        totalTime,
        qualityScore,
        retrievedChunks: retrievedContext?.results.length || 0
      });

      this.emit('generationCompleted', {
        sessionId,
        userId: request.userId,
        taskType: request.taskType,
        totalTime,
        qualityScore
      });

      return response;

    } catch (error) {
      logger.error('RAG-enhanced generation failed:', error);
      
      // Clean up session
      if (this.activeSessions.has(sessionId)) {
        const ragSession = this.activeSessions.get(sessionId);
        await this.endRAGSession(ragSession.id, {
          totalTime: Date.now() - startTime,
          qualityScore: 0,
          success: false,
          error: error.message
        });
        this.activeSessions.delete(sessionId);
      }

      throw error;
    }
  }

  /**
   * Start a new RAG session
   */
  private async startRAGSession(sessionId: string, request: RAGEnhancedRequest): Promise<any> {
    return await prisma.rAGSession.create({
      data: {
        id: sessionId,
        sessionType: request.taskType,
        context: {
          originalPrompt: request.prompt,
          taskType: request.taskType,
          knowledgeBaseId: request.knowledgeBaseId,
          ragOptions: request.ragOptions,
          aiOptions: request.aiOptions
        },
        userId: request.userId,
        knowledgeBaseId: request.knowledgeBaseId
      }
    });
  }

  /**
   * Retrieve relevant context using semantic search
   */
  private async retrieveRelevantContext(request: RAGEnhancedRequest): Promise<any> {
    if (!request.knowledgeBaseId) return null;

    const retrievalStartTime = Date.now();

    try {
      // Prepare search query based on task type
      const searchQuery = this.prepareSearchQuery(request);

      const searchResults = await semanticSearch.search({
        query: searchQuery,
        knowledgeBaseId: request.knowledgeBaseId,
        userId: request.userId,
        queryType: this.mapTaskTypeToQueryType(request.taskType),
        filters: {
          language: request.context?.language,
          framework: request.context?.framework
        },
        options: {
          maxResults: request.ragOptions?.maxRetrievalResults || 10,
          threshold: request.ragOptions?.retrievalThreshold || 0.7,
          includeContext: request.ragOptions?.includeContext || true,
          rerank: true
        }
      });

      return {
        ...searchResults,
        retrievalTime: Date.now() - retrievalStartTime
      };

    } catch (error) {
      logger.warn('Context retrieval failed:', error.message);
      return null;
    }
  }

  /**
   * Enhance prompt with retrieved context
   */
  private async enhancePromptWithContext(
    originalPrompt: string,
    retrievedContext: any,
    request: RAGEnhancedRequest
  ): Promise<{
    prompt: string;
    enhanced: boolean;
    examplesIncluded: number;
  }> {
    if (!retrievedContext || !request.ragOptions?.enhancePrompt) {
      return {
        prompt: originalPrompt,
        enhanced: false,
        examplesIncluded: 0
      };
    }

    let enhancedPrompt = originalPrompt;
    let examplesIncluded = 0;

    // Add context about the codebase
    if (retrievedContext.context) {
      enhancedPrompt += `\n\nCodebase Context:\n`;
      enhancedPrompt += `- Project: ${retrievedContext.context.knowledgeBaseName}\n`;
      enhancedPrompt += `- Total code chunks: ${retrievedContext.context.totalChunks}\n`;
    }

    // Add relevant code examples
    if (request.ragOptions?.useCodeExamples && retrievedContext.results.length > 0) {
      enhancedPrompt += `\n\nRelevant Code Examples:\n`;
      
      const topResults = retrievedContext.results.slice(0, 3);
      for (const [index, result] of topResults.entries()) {
        enhancedPrompt += `\nExample ${index + 1} (${result.contentType} from ${result.fileName}):\n`;
        enhancedPrompt += `\`\`\`${result.language}\n${result.content}\n\`\`\`\n`;
        examplesIncluded++;
      }
    }

    // Add patterns and best practices
    const codeContext = this.extractCodeContext(retrievedContext.results);
    if (codeContext.patterns.length > 0) {
      enhancedPrompt += `\n\nCommon Patterns in Codebase:\n`;
      codeContext.patterns.forEach(pattern => {
        enhancedPrompt += `- ${pattern}\n`;
      });
    }

    if (codeContext.dependencies.length > 0) {
      enhancedPrompt += `\n\nKey Dependencies:\n`;
      codeContext.dependencies.forEach(dep => {
        enhancedPrompt += `- ${dep}\n`;
      });
    }

    // Add task-specific instructions
    enhancedPrompt += this.getTaskSpecificInstructions(request.taskType, codeContext);

    // Add quality guidelines
    enhancedPrompt += `\n\nPlease ensure your response:\n`;
    enhancedPrompt += `- Follows the existing code patterns and style\n`;
    enhancedPrompt += `- Uses the same dependencies and frameworks\n`;
    enhancedPrompt += `- Includes proper error handling and validation\n`;
    enhancedPrompt += `- Provides clear, production-ready code\n`;

    return {
      prompt: enhancedPrompt,
      enhanced: true,
      examplesIncluded
    };
  }

  /**
   * Extract useful context from retrieved code chunks
   */
  private extractCodeContext(results: any[]): CodeContext {
    const context: CodeContext = {
      relevantCode: [],
      patterns: [],
      bestPractices: [],
      dependencies: [],
      examples: [],
      documentation: []
    };

    for (const result of results) {
      // Extract dependencies
      if (result.metadata.dependencies) {
        context.dependencies.push(...result.metadata.dependencies);
      }

      // Extract patterns based on content type
      if (result.contentType === 'function' && result.functionName) {
        context.patterns.push(`Function pattern: ${result.functionName}`);
      }

      if (result.contentType === 'class' && result.className) {
        context.patterns.push(`Class pattern: ${result.className}`);
      }

      // Extract keywords as patterns
      if (result.metadata.keywords) {
        context.patterns.push(...result.metadata.keywords.map((k: string) => `Uses ${k}`));
      }
    }

    // Deduplicate and limit
    context.dependencies = [...new Set(context.dependencies)].slice(0, 5);
    context.patterns = [...new Set(context.patterns)].slice(0, 5);

    return context;
  }

  /**
   * Generate AI response (placeholder for actual AI integration)
   */
  private async generateAIResponse(prompt: string, routingResult: any): Promise<any> {
    // This would integrate with the actual AI providers through the router
    // For now, return a mock response
    const startTime = Date.now();
    
    // Simulate AI generation time based on provider
    const simulatedDelay = routingResult.estimatedLatency || 2000;
    await new Promise(resolve => setTimeout(resolve, Math.min(simulatedDelay, 5000)));

    return {
      response: `Enhanced AI response based on retrieved context and prompt: ${prompt.substring(0, 100)}...`,
      tokensUsed: Math.floor(prompt.length / 4) + 500,
      cost: routingResult.estimatedCost || 0.01,
      generationTime: Date.now() - startTime
    };
  }

  /**
   * Post-process AI response
   */
  private async postProcessResponse(
    aiResponse: any,
    retrievedContext: any,
    request: RAGEnhancedRequest
  ): Promise<string> {
    let response = aiResponse.response;

    // Add citations for retrieved context
    if (retrievedContext && retrievedContext.results.length > 0) {
      response += `\n\n---\n**Based on context from:**\n`;
      retrievedContext.results.slice(0, 3).forEach((result: any, index: number) => {
        response += `${index + 1}. ${result.fileName} (${result.contentType})\n`;
      });
    }

    return response;
  }

  /**
   * Calculate quality score for the response
   */
  private calculateQualityScore(
    response: string,
    retrievedContext: any,
    enhancedPrompt: any
  ): number {
    let score = 0.7; // Base score

    // Boost for context usage
    if (retrievedContext && retrievedContext.results.length > 0) {
      score += 0.15;
    }

    // Boost for prompt enhancement
    if (enhancedPrompt.enhanced) {
      score += 0.1;
    }

    // Boost for code examples
    if (enhancedPrompt.examplesIncluded > 0) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidenceScore(qualityScore: number, routingConfidence: number): number {
    return (qualityScore + routingConfidence) / 2;
  }

  /**
   * Store RAG interaction for analytics
   */
  private async storeRAGInteraction(sessionId: string, data: any): Promise<void> {
    await prisma.rAGInteraction.create({
      data: {
        sessionId,
        interactionType: 'response',
        input: data.input,
        output: data.output,
        tokensUsed: data.tokensUsed,
        cost: data.cost,
        provider: data.aiProvider,
        model: data.aiModel,
        retrievedChunks: data.retrievalResults,
        relevanceScore: data.qualityScore,
        metadata: {
          taskType: data.taskType,
          enhancementUsed: true
        }
      }
    });
  }

  /**
   * End RAG session
   */
  private async endRAGSession(sessionId: string, summary: any): Promise<void> {
    await prisma.rAGSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
        totalTokens: summary.tokensUsed || 0,
        totalCost: summary.cost || 0,
        qualityScore: summary.qualityScore,
        feedback: summary.error ? `Error: ${summary.error}` : 'Completed successfully'
      }
    });
  }

  /**
   * Helper methods
   */
  private generateSessionId(): string {
    return `rag_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private prepareSearchQuery(request: RAGEnhancedRequest): string {
    let query = request.prompt;

    // Enhance query based on task type
    switch (request.taskType) {
      case 'code-generation':
        query = `generate code for: ${query}`;
        break;
      case 'explanation':
        query = `explain code: ${query}`;
        break;
      case 'refactoring':
        query = `refactor code: ${query}`;
        break;
      case 'debugging':
        query = `debug issue: ${query}`;
        break;
      case 'documentation':
        query = `document code: ${query}`;
        break;
    }

    // Add context information
    if (request.context?.language) {
      query += ` in ${request.context.language}`;
    }

    if (request.context?.framework) {
      query += ` using ${request.context.framework}`;
    }

    return query;
  }

  private mapTaskTypeToQueryType(taskType: string): 'search' | 'explain' | 'generate' | 'refactor' {
    const mapping = {
      'code-generation': 'generate',
      'explanation': 'explain',
      'refactoring': 'refactor',
      'debugging': 'search',
      'documentation': 'explain'
    } as const;

    return mapping[taskType as keyof typeof mapping] || 'search';
  }

  private mapRAGTaskTypeToAITaskType(taskType: string): 'code-generation' | 'text-generation' | 'image-analysis' | 'reasoning' | 'embedding' {
    const mapping = {
      'code-generation': 'code-generation',
      'explanation': 'text-generation',
      'refactoring': 'code-generation',
      'debugging': 'reasoning',
      'documentation': 'text-generation'
    } as const;

    return mapping[taskType as keyof typeof mapping] || 'text-generation';
  }

  private getTaskSpecificInstructions(taskType: string, context: CodeContext): string {
    const instructions = {
      'code-generation': `\n\nGenerate clean, production-ready code that:\n- Follows existing patterns\n- Includes proper error handling\n- Uses consistent naming conventions\n- Includes necessary imports\n`,
      
      'explanation': `\n\nProvide a clear explanation that:\n- Explains the purpose and functionality\n- Describes how it fits in the codebase\n- Mentions any important patterns or dependencies\n- Includes usage examples if relevant\n`,
      
      'refactoring': `\n\nSuggest refactoring improvements that:\n- Maintain existing functionality\n- Improve code readability and maintainability\n- Follow modern best practices\n- Consider performance implications\n`,
      
      'debugging': `\n\nHelp debug the issue by:\n- Identifying potential root causes\n- Suggesting specific fixes\n- Providing debugging strategies\n- Referencing similar patterns in the codebase\n`,
      
      'documentation': `\n\nGenerate comprehensive documentation that:\n- Explains the purpose and usage\n- Includes code examples\n- Documents parameters and return values\n- Follows existing documentation style\n`
    };

    return instructions[taskType] || '';
  }

  /**
   * Get RAG analytics
   */
  async getAnalytics(userId: string, timeRange: number = 7): Promise<any> {
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    const [sessionStats, taskTypeDistribution, qualityStats] = await Promise.all([
      // Session statistics
      prisma.rAGSession.aggregate({
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        _count: { id: true },
        _avg: { totalTokens: true, totalCost: true, qualityScore: true }
      }),

      // Task type distribution
      prisma.rAGSession.groupBy({
        by: ['sessionType'],
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        _count: { sessionType: true }
      }),

      // Quality statistics
      prisma.rAGSession.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
          qualityScore: { not: null }
        },
        select: { qualityScore: true, sessionType: true }
      })
    ]);

    return {
      summary: {
        totalSessions: sessionStats._count.id,
        avgTokensPerSession: sessionStats._avg.totalTokens,
        avgCostPerSession: sessionStats._avg.totalCost,
        avgQualityScore: sessionStats._avg.qualityScore
      },
      taskTypeDistribution: taskTypeDistribution.map(t => ({
        taskType: t.sessionType,
        count: t._count.sessionType
      })),
      qualityTrends: qualityStats.map(q => ({
        score: q.qualityScore,
        taskType: q.sessionType
      }))
    };
  }

  /**
   * Generate response (simplified interface for AdvancedRAGLearningService compatibility)
   */
  async generateResponse(request: {
    prompt: string;
    context: { type: string; documentCount?: number; [key: string]: any; };
    userId: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    content: string;
    reasoning?: string;
    confidence?: number;
    tokensUsed?: number;
  }> {
    try {
      // Convert to internal request format
      const ragRequest: RAGEnhancedRequest = {
        userId: request.userId,
        prompt: request.prompt,
        taskType: 'code-generation',
        ragOptions: {
          retrievalThreshold: 0.7,
          maxRetrievalResults: request.context.documentCount || 5,
          includeContext: true,
          enhancePrompt: true,
          useCodeExamples: true
        },
        aiOptions: {
          qualityRequired: 'good',
          creativity: 'balanced'
        }
      };

      // Generate enhanced response
      const response = await this.generateEnhanced(ragRequest);

      return {
        content: response.response,
        reasoning: `Generated using ${response.aiGeneration.provider} with ${response.retrievedContext.totalRetrieved} retrieved contexts`,
        confidence: response.metadata.confidenceScore,
        tokensUsed: response.aiGeneration.tokensUsed
      };
    } catch (error) {
      logger.error('RAG response generation failed:', error);
      
      // Fallback response
      return {
        content: this.generateFallbackResponse(request.prompt),
        reasoning: 'Fallback response due to service error',
        confidence: 0.5,
        tokensUsed: 0
      };
    }
  }

  private generateFallbackResponse(prompt: string): string {
    return `I understand you're asking about: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"

Based on general programming knowledge, here are some key considerations:

1. **Analysis**: Break down the problem into manageable components
2. **Best Practices**: Follow established patterns and conventions
3. **Implementation**: Start with a simple, working solution
4. **Testing**: Validate your approach with appropriate tests
5. **Documentation**: Ensure your code is well-documented

For more specific guidance, please provide additional context about your use case, technology stack, or specific requirements.`;
  }
}

// Export singleton instance
export const ragEnhancedAI = new RAGEnhancedAIService();