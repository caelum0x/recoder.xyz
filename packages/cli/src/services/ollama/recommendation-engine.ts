/**
 * Intelligent Model Recommendation Engine
 * 
 * Advanced recommendation system that analyzes user context, system capabilities,
 * usage patterns, and project requirements to suggest optimal AI models for
 * specific tasks and workflows with personalized scoring algorithms.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '@recoder/shared';
import { platformDetector, PlatformInfo } from './platform-detector';
import type { ModelInfo, SystemProfile, ModelCapability } from './model-manager';

export interface RecommendationContext {
  useCase: 'coding' | 'chat' | 'general' | 'documentation' | 'analysis' | 'debugging';
  language?: string[];              // Programming languages
  framework?: string[];             // Frameworks being used
  projectType?: 'web' | 'mobile' | 'desktop' | 'cli' | 'library' | 'api';
  complexity: 'simple' | 'medium' | 'complex';
  priority: 'speed' | 'quality' | 'memory' | 'accuracy';
  timeConstraint?: 'immediate' | 'flexible';
  privacyLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  budget: 'free-only' | 'cost-conscious' | 'flexible';
}

export interface UserPreferences {
  preferredModels: string[];        // User's favorite models
  avoidedModels: string[];          // Models user doesn't want
  maxModelSize: number;             // Max model size in GB
  preferLocalModels: boolean;       // Prefer local over cloud
  preferSmallModels: boolean;       // Prefer smaller, faster models
  prioritizeAccuracy: boolean;      // Accuracy vs speed tradeoff
  autoInstallModels: boolean;       // Auto-install recommendations
  updateFrequency: 'daily' | 'weekly' | 'monthly' | 'manual';
}

export interface UsagePattern {
  mostUsedLanguages: string[];      // Based on file analysis
  commonFrameworks: string[];       // Detected frameworks
  projectTypes: string[];           // Types of projects worked on
  averageSessionLength: number;     // Minutes per session
  peakUsageHours: number[];         // Hours of day (0-23)
  codeComplexity: 'simple' | 'medium' | 'complex';
  preferredResponseLength: 'short' | 'medium' | 'detailed';
}

export interface ModelRecommendation {
  model: ModelInfo;
  score: number;                    // 0-100 confidence score
  confidence: 'low' | 'medium' | 'high';
  reasoning: RecommendationReason[];
  warnings: string[];
  alternatives: string[];           // Alternative model suggestions
  estimatedPerformance: {
    tokensPerSecond: number;
    memoryUsage: number;
    accuracyScore: number;          // 0-100
    speedScore: number;             // 0-100
  };
  installationTime: number;         // Estimated time in minutes
  usageContext: string[];           // When to use this model
}

export interface RecommendationReason {
  type: 'system_compatibility' | 'use_case_match' | 'user_preference' | 'performance_optimization' | 'cost_efficiency' | 'privacy_requirement';
  weight: number;                   // 0-1 importance weight
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface ProjectAnalysis {
  languages: Array<{ name: string; percentage: number; lineCount: number }>;
  frameworks: Array<{ name: string; confidence: number; files: string[] }>;
  projectType: string;
  complexity: 'simple' | 'medium' | 'complex';
  codeSize: number;                 // Total lines of code
  fileTypes: Record<string, number>; // Extension counts
  dependencies: string[];           // Package dependencies
  aiUsagePatterns: {
    frequentPrompts: string[];
    averagePromptLength: number;
    preferredResponseStyle: string;
  };
}

export class IntelligentRecommendationEngine extends EventEmitter {
  private userPreferences: UserPreferences | null = null;
  private usagePatterns: UsagePattern | null = null;
  private systemProfile: SystemProfile | null = null;
  private projectAnalyses: Map<string, ProjectAnalysis> = new Map();
  private recommendationHistory: Array<{ context: RecommendationContext; recommendations: ModelRecommendation[]; timestamp: Date }> = [];
  
  private readonly PREFERENCES_FILE = path.join(os.homedir(), '.recoder', 'preferences.json');
  private readonly USAGE_PATTERNS_FILE = path.join(os.homedir(), '.recoder', 'usage-patterns.json');
  private readonly RECOMMENDATION_HISTORY_FILE = path.join(os.homedir(), '.recoder', 'recommendation-history.json');

  // Model scoring weights for different criteria
  private readonly SCORING_WEIGHTS = {
    system_compatibility: 0.25,      // How well model fits system
    use_case_alignment: 0.20,        // Match to intended use case
    user_preferences: 0.15,          // User's stated preferences
    performance_optimization: 0.15,  // Speed and efficiency
    cost_efficiency: 0.10,           // Cost considerations
    privacy_requirements: 0.10,      // Privacy and security needs
    learning_curve: 0.05            // Ease of use
  };

  constructor() {
    super();
  }

  /**
   * Initialize the recommendation engine
   */
  async initialize(): Promise<void> {
    Logger.info('Initializing Intelligent Recommendation Engine...');

    try {
      // Load user data
      await this.loadUserPreferences();
      await this.loadUsagePatterns();
      await this.loadRecommendationHistory();

      // Profile the system
      this.systemProfile = await this.profileSystem();

      // Analyze current project if in a project directory
      const currentProject = await this.analyzeCurrentProject();
      if (currentProject) {
        this.projectAnalyses.set(process.cwd(), currentProject);
      }

      Logger.info('Recommendation engine initialized successfully');
      this.emit('initialized');

    } catch (error) {
      Logger.error('Failed to initialize recommendation engine:', error);
      throw error;
    }
  }

  /**
   * Get intelligent model recommendations
   */
  async getRecommendations(
    context: RecommendationContext,
    availableModels: ModelInfo[],
    maxRecommendations: number = 5
  ): Promise<ModelRecommendation[]> {
    Logger.info('Generating intelligent model recommendations', { context, modelCount: availableModels.length });

    try {
      // Enhance context with project analysis and usage patterns
      const enhancedContext = await this.enhanceContext(context);

      // Score all available models
      const scoredModels = await Promise.all(
        availableModels.map(model => this.scoreModel(model, enhancedContext))
      );

      // Filter and sort recommendations
      const validRecommendations = scoredModels
        .filter(rec => rec.score > 20) // Minimum viable score
        .sort((a, b) => b.score - a.score)
        .slice(0, maxRecommendations);

      // Add alternatives and enhance reasoning
      const finalRecommendations = await this.enhanceRecommendations(validRecommendations, enhancedContext);

      // Store recommendation for learning
      this.storeRecommendation(context, finalRecommendations);

      Logger.info(`Generated ${finalRecommendations.length} recommendations`);
      this.emit('recommendationsGenerated', { context, recommendations: finalRecommendations });

      return finalRecommendations;

    } catch (error) {
      Logger.error('Failed to generate recommendations:', error);
      throw error;
    }
  }

  /**
   * Learn from user feedback on recommendations
   */
  async provideFeedback(
    recommendationId: string,
    modelUsed: string,
    feedback: {
      satisfaction: 1 | 2 | 3 | 4 | 5;
      performance: 'poor' | 'fair' | 'good' | 'excellent';
      accuracy: 'poor' | 'fair' | 'good' | 'excellent';
      speed: 'poor' | 'fair' | 'good' | 'excellent';
      comments?: string;
    }
  ): Promise<void> {
    Logger.info('Processing user feedback', { modelUsed, satisfaction: feedback.satisfaction });

    try {
      // Update user preferences based on feedback
      await this.updatePreferencesFromFeedback(modelUsed, feedback);

      // Store feedback for future analysis
      await this.storeFeedback(recommendationId, modelUsed, feedback);

      // Adjust scoring algorithms based on feedback
      await this.adjustScoringWeights(feedback);

      Logger.info('User feedback processed and incorporated');
      this.emit('feedbackProcessed', { modelUsed, feedback });

    } catch (error) {
      Logger.error('Failed to process feedback:', error);
      throw error;
    }
  }

  /**
   * Get personalized model recommendations for specific project
   */
  async getProjectRecommendations(projectPath: string): Promise<ModelRecommendation[]> {
    try {
      // Analyze the project
      const analysis = await this.analyzeProject(projectPath);
      this.projectAnalyses.set(projectPath, analysis);

      // Create context from project analysis
      const context: RecommendationContext = {
        useCase: this.inferUseCaseFromProject(analysis),
        language: analysis.languages.map(l => l.name),
        framework: analysis.frameworks.map(f => f.name),
        projectType: analysis.projectType as any,
        complexity: analysis.complexity,
        priority: 'quality', // Default for project-specific recommendations
        privacyLevel: 'internal', // Assume internal projects
        budget: this.userPreferences?.preferLocalModels ? 'free-only' : 'flexible'
      };

      // Get available models (this would come from model manager)
      const availableModels = await this.getAvailableModels();

      return await this.getRecommendations(context, availableModels);

    } catch (error) {
      Logger.error(`Failed to get project recommendations for ${projectPath}:`, error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    this.userPreferences = {
      ...this.getDefaultPreferences(),
      ...this.userPreferences,
      ...preferences
    };

    await this.saveUserPreferences();
    Logger.info('User preferences updated');
    this.emit('preferencesUpdated', this.userPreferences);
  }

  /**
   * Get current user preferences
   */
  getUserPreferences(): UserPreferences {
    return this.userPreferences || this.getDefaultPreferences();
  }

  /**
   * Get usage analytics and insights
   */
  getUsageInsights(): {
    totalRecommendations: number;
    mostRecommendedModels: Array<{ model: string; count: number }>;
    usagePatterns: UsagePattern | null;
    systemOptimization: string[];
    improvementSuggestions: string[];
  } {
    const totalRecommendations = this.recommendationHistory.length;
    
    // Count model recommendations
    const modelCounts = new Map<string, number>();
    this.recommendationHistory.forEach(({ recommendations }) => {
      recommendations.forEach(rec => {
        const count = modelCounts.get(rec.model.fullName) || 0;
        modelCounts.set(rec.model.fullName, count + 1);
      });
    });

    const mostRecommendedModels = Array.from(modelCounts.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const systemOptimization = this.generateSystemOptimizationSuggestions();
    const improvementSuggestions = this.generateImprovementSuggestions();

    return {
      totalRecommendations,
      mostRecommendedModels,
      usagePatterns: this.usagePatterns,
      systemOptimization,
      improvementSuggestions
    };
  }

  // Private helper methods

  private async scoreModel(model: ModelInfo, context: RecommendationContext & { enhanced: boolean }): Promise<ModelRecommendation> {
    let totalScore = 0;
    const reasons: RecommendationReason[] = [];
    const warnings: string[] = [];

    // System compatibility scoring
    const compatibilityScore = await this.scoreSystemCompatibility(model);
    totalScore += compatibilityScore * this.SCORING_WEIGHTS.system_compatibility * 100;
    
    if (compatibilityScore > 0.8) {
      reasons.push({
        type: 'system_compatibility',
        weight: this.SCORING_WEIGHTS.system_compatibility,
        description: 'Excellent compatibility with your system specifications',
        impact: 'high'
      });
    } else if (compatibilityScore < 0.5) {
      warnings.push('May have performance issues on your current system');
    }

    // Use case alignment scoring
    const useCaseScore = this.scoreUseCaseAlignment(model, context);
    totalScore += useCaseScore * this.SCORING_WEIGHTS.use_case_alignment * 100;
    
    if (useCaseScore > 0.8) {
      reasons.push({
        type: 'use_case_match',
        weight: this.SCORING_WEIGHTS.use_case_alignment,
        description: `Specifically optimized for ${context.useCase} tasks`,
        impact: 'high'
      });
    }

    // User preferences scoring
    const preferenceScore = this.scoreUserPreferences(model);
    totalScore += preferenceScore * this.SCORING_WEIGHTS.user_preferences * 100;

    // Performance optimization scoring
    const performanceScore = await this.scorePerformanceOptimization(model, context);
    totalScore += performanceScore * this.SCORING_WEIGHTS.performance_optimization * 100;

    // Cost efficiency scoring
    const costScore = this.scoreCostEfficiency(model, context);
    totalScore += costScore * this.SCORING_WEIGHTS.cost_efficiency * 100;

    if (costScore > 0.9) {
      reasons.push({
        type: 'cost_efficiency',
        weight: this.SCORING_WEIGHTS.cost_efficiency,
        description: 'Cost-free local processing saves money',
        impact: 'medium'
      });
    }

    // Privacy requirements scoring
    const privacyScore = this.scorePrivacyRequirements(model, context);
    totalScore += privacyScore * this.SCORING_WEIGHTS.privacy_requirements * 100;

    if (context.privacyLevel === 'restricted' && (model as any).isLocal) {
      reasons.push({
        type: 'privacy_requirement',
        weight: this.SCORING_WEIGHTS.privacy_requirements,
        description: 'Local processing ensures maximum data privacy',
        impact: 'high'
      });
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(totalScore, reasons.length);

    // Estimate performance
    const estimatedPerformance = await this.estimateModelPerformance(model, context);

    // Generate usage context
    const usageContext = this.generateUsageContext(model, context);

    return {
      model,
      score: Math.round(totalScore),
      confidence,
      reasoning: reasons,
      warnings,
      alternatives: [],
      estimatedPerformance,
      installationTime: this.estimateInstallationTime(model),
      usageContext
    };
  }

  private async scoreSystemCompatibility(model: ModelInfo): Promise<number> {
    if (!this.systemProfile) return 0.5;

    let score = 0;

    // RAM compatibility
    const ramScore = Math.min(1, this.systemProfile.totalRam / model.requirements.recommendedRam);
    score += ramScore * 0.4;

    // CPU compatibility
    const cpuScore = Math.min(1, this.systemProfile.cpuCores / model.requirements.minCpuCores);
    score += cpuScore * 0.3;

    // Architecture compatibility
    const archScore = model.requirements.architecture.includes(this.systemProfile.platform.arch) ? 1 : 0;
    score += archScore * 0.2;

    // Storage compatibility
    const storageScore = Math.min(1, this.systemProfile.storageSpace / (model.size / (1024 ** 3)));
    score += storageScore * 0.1;

    return Math.min(1, score);
  }

  private scoreUseCaseAlignment(model: ModelInfo, context: RecommendationContext): number {
    let score = 0;

    // Check model capabilities alignment
    const relevantCapabilities = model.capabilities.filter(cap => {
      switch (context.useCase) {
        case 'coding':
          return cap.type === 'code' && cap.proficiency !== 'basic';
        case 'chat':
          return cap.type === 'chat' && cap.proficiency !== 'basic';
        case 'documentation':
          return cap.type === 'instruct' || cap.type === 'chat';
        case 'analysis':
          return cap.type === 'instruct' || cap.type === 'code';
        case 'debugging':
          return cap.type === 'code' && cap.proficiency === 'excellent';
        default:
          return true;
      }
    });

    score += Math.min(1, relevantCapabilities.length / 2) * 0.6;

    // Language alignment for coding tasks
    if (context.language && context.useCase === 'coding') {
      const languageMatch = relevantCapabilities.some(cap => 
        cap.languages?.some(lang => context.language!.includes(lang))
      );
      score += languageMatch ? 0.4 : 0;
    } else {
      score += 0.4; // No language penalty for non-coding tasks
    }

    return Math.min(1, score);
  }

  private scoreUserPreferences(model: ModelInfo): number {
    if (!this.userPreferences) return 0.5;

    let score = 0.5; // Base score

    // Preferred models
    if (this.userPreferences.preferredModels.includes(model.fullName)) {
      score += 0.3;
    }

    // Avoided models
    if (this.userPreferences.avoidedModels.includes(model.fullName)) {
      score -= 0.4;
    }

    // Model size preference
    const modelSizeGB = model.size / (1024 ** 3);
    if (modelSizeGB <= this.userPreferences.maxModelSize) {
      score += 0.1;
    } else {
      score -= 0.2;
    }

    // Local model preference
    if (this.userPreferences.preferLocalModels && (model as any).isLocal) {
      score += 0.2;
    }

    // Small model preference
    if (this.userPreferences.preferSmallModels && modelSizeGB < 5) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  private async scorePerformanceOptimization(model: ModelInfo, context: RecommendationContext): Promise<number> {
    let score = 0;

    // Speed vs accuracy tradeoff
    if (context.priority === 'speed') {
      // Prefer smaller models for speed
      const sizeScore = Math.max(0, 1 - (model.size / (10 * 1024 ** 3))); // Penalize models > 10GB
      score += sizeScore * 0.5;
    } else if (context.priority === 'accuracy') {
      // Prefer larger, more capable models
      const capabilityScore = model.capabilities.filter(cap => cap.proficiency === 'excellent').length / model.capabilities.length;
      score += capabilityScore * 0.5;
    }

    // Memory efficiency
    if (context.priority === 'memory' && this.systemProfile) {
      const memoryEfficiency = Math.max(0, 1 - (model.requirements.recommendedRam / this.systemProfile.totalRam));
      score += memoryEfficiency * 0.5;
    }

    // Time constraint consideration
    if (context.timeConstraint === 'immediate') {
      // Prefer models that are already installed or quick to install
      score += model.isInstalled ? 0.3 : 0.1;
    }

    return Math.min(1, score + 0.2); // Base performance score
  }

  private scoreCostEfficiency(model: ModelInfo, context: RecommendationContext): number {
    let score = 0;

    if (context.budget === 'free-only') {
      // Only local models are free
      score = (model as any).isLocal ? 1 : 0;
    } else if (context.budget === 'cost-conscious') {
      // Prefer free models, but allow paid ones
      score = (model as any).isLocal ? 1 : 0.3;
    } else {
      // Budget flexible - slight preference for free
      score = (model as any).isLocal ? 0.8 : 0.6;
    }

    return score;
  }

  private scorePrivacyRequirements(model: ModelInfo, context: RecommendationContext): number {
    const privacyScores = {
      'public': 0.5,      // Any model is fine for public data
      'internal': 0.7,    // Slight preference for local
      'confidential': 0.9, // Strong preference for local
      'restricted': 1.0   // Only local models acceptable
    };

    const baseScore = privacyScores[context.privacyLevel] || 0.5;
    
    if ((model as any).isLocal) {
      return Math.min(1, baseScore + 0.3);
    } else {
      return context.privacyLevel === 'restricted' ? 0 : baseScore * 0.7;
    }
  }

  private calculateConfidence(score: number, reasonCount: number): 'low' | 'medium' | 'high' {
    if (score > 80 && reasonCount >= 3) return 'high';
    if (score > 60 && reasonCount >= 2) return 'medium';
    return 'low';
  }

  private async estimateModelPerformance(model: ModelInfo, context: RecommendationContext): Promise<{
    tokensPerSecond: number;
    memoryUsage: number;
    accuracyScore: number;
    speedScore: number;
  }> {
    if (!this.systemProfile) {
      return { tokensPerSecond: 10, memoryUsage: 4, accuracyScore: 70, speedScore: 70 };
    }

    // Estimate based on model size and system specs
    const modelSizeGB = model.size / (1024 ** 3);
    const ramRatio = this.systemProfile.totalRam / model.requirements.recommendedRam;
    const coreRatio = this.systemProfile.cpuCores / model.requirements.minCpuCores;

    // Base performance for local models
    const baseTokensPerSecond = this.systemProfile.hasGpu ? 25 : 15;
    const tokensPerSecond = Math.round(baseTokensPerSecond * ramRatio * coreRatio / Math.sqrt(modelSizeGB));

    const memoryUsage = Math.min(model.requirements.recommendedRam, this.systemProfile.totalRam * 0.8);

    // Accuracy generally increases with model size (up to a point)
    const accuracyScore = Math.min(95, 50 + (Math.log(modelSizeGB) * 15));

    // Speed decreases with model size
    const speedScore = Math.max(30, 100 - (modelSizeGB * 8));

    return {
      tokensPerSecond: Math.max(1, tokensPerSecond),
      memoryUsage,
      accuracyScore: Math.round(accuracyScore),
      speedScore: Math.round(speedScore)
    };
  }

  private estimateInstallationTime(model: ModelInfo): number {
    const sizeGB = model.size / (1024 ** 3);
    
    // Estimate based on size and typical download speeds
    // Assume 10 Mbps average download speed
    const downloadTimeMinutes = (sizeGB * 8 * 1024) / (10 * 60); // Convert GB to Mb, divide by speed
    const installTimeMinutes = 2; // Installation overhead
    
    return Math.round(downloadTimeMinutes + installTimeMinutes);
  }

  private generateUsageContext(model: ModelInfo, context: RecommendationContext): string[] {
    const contexts: string[] = [];

    // Use case contexts
    if (context.useCase === 'coding') {
      contexts.push('Code generation and review');
      contexts.push('Debugging assistance');
      contexts.push('Code refactoring');
    }

    // Language-specific contexts
    if (context.language) {
      contexts.push(`${context.language.join(', ')} development`);
    }

    // Complexity contexts
    if (context.complexity === 'simple') {
      contexts.push('Quick tasks and prototypes');
    } else if (context.complexity === 'complex') {
      contexts.push('Large-scale applications');
      contexts.push('Architecture decisions');
    }

    // Privacy contexts
    if (context.privacyLevel === 'restricted') {
      contexts.push('Sensitive code processing');
      contexts.push('Offline development');
    }

    return contexts;
  }

  private async enhanceContext(context: RecommendationContext): Promise<RecommendationContext & { enhanced: boolean }> {
    // Add project analysis if available
    const currentProjectAnalysis = this.projectAnalyses.get(process.cwd());
    
    if (currentProjectAnalysis) {
      return {
        ...context,
        language: context.language || currentProjectAnalysis.languages.map(l => l.name),
        framework: context.framework || currentProjectAnalysis.frameworks.map(f => f.name),
        complexity: context.complexity || currentProjectAnalysis.complexity,
        enhanced: true
      };
    }

    return { ...context, enhanced: false };
  }

  private async enhanceRecommendations(
    recommendations: ModelRecommendation[],
    context: RecommendationContext & { enhanced: boolean }
  ): Promise<ModelRecommendation[]> {
    return recommendations.map((rec, index) => {
      // Add alternatives
      const alternatives = recommendations
        .filter((_, i) => i !== index)
        .slice(0, 2)
        .map(alt => alt.model.fullName);

      return {
        ...rec,
        alternatives
      };
    });
  }

  private async profileSystem(): Promise<SystemProfile> {
    const platform = await platformDetector.detectPlatform();
    const totalRam = Math.round(os.totalmem() / (1024 ** 3));
    const availableRam = Math.round(os.freemem() / (1024 ** 3));
    const cpuCores = os.cpus().length;
    const cpuSpeed = os.cpus()[0]?.speed ? os.cpus()[0].speed / 1000 : 2.5;

    return {
      platform,
      totalRam,
      availableRam,
      cpuCores,
      cpuSpeed,
      hasGpu: false, // Would be detected properly in real implementation
      storageSpace: 100, // Placeholder - would be calculated
      networkSpeed: 100
    };
  }

  private async analyzeCurrentProject(): Promise<ProjectAnalysis | null> {
    try {
      return await this.analyzeProject(process.cwd());
    } catch (error) {
      return null;
    }
  }

  private async analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
    // This would implement comprehensive project analysis
    // For now, return a placeholder analysis
    return {
      languages: [
        { name: 'javascript', percentage: 60, lineCount: 5000 },
        { name: 'typescript', percentage: 40, lineCount: 3000 }
      ],
      frameworks: [
        { name: 'react', confidence: 0.9, files: ['package.json'] }
      ],
      projectType: 'web',
      complexity: 'medium',
      codeSize: 8000,
      fileTypes: { '.js': 25, '.ts': 15, '.jsx': 10 },
      dependencies: ['react', 'express', 'axios'],
      aiUsagePatterns: {
        frequentPrompts: ['generate component', 'fix bug', 'optimize code'],
        averagePromptLength: 150,
        preferredResponseStyle: 'detailed'
      }
    };
  }

  private inferUseCaseFromProject(analysis: ProjectAnalysis): 'coding' | 'chat' | 'general' {
    // Simple heuristic based on project characteristics
    if (analysis.languages.length > 0) {
      return 'coding';
    }
    return 'general';
  }

  private async getAvailableModels(): Promise<ModelInfo[]> {
    // This would get models from the model manager
    // Placeholder implementation
    return [];
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      preferredModels: [],
      avoidedModels: [],
      maxModelSize: 10, // 10GB
      preferLocalModels: true,
      preferSmallModels: false,
      prioritizeAccuracy: false,
      autoInstallModels: true,
      updateFrequency: 'weekly'
    };
  }

  private async loadUserPreferences(): Promise<void> {
    try {
      const data = await fs.readFile(this.PREFERENCES_FILE, 'utf8');
      this.userPreferences = JSON.parse(data);
    } catch (error) {
      this.userPreferences = this.getDefaultPreferences();
    }
  }

  private async saveUserPreferences(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.PREFERENCES_FILE), { recursive: true });
      await fs.writeFile(this.PREFERENCES_FILE, JSON.stringify(this.userPreferences, null, 2));
    } catch (error) {
      Logger.error('Failed to save user preferences:', error);
    }
  }

  private async loadUsagePatterns(): Promise<void> {
    try {
      const data = await fs.readFile(this.USAGE_PATTERNS_FILE, 'utf8');
      this.usagePatterns = JSON.parse(data);
    } catch (error) {
      this.usagePatterns = null;
    }
  }

  private async loadRecommendationHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.RECOMMENDATION_HISTORY_FILE, 'utf8');
      this.recommendationHistory = JSON.parse(data);
    } catch (error) {
      this.recommendationHistory = [];
    }
  }

  private storeRecommendation(context: RecommendationContext, recommendations: ModelRecommendation[]): void {
    this.recommendationHistory.push({
      context,
      recommendations,
      timestamp: new Date()
    });

    // Keep only last 100 recommendations
    if (this.recommendationHistory.length > 100) {
      this.recommendationHistory = this.recommendationHistory.slice(-100);
    }

    // Save to file (async, don't wait)
    this.saveRecommendationHistory().catch(error => {
      Logger.error('Failed to save recommendation history:', error);
    });
  }

  private async saveRecommendationHistory(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.RECOMMENDATION_HISTORY_FILE), { recursive: true });
      await fs.writeFile(this.RECOMMENDATION_HISTORY_FILE, JSON.stringify(this.recommendationHistory, null, 2));
    } catch (error) {
      Logger.error('Failed to save recommendation history:', error);
    }
  }

  private async updatePreferencesFromFeedback(modelUsed: string, feedback: any): Promise<void> {
    if (!this.userPreferences) return;

    if (feedback.satisfaction >= 4) {
      // Add to preferred models if highly satisfied
      if (!this.userPreferences.preferredModels.includes(modelUsed)) {
        this.userPreferences.preferredModels.push(modelUsed);
      }
      
      // Remove from avoided models if present
      const avoidIndex = this.userPreferences.avoidedModels.indexOf(modelUsed);
      if (avoidIndex > -1) {
        this.userPreferences.avoidedModels.splice(avoidIndex, 1);
      }
    } else if (feedback.satisfaction <= 2) {
      // Add to avoided models if unsatisfied
      if (!this.userPreferences.avoidedModels.includes(modelUsed)) {
        this.userPreferences.avoidedModels.push(modelUsed);
      }
      
      // Remove from preferred models if present
      const prefIndex = this.userPreferences.preferredModels.indexOf(modelUsed);
      if (prefIndex > -1) {
        this.userPreferences.preferredModels.splice(prefIndex, 1);
      }
    }

    await this.saveUserPreferences();
  }

  private async storeFeedback(recommendationId: string, modelUsed: string, feedback: any): Promise<void> {
    // Store feedback for analysis - implementation would save to feedback file
    Logger.info('Feedback stored for analysis', { recommendationId, modelUsed, feedback });
  }

  private async adjustScoringWeights(feedback: any): Promise<void> {
    // Adjust scoring weights based on feedback patterns
    // This would implement machine learning to improve recommendations over time
    Logger.debug('Adjusting scoring weights based on feedback', feedback);
  }

  private generateSystemOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    
    if (this.systemProfile) {
      if (this.systemProfile.totalRam < 8) {
        suggestions.push('Consider upgrading RAM for better model performance');
      }
      
      if (this.systemProfile.cpuCores < 4) {
        suggestions.push('CPU upgrade would improve inference speed');
      }
      
      if (!this.systemProfile.hasGpu) {
        suggestions.push('GPU acceleration could significantly improve performance');
      }
      
      if (this.systemProfile.storageSpace < 50) {
        suggestions.push('Free up storage space for larger models');
      }
    }

    return suggestions;
  }

  private generateImprovementSuggestions(): string[] {
    const suggestions: string[] = [];
    
    if (this.recommendationHistory.length < 5) {
      suggestions.push('Use more recommendations to improve personalization');
    }
    
    if (!this.usagePatterns) {
      suggestions.push('Enable usage analytics to get better recommendations');
    }
    
    suggestions.push('Provide feedback on recommendations to improve accuracy');
    suggestions.push('Update preferences regularly as your needs change');

    return suggestions;
  }
}

// Export singleton instance
export const recommendationEngine = new IntelligentRecommendationEngine();