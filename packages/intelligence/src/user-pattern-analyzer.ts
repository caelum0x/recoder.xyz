/**
 * User Pattern Analyzer
 * Learns from user coding patterns, preferences, and behaviors to provide personalized AI assistance
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '@recoder/shared';
import { v4 as uuidv4 } from 'uuid';
import * as statistics from 'simple-statistics';
import { KMeans } from 'ml-kmeans';

export interface CodingSession {
  id: string;
  userId: string;
  projectId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  actions: CodingAction[];
  context: SessionContext;
  productivity: ProductivityMetrics;
  language: string;
  framework?: string;
}

export interface CodingAction {
  id: string;
  type: 'generation' | 'edit' | 'refactor' | 'debug' | 'test' | 'documentation' | 'search' | 'analysis';
  timestamp: number;
  prompt?: string;
  code?: string;
  files: string[];
  lineCount: number;
  characterCount: number;
  complexity: number;
  success: boolean;
  duration: number;
  model?: string;
  tokens?: { input: number; output: number };
  cost?: number;
  feedback?: UserFeedback;
}

export interface SessionContext {
  projectType: 'web' | 'mobile' | 'desktop' | 'api' | 'library' | 'script' | 'unknown';
  technologies: string[];
  fileTypes: string[];
  codebaseSize: 'small' | 'medium' | 'large' | 'enterprise';
  teamSize: 'solo' | 'small' | 'medium' | 'large';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
}

export interface ProductivityMetrics {
  linesPerHour: number;
  actionsPerHour: number;
  successRate: number;
  averageComplexity: number;
  focusTime: number; // Minutes of continuous work
  breakTime: number; // Minutes of inactivity
  errorRate: number;
  refactorFrequency: number;
}

export interface UserFeedback {
  rating: 1 | 2 | 3 | 4 | 5;
  helpful: boolean;
  accurate: boolean;
  timeToComplete: number;
  improvements?: string[];
  tags?: string[];
}

export interface UserPattern {
  id: string;
  userId: string;
  type: 'coding_style' | 'preference' | 'workflow' | 'timing' | 'technology' | 'productivity';
  pattern: string;
  description: string;
  confidence: number; // 0-1
  frequency: number;
  lastSeen: number;
  examples: string[];
  metadata: Record<string, any>;
}

export interface UserProfile {
  userId: string;
  created: number;
  lastActive: number;
  totalSessions: number;
  totalActions: number;
  totalCodeLines: number;
  averageSessionDuration: number;
  preferredLanguages: { language: string; frequency: number }[];
  preferredFrameworks: { framework: string; frequency: number }[];
  workingHours: { start: number; end: number; timezone: string };
  productivityPeaks: { hour: number; productivity: number }[];
  codingStyle: CodingStyleProfile;
  patterns: UserPattern[];
  preferences: UserPreferences;
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  specializations: string[];
}

export interface CodingStyleProfile {
  indentationStyle: 'spaces' | 'tabs';
  indentationSize: number;
  namingConvention: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case';
  bracketStyle: 'same_line' | 'new_line' | 'k&r' | 'allman';
  lineLength: number;
  commentFrequency: 'low' | 'medium' | 'high';
  documentationStyle: 'minimal' | 'moderate' | 'comprehensive';
  testingApproach: 'none' | 'unit' | 'integration' | 'comprehensive';
  errorHandling: 'minimal' | 'defensive' | 'comprehensive';
  performanceOriented: boolean;
  securityConscious: boolean;
}

export interface UserPreferences {
  aiAssistanceLevel: 'minimal' | 'moderate' | 'extensive';
  explanationDetail: 'brief' | 'moderate' | 'detailed';
  codeComments: boolean;
  autoFormatting: boolean;
  suggestionTiming: 'immediate' | 'after_pause' | 'on_request';
  preferredModels: string[];
  costSensitivity: 'low' | 'medium' | 'high';
  qualityThreshold: number; // 0-1
}

export interface PatternAnalysisConfig {
  enabled: boolean;
  learningRate: number;
  confidenceThreshold: number;
  patternDecayDays: number;
  maxPatternsPerUser: number;
  analysisFrequency: number; // hours
  privacyMode: boolean;
  anonymizeData: boolean;
}

export class UserPatternAnalyzer extends EventEmitter {
  private readonly logger = new Logger('UserPatternAnalyzer');
  private readonly config: PatternAnalysisConfig;
  private readonly activeSessions = new Map<string, CodingSession>();
  private readonly userProfiles = new Map<string, UserProfile>();
  private readonly patterns = new Map<string, UserPattern[]>();
  private analysisTimer?: NodeJS.Timeout;

  constructor(config?: Partial<PatternAnalysisConfig>) {
    super();
    
    this.config = {
      enabled: true,
      learningRate: 0.1,
      confidenceThreshold: 0.7,
      patternDecayDays: 30,
      maxPatternsPerUser: 100,
      analysisFrequency: 6, // Every 6 hours
      privacyMode: false,
      anonymizeData: false,
      ...config,
    };

    this.startPeriodicAnalysis();
    this.loadUserProfiles();
  }

  /**
   * Start a new coding session
   */
  async startSession(userId: string, projectId: string, context: Partial<SessionContext> = {}): Promise<string> {
    const sessionId = uuidv4();
    const now = Date.now();
    
    const session: CodingSession = {
      id: sessionId,
      userId,
      projectId,
      startTime: now,
      actions: [],
      context: {
        projectType: 'unknown',
        technologies: [],
        fileTypes: [],
        codebaseSize: 'medium',
        teamSize: 'solo',
        timeOfDay: this.getTimeOfDay(now),
        dayOfWeek: this.getDayOfWeek(now),
        ...context,
      },
      productivity: {
        linesPerHour: 0,
        actionsPerHour: 0,
        successRate: 0,
        averageComplexity: 0,
        focusTime: 0,
        breakTime: 0,
        errorRate: 0,
        refactorFrequency: 0,
      },
      language: context.technologies?.[0] || 'javascript',
    };

    this.activeSessions.set(sessionId, session);
    
    this.logger.info(`Started coding session ${sessionId} for user ${userId}`);
    this.emit('sessionStarted', session);
    
    return sessionId;
  }

  /**
   * End a coding session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = Date.now();
    session.endTime = now;
    session.duration = now - session.startTime;

    // Calculate final productivity metrics
    session.productivity = this.calculateProductivityMetrics(session);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Update user profile
    await this.updateUserProfile(session);

    // Analyze patterns from this session
    await this.analyzeSessionPatterns(session);

    // Save session data
    await this.saveSessionData(session);

    this.logger.info(`Ended coding session ${sessionId}, duration: ${session.duration}ms`);
    this.emit('sessionEnded', session);
  }

  /**
   * Record a coding action
   */
  async recordAction(sessionId: string, action: Omit<CodingAction, 'id' | 'timestamp'>): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const codingAction: CodingAction = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...action,
    };

    session.actions.push(codingAction);

    // Real-time pattern detection
    if (this.config.enabled) {
      await this.detectRealTimePatterns(session, codingAction);
    }

    this.emit('actionRecorded', { session, action: codingAction });
  }

  /**
   * Record user feedback
   */
  async recordFeedback(sessionId: string, actionId: string, feedback: UserFeedback): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const action = session.actions.find(a => a.id === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in session ${sessionId}`);
    }

    action.feedback = feedback;

    // Learn from feedback
    await this.learnFromFeedback(session, action, feedback);

    this.emit('feedbackRecorded', { session, action, feedback });
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return this.userProfiles.get(userId) || null;
  }

  /**
   * Get user patterns
   */
  async getUserPatterns(userId: string, type?: UserPattern['type']): Promise<UserPattern[]> {
    const userPatterns = this.patterns.get(userId) || [];
    
    if (type) {
      return userPatterns.filter(p => p.type === type);
    }
    
    return userPatterns;
  }

  /**
   * Predict user behavior
   */
  async predictUserBehavior(userId: string, context: Partial<SessionContext>): Promise<{
    nextAction: string;
    confidence: number;
    timeEstimate: number;
    suggestions: string[];
  }> {
    const profile = await this.getUserProfile(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }

    const patterns = await this.getUserPatterns(userId, 'workflow');
    const contextPatterns = patterns.filter(p => this.matchesContext(p, context));

    // Simple prediction based on most frequent patterns
    const sortedPatterns = contextPatterns.sort((a, b) => b.frequency - a.frequency);
    const topPattern = sortedPatterns[0];

    if (!topPattern) {
      return {
        nextAction: 'generation',
        confidence: 0.3,
        timeEstimate: 300000, // 5 minutes default
        suggestions: ['Consider starting with code generation', 'Review existing code first'],
      };
    }

    return {
      nextAction: topPattern.pattern,
      confidence: topPattern.confidence,
      timeEstimate: this.estimateActionTime(profile, topPattern.pattern),
      suggestions: this.generateSuggestions(profile, context),
    };
  }

  /**
   * Get productivity insights
   */
  async getProductivityInsights(userId: string, timeframe: { start: number; end: number }): Promise<{
    averageProductivity: number;
    peakHours: number[];
    improvements: string[];
    trends: { metric: string; trend: 'increasing' | 'decreasing' | 'stable'; value: number }[];
  }> {
    const profile = await this.getUserProfile(userId);
    if (!profile) {
      throw new Error(`User profile not found for ${userId}`);
    }

    // Load session data for timeframe
    const sessions = await this.loadSessionsInTimeframe(userId, timeframe);
    
    const productivityScores = sessions.map(s => this.calculateOverallProductivity(s.productivity));
    const averageProductivity = statistics.mean(productivityScores);

    const hourlyProductivity = new Map<number, number[]>();
    sessions.forEach(session => {
      const hour = new Date(session.startTime).getHours();
      if (!hourlyProductivity.has(hour)) {
        hourlyProductivity.set(hour, []);
      }
      hourlyProductivity.get(hour)!.push(this.calculateOverallProductivity(session.productivity));
    });

    const peakHours = Array.from(hourlyProductivity.entries())
      .map(([hour, scores]) => ({ hour, avg: statistics.mean(scores) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)
      .map(entry => entry.hour);

    return {
      averageProductivity,
      peakHours,
      improvements: this.generateProductivityImprovements(profile, sessions),
      trends: this.calculateTrends(sessions),
    };
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): {
    totalUsers: number;
    totalSessions: number;
    totalPatterns: number;
    avgPatternsPerUser: number;
    learningAccuracy: number;
  } {
    const totalUsers = this.userProfiles.size;
    const totalSessions = Array.from(this.userProfiles.values())
      .reduce((sum, profile) => sum + profile.totalSessions, 0);
    const totalPatterns = Array.from(this.patterns.values())
      .reduce((sum, patterns) => sum + patterns.length, 0);
    
    return {
      totalUsers,
      totalSessions,
      totalPatterns,
      avgPatternsPerUser: totalUsers > 0 ? totalPatterns / totalUsers : 0,
      learningAccuracy: this.calculateLearningAccuracy(),
    };
  }

  /**
   * Calculate productivity metrics for a session
   */
  private calculateProductivityMetrics(session: CodingSession): ProductivityMetrics {
    const duration = session.duration || 0;
    const durationHours = duration / (1000 * 60 * 60);
    
    const totalLines = session.actions.reduce((sum, action) => sum + action.lineCount, 0);
    const successfulActions = session.actions.filter(action => action.success);
    const totalComplexity = session.actions.reduce((sum, action) => sum + action.complexity, 0);
    
    // Calculate focus time (periods of continuous activity)
    const focusTime = this.calculateFocusTime(session.actions);
    const breakTime = Math.max(0, duration - focusTime);

    return {
      linesPerHour: durationHours > 0 ? totalLines / durationHours : 0,
      actionsPerHour: durationHours > 0 ? session.actions.length / durationHours : 0,
      successRate: session.actions.length > 0 ? successfulActions.length / session.actions.length : 0,
      averageComplexity: session.actions.length > 0 ? totalComplexity / session.actions.length : 0,
      focusTime: focusTime / (1000 * 60), // Convert to minutes
      breakTime: breakTime / (1000 * 60),
      errorRate: session.actions.length > 0 ? (session.actions.length - successfulActions.length) / session.actions.length : 0,
      refactorFrequency: session.actions.filter(a => a.type === 'refactor').length,
    };
  }

  /**
   * Update user profile with session data
   */
  private async updateUserProfile(session: CodingSession): Promise<void> {
    let profile = this.userProfiles.get(session.userId);
    
    if (!profile) {
      profile = this.createDefaultProfile(session.userId);
    }

    // Update basic stats
    profile.lastActive = Date.now();
    profile.totalSessions++;
    profile.totalActions += session.actions.length;
    profile.totalCodeLines += session.actions.reduce((sum, action) => sum + action.lineCount, 0);
    
    // Update average session duration
    const totalDuration = (profile.averageSessionDuration * (profile.totalSessions - 1)) + (session.duration || 0);
    profile.averageSessionDuration = totalDuration / profile.totalSessions;

    // Update preferred languages and frameworks
    this.updateLanguagePreferences(profile, session);
    this.updateFrameworkPreferences(profile, session);

    // Update working hours
    this.updateWorkingHours(profile, session);

    // Update productivity peaks
    this.updateProductivityPeaks(profile, session);

    // Update coding style
    await this.updateCodingStyle(profile, session);

    // Update skill level
    this.updateSkillLevel(profile, session);

    this.userProfiles.set(session.userId, profile);
    
    // Save profile
    await this.saveUserProfile(profile);
  }

  /**
   * Analyze patterns from a completed session
   */
  private async analyzeSessionPatterns(session: CodingSession): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const patterns: UserPattern[] = [];

    // Analyze workflow patterns
    patterns.push(...this.analyzeWorkflowPatterns(session));

    // Analyze timing patterns
    patterns.push(...this.analyzeTimingPatterns(session));

    // Analyze technology patterns
    patterns.push(...this.analyzeTechnologyPatterns(session));

    // Analyze coding style patterns
    patterns.push(...await this.analyzeCodingStylePatterns(session));

    // Update user patterns
    await this.updateUserPatterns(session.userId, patterns);
  }

  /**
   * Detect real-time patterns during coding
   */
  private async detectRealTimePatterns(session: CodingSession, action: CodingAction): Promise<void> {
    // Detect immediate patterns that could be useful for real-time suggestions
    const recentActions = session.actions.slice(-5); // Last 5 actions
    
    // Pattern: Repeated action types
    const actionTypes = recentActions.map(a => a.type);
    const uniqueTypes = new Set(actionTypes);
    
    if (uniqueTypes.size === 1 && actionTypes.length >= 3) {
      // User is repeating the same action type
      this.emit('patternDetected', {
        type: 'repeated_action',
        pattern: actionTypes[0],
        confidence: 0.8,
        suggestion: `Consider using batch operations for ${actionTypes[0]}`,
      });
    }

    // Pattern: Error frequency
    const errorRate = recentActions.filter(a => !a.success).length / recentActions.length;
    if (errorRate > 0.6) {
      this.emit('patternDetected', {
        type: 'high_error_rate',
        pattern: 'frequent_errors',
        confidence: 0.9,
        suggestion: 'Consider taking a break or reviewing the approach',
      });
    }
  }

  /**
   * Learn from user feedback
   */
  private async learnFromFeedback(session: CodingSession, action: CodingAction, feedback: UserFeedback): Promise<void> {
    // Create feedback-based patterns
    const pattern: UserPattern = {
      id: uuidv4(),
      userId: session.userId,
      type: 'preference',
      pattern: `${action.type}_feedback_${feedback.rating}`,
      description: `User rated ${action.type} action as ${feedback.rating}/5`,
      confidence: 0.8,
      frequency: 1,
      lastSeen: Date.now(),
      examples: [action.prompt || action.code || ''],
      metadata: {
        actionType: action.type,
        rating: feedback.rating,
        helpful: feedback.helpful,
        accurate: feedback.accurate,
        improvements: feedback.improvements,
      },
    };

    await this.updateUserPatterns(session.userId, [pattern]);

    // Adjust confidence for similar patterns
    const userPatterns = this.patterns.get(session.userId) || [];
    userPatterns.forEach(p => {
      if (p.type === 'preference' && p.pattern.includes(action.type)) {
        // Adjust confidence based on feedback
        if (feedback.rating >= 4) {
          p.confidence = Math.min(1.0, p.confidence + this.config.learningRate);
        } else if (feedback.rating <= 2) {
          p.confidence = Math.max(0.1, p.confidence - this.config.learningRate);
        }
      }
    });
  }

  /**
   * Analyze workflow patterns
   */
  private analyzeWorkflowPatterns(session: CodingSession): UserPattern[] {
    const patterns: UserPattern[] = [];
    const actions = session.actions;

    if (actions.length < 3) {
      return patterns;
    }

    // Find common action sequences
    const sequences = this.findActionSequences(actions, 3);
    
    sequences.forEach(sequence => {
      if (sequence.frequency >= 2) {
        patterns.push({
          id: uuidv4(),
          userId: session.userId,
          type: 'workflow',
          pattern: sequence.pattern,
          description: `Common workflow: ${sequence.pattern}`,
          confidence: Math.min(0.9, sequence.frequency / actions.length),
          frequency: sequence.frequency,
          lastSeen: Date.now(),
          examples: sequence.examples,
          metadata: { sequenceLength: 3 },
        });
      }
    });

    return patterns;
  }

  /**
   * Analyze timing patterns
   */
  private analyzeTimingPatterns(session: CodingSession): UserPattern[] {
    const patterns: UserPattern[] = [];
    
    // Peak productivity times
    const hourlyProductivity = this.calculateHourlyProductivity(session);
    const peakHour = Object.entries(hourlyProductivity)
      .sort(([,a], [,b]) => b - a)[0];

    if (peakHour && peakHour[1] > 0) {
      patterns.push({
        id: uuidv4(),
        userId: session.userId,
        type: 'timing',
        pattern: `peak_hour_${peakHour[0]}`,
        description: `Most productive at hour ${peakHour[0]}`,
        confidence: 0.7,
        frequency: 1,
        lastSeen: Date.now(),
        examples: [],
        metadata: { 
          hour: parseInt(peakHour[0]),
          productivity: peakHour[1],
          timeOfDay: session.context.timeOfDay,
        },
      });
    }

    return patterns;
  }

  /**
   * Analyze technology patterns
   */
  private analyzeTechnologyPatterns(session: CodingSession): UserPattern[] {
    const patterns: UserPattern[] = [];
    
    // Technology preferences
    session.context.technologies.forEach(tech => {
      patterns.push({
        id: uuidv4(),
        userId: session.userId,
        type: 'technology',
        pattern: `prefers_${tech}`,
        description: `Uses ${tech} technology`,
        confidence: 0.6,
        frequency: 1,
        lastSeen: Date.now(),
        examples: [],
        metadata: { 
          technology: tech,
          projectType: session.context.projectType,
        },
      });
    });

    return patterns;
  }

  /**
   * Analyze coding style patterns
   */
  private async analyzeCodingStylePatterns(session: CodingSession): UserPattern[] {
    const patterns: UserPattern[] = [];
    
    // Analyze code from actions for style patterns
    const codeActions = session.actions.filter(a => a.code && a.code.length > 0);
    
    if (codeActions.length === 0) {
      return patterns;
    }

    // Detect indentation style
    const indentationStyle = this.detectIndentationStyle(codeActions);
    if (indentationStyle) {
      patterns.push({
        id: uuidv4(),
        userId: session.userId,
        type: 'coding_style',
        pattern: `indentation_${indentationStyle.type}_${indentationStyle.size}`,
        description: `Prefers ${indentationStyle.type} indentation with ${indentationStyle.size} spaces`,
        confidence: indentationStyle.confidence,
        frequency: 1,
        lastSeen: Date.now(),
        examples: indentationStyle.examples,
        metadata: indentationStyle,
      });
    }

    // Detect naming convention
    const namingConvention = this.detectNamingConvention(codeActions);
    if (namingConvention) {
      patterns.push({
        id: uuidv4(),
        userId: session.userId,
        type: 'coding_style',
        pattern: `naming_${namingConvention.style}`,
        description: `Uses ${namingConvention.style} naming convention`,
        confidence: namingConvention.confidence,
        frequency: 1,
        lastSeen: Date.now(),
        examples: namingConvention.examples,
        metadata: namingConvention,
      });
    }

    return patterns;
  }

  /**
   * Update user patterns
   */
  private async updateUserPatterns(userId: string, newPatterns: UserPattern[]): Promise<void> {
    let userPatterns = this.patterns.get(userId) || [];
    
    newPatterns.forEach(newPattern => {
      const existing = userPatterns.find(p => 
        p.type === newPattern.type && p.pattern === newPattern.pattern
      );
      
      if (existing) {
        // Update existing pattern
        existing.frequency += newPattern.frequency;
        existing.confidence = Math.min(1.0, existing.confidence + this.config.learningRate);
        existing.lastSeen = newPattern.lastSeen;
        existing.examples.push(...newPattern.examples);
        
        // Keep only recent examples
        existing.examples = existing.examples.slice(-10);
      } else {
        // Add new pattern
        userPatterns.push(newPattern);
      }
    });

    // Remove old patterns
    const cutoff = Date.now() - (this.config.patternDecayDays * 24 * 60 * 60 * 1000);
    userPatterns = userPatterns.filter(p => p.lastSeen > cutoff);

    // Limit number of patterns
    if (userPatterns.length > this.config.maxPatternsPerUser) {
      userPatterns = userPatterns
        .sort((a, b) => b.confidence * b.frequency - a.confidence * a.frequency)
        .slice(0, this.config.maxPatternsPerUser);
    }

    this.patterns.set(userId, userPatterns);
    
    // Save patterns
    await this.saveUserPatterns(userId, userPatterns);
  }

  /**
   * Helper methods
   */
  private getTimeOfDay(timestamp: number): SessionContext['timeOfDay'] {
    const hour = new Date(timestamp).getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  private getDayOfWeek(timestamp: number): SessionContext['dayOfWeek'] {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    return days[new Date(timestamp).getDay()];
  }

  private calculateFocusTime(actions: CodingAction[]): number {
    if (actions.length === 0) return 0;
    
    let focusTime = 0;
    let lastTimestamp = actions[0].timestamp;
    
    for (let i = 1; i < actions.length; i++) {
      const gap = actions[i].timestamp - lastTimestamp;
      
      // Consider gaps less than 5 minutes as focus time
      if (gap < 5 * 60 * 1000) {
        focusTime += gap;
      }
      
      lastTimestamp = actions[i].timestamp;
    }
    
    return focusTime;
  }

  private calculateOverallProductivity(metrics: ProductivityMetrics): number {
    // Weighted average of different productivity metrics
    return (
      metrics.linesPerHour * 0.2 +
      metrics.actionsPerHour * 0.15 +
      metrics.successRate * 0.25 +
      (1 - metrics.errorRate) * 0.2 +
      (metrics.focusTime / (metrics.focusTime + metrics.breakTime)) * 0.2
    );
  }

  private findActionSequences(actions: CodingAction[], sequenceLength: number): {
    pattern: string;
    frequency: number;
    examples: string[];
  }[] {
    const sequences = new Map<string, { count: number; examples: string[] }>();
    
    for (let i = 0; i <= actions.length - sequenceLength; i++) {
      const sequence = actions.slice(i, i + sequenceLength);
      const pattern = sequence.map(a => a.type).join(' -> ');
      
      if (!sequences.has(pattern)) {
        sequences.set(pattern, { count: 0, examples: [] });
      }
      
      const entry = sequences.get(pattern)!;
      entry.count++;
      
      if (entry.examples.length < 3) {
        entry.examples.push(sequence.map(a => a.prompt || a.code || '').join('; '));
      }
    }
    
    return Array.from(sequences.entries()).map(([pattern, data]) => ({
      pattern,
      frequency: data.count,
      examples: data.examples,
    }));
  }

  private detectIndentationStyle(codeActions: CodingAction[]): {
    type: 'spaces' | 'tabs';
    size: number;
    confidence: number;
    examples: string[];
  } | null {
    const codeBlocks = codeActions.map(a => a.code!).filter(Boolean);
    if (codeBlocks.length === 0) return null;

    let spacesCount = 0;
    let tabsCount = 0;
    const examples: string[] = [];

    codeBlocks.forEach(code => {
      const lines = code.split('\n');
      lines.forEach(line => {
        if (line.startsWith('  ')) spacesCount++;
        if (line.startsWith('\t')) tabsCount++;
        
        if (examples.length < 3 && (line.startsWith('  ') || line.startsWith('\t'))) {
          examples.push(line.substring(0, 50));
        }
      });
    });

    const total = spacesCount + tabsCount;
    if (total === 0) return null;

    const useSpaces = spacesCount > tabsCount;
    const confidence = Math.max(spacesCount, tabsCount) / total;

    return {
      type: useSpaces ? 'spaces' : 'tabs',
      size: useSpaces ? 2 : 1, // Default sizes
      confidence,
      examples,
    };
  }

  private detectNamingConvention(codeActions: CodingAction[]): {
    style: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case';
    confidence: number;
    examples: string[];
  } | null {
    const codeBlocks = codeActions.map(a => a.code!).filter(Boolean);
    if (codeBlocks.length === 0) return null;

    const patterns = {
      camelCase: /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g,
      snake_case: /\b[a-z][a-z0-9]*_[a-z0-9_]*\b/g,
      PascalCase: /\b[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g,
      'kebab-case': /\b[a-z][a-z0-9]*-[a-z0-9-]*\b/g,
    };

    const counts = { camelCase: 0, snake_case: 0, PascalCase: 0, 'kebab-case': 0 };
    const examples: Record<string, string[]> = { camelCase: [], snake_case: [], PascalCase: [], 'kebab-case': [] };

    codeBlocks.forEach(code => {
      Object.entries(patterns).forEach(([style, pattern]) => {
        const matches = code.match(pattern) || [];
        counts[style as keyof typeof counts] += matches.length;
        
        if (examples[style].length < 3) {
          examples[style].push(...matches.slice(0, 3 - examples[style].length));
        }
      });
    });

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (total === 0) return null;

    const dominantStyle = Object.entries(counts).reduce((max, [style, count]) => 
      count > max.count ? { style, count } : max, { style: 'camelCase', count: 0 });

    return {
      style: dominantStyle.style as any,
      confidence: dominantStyle.count / total,
      examples: examples[dominantStyle.style],
    };
  }

  private matchesContext(pattern: UserPattern, context: Partial<SessionContext>): boolean {
    // Simple context matching - could be enhanced with ML
    const patternContext = pattern.metadata;
    
    if (context.projectType && patternContext.projectType !== context.projectType) {
      return false;
    }
    
    if (context.timeOfDay && patternContext.timeOfDay !== context.timeOfDay) {
      return false;
    }
    
    return true;
  }

  private estimateActionTime(profile: UserProfile, actionType: string): number {
    // Estimate based on historical data
    const baseTime = 300000; // 5 minutes default
    
    switch (actionType) {
      case 'generation': return baseTime * 0.8;
      case 'edit': return baseTime * 0.5;
      case 'refactor': return baseTime * 1.5;
      case 'debug': return baseTime * 2;
      case 'test': return baseTime * 1.2;
      case 'documentation': return baseTime * 0.7;
      default: return baseTime;
    }
  }

  private generateSuggestions(profile: UserProfile, context: Partial<SessionContext>): string[] {
    const suggestions = [
      'Consider your most productive pattern from past sessions',
      'Take breaks to maintain focus',
    ];

    if (profile.productivityPeaks.length > 0) {
      const peakHour = profile.productivityPeaks[0].hour;
      suggestions.push(`You're most productive around ${peakHour}:00`);
    }

    if (profile.codingStyle.testingApproach === 'none') {
      suggestions.push('Consider adding tests to improve code quality');
    }

    return suggestions;
  }

  private generateProductivityImprovements(profile: UserProfile, sessions: CodingSession[]): string[] {
    const improvements: string[] = [];
    
    const avgErrorRate = statistics.mean(sessions.map(s => s.productivity.errorRate));
    if (avgErrorRate > 0.2) {
      improvements.push('Consider slowing down to reduce errors');
    }

    const avgFocusTime = statistics.mean(sessions.map(s => s.productivity.focusTime));
    if (avgFocusTime < 30) {
      improvements.push('Try to maintain longer periods of focused work');
    }

    if (profile.codingStyle.commentFrequency === 'low') {
      improvements.push('Adding more comments can improve code maintainability');
    }

    return improvements;
  }

  private calculateTrends(sessions: CodingSession[]): Array<{
    metric: string;
    trend: 'increasing' | 'decreasing' | 'stable';
    value: number;
  }> {
    if (sessions.length < 2) return [];

    const trends = [];
    const halfPoint = Math.floor(sessions.length / 2);
    const firstHalf = sessions.slice(0, halfPoint);
    const secondHalf = sessions.slice(halfPoint);

    // Productivity trend
    const firstHalfProductivity = statistics.mean(firstHalf.map(s => this.calculateOverallProductivity(s.productivity)));
    const secondHalfProductivity = statistics.mean(secondHalf.map(s => this.calculateOverallProductivity(s.productivity)));
    const productivityChange = (secondHalfProductivity - firstHalfProductivity) / firstHalfProductivity;

    trends.push({
      metric: 'productivity',
      trend: productivityChange > 0.05 ? 'increasing' : productivityChange < -0.05 ? 'decreasing' : 'stable',
      value: productivityChange,
    });

    return trends;
  }

  private calculateHourlyProductivity(session: CodingSession): Record<string, number> {
    const hourlyStats: Record<string, { actions: number; lines: number; duration: number }> = {};
    
    session.actions.forEach(action => {
      const hour = new Date(action.timestamp).getHours().toString();
      
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = { actions: 0, lines: 0, duration: 0 };
      }
      
      hourlyStats[hour].actions++;
      hourlyStats[hour].lines += action.lineCount;
      hourlyStats[hour].duration += action.duration;
    });

    const productivity: Record<string, number> = {};
    Object.entries(hourlyStats).forEach(([hour, stats]) => {
      const durationHours = stats.duration / (1000 * 60 * 60);
      productivity[hour] = durationHours > 0 ? stats.lines / durationHours : 0;
    });

    return productivity;
  }

  private calculateLearningAccuracy(): number {
    // Simplified accuracy calculation
    return 0.85; // Placeholder
  }

  private updateLanguagePreferences(profile: UserProfile, session: CodingSession): void {
    const language = session.language;
    const existing = profile.preferredLanguages.find(l => l.language === language);
    
    if (existing) {
      existing.frequency++;
    } else {
      profile.preferredLanguages.push({ language, frequency: 1 });
    }
    
    // Sort by frequency
    profile.preferredLanguages.sort((a, b) => b.frequency - a.frequency);
  }

  private updateFrameworkPreferences(profile: UserProfile, session: CodingSession): void {
    if (session.framework) {
      const existing = profile.preferredFrameworks.find(f => f.framework === session.framework);
      
      if (existing) {
        existing.frequency++;
      } else {
        profile.preferredFrameworks.push({ framework: session.framework, frequency: 1 });
      }
      
      // Sort by frequency
      profile.preferredFrameworks.sort((a, b) => b.frequency - a.frequency);
    }
  }

  private updateWorkingHours(profile: UserProfile, session: CodingSession): void {
    const startHour = new Date(session.startTime).getHours();
    
    if (!profile.workingHours.start || startHour < profile.workingHours.start) {
      profile.workingHours.start = startHour;
    }
    
    if (session.endTime) {
      const endHour = new Date(session.endTime).getHours();
      if (!profile.workingHours.end || endHour > profile.workingHours.end) {
        profile.workingHours.end = endHour;
      }
    }
  }

  private updateProductivityPeaks(profile: UserProfile, session: CodingSession): void {
    const hourlyProductivity = this.calculateHourlyProductivity(session);
    
    Object.entries(hourlyProductivity).forEach(([hour, productivity]) => {
      const hourNum = parseInt(hour);
      const existing = profile.productivityPeaks.find(p => p.hour === hourNum);
      
      if (existing) {
        existing.productivity = (existing.productivity + productivity) / 2;
      } else {
        profile.productivityPeaks.push({ hour: hourNum, productivity });
      }
    });
    
    // Sort by productivity
    profile.productivityPeaks.sort((a, b) => b.productivity - a.productivity);
    
    // Keep top 5 peak hours
    profile.productivityPeaks = profile.productivityPeaks.slice(0, 5);
  }

  private async updateCodingStyle(profile: UserProfile, session: CodingSession): Promise<void> {
    const codeActions = session.actions.filter(a => a.code && a.code.length > 0);
    
    if (codeActions.length === 0) return;

    const indentationStyle = this.detectIndentationStyle(codeActions);
    if (indentationStyle && indentationStyle.confidence > 0.7) {
      profile.codingStyle.indentationStyle = indentationStyle.type;
      profile.codingStyle.indentationSize = indentationStyle.size;
    }

    const namingConvention = this.detectNamingConvention(codeActions);
    if (namingConvention && namingConvention.confidence > 0.7) {
      profile.codingStyle.namingConvention = namingConvention.style;
    }
  }

  private updateSkillLevel(profile: UserProfile, session: CodingSession): void {
    const avgComplexity = session.productivity.averageComplexity;
    const successRate = session.productivity.successRate;
    const linesPerHour = session.productivity.linesPerHour;
    
    // Simple skill level calculation
    let skillScore = 0;
    
    if (avgComplexity > 7) skillScore += 2;
    else if (avgComplexity > 5) skillScore += 1;
    
    if (successRate > 0.9) skillScore += 2;
    else if (successRate > 0.7) skillScore += 1;
    
    if (linesPerHour > 100) skillScore += 2;
    else if (linesPerHour > 50) skillScore += 1;
    
    if (skillScore >= 5) {
      profile.skillLevel = 'expert';
    } else if (skillScore >= 3) {
      profile.skillLevel = 'advanced';
    } else if (skillScore >= 1) {
      profile.skillLevel = 'intermediate';
    } else {
      profile.skillLevel = 'beginner';
    }
  }

  private createDefaultProfile(userId: string): UserProfile {
    return {
      userId,
      created: Date.now(),
      lastActive: Date.now(),
      totalSessions: 0,
      totalActions: 0,
      totalCodeLines: 0,
      averageSessionDuration: 0,
      preferredLanguages: [],
      preferredFrameworks: [],
      workingHours: { start: 9, end: 17, timezone: 'UTC' },
      productivityPeaks: [],
      codingStyle: {
        indentationStyle: 'spaces',
        indentationSize: 2,
        namingConvention: 'camelCase',
        bracketStyle: 'same_line',
        lineLength: 80,
        commentFrequency: 'medium',
        documentationStyle: 'moderate',
        testingApproach: 'unit',
        errorHandling: 'defensive',
        performanceOriented: false,
        securityConscious: false,
      },
      patterns: [],
      preferences: {
        aiAssistanceLevel: 'moderate',
        explanationDetail: 'moderate',
        codeComments: true,
        autoFormatting: true,
        suggestionTiming: 'after_pause',
        preferredModels: [],
        costSensitivity: 'medium',
        qualityThreshold: 0.8,
      },
      skillLevel: 'intermediate',
      specializations: [],
    };
  }

  private startPeriodicAnalysis(): void {
    if (this.config.analysisFrequency > 0) {
      this.analysisTimer = setInterval(() => {
        this.performPeriodicAnalysis();
      }, this.config.analysisFrequency * 60 * 60 * 1000);
    }
  }

  private async performPeriodicAnalysis(): Promise<void> {
    this.logger.info('Performing periodic pattern analysis');
    
    // Analyze patterns for all users
    for (const userId of this.userProfiles.keys()) {
      try {
        await this.analyzeUserPatternsBackground(userId);
      } catch (error) {
        this.logger.error(`Failed to analyze patterns for user ${userId}:`, error);
      }
    }
  }

  private async analyzeUserPatternsBackground(userId: string): Promise<void> {
    // Background analysis of user patterns
    const patterns = this.patterns.get(userId) || [];
    
    // Remove expired patterns
    const cutoff = Date.now() - (this.config.patternDecayDays * 24 * 60 * 60 * 1000);
    const validPatterns = patterns.filter(p => p.lastSeen > cutoff);
    
    this.patterns.set(userId, validPatterns);
    
    // Cluster similar patterns
    await this.clusterUserPatterns(userId, validPatterns);
  }

  private async clusterUserPatterns(userId: string, patterns: UserPattern[]): Promise<void> {
    if (patterns.length < 5) return;

    // Simple clustering based on pattern similarity
    const clusters = new Map<string, UserPattern[]>();
    
    patterns.forEach(pattern => {
      const clusterKey = `${pattern.type}_${pattern.pattern.split('_')[0]}`;
      
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      
      clusters.get(clusterKey)!.push(pattern);
    });

    // Merge similar patterns in each cluster
    clusters.forEach((clusterPatterns, clusterKey) => {
      if (clusterPatterns.length > 1) {
        const merged = this.mergePatterns(clusterPatterns);
        
        // Replace original patterns with merged one
        const otherPatterns = patterns.filter(p => !clusterPatterns.includes(p));
        this.patterns.set(userId, [...otherPatterns, merged]);
      }
    });
  }

  private mergePatterns(patterns: UserPattern[]): UserPattern {
    const first = patterns[0];
    
    return {
      ...first,
      confidence: statistics.mean(patterns.map(p => p.confidence)),
      frequency: patterns.reduce((sum, p) => sum + p.frequency, 0),
      lastSeen: Math.max(...patterns.map(p => p.lastSeen)),
      examples: patterns.flatMap(p => p.examples).slice(0, 10),
    };
  }

  private async loadUserProfiles(): Promise<void> {
    try {
      // Load user profiles from disk
      const profilesDir = './user-profiles';
      const files = await fs.readdir(profilesDir).catch(() => []);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(profilesDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const profile: UserProfile = JSON.parse(content);
          this.userProfiles.set(profile.userId, profile);
        }
      }
      
      this.logger.info(`Loaded ${this.userProfiles.size} user profiles`);
    } catch (error) {
      this.logger.error('Failed to load user profiles:', error);
    }
  }

  private async saveUserProfile(profile: UserProfile): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const profilesDir = './user-profiles';
      await fs.mkdir(profilesDir, { recursive: true });
      
      const filePath = path.join(profilesDir, `${profile.userId}.json`);
      await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save user profile ${profile.userId}:`, error);
    }
  }

  private async saveUserPatterns(userId: string, patterns: UserPattern[]): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const patternsDir = './user-patterns';
      await fs.mkdir(patternsDir, { recursive: true });
      
      const filePath = path.join(patternsDir, `${userId}.json`);
      await fs.writeFile(filePath, JSON.stringify(patterns, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save user patterns ${userId}:`, error);
    }
  }

  private async saveSessionData(session: CodingSession): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const sessionsDir = './coding-sessions';
      await fs.mkdir(sessionsDir, { recursive: true });
      
      const date = new Date(session.startTime).toISOString().split('T')[0];
      const filePath = path.join(sessionsDir, `${date}.jsonl`);
      
      const sessionData = this.config.anonymizeData ? this.anonymizeSession(session) : session;
      const line = JSON.stringify(sessionData) + '\n';
      
      await fs.appendFile(filePath, line);
    } catch (error) {
      this.logger.error(`Failed to save session data ${session.id}:`, error);
    }
  }

  private anonymizeSession(session: CodingSession): Partial<CodingSession> {
    return {
      ...session,
      userId: 'anonymous',
      actions: session.actions.map(action => ({
        ...action,
        prompt: action.prompt ? '[REDACTED]' : undefined,
        code: action.code ? '[REDACTED]' : undefined,
      })),
    };
  }

  private async loadSessionsInTimeframe(userId: string, timeframe: { start: number; end: number }): Promise<CodingSession[]> {
    // This would load sessions from disk for the given timeframe
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
    
    this.removeAllListeners();
    this.activeSessions.clear();
    this.userProfiles.clear();
    this.patterns.clear();
  }
}