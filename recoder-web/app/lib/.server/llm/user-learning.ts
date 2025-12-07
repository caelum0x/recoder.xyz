/**
 * User-Specific Optimization Learning System
 * Learns from individual user patterns to provide personalized optimization
 */

export interface UserProfile {
  userId: string;
  created: number;
  lastActive: number;
  preferences: UserPreferences;
  patterns: UserPatterns;
  optimization: UserOptimization;
  stats: UserStats;
}

export interface UserPreferences {
  preferredFrameworks: string[];
  codingStyle: 'minimal' | 'verbose' | 'balanced';
  outputFormat: 'concise' | 'detailed' | 'step-by-step' | 'balanced';
  prioritizeSpeed: boolean;
  prioritizeQuality: boolean;
  languagePreference: 'typescript' | 'javascript' | 'mixed';
  complexity: 'beginner' | 'intermediate' | 'advanced';
}

export interface UserPatterns {
  requestTypes: Record<string, number>; // type -> frequency
  frameworkUsage: Record<string, number>; // framework -> usage count
  projectSizes: number[]; // file counts in recent projects
  sessionLengths: number[]; // conversation lengths
  commonKeywords: Record<string, number>; // keyword -> frequency
  timeOfDayActivity: Record<string, number>; // hour -> activity
  averageResponseLength: number;
  preferredPromptStyle: string;
}

export interface UserOptimization {
  bestStrategy: string;
  strategyEffectiveness: Record<string, number>; // strategy -> success rate
  qualityScores: Record<string, number[]>; // strategy -> quality scores
  costSavings: Record<string, number>; // strategy -> avg savings
  responseTimePreference: number; // preferred response time
  adaptivePromptLevel: number; // 0-1, how much to personalize prompts
}

export interface UserStats {
  totalRequests: number;
  totalTokensSaved: number;
  totalCostSaved: number;
  averageQualityScore: number;
  successRate: number;
  learningProgress: number; // 0-1, how well we understand the user
  lastOptimizationUpdate: number;
}

export interface LearningConfig {
  enabled: boolean;
  minInteractions: number; // minimum interactions before personalizing
  learningRate: number; // how quickly to adapt (0-1)
  privacyMode: boolean; // anonymize data
  retentionDays: number; // how long to keep user data
  adaptationThreshold: number; // confidence threshold for adaptations
}

class UserLearningSystem {
  private profiles: Map<string, UserProfile> = new Map();
  private config: LearningConfig;
  private cleanupInitialized = false;

  constructor(config?: Partial<LearningConfig>) {
    this.config = {
      enabled: true,
      minInteractions: 5,
      learningRate: 0.1,
      privacyMode: false,
      retentionDays: 90,
      adaptationThreshold: 0.7,
      ...config
    };
    // Note: setInterval removed for Cloudflare Workers compatibility
    // Cleanup is now done lazily on profile access
  }

  /**
   * Get or create user profile
   */
  getUserProfile(userId: string): UserProfile {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, this.createNewProfile(userId));
    }

    const profile = this.profiles.get(userId)!;
    profile.lastActive = Date.now();
    return profile;
  }

  /**
   * Learn from user interaction
   */
  learnFromInteraction(
    userId: string,
    interaction: {
      userMessage: string;
      strategy: string;
      framework?: string;
      qualityScore: number;
      responseTime: number;
      tokensSaved: number;
      costSaved: number;
      successful: boolean;
      conversationLength: number;
      fileCount?: number;
    }
  ): void {
    if (!this.config.enabled) return;

    const profile = this.getUserProfile(userId);

    // Update patterns
    this.updateUserPatterns(profile, interaction);

    // Update optimization data
    this.updateOptimization(profile, interaction);

    // Update stats
    this.updateStats(profile, interaction);

    // Trigger learning if enough data
    if (profile.stats.totalRequests >= this.config.minInteractions) {
      this.performLearning(profile);
    }
  }

  /**
   * Get personalized strategy for user
   */
  getPersonalizedStrategy(
    userId: string,
    userMessage: string,
    conversationLength: number,
    defaultStrategy: string
  ): string {
    if (!this.config.enabled) return defaultStrategy;

    const profile = this.profiles.get(userId);
    if (!profile || profile.stats.totalRequests < this.config.minInteractions) {
      return defaultStrategy;
    }

    // Check if we have enough confidence in our optimization
    if (profile.stats.learningProgress < this.config.adaptationThreshold) {
      return defaultStrategy;
    }

    // Get personalized strategy based on patterns
    const personalizedStrategy = this.calculateBestStrategy(profile, userMessage, conversationLength);

    return personalizedStrategy || defaultStrategy;
  }

  /**
   * Get personalized prompt modifications
   */
  getPersonalizedPromptMods(userId: string): {
    style: string;
    verbosity: number;
    focusAreas: string[];
  } {
    const profile = this.profiles.get(userId);
    if (!profile || profile.stats.learningProgress < 0.5) {
      return {
        style: 'balanced',
        verbosity: 0.5,
        focusAreas: []
      };
    }

    const preferences = profile.preferences;
    const patterns = profile.patterns;

    return {
      style: preferences.codingStyle,
      verbosity: this.calculateVerbosityLevel(preferences, patterns),
      focusAreas: this.identifyFocusAreas(patterns)
    };
  }

  /**
   * Get user insights for debugging/analytics
   */
  getUserInsights(userId: string): any {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    return {
      preferences: profile.preferences,
      topFrameworks: this.getTopFrameworks(profile.patterns),
      bestStrategy: profile.optimization.bestStrategy,
      learningProgress: profile.stats.learningProgress,
      personalizedRecommendations: this.generateRecommendations(profile)
    };
  }

  /**
   * Create new user profile
   */
  private createNewProfile(userId: string): UserProfile {
    return {
      userId,
      created: Date.now(),
      lastActive: Date.now(),
      preferences: {
        preferredFrameworks: [],
        codingStyle: 'balanced',
        outputFormat: 'balanced',
        prioritizeSpeed: false,
        prioritizeQuality: true,
        languagePreference: 'typescript',
        complexity: 'intermediate'
      },
      patterns: {
        requestTypes: {},
        frameworkUsage: {},
        projectSizes: [],
        sessionLengths: [],
        commonKeywords: {},
        timeOfDayActivity: {},
        averageResponseLength: 0,
        preferredPromptStyle: 'smart'
      },
      optimization: {
        bestStrategy: 'smart',
        strategyEffectiveness: {},
        qualityScores: {},
        costSavings: {},
        responseTimePreference: 2000,
        adaptivePromptLevel: 0
      },
      stats: {
        totalRequests: 0,
        totalTokensSaved: 0,
        totalCostSaved: 0,
        averageQualityScore: 0,
        successRate: 0,
        learningProgress: 0,
        lastOptimizationUpdate: Date.now()
      }
    };
  }

  /**
   * Update user patterns from interaction
   */
  private updateUserPatterns(profile: UserProfile, interaction: any): void {
    const patterns = profile.patterns;

    // Detect request type
    const requestType = this.classifyRequest(interaction.userMessage);
    patterns.requestTypes[requestType] = (patterns.requestTypes[requestType] || 0) + 1;

    // Track framework usage
    if (interaction.framework) {
      patterns.frameworkUsage[interaction.framework] =
        (patterns.frameworkUsage[interaction.framework] || 0) + 1;
    }

    // Track project sizes
    if (interaction.fileCount) {
      patterns.projectSizes.push(interaction.fileCount);
      if (patterns.projectSizes.length > 20) {
        patterns.projectSizes = patterns.projectSizes.slice(-20); // Keep last 20
      }
    }

    // Track session lengths
    patterns.sessionLengths.push(interaction.conversationLength);
    if (patterns.sessionLengths.length > 10) {
      patterns.sessionLengths = patterns.sessionLengths.slice(-10);
    }

    // Extract and track keywords
    const keywords = this.extractKeywords(interaction.userMessage);
    keywords.forEach(keyword => {
      patterns.commonKeywords[keyword] = (patterns.commonKeywords[keyword] || 0) + 1;
    });

    // Track time of day activity
    const hour = new Date().getHours().toString();
    patterns.timeOfDayActivity[hour] = (patterns.timeOfDayActivity[hour] || 0) + 1;

    // Update preferred prompt style based on successful interactions
    if (interaction.successful && interaction.qualityScore > 80) {
      patterns.preferredPromptStyle = interaction.strategy;
    }
  }

  /**
   * Update optimization data
   */
  private updateOptimization(profile: UserProfile, interaction: any): void {
    const optimization = profile.optimization;
    const strategy = interaction.strategy;

    // Update strategy effectiveness
    const currentSuccess = optimization.strategyEffectiveness[strategy] || 0;
    const successRate = interaction.successful ? 1 : 0;
    optimization.strategyEffectiveness[strategy] =
      this.updateExponentialAverage(currentSuccess, successRate, this.config.learningRate);

    // Update quality scores
    if (!optimization.qualityScores[strategy]) {
      optimization.qualityScores[strategy] = [];
    }
    optimization.qualityScores[strategy].push(interaction.qualityScore);
    if (optimization.qualityScores[strategy].length > 10) {
      optimization.qualityScores[strategy] = optimization.qualityScores[strategy].slice(-10);
    }

    // Update cost savings
    const currentSavings = optimization.costSavings[strategy] || 0;
    optimization.costSavings[strategy] =
      this.updateExponentialAverage(currentSavings, interaction.costSaved, this.config.learningRate);

    // Update response time preference
    if (interaction.successful) {
      optimization.responseTimePreference =
        this.updateExponentialAverage(
          optimization.responseTimePreference,
          interaction.responseTime,
          this.config.learningRate
        );
    }
  }

  /**
   * Update user stats
   */
  private updateStats(profile: UserProfile, interaction: any): void {
    const stats = profile.stats;

    stats.totalRequests++;
    stats.totalTokensSaved += interaction.tokensSaved;
    stats.totalCostSaved += interaction.costSaved;

    // Update average quality score
    stats.averageQualityScore = this.updateExponentialAverage(
      stats.averageQualityScore,
      interaction.qualityScore,
      this.config.learningRate
    );

    // Update success rate
    const successValue = interaction.successful ? 1 : 0;
    stats.successRate = this.updateExponentialAverage(
      stats.successRate,
      successValue,
      this.config.learningRate
    );

    // Update learning progress (confidence in our understanding)
    const dataPoints = stats.totalRequests;
    const maxConfidence = 50; // Need 50 interactions for full confidence
    stats.learningProgress = Math.min(dataPoints / maxConfidence, 1);
  }

  /**
   * Perform machine learning to optimize user experience
   */
  private performLearning(profile: UserProfile): void {
    // Update preferences based on patterns
    this.updatePreferences(profile);

    // Find best strategy
    this.findBestStrategy(profile);

    // Update adaptive prompt level
    this.updateAdaptiveLevel(profile);

    profile.stats.lastOptimizationUpdate = Date.now();
  }

  /**
   * Update user preferences based on observed patterns
   */
  private updatePreferences(profile: UserProfile): void {
    const patterns = profile.patterns;
    const preferences = profile.preferences;

    // Update preferred frameworks
    const topFrameworks = this.getTopFrameworks(patterns);
    preferences.preferredFrameworks = topFrameworks.slice(0, 3);

    // Infer coding style from patterns
    const avgProjectSize = patterns.projectSizes.length > 0 ?
      patterns.projectSizes.reduce((a, b) => a + b, 0) / patterns.projectSizes.length : 5;

    if (avgProjectSize < 3) {
      preferences.codingStyle = 'minimal';
    } else if (avgProjectSize > 10) {
      preferences.codingStyle = 'verbose';
    } else {
      preferences.codingStyle = 'balanced';
    }

    // Infer language preference
    const hasTypeScriptKeywords = Object.keys(patterns.commonKeywords).some(
      keyword => ['typescript', 'types', 'interface'].includes(keyword.toLowerCase())
    );
    if (hasTypeScriptKeywords) {
      preferences.languagePreference = 'typescript';
    }

    // Infer complexity level
    const complexKeywords = ['advanced', 'complex', 'optimization', 'performance', 'architecture'];
    const complexityScore = Object.keys(patterns.commonKeywords).filter(
      keyword => complexKeywords.includes(keyword.toLowerCase())
    ).length;

    if (complexityScore > 3) {
      preferences.complexity = 'advanced';
    } else if (complexityScore < 1) {
      preferences.complexity = 'beginner';
    } else {
      preferences.complexity = 'intermediate';
    }
  }

  /**
   * Find the best strategy for this user
   */
  private findBestStrategy(profile: UserProfile): void {
    const optimization = profile.optimization;

    let bestStrategy = 'smart';
    let bestScore = 0;

    for (const [strategy, effectiveness] of Object.entries(optimization.strategyEffectiveness)) {
      const qualityScores = optimization.qualityScores[strategy] || [];
      const avgQuality = qualityScores.length > 0 ?
        qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;

      const costSavings = optimization.costSavings[strategy] || 0;

      // Combined score considering effectiveness, quality, and cost savings
      const score = (effectiveness * 0.4) + (avgQuality / 100 * 0.4) + (costSavings * 1000 * 0.2);

      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    optimization.bestStrategy = bestStrategy;
  }

  /**
   * Update adaptive prompt level
   */
  private updateAdaptiveLevel(profile: UserProfile): void {
    const stats = profile.stats;

    // Increase adaptation level as we learn more about the user
    const baseLevel = Math.min(stats.learningProgress, 0.8);

    // Bonus for high success rate and quality
    const performanceBonus = (stats.successRate + stats.averageQualityScore / 100) / 2 * 0.2;

    profile.optimization.adaptivePromptLevel = Math.min(baseLevel + performanceBonus, 1);
  }

  /**
   * Calculate best strategy for current context
   */
  private calculateBestStrategy(
    profile: UserProfile,
    userMessage: string,
    conversationLength: number
  ): string {
    const requestType = this.classifyRequest(userMessage);
    const optimization = profile.optimization;

    // Check if user has specific preferences for this type of request
    if (optimization.strategyEffectiveness[requestType]) {
      return requestType;
    }

    // Use overall best strategy
    return optimization.bestStrategy;
  }

  /**
   * Calculate verbosity level for prompts
   */
  private calculateVerbosityLevel(preferences: UserPreferences, patterns: UserPatterns): number {
    let verbosity = 0.5; // Start balanced

    if (preferences.codingStyle === 'verbose') verbosity += 0.3;
    if (preferences.codingStyle === 'minimal') verbosity -= 0.3;

    if (preferences.outputFormat === 'detailed') verbosity += 0.2;
    if (preferences.outputFormat === 'concise') verbosity -= 0.2;

    if (preferences.complexity === 'beginner') verbosity += 0.2;
    if (preferences.complexity === 'advanced') verbosity -= 0.1;

    return Math.max(0, Math.min(1, verbosity));
  }

  /**
   * Identify focus areas based on user patterns
   */
  private identifyFocusAreas(patterns: UserPatterns): string[] {
    const focusAreas = [];

    // Most used frameworks
    const topFrameworks = this.getTopFrameworks(patterns);
    focusAreas.push(...topFrameworks.slice(0, 2));

    // Common request types
    const topRequestTypes = Object.entries(patterns.requestTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2)
      .map(([type]) => type);
    focusAreas.push(...topRequestTypes);

    // Common keywords
    const topKeywords = Object.entries(patterns.commonKeywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([keyword]) => keyword);
    focusAreas.push(...topKeywords);

    return [...new Set(focusAreas)]; // Remove duplicates
  }

  /**
   * Generate personalized recommendations
   */
  private generateRecommendations(profile: UserProfile): string[] {
    const recommendations = [];
    const patterns = profile.patterns;
    const preferences = profile.preferences;

    // Framework recommendations
    if (patterns.frameworkUsage['react'] > 3 && !preferences.preferredFrameworks.includes('nextjs')) {
      recommendations.push('Consider trying Next.js for better React development experience');
    }

    // Quality improvements
    if (profile.stats.averageQualityScore < 80) {
      recommendations.push('Enable TypeScript for better code quality');
    }

    // Performance recommendations
    const avgProjectSize = patterns.projectSizes.length > 0 ?
      patterns.projectSizes.reduce((a, b) => a + b, 0) / patterns.projectSizes.length : 0;

    if (avgProjectSize > 15) {
      recommendations.push('Consider modular architecture for large projects');
    }

    return recommendations;
  }

  /**
   * Utility methods
   */
  private classifyRequest(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('game') || lowerMessage.includes('canvas')) return 'game';
    if (lowerMessage.includes('dashboard') || lowerMessage.includes('chart')) return 'dashboard';
    if (lowerMessage.includes('api') || lowerMessage.includes('server')) return 'backend';
    if (lowerMessage.includes('mobile') || lowerMessage.includes('app')) return 'mobile';
    if (lowerMessage.includes('website') || lowerMessage.includes('landing')) return 'website';

    return 'general';
  }

  private extractKeywords(message: string): string[] {
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Filter out common words
    const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'have', 'their', 'said', 'each', 'which', 'would', 'there', 'could']);

    return words.filter(word => !stopWords.has(word));
  }

  private getTopFrameworks(patterns: UserPatterns): string[] {
    return Object.entries(patterns.frameworkUsage)
      .sort(([,a], [,b]) => b - a)
      .map(([framework]) => framework);
  }

  private updateExponentialAverage(current: number, newValue: number, learningRate: number): number {
    return current * (1 - learningRate) + newValue * learningRate;
  }

  private cleanupOldProfiles(): void {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

    for (const [userId, profile] of this.profiles.entries()) {
      if (profile.lastActive < cutoffTime) {
        this.profiles.delete(userId);
      }
    }
  }

  /**
   * Export user learning data for analysis
   */
  exportLearningData(): string {
    const anonymizedProfiles = Array.from(this.profiles.values()).map(profile => ({
      ...profile,
      userId: this.config.privacyMode ? 'anonymized' : profile.userId
    }));

    return JSON.stringify({
      profiles: anonymizedProfiles,
      config: this.config,
      exportDate: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }
}

// Global user learning instance
export const userLearningSystem = new UserLearningSystem();

// Learning insights for analytics
export const getLearningInsights = () => {
  const totalUsers = userLearningSystem['profiles'].size;
  const activeUsers = Array.from(userLearningSystem['profiles'].values())
    .filter(p => Date.now() - p.lastActive < 24 * 60 * 60 * 1000).length;

  return {
    totalUsers,
    activeUsers,
    averageLearningProgress: totalUsers > 0 ?
      Array.from(userLearningSystem['profiles'].values())
        .reduce((sum, p) => sum + p.stats.learningProgress, 0) / totalUsers : 0,
    topFrameworks: {},
    topRequestTypes: {}
  };
};