/**
 * Advanced Conflict Resolution System for Recoder.xyz
 * 
 * Handles complex merge conflicts in real-time collaborative environments
 * Uses AI-powered conflict resolution and operational transformation
 */

import { EventEmitter } from 'events';
import { StateSynchronizer, SyncConflict, StateChange } from './state-synchronizer';
import { AIOrchestrator } from '../ai/orchestrator';

export interface ConflictContext {
  conflictId: string;
  sessionId: string;
  userId: string;
  path: string; 
  conflictType: 'value' | 'structure' | 'code' | 'preference' | 'permission';
  severity: 'low' | 'medium' | 'high' | 'critical';
  localChange: StateChange;
  remoteChanges: StateChange[];
  baseValue: any; // Original value before any changes
  timestamp: Date;
  participants: {
    userId: string;
    sessionId: string;
    platform: string;
    lastActivity: Date;
  }[];
}

export interface ResolutionStrategy {
  name: string;
  description: string;
  applicableTypes: ConflictContext['conflictType'][];
  priority: number;
  requiresUserInput: boolean;
  autoApplicable: boolean;
  confidence: number; // 0-1 score of how confident this strategy is
}

export interface ResolutionResult {
  conflictId: string;
  strategy: string;
  resolvedValue: any;
  confidence: number;
  metadata: {
    appliedBy: 'system' | 'user' | 'ai';
    reasoning?: string;
    alternatives?: Array<{
      strategy: string;
      value: any;
      confidence: number;
    }>;
  };
  userFeedback?: {
    accepted: boolean;
    rating: number; // 1-5
    comments?: string;
  };
}

export interface OperationalTransform {
  id: string;
  operations: Operation[];
  baseVersion: number;
  targetVersion: number;
  sessionId: string;
}

export interface Operation {
  type: 'insert' | 'delete' | 'retain' | 'replace';
  position?: number;
  length?: number;
  content?: any;
  attributes?: Record<string, any>;
}

export class ConflictResolver extends EventEmitter {
  private static instance: ConflictResolver;
  private stateSynchronizer: StateSynchronizer;
  private aiOrchestrator: AIOrchestrator;
  private resolutionStrategies: Map<string, ResolutionStrategy> = new Map();
  private activeConflicts: Map<string, ConflictContext> = new Map();
  private resolutionHistory: Map<string, ResolutionResult[]> = new Map();
  private operationalTransforms: Map<string, OperationalTransform[]> = new Map();

  private constructor() {
    super();
    this.stateSynchronizer = StateSynchronizer.getInstance();
    this.initializeStrategies();
    this.setupEventListeners();
  }

  static getInstance(): ConflictResolver {
    if (!ConflictResolver.instance) {
      ConflictResolver.instance = new ConflictResolver();
    }
    return ConflictResolver.instance;
  }

  /**
   * Resolve a conflict using the best available strategy
   */
  async resolveConflict(conflict: SyncConflict): Promise<ResolutionResult> {
    const context = await this.buildConflictContext(conflict);
    this.activeConflicts.set(conflict.id, context);

    try {
      // Determine the best resolution strategy
      const strategy = await this.selectResolutionStrategy(context);
      
      // Apply the resolution strategy
      const result = await this.applyResolutionStrategy(context, strategy);
      
      // Store resolution history
      this.recordResolution(context.conflictId, result);

      // Clean up
      this.activeConflicts.delete(conflict.id);

      this.emit('conflict-resolved', { context, result });
      return result;

    } catch (error) {
      this.emit('conflict-resolution-failed', { context, error });
      throw error;
    }
  }

  /**
   * Handle multiple related conflicts in batch
   */
  async resolveBatchConflicts(conflicts: SyncConflict[]): Promise<ResolutionResult[]> {
    const results: ResolutionResult[] = [];
    
    // Group related conflicts
    const conflictGroups = this.groupRelatedConflicts(conflicts);
    
    for (const group of conflictGroups) {
      if (group.length === 1) {
        // Single conflict - resolve normally
        const result = await this.resolveConflict(group[0]);
        results.push(result);
      } else {
        // Multiple related conflicts - resolve as batch
        const batchResult = await this.resolveBatchGroup(group);
        results.push(...batchResult);
      }
    }

    return results;
  }

  /**
   * Apply operational transformation to resolve text/code conflicts
   */
  async applyOperationalTransform(
    sessionId: string,
    localOps: Operation[],
    remoteOps: Operation[],
    baseContent: string
  ): Promise<string> {
    // Transform operations to resolve conflicts
    const transformedLocalOps = this.transformOperations(localOps, remoteOps);
    const transformedRemoteOps = this.transformOperations(remoteOps, localOps);

    // Apply operations in correct order
    let result = baseContent;
    result = this.applyOperations(result, transformedRemoteOps);
    result = this.applyOperations(result, transformedLocalOps);

    // Store transformation for audit
    const transform: OperationalTransform = {
      id: this.generateTransformId(),
      operations: [...transformedRemoteOps, ...transformedLocalOps],
      baseVersion: 0, // Would track actual version
      targetVersion: 1,
      sessionId
    };

    if (!this.operationalTransforms.has(sessionId)) {
      this.operationalTransforms.set(sessionId, []);
    }
    this.operationalTransforms.get(sessionId)!.push(transform);

    return result;
  }

  /**
   * Use AI to intelligently resolve complex conflicts
   */
  async resolveWithAI(context: ConflictContext): Promise<any> {
    if (!this.aiOrchestrator) {
      // Initialize AI orchestrator if not already done
      this.aiOrchestrator = AIOrchestrator.getInstance();
    }

    const prompt = this.buildAIResolutionPrompt(context);
    
    const aiRequest = {
      prompt,
      task: {
        type: 'analysis' as const,
        complexity: 'complex' as const,
        language: 'typescript'
      },
      user: { id: context.userId, tier: 'pro' as const },
      options: { priority: 'quality' as const }
    };

    try {
      const result = await this.aiOrchestrator.generateCode(aiRequest);
      return this.parseAIResolution(result.content, context);
    } catch (error) {
      console.error('AI-powered conflict resolution failed:', error);
      throw new Error('AI resolution failed');
    }
  }

  /**
   * Build conflict context from sync conflict
   */
  private async buildConflictContext(conflict: SyncConflict): Promise<ConflictContext> {
    // Determine conflict type based on path and values
    const conflictType = this.determineConflictType(conflict.path, conflict.localValue, conflict.remoteValue);
    
    // Determine severity
    const severity = this.calculateConflictSeverity(conflictType, conflict);

    // Get base value (would fetch from version history)
    const baseValue = await this.getBaseValue(conflict.sessionId, conflict.path);

    // Create mock state changes (in real implementation, these would be tracked)
    const localChange: StateChange = {
      id: 'local-change',
      sessionId: conflict.sessionId,
      timestamp: conflict.timestamp,
      path: conflict.path,
      oldValue: baseValue,
      newValue: conflict.localValue,
      operation: 'set',
      metadata: {
        userId: 'local-user',
        platform: 'current',
        deviceId: 'current-device',
        version: 1
      }
    };

    const remoteChange: StateChange = {
      id: 'remote-change',
      sessionId: conflict.sessionId,
      timestamp: conflict.timestamp,
      path: conflict.path,
      oldValue: baseValue,
      newValue: conflict.remoteValue,
      operation: 'set',
      metadata: {
        userId: 'remote-user',
        platform: 'remote',
        deviceId: 'remote-device',
        version: 1
      }
    };

    return {
      conflictId: conflict.id,
      sessionId: conflict.sessionId,
      userId: 'current-user', // Would get from session
      path: conflict.path,
      conflictType,
      severity,
      localChange,
      remoteChanges: [remoteChange],
      baseValue,
      timestamp: conflict.timestamp,
      participants: [
        {
          userId: 'local-user',
          sessionId: conflict.sessionId,
          platform: 'current',
          lastActivity: new Date()
        },
        {
          userId: 'remote-user',
          sessionId: 'remote-session',
          platform: 'remote',
          lastActivity: new Date()
        }
      ]
    };
  }

  /**
   * Select the best resolution strategy for a conflict
   */
  private async selectResolutionStrategy(context: ConflictContext): Promise<ResolutionStrategy> {
    const applicableStrategies = Array.from(this.resolutionStrategies.values())
      .filter(strategy => strategy.applicableTypes.includes(context.conflictType))
      .sort((a, b) => b.priority - a.priority);

    if (applicableStrategies.length === 0) {
      throw new Error(`No applicable resolution strategy for conflict type: ${context.conflictType}`);
    }

    // For high-severity conflicts, prefer manual resolution
    if (context.severity === 'critical' || context.severity === 'high') {
      const manualStrategy = applicableStrategies.find(s => s.requiresUserInput);
      if (manualStrategy) {
        return manualStrategy;
      }
    }

    // For code conflicts, prefer AI-powered resolution
    if (context.conflictType === 'code') {
      const aiStrategy = applicableStrategies.find(s => s.name === 'ai-merge');
      if (aiStrategy) {
        return aiStrategy;
      }
    }

    // Return highest priority applicable strategy
    return applicableStrategies[0];
  }

  /**
   * Apply a resolution strategy to resolve the conflict
   */
  private async applyResolutionStrategy(
    context: ConflictContext, 
    strategy: ResolutionStrategy
  ): Promise<ResolutionResult> {
    let resolvedValue: any;
    let confidence = strategy.confidence;
    let reasoning = '';

    switch (strategy.name) {
      case 'last-writer-wins':
        resolvedValue = context.remoteChanges[context.remoteChanges.length - 1].newValue;
        reasoning = 'Applied last writer wins strategy - using most recent change';
        break;

      case 'user-preference':
        resolvedValue = context.localChange.newValue;
        reasoning = 'Preferred local user changes to maintain workflow continuity';
        break;

      case 'smart-merge':
        resolvedValue = await this.performSmartMerge(context);
        reasoning = 'Intelligently merged conflicting values based on content analysis';
        break;

      case 'ai-merge':
        resolvedValue = await this.resolveWithAI(context);
        reasoning = 'AI-powered resolution based on code analysis and best practices';
        confidence = 0.85; // AI confidence
        break;

      case 'manual-resolution':
        // Emit event for user to resolve manually
        this.emit('manual-resolution-required', context);
        throw new Error('Manual resolution required');

      case 'operational-transform':
        if (typeof context.localChange.newValue === 'string' && 
            typeof context.remoteChanges[0].newValue === 'string') {
          resolvedValue = await this.applyOperationalTransform(
            context.sessionId,
            this.parseOperations(context.localChange.newValue, context.baseValue),
            this.parseOperations(context.remoteChanges[0].newValue, context.baseValue),
            context.baseValue
          );
          reasoning = 'Applied operational transformation to merge text changes';
        } else {
          throw new Error('Operational transform only applicable to text content');
        }
        break;

      default:
        throw new Error(`Unknown resolution strategy: ${strategy.name}`);
    }

    return {
      conflictId: context.conflictId,
      strategy: strategy.name,
      resolvedValue,
      confidence,
      metadata: {
        appliedBy: strategy.requiresUserInput ? 'user' : 'system',
        reasoning,
        alternatives: await this.generateAlternatives(context, strategy)
      }
    };
  }

  /**
   * Perform smart merge of conflicting values
   */
  private async performSmartMerge(context: ConflictContext): Promise<any> {
    const { localValue, remoteValue } = {
      localValue: context.localChange.newValue,
      remoteValue: context.remoteChanges[0].newValue
    };

    // Handle different data types
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      // Merge arrays - combine unique elements
      return [...new Set([...localValue, ...remoteValue])];
    }

    if (typeof localValue === 'object' && typeof remoteValue === 'object' && 
        localValue !== null && remoteValue !== null) {
      // Deep merge objects
      return this.deepMerge(localValue, remoteValue);
    }

    if (typeof localValue === 'string' && typeof remoteValue === 'string') {
      // For code or text, try to merge intelligently
      if (this.isCodeContent(localValue) || this.isCodeContent(remoteValue)) {
        return this.mergeCodeContent(localValue, remoteValue, context.baseValue);
      } else {
        // For regular text, concatenate with separator
        return `${localValue}\n${remoteValue}`;
      }
    }

    // For primitives, prefer local value (user's current work)
    return localValue;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(obj1: any, obj2: any): any {
    const result = { ...obj1 };
    
    for (const key in obj2) {
      if (obj2.hasOwnProperty(key)) {
        if (typeof obj2[key] === 'object' && obj2[key] !== null && 
            typeof result[key] === 'object' && result[key] !== null) {
          result[key] = this.deepMerge(result[key], obj2[key]);
        } else {
          result[key] = obj2[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Check if content is code
   */
  private isCodeContent(content: string): boolean {
    const codeIndicators = [
      'function', 'class', 'import', 'export', 'const', 'let', 'var',
      '{', '}', ';', '//', '/*', '*/', '=>', 'async', 'await'
    ];
    
    return codeIndicators.some(indicator => content.includes(indicator));
  }

  /**
   * Merge code content using diff-based approach
   */
  private async mergeCodeContent(local: string, remote: string, base: string): Promise<string> {
    // This would use a more sophisticated diff-merge algorithm
    // For now, we'll do a simple line-based merge
    
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');
    const baseLines = base.split('\n');
    
    const merged: string[] = [];
    const maxLines = Math.max(localLines.length, remoteLines.length, baseLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const localLine = localLines[i] || '';
      const remoteLine = remoteLines[i] || '';
      const baseLine = baseLines[i] || '';
      
      if (localLine === remoteLine) {
        merged.push(localLine);
      } else if (localLine === baseLine) {
        merged.push(remoteLine); // Remote changed, use remote
      } else if (remoteLine === baseLine) {
        merged.push(localLine); // Local changed, use local
      } else {
        // Both changed - add both with conflict markers
        merged.push('<<<<<<< LOCAL');
        merged.push(localLine);
        merged.push('=======');
        merged.push(remoteLine);
        merged.push('>>>>>>> REMOTE');
      }
    }
    
    return merged.join('\n');
  }

  /**
   * Initialize resolution strategies
   */
  private initializeStrategies(): void {
    const strategies: ResolutionStrategy[] = [
      {
        name: 'last-writer-wins',
        description: 'Use the most recent change',
        applicableTypes: ['value', 'preference'],
        priority: 1,
        requiresUserInput: false,
        autoApplicable: true,
        confidence: 0.7
      },
      {
        name: 'user-preference',
        description: 'Prefer local user changes',
        applicableTypes: ['preference', 'value'],
        priority: 2,
        requiresUserInput: false,
        autoApplicable: true,
        confidence: 0.8
      },
      {
        name: 'smart-merge',
        description: 'Intelligently merge compatible changes',
        applicableTypes: ['value', 'structure'],
        priority: 3,
        requiresUserInput: false,
        autoApplicable: true,
        confidence: 0.75
      },
      {
        name: 'ai-merge',
        description: 'AI-powered conflict resolution',
        applicableTypes: ['code', 'structure'],
        priority: 4,
        requiresUserInput: false,
        autoApplicable: true,
        confidence: 0.85
      },
      {
        name: 'operational-transform',
        description: 'Use operational transformation for text',
        applicableTypes: ['code'],
        priority: 5,
        requiresUserInput: false,
        autoApplicable: true,
        confidence: 0.9
      },
      {
        name: 'manual-resolution',
        description: 'Require user intervention',
        applicableTypes: ['permission', 'code', 'structure', 'value', 'preference'],
        priority: 10,
        requiresUserInput: true,
        autoApplicable: false,
        confidence: 1.0
      }
    ];

    strategies.forEach(strategy => {
      this.resolutionStrategies.set(strategy.name, strategy);
    });
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.stateSynchronizer.on('conflict-detected', async (conflict: SyncConflict) => {
      try {
        await this.resolveConflict(conflict);
      } catch (error) {
        console.error('Auto-resolution failed:', error);
        this.emit('auto-resolution-failed', { conflict, error });
      }
    });
  }

  // Utility methods and helpers...

  private determineConflictType(path: string, localValue: any, remoteValue: any): ConflictContext['conflictType'] {
    if (path.includes('preferences')) return 'preference';
    if (path.includes('permissions')) return 'permission';
    if (typeof localValue === 'string' && this.isCodeContent(localValue)) return 'code';
    if (typeof localValue === 'object') return 'structure';
    return 'value';
  }

  private calculateConflictSeverity(type: ConflictContext['conflictType'], conflict: SyncConflict): ConflictContext['severity'] {
    if (type === 'permission') return 'critical';
    if (type === 'code') return 'high';
    if (type === 'structure') return 'medium';
    return 'low';
  }

  private async getBaseValue(sessionId: string, path: string): Promise<any> {
    // Would fetch from version history - for now return null
    return null;
  }

  private groupRelatedConflicts(conflicts: SyncConflict[]): SyncConflict[][] {
    // Group conflicts by path prefix
    const groups = new Map<string, SyncConflict[]>();
    for (const conflict of conflicts) {
      const pathPrefix = conflict.path.split('.')[0];
      if (!groups.has(pathPrefix)) {
        groups.set(pathPrefix, []);
      }
      groups.get(pathPrefix)!.push(conflict);
    }
    return Array.from(groups.values());
  }

  private async resolveBatchGroup(conflicts: SyncConflict[]): Promise<ResolutionResult[]> {
    // For now, resolve each conflict individually
    // In a more advanced implementation, we'd resolve them as a cohesive batch
    const results: ResolutionResult[] = [];
    for (const conflict of conflicts) {
      const result = await this.resolveConflict(conflict);
      results.push(result);
    }
    return results;
  }

  private transformOperations(localOps: Operation[], remoteOps: Operation[]): Operation[] {
    // Simplified operational transformation
    // In a real implementation, this would be much more sophisticated
    return localOps; // Placeholder
  }

  private applyOperations(content: string, operations: Operation[]): string {
    let result = content;
    // Apply operations in order
    for (const op of operations) {
      // Simplified operation application
      // Real implementation would handle all operation types properly
    }
    return result;
  }

  private parseOperations(newContent: string, baseContent: string): Operation[] {
    // Generate operations from diff
    // Placeholder implementation
    return [{
      type: 'replace',
      position: 0,
      length: baseContent.length,
      content: newContent
    }];
  }

  private buildAIResolutionPrompt(context: ConflictContext): string {
    return `You are an expert code conflict resolver. Please analyze this conflict and provide the best resolution:

Conflict Type: ${context.conflictType}
Severity: ${context.severity}
Path: ${context.path}

Local Change:
${JSON.stringify(context.localChange.newValue, null, 2)}

Remote Change:
${JSON.stringify(context.remoteChanges[0].newValue, null, 2)}

Base Value:
${JSON.stringify(context.baseValue, null, 2)}

Please provide:
1. The resolved value that best combines both changes
2. Reasoning for your resolution
3. Any potential issues with the resolution

Respond in JSON format with: { "resolvedValue": ..., "reasoning": "...", "confidence": 0.9 }`;
  }

  private parseAIResolution(aiResponse: string, context: ConflictContext): any {
    try {
      const parsed = JSON.parse(aiResponse);
      return parsed.resolvedValue;
    } catch (error) {
      console.warn('Failed to parse AI resolution, falling back to smart merge');
      return this.performSmartMerge(context);
    }
  }

  private async generateAlternatives(context: ConflictContext, appliedStrategy: ResolutionStrategy): Promise<Array<{strategy: string; value: any; confidence: number}>> {
    const alternatives: Array<{strategy: string; value: any; confidence: number}> = [];
    
    // Always provide the option to use either original value
    alternatives.push({
      strategy: 'use-local',
      value: context.localChange.newValue,
      confidence: 0.6
    });
    
    alternatives.push({
      strategy: 'use-remote',
      value: context.remoteChanges[0].newValue,
      confidence: 0.6
    });
    
    return alternatives;
  }

  private recordResolution(conflictId: string, result: ResolutionResult): void {
    if (!this.resolutionHistory.has(conflictId)) {
      this.resolutionHistory.set(conflictId, []);
    }
    this.resolutionHistory.get(conflictId)!.push(result);
  }

  private generateTransformId(): string {
    return `transform-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ConflictResolver;