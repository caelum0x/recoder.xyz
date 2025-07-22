/**
 * Hybrid Consensus Processing System
 * Combines multiple AI models for critical tasks requiring high accuracy
 */

import { Logger } from '@recoder/shared';
import { AIHub, TaskContext, AIResponse } from './ai-hub';
import { AIRouter, PrivacyLevel } from './ai-router';
import { AuthService } from './auth';

export interface ConsensusRequest {
  prompt: string;
  taskType: 'security-analysis' | 'architecture-review' | 'code-audit' | 'critical-decision';
  context: TaskContext;
  privacyLevel: PrivacyLevel;
  consensusThreshold: number; // 0.6 = 60% agreement required
  maxModels: number; // Maximum models to use
}

export interface ModelResponse {
  model: string;
  response: AIResponse;
  confidence: number;
  quality: ResponseQuality;
  executionTime: number;
}

export interface ResponseQuality {
  coherence: number;
  completeness: number;
  accuracy: number;
  relevance: number;
  overall: number;
}

export interface ConsensusResult {
  finalAnswer: string;
  consensusReached: boolean;
  consensusScore: number;
  modelResponses: ModelResponse[];
  reasoning: string;
  recommendedAction: string;
  alternatives: string[];
}

export class HybridConsensusSystem {
  private aiHub: AIHub;
  private aiRouter: typeof AIRouter;

  constructor() {
    this.aiHub = AIHub.getInstance();
    this.aiRouter = AIRouter;
  }

  /**
   * Process a critical task using multiple models for consensus
   */
  async processWithConsensus(request: ConsensusRequest): Promise<ConsensusResult> {
    Logger.info(`🔄 Starting hybrid consensus for ${request.taskType}`);
    
    try {
      // Check if user has access to hybrid processing
      await this.validateAccess(request);
      
      // Select optimal models for consensus
      const selectedModels = await this.selectConsensusModels(request);
      
      // Execute requests in parallel
      const modelResponses = await this.executeParallelRequests(
        request.prompt, 
        selectedModels,
        request.context,
        request.privacyLevel
      );
      
      // Analyze responses and build consensus
      const consensus = await this.analyzeConsensus(modelResponses, request.consensusThreshold);
      
      Logger.info(`✅ Consensus processing completed: ${consensus.consensusReached ? 'Agreement reached' : 'Partial consensus'}`);
      
      return consensus;
    } catch (error) {
      Logger.error('Hybrid consensus processing failed:', error);
      throw new Error(`Consensus processing failed: ${error.message}`);
    }
  }

  /**
   * Security-focused consensus for critical security analysis
   */
  async securityConsensus(
    codeToAnalyze: string,
    privacyLevel: PrivacyLevel = PrivacyLevel.CONFIDENTIAL
  ): Promise<ConsensusResult> {
    const request: ConsensusRequest = {
      prompt: `Perform a comprehensive security analysis of the following code. Look for vulnerabilities, security risks, and potential attack vectors:\n\n${codeToAnalyze}`,
      taskType: 'security-analysis',
      context: {
        type: 'security',
        complexity: 'expert',
        priority: 'quality',
        privacyLevel
      },
      privacyLevel,
      consensusThreshold: 0.8, // High threshold for security
      maxModels: 3
    };

    return this.processWithConsensus(request);
  }

  /**
   * Architecture review consensus for system design decisions
   */
  async architectureConsensus(
    architectureDescription: string,
    privacyLevel: PrivacyLevel = PrivacyLevel.INTERNAL
  ): Promise<ConsensusResult> {
    const request: ConsensusRequest = {
      prompt: `Review the following system architecture and provide recommendations for improvements, scalability, and best practices:\n\n${architectureDescription}`,
      taskType: 'architecture-review',
      context: {
        type: 'backend',
        complexity: 'expert',
        priority: 'quality',
        privacyLevel
      },
      privacyLevel,
      consensusThreshold: 0.7,
      maxModels: 4
    };

    return this.processWithConsensus(request);
  }

  /**
   * Code audit consensus for production code review
   */
  async codeAuditConsensus(
    codeToAudit: string,
    language: string,
    privacyLevel: PrivacyLevel = PrivacyLevel.INTERNAL
  ): Promise<ConsensusResult> {
    const request: ConsensusRequest = {
      prompt: `Perform a thorough code audit of this ${language} code. Check for bugs, performance issues, security vulnerabilities, code quality, and adherence to best practices:\n\n${codeToAudit}`,
      taskType: 'code-audit',
      context: {
        type: 'general',
        complexity: 'complex',
        priority: 'quality',
        privacyLevel
      },
      privacyLevel,
      consensusThreshold: 0.75,
      maxModels: 3
    };

    return this.processWithConsensus(request);
  }

  private async validateAccess(request: ConsensusRequest): Promise<void> {
    // Check if user tier supports hybrid processing
    const authToken = process.env.RECODER_AUTH_TOKEN;
    if (!authToken) {
      throw new Error('Authentication required for hybrid consensus processing');
    }

    const subscription = await AuthService.getSubscription(authToken);
    if (!subscription.success || !subscription.data) {
      throw new Error('Unable to verify subscription for consensus processing');
    }

    // Hybrid processing requires Pro or Enterprise tier
    const { plan } = subscription.data;
    if (!['pro', 'enterprise'].includes(plan)) {
      throw new Error(`Hybrid consensus processing requires Pro or Enterprise plan. Current plan: ${plan}`);
    }
  }

  private async selectConsensusModels(request: ConsensusRequest): Promise<string[]> {
    const taskSpecializations = {
      'security-analysis': ['claude-sonnet-4', 'gemini-2.5-pro', 'deepseek-v3'],
      'architecture-review': ['claude-sonnet-4', 'mistral-large-2407', 'gemini-2.5-pro'],
      'code-audit': ['deepseek-v3', 'claude-sonnet-4', 'mistral-large-2407'],
      'critical-decision': ['claude-sonnet-4', 'gemini-2.5-pro', 'mistral-large-2407']
    };

    const preferredModels = taskSpecializations[request.taskType] || ['claude-sonnet-4', 'deepseek-v3'];
    
    // Filter by privacy constraints and availability
    const allowedModels = this.aiRouter.filterModelsByPrivacy?.(request.privacyLevel) || preferredModels;
    
    // Return top N models based on request
    return preferredModels
      .filter(model => allowedModels.includes(model))
      .slice(0, Math.min(request.maxModels, 4));
  }

  private async executeParallelRequests(
    prompt: string,
    models: string[],
    context: TaskContext,
    privacyLevel: PrivacyLevel
  ): Promise<ModelResponse[]> {
    const requests = models.map(async (modelId) => {
      const startTime = Date.now();
      
      try {
        const routingDecision = await this.aiRouter.routeRequest(
          prompt,
          context.type,
          'pro', // Assume pro tier for consensus
          privacyLevel
        );

        // Override with specific model for consensus
        const response = await this.aiHub.chat(
          [{ role: 'user', content: prompt }],
          context,
          { model: modelId }
        );

        const executionTime = Date.now() - startTime;
        const quality = this.assessResponseQuality(response.content, prompt);

        return {
          model: modelId,
          response,
          confidence: this.calculateConfidence(response, quality),
          quality,
          executionTime
        };
      } catch (error) {
        Logger.warn(`Model ${modelId} failed in consensus:`, error);
        return null;
      }
    });

    const results = await Promise.all(requests);
    return results.filter(result => result !== null) as ModelResponse[];
  }

  private assessResponseQuality(response: string, originalPrompt: string): ResponseQuality {
    // Simple quality assessment - in production, this would be more sophisticated
    const coherence = this.assessCoherence(response);
    const completeness = this.assessCompleteness(response, originalPrompt);
    const accuracy = this.assessAccuracy(response);
    const relevance = this.assessRelevance(response, originalPrompt);
    
    const overall = (coherence + completeness + accuracy + relevance) / 4;

    return { coherence, completeness, accuracy, relevance, overall };
  }

  private assessCoherence(response: string): number {
    // Basic coherence assessment
    const sentences = response.split(/[.!?]+/).filter(s => s.trim());
    const avgSentenceLength = sentences.reduce((acc, s) => acc + s.length, 0) / sentences.length;
    
    // Score based on sentence structure and length variation
    return Math.min(1.0, (avgSentenceLength / 100) * 0.8 + 0.2);
  }

  private assessCompleteness(response: string, prompt: string): number {
    // Basic completeness check
    const responseLength = response.length;
    const promptComplexity = prompt.split(' ').length;
    
    // Expect longer responses for complex prompts
    const expectedLength = Math.max(200, promptComplexity * 10);
    return Math.min(1.0, responseLength / expectedLength);
  }

  private assessAccuracy(response: string): number {
    // Basic accuracy indicators
    const hasSpecificDetails = /\b(specifically|exactly|precisely)\b/i.test(response);
    const hasExamples = /\b(example|instance|such as)\b/i.test(response);
    const hasStructure = response.includes('\n') || response.includes('1.') || response.includes('•');
    
    let score = 0.5; // Base score
    if (hasSpecificDetails) score += 0.2;
    if (hasExamples) score += 0.2;
    if (hasStructure) score += 0.1;
    
    return Math.min(1.0, score);
  }

  private assessRelevance(response: string, prompt: string): number {
    // Simple keyword overlap assessment
    const promptWords = prompt.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const responseWords = response.toLowerCase().split(/\W+/);
    
    const overlap = promptWords.filter(word => responseWords.includes(word)).length;
    return Math.min(1.0, overlap / Math.max(1, promptWords.length / 2));
  }

  private calculateConfidence(response: AIResponse, quality: ResponseQuality): number {
    // Combine response metadata with quality assessment
    let confidence = quality.overall;
    
    // Adjust based on response length (too short might indicate uncertainty)
    if (response.content.length < 100) {
      confidence *= 0.8;
    }
    
    // Adjust based on finish reason
    if (response.finishReason === 'length') {
      confidence *= 0.9; // Might be cut off
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async analyzeConsensus(
    responses: ModelResponse[],
    threshold: number
  ): Promise<ConsensusResult> {
    if (responses.length === 0) {
      throw new Error('No valid responses received for consensus analysis');
    }

    // Sort by quality and confidence
    const sortedResponses = responses.sort(
      (a, b) => (b.quality.overall + b.confidence) - (a.quality.overall + a.confidence)
    );

    // Find common themes and agreements
    const agreements = await this.findAgreements(sortedResponses);
    const consensusScore = this.calculateConsensusScore(agreements, responses.length);
    
    const consensusReached = consensusScore >= threshold;
    
    // Build final answer
    const finalAnswer = consensusReached 
      ? this.synthesizeConsensusAnswer(sortedResponses, agreements)
      : this.createPartialConsensusAnswer(sortedResponses);

    const reasoning = this.buildReasoningExplanation(
      sortedResponses,
      agreements,
      consensusScore,
      threshold
    );

    const recommendedAction = this.generateRecommendedAction(
      consensusReached,
      sortedResponses,
      consensusScore
    );

    const alternatives = this.extractAlternatives(sortedResponses);

    return {
      finalAnswer,
      consensusReached,
      consensusScore,
      modelResponses: sortedResponses,
      reasoning,
      recommendedAction,
      alternatives
    };
  }

  private async findAgreements(responses: ModelResponse[]): Promise<string[]> {
    // Simple agreement detection based on common keywords and phrases
    const allContent = responses.map(r => r.response.content.toLowerCase());
    const commonPhrases: string[] = [];
    
    // Find phrases that appear in multiple responses
    for (let i = 0; i < allContent.length; i++) {
      const words = allContent[i].split(/\W+/);
      for (let j = 0; j < words.length - 2; j++) {
        const phrase = words.slice(j, j + 3).join(' ');
        if (phrase.length > 10) {
          const occurrences = allContent.filter(content => content.includes(phrase)).length;
          if (occurrences >= Math.ceil(responses.length / 2)) {
            commonPhrases.push(phrase);
          }
        }
      }
    }
    
    return [...new Set(commonPhrases)].slice(0, 10); // Top 10 agreements
  }

  private calculateConsensusScore(agreements: string[], totalResponses: number): number {
    if (totalResponses < 2) return 1.0;
    
    // Score based on number of agreements relative to response count
    const agreementRatio = agreements.length / (totalResponses * 5); // Normalize
    return Math.min(1.0, agreementRatio + 0.3); // Base score + agreement boost
  }

  private synthesizeConsensusAnswer(
    responses: ModelResponse[],
    agreements: string[]
  ): string {
    const topResponse = responses[0];
    const consensusIntro = `Based on consensus analysis across ${responses.length} AI models:\n\n`;
    
    // Combine the best response with key agreements
    const mainAnswer = topResponse.response.content;
    const agreementSummary = agreements.length > 0 
      ? `\n\n**Key Areas of Agreement:**\n${agreements.slice(0, 5).map(a => `• ${a}`).join('\n')}`
      : '';
    
    return consensusIntro + mainAnswer + agreementSummary;
  }

  private createPartialConsensusAnswer(responses: ModelResponse[]): string {
    const intro = `Partial consensus reached. Multiple perspectives analyzed:\n\n`;
    
    let combinedAnswer = intro;
    
    responses.forEach((response, index) => {
      combinedAnswer += `**Model ${index + 1} (${response.model}, confidence: ${(response.confidence * 100).toFixed(0)}%):**\n`;
      combinedAnswer += response.response.content.substring(0, 300) + '...\n\n';
    });
    
    return combinedAnswer;
  }

  private buildReasoningExplanation(
    responses: ModelResponse[],
    agreements: string[],
    consensusScore: number,
    threshold: number
  ): string {
    let reasoning = `Consensus Analysis:\n`;
    reasoning += `• ${responses.length} models participated\n`;
    reasoning += `• Consensus score: ${(consensusScore * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)\n`;
    reasoning += `• ${agreements.length} key agreements identified\n`;
    
    const avgConfidence = responses.reduce((acc, r) => acc + r.confidence, 0) / responses.length;
    reasoning += `• Average model confidence: ${(avgConfidence * 100).toFixed(1)}%\n`;
    
    return reasoning;
  }

  private generateRecommendedAction(
    consensusReached: boolean,
    responses: ModelResponse[],
    consensusScore: number
  ): string {
    if (consensusReached && consensusScore > 0.9) {
      return 'High confidence recommendation: Proceed with the consensus solution.';
    } else if (consensusReached) {
      return 'Moderate confidence: Review the consensus carefully before implementation.';
    } else if (consensusScore > 0.5) {
      return 'Consider multiple approaches or seek additional expert review.';
    } else {
      return 'Low consensus: Recommend human expert consultation before proceeding.';
    }
  }

  private extractAlternatives(responses: ModelResponse[]): string[] {
    // Extract alternative approaches mentioned in responses
    const alternatives: string[] = [];
    
    responses.forEach(response => {
      const content = response.response.content.toLowerCase();
      
      // Look for alternative suggestions
      const altPatterns = [
        /alternatively,?\s+(.{20,100})/gi,
        /another approach\s+(.{20,100})/gi,
        /you could also\s+(.{20,100})/gi,
        /consider\s+(.{20,100})/gi
      ];
      
      altPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          alternatives.push(...matches.slice(0, 2)); // Limit to 2 per response
        }
      });
    });
    
    return [...new Set(alternatives)].slice(0, 5); // Top 5 unique alternatives
  }
}

// Export singleton instance
export const HybridConsensus = new HybridConsensusSystem();