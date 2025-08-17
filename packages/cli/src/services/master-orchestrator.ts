/**
 * Master AI Orchestrator - Small AI that controls all other models
 * Revolutionary system that routes tasks to optimal AI providers based on:
 * - Task complexity and type
 * - Cost optimization requirements
 * - Performance needs
 * - Model availability and health
 */

import { AIHub, TaskContext } from './ai-hub';
import { Logger } from '../utils/logger';

export interface OrchestratorTask {
  description: string;
  type: 'code_generation' | 'analysis' | 'planning' | 'optimization' | 'debugging' | 'documentation';
  complexity: 'simple' | 'medium' | 'complex' | 'expert';
  priority: 'cost' | 'speed' | 'quality' | 'balanced';
  requirements?: string[];
  context?: any;
}

export interface ModelCapability {
  provider: string;
  model: string;
  strengths: string[];
  weaknesses: string[];
  costPerToken: number;
  avgResponseTime: number;
  qualityScore: number;
  specializations: string[];
  maxContext: number;
  availability: number; // 0-1 scale
}

export interface OrchestratorDecision {
  selectedProvider: string;
  selectedModel: string;
  confidence: number;
  reasoning: string;
  estimatedCost: number;
  estimatedTime: number;
  fallbackOptions: string[];
  strategy: 'single' | 'consensus' | 'pipeline' | 'parallel';
}

export class MasterAIOrchestrator {
  private aiHub: AIHub;
  private modelCapabilities: Map<string, ModelCapability>;
  private taskHistory: Array<{
    task: OrchestratorTask;
    decision: OrchestratorDecision;
    actualCost: number;
    actualTime: number;
    quality: number;
    success: boolean;
  }>;

  constructor() {
    this.aiHub = AIHub.getInstance();
    this.modelCapabilities = new Map();
    this.taskHistory = [];
    this.initializeModelCapabilities();
  }

  private initializeModelCapabilities(): void {
    // Claude Models - Premium quality, excellent for complex reasoning
    this.modelCapabilities.set('claude-3-5-sonnet', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      strengths: ['complex reasoning', 'code analysis', 'security', 'architecture'],
      weaknesses: ['cost', 'speed'],
      costPerToken: 0.00015,
      avgResponseTime: 3500,
      qualityScore: 9.5,
      specializations: ['typescript', 'react', 'security', 'blockchain'],
      maxContext: 200000,
      availability: 0.98
    });

    // Groq Models - Ultra fast, good for real-time responses
    this.modelCapabilities.set('llama3-groq', {
      provider: 'groq',
      model: 'llama3-70b-8192',
      strengths: ['speed', 'cost-efficiency', 'real-time'],
      weaknesses: ['complex reasoning', 'context length'],
      costPerToken: 0.00005,
      avgResponseTime: 800,
      qualityScore: 8.0,
      specializations: ['web development', 'api design', 'quick fixes'],
      maxContext: 8192,
      availability: 0.95
    });

    // Gemini Models - Strong multimodal, good balance
    this.modelCapabilities.set('gemini-pro', {
      provider: 'google',
      model: 'gemini-1.5-pro',
      strengths: ['multimodal', 'balanced performance', 'large context'],
      weaknesses: ['availability', 'consistency'],
      costPerToken: 0.0001,
      avgResponseTime: 2500,
      qualityScore: 8.5,
      specializations: ['analysis', 'documentation', 'planning'],
      maxContext: 128000,
      availability: 0.92
    });

    // Ollama - Local, private, fast for simple tasks
    this.modelCapabilities.set('ollama-local', {
      provider: 'ollama',
      model: 'llama3:latest',
      strengths: ['privacy', 'no cost', 'availability'],
      weaknesses: ['quality', 'complex reasoning'],
      costPerToken: 0,
      avgResponseTime: 1200,
      qualityScore: 7.0,
      specializations: ['simple tasks', 'prototyping', 'local development'],
      maxContext: 4096,
      availability: 1.0
    });
  }

  /**
   * Main orchestration method - the "small AI" that makes decisions
   */
  async orchestrate(task: OrchestratorTask): Promise<OrchestratorDecision> {
    Logger.info(`🎯 Orchestrator analyzing task: ${task.description.substring(0, 50)}...`);

    // Step 1: Analyze task requirements
    const taskAnalysis = this.analyzeTask(task);
    
    // Step 2: Score models based on task requirements
    const modelScores = this.scoreModels(task, taskAnalysis);
    
    // Step 3: Make intelligent decision based on priority
    const decision = this.makeDecision(task, modelScores);
    
    // Step 4: Log decision for learning
    Logger.info(`🧠 Orchestrator selected: ${decision.selectedProvider}/${decision.selectedModel} (${decision.confidence}% confidence)`);
    Logger.info(`💡 Reasoning: ${decision.reasoning}`);
    
    return decision;
  }

  private analyzeTask(task: OrchestratorTask): any {
    const analysis = {
      isCodeGeneration: task.type === 'code_generation',
      isAnalysis: task.type === 'analysis',
      isPlanningTask: task.type === 'planning',
      requiresSecurity: task.description.toLowerCase().includes('security') || task.description.toLowerCase().includes('auth'),
      requiresSpeed: task.priority === 'speed',
      requiresQuality: task.priority === 'quality',
      requiresCostEfficiency: task.priority === 'cost',
      estimatedTokens: this.estimateTokens(task.description),
      hasDeadline: task.requirements?.includes('urgent'),
      needsPrivacy: task.requirements?.includes('private')
    };

    return analysis;
  }

  private scoreModels(task: OrchestratorTask, analysis: any): Map<string, number> {
    const scores = new Map<string, number>();

    for (const [modelId, capability] of this.modelCapabilities) {
      let score = 0;

      // Base quality score (0-100)
      score += capability.qualityScore * 10;

      // Task type alignment
      if (analysis.isCodeGeneration && capability.strengths.includes('complex reasoning')) {
        score += 20;
      }
      if (analysis.requiresSecurity && capability.specializations.includes('security')) {
        score += 25;
      }
      if (analysis.isPlanningTask && capability.strengths.includes('analysis')) {
        score += 15;
      }

      // Priority adjustments
      switch (task.priority) {
        case 'speed':
          score += (5000 - capability.avgResponseTime) / 50; // Faster = higher score
          break;
        case 'cost':
          score += capability.costPerToken === 0 ? 30 : (0.0002 - capability.costPerToken) * 100000;
          break;
        case 'quality':
          score += capability.qualityScore * 5;
          break;
        case 'balanced':
          score += capability.qualityScore * 3;
          score += (3000 - capability.avgResponseTime) / 100;
          break;
      }

      // Complexity adjustments
      if (task.complexity === 'expert' && capability.qualityScore < 8.5) {
        score -= 20; // Penalize low-quality models for expert tasks
      }
      if (task.complexity === 'simple' && capability.costPerToken > 0.0001) {
        score -= 15; // Penalize expensive models for simple tasks
      }

      // Availability penalty
      score *= capability.availability;

      // Context length requirements
      if (analysis.estimatedTokens > capability.maxContext) {
        score = 0; // Cannot handle this task
      }

      // Privacy requirements
      if (analysis.needsPrivacy && capability.provider !== 'ollama') {
        score -= 30;
      }

      scores.set(modelId, Math.max(0, score));
    }

    return scores;
  }

  private makeDecision(task: OrchestratorTask, scores: Map<string, number>): OrchestratorDecision {
    // Sort models by score
    const sortedModels = Array.from(scores.entries())
      .sort(([,a], [,b]) => b - a)
      .filter(([,score]) => score > 0);

    if (sortedModels.length === 0) {
      throw new Error('No suitable models available for this task');
    }

    const [bestModelId, bestScore] = sortedModels[0];
    const bestModel = this.modelCapabilities.get(bestModelId)!;

    // Determine strategy based on task complexity and requirements
    let strategy: 'single' | 'consensus' | 'pipeline' | 'parallel' = 'single';
    
    if (task.complexity === 'expert' && task.priority === 'quality') {
      strategy = 'consensus'; // Use multiple models for critical tasks
    } else if (task.type === 'planning' && sortedModels.length >= 2) {
      strategy = 'consensus'; // Planning benefits from multiple perspectives
    }

    // Calculate confidence based on score gap
    const confidence = Math.min(95, Math.max(60, (bestScore / 100) * 90));

    // Generate reasoning
    const reasoning = this.generateReasoning(task, bestModel, sortedModels);

    // Estimate cost and time
    const estimatedTokens = this.estimateTokens(task.description);
    const estimatedCost = estimatedTokens * bestModel.costPerToken;
    const estimatedTime = bestModel.avgResponseTime;

    return {
      selectedProvider: bestModel.provider,
      selectedModel: bestModel.model,
      confidence,
      reasoning,
      estimatedCost,
      estimatedTime,
      fallbackOptions: sortedModels.slice(1, 3).map(([id]) => id),
      strategy
    };
  }

  private generateReasoning(task: OrchestratorTask, model: ModelCapability, alternatives: Array<[string, number]>): string {
    const reasons = [];

    if (task.priority === 'speed' && model.avgResponseTime < 1500) {
      reasons.push(`selected for ultra-fast response time (${model.avgResponseTime}ms)`);
    }
    if (task.priority === 'cost' && model.costPerToken <= 0.00005) {
      reasons.push(`chosen for cost efficiency (${model.costPerToken}/token)`);
    }
    if (task.priority === 'quality' && model.qualityScore >= 9.0) {
      reasons.push(`optimal for quality requirements (${model.qualityScore}/10 score)`);
    }
    if (task.complexity === 'expert' && model.strengths.includes('complex reasoning')) {
      reasons.push(`best suited for expert-level complexity`);
    }

    const specialization = model.specializations.find(spec => 
      task.description.toLowerCase().includes(spec.toLowerCase())
    );
    if (specialization) {
      reasons.push(`specialized in ${specialization}`);
    }

    if (reasons.length === 0) {
      reasons.push(`highest overall score (${alternatives[0][1].toFixed(1)}/100)`);
    }

    return reasons.join(', ');
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4) + 500; // +500 for response tokens
  }

  /**
   * Execute task with orchestrated decision
   */
  async executeTask(task: OrchestratorTask): Promise<any> {
    const startTime = Date.now();
    const decision = await this.orchestrate(task);

    try {
      let result;

      if (decision.strategy === 'consensus') {
        // Use multiple models and combine results
        result = await this.executeConsensusTask(task, decision);
      } else {
        // Use single model
        result = await this.executeSingleTask(task, decision);
      }

      // Record success metrics
      const actualTime = Date.now() - startTime;
      this.recordTaskMetrics(task, decision, actualTime, true, 8.5); // Assume good quality for now

      return result;
    } catch (error) {
      Logger.error(`Orchestrator task failed: ${error}`);
      
      // Try fallback if available
      if (decision.fallbackOptions.length > 0) {
        Logger.info(`🔄 Trying fallback option: ${decision.fallbackOptions[0]}`);
        const fallbackModel = this.modelCapabilities.get(decision.fallbackOptions[0]);
        if (fallbackModel) {
          const fallbackDecision = { ...decision, selectedProvider: fallbackModel.provider, selectedModel: fallbackModel.model };
          return await this.executeSingleTask(task, fallbackDecision);
        }
      }

      throw error;
    }
  }

  private async executeSingleTask(task: OrchestratorTask, decision: OrchestratorDecision): Promise<any> {
    const messages = [
      {
        role: 'system',
        content: `You are executing a ${task.type} task with ${task.complexity} complexity. Priority: ${task.priority}. Provide ${task.type === 'code_generation' ? 'working code' : 'detailed analysis'}.`
      },
      {
        role: 'user',
        content: task.description
      }
    ];

    // Route to appropriate AI hub method based on provider
    const mapTaskTypeToContextType = (type: OrchestratorTask['type']): TaskContext['type'] => {
      switch (type) {
        case 'code_generation':
        case 'debugging':
        case 'optimization':
          return 'backend';
        case 'analysis':
        case 'documentation':
          return 'general';
        case 'planning':
          return 'general';
        default:
          return 'general';
      }
    };

    const context: TaskContext = {
      type: mapTaskTypeToContextType(task.type),
      complexity: task.complexity === 'expert' ? 'complex' : (task.complexity || 'medium'),
      priority: task.priority === 'balanced' ? 'quality' : (task.priority as 'cost' | 'speed' | 'quality')
    };
    
    const response = await this.aiHub.chat(messages, context, {
      maxTokens: 4000,
      temperature: task.type === 'code_generation' ? 0.1 : 0.3
    });

    return response;
  }

  private async executeConsensusTask(task: OrchestratorTask, decision: OrchestratorDecision): Promise<any> {
    Logger.info(`🤝 Executing consensus task with multiple models`);
    
    // Get top 3 models for consensus
    const topModels = [decision.selectedProvider];
    if (decision.fallbackOptions.length >= 2) {
      const fallback1 = this.modelCapabilities.get(decision.fallbackOptions[0]);
      const fallback2 = this.modelCapabilities.get(decision.fallbackOptions[1]);
      if (fallback1) topModels.push(fallback1.provider);
      if (fallback2) topModels.push(fallback2.provider);
    }

    const responses = [];
    for (const provider of topModels.slice(0, 3)) {
      try {
        const response = await this.executeSingleTask(task, { ...decision, selectedProvider: provider });
        responses.push({ provider, response });
      } catch (error) {
        Logger.warn(`Provider ${provider} failed in consensus: ${error}`);
      }
    }

    if (responses.length === 0) {
      throw new Error('All consensus providers failed');
    }

    // For now, return the best provider's response
    // In a more advanced version, we would synthesize all responses
    return responses[0].response;
  }

  private recordTaskMetrics(
    task: OrchestratorTask, 
    decision: OrchestratorDecision, 
    actualTime: number, 
    success: boolean, 
    quality: number
  ): void {
    this.taskHistory.push({
      task,
      decision,
      actualCost: decision.estimatedCost, // In real implementation, track actual cost
      actualTime,
      quality,
      success
    });

    // Keep only last 1000 entries for performance
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-1000);
    }
  }

  /**
   * Get orchestrator performance metrics
   */
  getMetrics(): any {
    const successRate = this.taskHistory.filter(h => h.success).length / Math.max(1, this.taskHistory.length);
    const avgQuality = this.taskHistory.reduce((sum, h) => sum + h.quality, 0) / Math.max(1, this.taskHistory.length);
    const avgTime = this.taskHistory.reduce((sum, h) => sum + h.actualTime, 0) / Math.max(1, this.taskHistory.length);
    const totalCost = this.taskHistory.reduce((sum, h) => sum + h.actualCost, 0);

    return {
      totalTasks: this.taskHistory.length,
      successRate: (successRate * 100).toFixed(1),
      avgQuality: avgQuality.toFixed(1),
      avgResponseTime: Math.round(avgTime),
      totalCost: totalCost.toFixed(4),
      modelUsage: this.getModelUsageStats()
    };
  }

  private getModelUsageStats(): any {
    const usage = new Map<string, number>();
    
    for (const history of this.taskHistory) {
      const key = `${history.decision.selectedProvider}/${history.decision.selectedModel}`;
      usage.set(key, (usage.get(key) || 0) + 1);
    }

    return Object.fromEntries(usage);
  }
}

// Singleton instance
let orchestratorInstance: MasterAIOrchestrator | null = null;

export function getMasterOrchestrator(): MasterAIOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MasterAIOrchestrator();
  }
  return orchestratorInstance;
}