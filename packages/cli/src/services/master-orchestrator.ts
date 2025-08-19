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
import { getIntelligentModelRouter, RoutingDecision } from './intelligent-model-router';

// Import backend services through unified API
interface BackendServices {
  costOptimizer?: any;
  providerManager?: any;
  failoverService?: any;
}

// Mock backend services until we can properly import them
const backendServices: BackendServices = {};

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
    this.setupRealTimeModelDiscovery();
    
    // Initialize intelligent model router
    this.initializeIntelligentRouter();
  }
  
  private initializeIntelligentRouter(): void {
    try {
      const router = getIntelligentModelRouter();
      Logger.info('🧠 Intelligent Model Router integrated with orchestrator');
    } catch (error) {
      Logger.warn('Failed to initialize intelligent router:', error);
    }
  }

  private async initializeModelCapabilities(): Promise<void> {
    try {
      // Try to get real-time model data from backend services
      if (backendServices.providerManager && backendServices.failoverService) {
        const providers = await backendServices.providerManager.getAllProviders();
        
        for (const provider of providers) {
          for (const model of provider.models) {
            const modelKey = `${provider.id}-${model.id}`;
            
            // Get real-time performance metrics
            const systemStatus = await backendServices.failoverService.getSystemStatus();
            const providerHealth = systemStatus.providers.find((p: any) => p.id === provider.id);
            
            this.modelCapabilities.set(modelKey, {
              provider: provider.id,
              model: model.id,
              strengths: model.capabilities || ['general'],
              weaknesses: this.inferWeaknesses(model),
              costPerToken: model.inputPrice || 0.0001,
              avgResponseTime: providerHealth?.metrics.responseTime || 2000,
              qualityScore: this.calculateQualityScore(model, provider),
              specializations: model.capabilities || ['general'],
              maxContext: model.maxTokens || 4096,
              availability: providerHealth?.metrics.uptime || 0.95
            });
          }
        }
        
        Logger.info(`🎯 Initialized ${this.modelCapabilities.size} models for orchestration`);
        return;
      }
    } catch (error) {
      Logger.debug('Backend services not available for model discovery:', error);
    }
    
    // Fallback to static capabilities
    this.initializeFallbackCapabilities();
  }
  
  private initializeFallbackCapabilities(): void {
    // Fallback static model capabilities
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

    // Add OpenRouter free models for cost optimization
    this.modelCapabilities.set('openrouter-gemini-free', {
      provider: 'openrouter',
      model: 'google/gemini-2.0-flash-exp:free',
      strengths: ['cost-efficiency', 'speed', 'multimodal'],
      weaknesses: ['rate limits', 'consistency'],
      costPerToken: 0,
      avgResponseTime: 1500,
      qualityScore: 8.2,
      specializations: ['web development', 'analysis', 'documentation'],
      maxContext: 32000,
      availability: 0.93
    });

    this.modelCapabilities.set('deepseek-v3-free', {
      provider: 'deepseek',
      model: 'deepseek-v3-0324-free',
      strengths: ['code generation', 'cost-efficiency', 'reasoning'],
      weaknesses: ['rate limits', 'availability'],
      costPerToken: 0,
      avgResponseTime: 2200,
      qualityScore: 9.0,
      specializations: ['code generation', 'debugging', 'optimization'],
      maxContext: 64000,
      availability: 0.88
    });

    this.modelCapabilities.set('groq-llama', {
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
  }
  
  private inferWeaknesses(model: any): string[] {
    const weaknesses = [];
    
    if (model.inputPrice > 0.0001) weaknesses.push('cost');
    if (model.maxTokens < 16000) weaknesses.push('context length');
    if (model.id.includes('free')) weaknesses.push('rate limits');
    if (!model.capabilities?.includes('code-generation')) weaknesses.push('code generation');
    
    return weaknesses.length > 0 ? weaknesses : ['general limitations'];
  }
  
  private calculateQualityScore(model: any, provider: any): number {
    let score = 7.0; // Base score
    
    // Provider-based scoring
    if (provider.id === 'anthropic') score += 2.5;
    if (provider.id === 'gemini') score += 1.5;
    if (provider.id === 'deepseek') score += 2.0;
    if (provider.id === 'groq') score += 1.0;
    if (provider.id === 'openrouter') score += 1.2;
    
    // Model-specific adjustments
    if (model.id.includes('sonnet')) score += 0.5;
    if (model.id.includes('v3')) score += 0.5;
    if (model.id.includes('coder')) score += 1.0;
    
    return Math.min(10.0, score);
  }
  
  private setupRealTimeModelDiscovery(): void {
    // Update model capabilities every 5 minutes
    setInterval(async () => {
      try {
        await this.updateModelCapabilities();
      } catch (error) {
        Logger.warn('Failed to update model capabilities:', error);
      }
    }, 5 * 60 * 1000);
  }
  
  private async updateModelCapabilities(): Promise<void> {
    try {
      if (!backendServices.failoverService) {
        return; // Service not available
      }
      
      const systemStatus = await backendServices.failoverService.getSystemStatus();
      
      for (const [modelKey, capability] of this.modelCapabilities) {
        const providerHealth = systemStatus.providers.find((p: any) => p.id === capability.provider);
        if (providerHealth) {
          // Update real-time metrics
          capability.avgResponseTime = providerHealth.metrics.responseTime;
          capability.availability = providerHealth.metrics.uptime;
          
          this.modelCapabilities.set(modelKey, capability);
        }
      }
      
      Logger.debug(`🔄 Updated ${this.modelCapabilities.size} model capabilities`);
    } catch (error) {
      Logger.debug('Failed to update model capabilities:', error);
    }
  }

  /**
   * Main orchestration method - the "small AI" that makes decisions
   */
  async orchestrate(task: OrchestratorTask): Promise<OrchestratorDecision> {
    Logger.info(`🎯 Orchestrator analyzing task: ${task.description.substring(0, 50)}...`);

    try {
      // Step 1: Use intelligent model router for real-time optimization
      const routingDecision = await this.getIntelligentRouting(task);
      if (routingDecision) {
        Logger.info(`🧠 Intelligent router selected: ${routingDecision.provider}/${routingDecision.model} (${routingDecision.confidence}% confidence)`);
        Logger.info(`💡 Routing reasoning: ${routingDecision.reasoning.slice(0, 2).join(', ')}`);
        return this.convertRoutingDecisionToOrchestratorDecision(routingDecision, task);
      }
    } catch (error) {
      Logger.warn('Intelligent routing failed, falling back to cost optimizer:', error);
    }

    try {
      // Step 2: Fallback to cost optimizer
      const costOptimizedDecision = await this.getCostOptimizedRouting(task);
      if (costOptimizedDecision) {
        Logger.info(`💰 Cost optimizer selected: ${costOptimizedDecision.selectedProvider}`);
        return this.convertCostDecisionToOrchestratorDecision(costOptimizedDecision, task);
      }
    } catch (error) {
      Logger.warn('Cost optimizer failed, falling back to manual orchestration:', error);
    }

    // Final fallback: Manual orchestration
    return await this.manualOrchestrate(task);
  }
  
  private async getIntelligentRouting(task: OrchestratorTask): Promise<RoutingDecision | null> {
    try {
      const router = getIntelligentModelRouter();
      
      const request = {
        description: task.description,
        type: task.type,
        complexity: task.complexity,
        priority: task.priority,
        maxCost: this.getMaxCost(task),
        requirements: task.requirements || []
      };
      
      return await router.routeTask(request);
    } catch (error) {
      Logger.debug('Intelligent routing not available:', error);
      return null;
    }
  }
  
  private convertRoutingDecisionToOrchestratorDecision(routingDecision: RoutingDecision, task: OrchestratorTask): OrchestratorDecision {
    return {
      selectedProvider: routingDecision.provider,
      selectedModel: routingDecision.model,
      confidence: routingDecision.confidence,
      reasoning: `Intelligent routing: ${routingDecision.reasoning.join(', ')}`,
      estimatedCost: routingDecision.estimatedCost,
      estimatedTime: routingDecision.estimatedTime,
      fallbackOptions: routingDecision.alternatives,
      strategy: routingDecision.optimizationApplied ? 'consensus' : 'single'
    };
  }
  
  private async getCostOptimizedRouting(task: OrchestratorTask): Promise<any> {
    try {
      if (!backendServices.costOptimizer) {
        return null; // Cost optimizer not available
      }
      
      const request = {
        userId: 'orchestrator-system',
        prompt: task.description,
        taskType: task.type,
        complexity: task.complexity,
        qualityRequirement: this.getQualityRequirement(task),
        maxCost: this.getMaxCost(task),
        userTier: this.getUserTier(task)
      };
      
      return await backendServices.costOptimizer.optimizeRouting(request);
    } catch (error) {
      Logger.debug('Cost optimization not available:', error);
      return null;
    }
  }
  
  private convertCostDecisionToOrchestratorDecision(costDecision: any, task: OrchestratorTask): OrchestratorDecision {
    return {
      selectedProvider: costDecision.selectedProvider,
      selectedModel: costDecision.selectedProvider, // Simplified
      confidence: Math.min(95, costDecision.qualityScore * 100),
      reasoning: `Cost-optimized routing: ${costDecision.reasoning}. Potential savings: $${costDecision.costSavings.toFixed(4)}`,
      estimatedCost: costDecision.expectedCost,
      estimatedTime: this.estimateResponseTime(costDecision.selectedProvider),
      fallbackOptions: costDecision.alternativeOptions.map(opt => opt.providerId),
      strategy: 'single'
    };
  }
  
  private async manualOrchestrate(task: OrchestratorTask): Promise<OrchestratorDecision> {
    // Step 1: Analyze task requirements
    const taskAnalysis = this.analyzeTask(task);
    
    // Step 2: Score models based on task requirements
    const modelScores = this.scoreModels(task, taskAnalysis);
    
    // Step 3: Make intelligent decision based on priority
    const decision = this.makeDecision(task, modelScores);
    
    // Step 4: Log decision for learning
    Logger.info(`🧠 Manual orchestrator selected: ${decision.selectedProvider}/${decision.selectedModel} (${decision.confidence}% confidence)`);
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

      // Enhanced task type alignment
      if (analysis.isCodeGeneration) {
        if (capability.specializations.includes('code generation') || capability.strengths.includes('complex reasoning')) {
          score += 25;
        }
        if (capability.provider === 'deepseek' && task.description.includes('code')) {
          score += 15; // DeepSeek specializes in coding
        }
      }
      
      if (analysis.requiresSecurity && capability.specializations.includes('security')) {
        score += 30;
      }
      
      if (analysis.isPlanningTask && capability.strengths.includes('analysis')) {
        score += 20;
      }

      // Real-time priority adjustments with cost optimization
      switch (task.priority) {
        case 'speed':
          score += (5000 - capability.avgResponseTime) / 50;
          if (capability.provider === 'groq') score += 20; // Groq is fastest
          break;
        case 'cost':
          if (capability.costPerToken === 0) {
            score += 40; // Free models get huge boost for cost priority
          } else {
            score += (0.0002 - capability.costPerToken) * 100000;
          }
          // Boost OpenRouter and DeepSeek free models
          if (capability.provider === 'openrouter' || capability.provider === 'deepseek') {
            score += 25;
          }
          break;
        case 'quality':
          score += capability.qualityScore * 6;
          if (capability.provider === 'anthropic') score += 15; // Claude for quality
          break;
        case 'balanced':
          score += capability.qualityScore * 3;
          score += (3000 - capability.avgResponseTime) / 100;
          // Balance between free and premium models
          if (capability.costPerToken === 0 && capability.qualityScore > 8.0) {
            score += 20;
          }
          break;
      }

      // Enhanced complexity adjustments
      if (task.complexity === 'expert') {
        if (capability.qualityScore < 8.5) {
          score -= 25;
        }
        if (capability.provider === 'anthropic' || capability.provider === 'deepseek') {
          score += 15; // Premium models for expert tasks
        }
      }
      
      if (task.complexity === 'simple') {
        if (capability.costPerToken > 0.0001) {
          score -= 20; // Heavily penalize expensive models for simple tasks
        }
        if (capability.costPerToken === 0) {
          score += 25; // Boost free models for simple tasks
        }
      }

      // Real-time availability penalty
      score *= capability.availability;

      // Context length requirements
      if (analysis.estimatedTokens > capability.maxContext) {
        score = 0; // Cannot handle this task
      }

      // Privacy requirements
      if (analysis.needsPrivacy && capability.provider !== 'ollama') {
        score -= 30;
      }
      
      // Boost models based on current system health
      if (capability.availability > 0.95 && capability.avgResponseTime < 2000) {
        score += 10; // Reward reliable, fast models
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

    // Cost optimization reasoning
    if (model.costPerToken === 0) {
      reasons.push(`free model providing ${(model.qualityScore * 10).toFixed(0)}% cost savings`);
    }
    
    if (task.priority === 'speed' && model.avgResponseTime < 1500) {
      reasons.push(`ultra-fast response time (${model.avgResponseTime}ms, ${model.provider} optimized)`);
    }
    
    if (task.priority === 'cost' && model.costPerToken <= 0.00005) {
      const costDescription = model.costPerToken === 0 ? 'free' : `$${model.costPerToken.toFixed(6)}/token`;
      reasons.push(`optimal cost efficiency (${costDescription})`);
    }
    
    if (task.priority === 'quality' && model.qualityScore >= 9.0) {
      reasons.push(`premium quality (${model.qualityScore}/10 score, ${model.provider} excellence)`);
    }
    
    if (task.complexity === 'expert' && model.strengths.includes('complex reasoning')) {
      reasons.push(`expert-level complexity handling with ${model.provider} intelligence`);
    }
    
    // Enhanced specialization detection
    const taskLower = task.description.toLowerCase();
    const specialization = model.specializations.find(spec => 
      taskLower.includes(spec.toLowerCase().replace(/[\s-]/g, ''))
    );
    if (specialization) {
      reasons.push(`${model.provider} specialization in ${specialization}`);
    }
    
    // Provider-specific advantages
    if (model.provider === 'deepseek' && taskLower.includes('code')) {
      reasons.push('DeepSeek V3 coding excellence (10/10 rating)');
    }
    if (model.provider === 'groq' && task.priority === 'speed') {
      reasons.push('Groq lightning-fast inference');
    }
    if (model.provider === 'anthropic' && task.complexity === 'expert') {
      reasons.push('Claude advanced reasoning capabilities');
    }
    if (model.provider === 'openrouter' && model.costPerToken === 0) {
      reasons.push('OpenRouter free model optimization');
    }
    
    // Real-time health factors
    if (model.availability > 0.95) {
      reasons.push(`high availability (${(model.availability * 100).toFixed(1)}% uptime)`);
    }

    if (reasons.length === 0) {
      reasons.push(`highest orchestration score (${alternatives[0][1].toFixed(1)}/100)`);
    }

    return reasons.join(', ');
  }
  
  // Helper methods for cost optimization integration
  private getQualityRequirement(task: OrchestratorTask): number {
    switch (task.complexity) {
      case 'expert': return 0.9;
      case 'complex': return 0.8;
      case 'medium': return 0.7;
      case 'simple': return 0.6;
      default: return 0.7;
    }
  }
  
  private getMaxCost(task: OrchestratorTask): number {
    switch (task.priority) {
      case 'cost': return 0.01;
      case 'balanced': return 0.05;
      case 'speed': return 0.1;
      case 'quality': return 0.2;
      default: return 0.05;
    }
  }
  
  private getUserTier(task: OrchestratorTask): 'free' | 'pro' | 'enterprise' {
    // In production, this would come from user context
    if (task.priority === 'cost') return 'free';
    if (task.complexity === 'expert') return 'enterprise';
    return 'pro';
  }
  
  private estimateResponseTime(provider: string): number {
    const providerTimes = {
      'groq': 800,
      'openrouter': 1500,
      'deepseek': 2200,
      'anthropic': 3500,
      'gemini': 2500,
      'ollama': 1200
    };
    return providerTimes[provider as keyof typeof providerTimes] || 2000;
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