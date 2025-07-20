/**
 * Context Memory System
 * Project-aware AI with persistent memory and contextual understanding
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '@recoder/shared';
import { v4 as uuidv4 } from 'uuid';
import LRU from 'lru-cache';
import * as compromise from 'compromise';

export interface ProjectContext {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'desktop' | 'api' | 'library' | 'cli' | 'unknown';
  language: string;
  framework?: string;
  version?: string;
  description?: string;
  technologies: Technology[];
  architecture: ProjectArchitecture;
  codebase: CodebaseAnalysis;
  dependencies: Dependency[];
  team: TeamInfo;
  goals: ProjectGoal[];
  constraints: ProjectConstraint[];
  conventions: CodingConvention[];
  created: number;
  lastUpdated: number;
  lastAccessed: number;
}

export interface Technology {
  name: string;
  type: 'language' | 'framework' | 'library' | 'tool' | 'service' | 'database';
  version?: string;
  purpose: string;
  confidence: number; // 0-1
  usage: 'primary' | 'secondary' | 'development' | 'testing';
}

export interface ProjectArchitecture {
  pattern: 'mvc' | 'mvvm' | 'microservices' | 'monolith' | 'jamstack' | 'serverless' | 'unknown';
  layers: ArchitectureLayer[];
  dataFlow: 'unidirectional' | 'bidirectional' | 'event-driven' | 'mixed';
  scalingStrategy: 'horizontal' | 'vertical' | 'auto' | 'manual';
  deploymentPattern: 'traditional' | 'containerized' | 'serverless' | 'hybrid';
}

export interface ArchitectureLayer {
  name: string;
  type: 'presentation' | 'business' | 'data' | 'infrastructure' | 'security';
  technologies: string[];
  responsibilities: string[];
  interfaces: string[];
}

export interface CodebaseAnalysis {
  totalFiles: number;
  totalLines: number;
  languages: { language: string; lines: number; percentage: number }[];
  structure: DirectoryStructure;
  complexity: ComplexityMetrics;
  quality: QualityMetrics;
  patterns: CodePattern[];
  hotspots: CodeHotspot[];
  lastAnalyzed: number;
}

export interface DirectoryStructure {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: DirectoryStructure[];
  purpose?: string;
}

export interface ComplexityMetrics {
  average: number;
  maximum: number;
  distribution: { range: string; count: number }[];
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
}

export interface QualityMetrics {
  testCoverage: number;
  duplication: number;
  techDebt: number;
  bugs: number;
  vulnerabilities: number;
  codeSmells: number;
  maintainabilityRating: 'A' | 'B' | 'C' | 'D' | 'E';
}

export interface CodePattern {
  name: string;
  type: 'design_pattern' | 'anti_pattern' | 'idiom' | 'convention';
  occurrences: number;
  files: string[];
  confidence: number;
  description: string;
}

export interface CodeHotspot {
  file: string;
  line: number;
  type: 'complexity' | 'churn' | 'coupling' | 'size' | 'bug_prone';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion: string;
}

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  source: 'npm' | 'yarn' | 'pip' | 'gem' | 'maven' | 'nuget' | 'other';
  license?: string;
  vulnerabilities: number;
  lastUpdated?: number;
  updateAvailable?: string;
}

export interface TeamInfo {
  size: number;
  roles: TeamRole[];
  experience: 'junior' | 'mixed' | 'senior';
  timezone: string;
  workingHours: { start: number; end: number };
  communicationStyle: 'async' | 'sync' | 'mixed';
}

export interface TeamRole {
  role: 'developer' | 'architect' | 'designer' | 'pm' | 'qa' | 'devops';
  count: number;
  seniority: 'junior' | 'mid' | 'senior' | 'lead';
}

export interface ProjectGoal {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  deadline?: number;
  metrics: string[];
}

export interface ProjectConstraint {
  id: string;
  type: 'performance' | 'security' | 'budget' | 'time' | 'technology' | 'compliance';
  description: string;
  impact: 'low' | 'medium' | 'high';
  workaround?: string;
}

export interface CodingConvention {
  type: 'naming' | 'formatting' | 'structure' | 'documentation' | 'testing';
  rule: string;
  description: string;
  examples: string[];
  enforcement: 'mandatory' | 'recommended' | 'optional';
}

export interface ContextMemory {
  id: string;
  projectId: string;
  type: 'conversation' | 'decision' | 'pattern' | 'lesson' | 'mistake';
  title: string;
  content: string;
  tags: string[];
  importance: 'low' | 'medium' | 'high' | 'critical';
  context: MemoryContext;
  associations: string[]; // IDs of related memories
  created: number;
  lastAccessed: number;
  accessCount: number;
  confidence: number; // 0-1
  source: 'user' | 'ai' | 'system' | 'analysis';
}

export interface MemoryContext {
  files: string[];
  functions: string[];
  concepts: string[];
  technologies: string[];
  people: string[];
  timeframe: { start?: number; end?: number };
  scope: 'local' | 'module' | 'project' | 'global';
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  projectId: string;
  thread: ConversationMessage[];
  summary: string;
  topics: ConversationTopic[];
  decisions: ConversationDecision[];
  actions: ConversationAction[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  startTime: number;
  lastUpdate: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata: {
    model?: string;
    tokens?: { input: number; output: number };
    confidence?: number;
    intent?: string;
    entities?: ExtractedEntity[];
  };
}

export interface ConversationTopic {
  name: string;
  relevance: number; // 0-1
  mentions: number;
  firstMentioned: number;
  lastMentioned: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ConversationDecision {
  id: string;
  description: string;
  rationale: string;
  alternatives: string[];
  impact: 'low' | 'medium' | 'high';
  reversible: boolean;
  timestamp: number;
}

export interface ConversationAction {
  id: string;
  type: 'code_generation' | 'refactoring' | 'debugging' | 'explanation' | 'research';
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  files: string[];
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface ExtractedEntity {
  text: string;
  type: 'technology' | 'file' | 'function' | 'concept' | 'person' | 'organization' | 'date';
  confidence: number;
  start: number;
  end: number;
}

export interface ContextMemoryConfig {
  enabled: boolean;
  maxMemoriesPerProject: number;
  memoryRetentionDays: number;
  autoSaveInterval: number; // minutes
  compressionEnabled: boolean;
  semanticSearchEnabled: boolean;
  privacyMode: boolean;
  encryptMemories: boolean;
  cacheSize: number;
  analysisDepth: 'shallow' | 'medium' | 'deep';
}

export class ContextMemory extends EventEmitter {
  private readonly logger = new Logger('ContextMemory');
  private readonly config: ContextMemoryConfig;
  private readonly projectContexts = new Map<string, ProjectContext>();
  private readonly memories = new Map<string, ContextMemory[]>();
  private readonly conversations = new Map<string, ConversationContext>();
  private readonly memoryCache = new LRU<string, ContextMemory>({ max: 1000 });
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(config?: Partial<ContextMemoryConfig>) {
    super();
    
    this.config = {
      enabled: true,
      maxMemoriesPerProject: 1000,
      memoryRetentionDays: 90,
      autoSaveInterval: 5, // 5 minutes
      compressionEnabled: true,
      semanticSearchEnabled: true,
      privacyMode: false,
      encryptMemories: false,
      cacheSize: 1000,
      analysisDepth: 'medium',
      ...config,
    };

    this.startAutoSave();
    this.loadProjectContexts();
  }

  /**
   * Initialize or update project context
   */
  async initializeProject(projectPath: string, metadata?: Partial<ProjectContext>): Promise<string> {
    const projectId = this.generateProjectId(projectPath);
    
    let context = this.projectContexts.get(projectId);
    if (!context) {
      context = await this.createProjectContext(projectId, projectPath, metadata);
    } else {
      context = await this.updateProjectContext(context, projectPath, metadata);
    }

    this.projectContexts.set(projectId, context);
    await this.saveProjectContext(context);

    this.logger.info(`Initialized project context: ${context.name} (${projectId})`);
    this.emit('projectInitialized', context);

    return projectId;
  }

  /**
   * Get project context
   */
  async getProjectContext(projectId: string): Promise<ProjectContext | null> {
    const context = this.projectContexts.get(projectId);
    if (context) {
      context.lastAccessed = Date.now();
    }
    return context || null;
  }

  /**
   * Analyze project codebase
   */
  async analyzeCodebase(projectId: string, projectPath: string): Promise<CodebaseAnalysis> {
    this.logger.info(`Analyzing codebase for project ${projectId}`);
    
    const analysis: CodebaseAnalysis = {
      totalFiles: 0,
      totalLines: 0,
      languages: [],
      structure: { name: '', type: 'directory', path: projectPath },
      complexity: {
        average: 0,
        maximum: 0,
        distribution: [],
        cyclomaticComplexity: 0,
        cognitiveComplexity: 0,
        maintainabilityIndex: 0,
      },
      quality: {
        testCoverage: 0,
        duplication: 0,
        techDebt: 0,
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 0,
        maintainabilityRating: 'C',
      },
      patterns: [],
      hotspots: [],
      lastAnalyzed: Date.now(),
    };

    try {
      // Analyze directory structure
      analysis.structure = await this.analyzeDirectoryStructure(projectPath);
      
      // Count files and lines
      const fileStats = await this.countFilesAndLines(projectPath);
      analysis.totalFiles = fileStats.totalFiles;
      analysis.totalLines = fileStats.totalLines;
      analysis.languages = fileStats.languages;

      // Analyze code patterns
      analysis.patterns = await this.analyzeCodePatterns(projectPath);

      // Detect hotspots
      analysis.hotspots = await this.detectCodeHotspots(projectPath);

      // Calculate complexity metrics
      analysis.complexity = await this.calculateComplexityMetrics(projectPath);

      // Assess quality metrics
      analysis.quality = await this.assessQualityMetrics(projectPath);

      // Update project context
      const context = this.projectContexts.get(projectId);
      if (context) {
        context.codebase = analysis;
        context.lastUpdated = Date.now();
        await this.saveProjectContext(context);
      }

      this.emit('codebaseAnalyzed', { projectId, analysis });
      
    } catch (error) {
      this.logger.error(`Failed to analyze codebase for ${projectId}:`, error);
    }

    return analysis;
  }

  /**
   * Store memory
   */
  async storeMemory(memory: Omit<ContextMemory, 'id' | 'created' | 'lastAccessed' | 'accessCount'>): Promise<string> {
    const memoryId = uuidv4();
    const fullMemory: ContextMemory = {
      id: memoryId,
      created: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      ...memory,
    };

    // Add to project memories
    const projectMemories = this.memories.get(memory.projectId) || [];
    projectMemories.push(fullMemory);

    // Limit memories per project
    if (projectMemories.length > this.config.maxMemoriesPerProject) {
      const sorted = projectMemories.sort((a, b) => {
        // Sort by importance, then by access frequency, then by recency
        const importanceWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const aScore = importanceWeight[a.importance] * 0.4 + a.accessCount * 0.3 + (a.lastAccessed / Date.now()) * 0.3;
        const bScore = importanceWeight[b.importance] * 0.4 + b.accessCount * 0.3 + (b.lastAccessed / Date.now()) * 0.3;
        return bScore - aScore;
      });
      
      this.memories.set(memory.projectId, sorted.slice(0, this.config.maxMemoriesPerProject));
    } else {
      this.memories.set(memory.projectId, projectMemories);
    }

    // Cache the memory
    this.memoryCache.set(memoryId, fullMemory);

    // Build associations
    await this.buildMemoryAssociations(fullMemory);

    this.emit('memoryStored', fullMemory);
    return memoryId;
  }

  /**
   * Retrieve memories
   */
  async retrieveMemories(
    projectId: string,
    query?: string,
    options?: {
      type?: ContextMemory['type'];
      importance?: ContextMemory['importance'];
      limit?: number;
      tags?: string[];
    }
  ): Promise<ContextMemory[]> {
    let memories = this.memories.get(projectId) || [];

    // Filter by type
    if (options?.type) {
      memories = memories.filter(m => m.type === options.type);
    }

    // Filter by importance
    if (options?.importance) {
      memories = memories.filter(m => m.importance === options.importance);
    }

    // Filter by tags
    if (options?.tags && options.tags.length > 0) {
      memories = memories.filter(m => 
        options.tags!.some(tag => m.tags.includes(tag))
      );
    }

    // Search by query
    if (query) {
      memories = await this.searchMemories(memories, query);
    }

    // Sort by relevance and importance
    memories.sort((a, b) => {
      const importanceWeight = { critical: 4, high: 3, medium: 2, low: 1 };
      const aScore = importanceWeight[a.importance] * 0.6 + a.confidence * 0.4;
      const bScore = importanceWeight[b.importance] * 0.6 + b.confidence * 0.4;
      return bScore - aScore;
    });

    // Limit results
    if (options?.limit) {
      memories = memories.slice(0, options.limit);
    }

    // Update access tracking
    memories.forEach(memory => {
      memory.lastAccessed = Date.now();
      memory.accessCount++;
    });

    return memories;
  }

  /**
   * Start conversation context
   */
  async startConversation(sessionId: string, userId: string, projectId: string): Promise<ConversationContext> {
    const context: ConversationContext = {
      sessionId,
      userId,
      projectId,
      thread: [],
      summary: '',
      topics: [],
      decisions: [],
      actions: [],
      sentiment: 'neutral',
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };

    this.conversations.set(sessionId, context);
    
    // Load relevant context from memory
    const relevantMemories = await this.retrieveMemories(projectId, '', {
      importance: 'high',
      limit: 10,
    });

    if (relevantMemories.length > 0) {
      const contextSummary = this.summarizeMemories(relevantMemories);
      await this.addMessage(sessionId, 'system', `Relevant context: ${contextSummary}`);
    }

    this.emit('conversationStarted', context);
    return context;
  }

  /**
   * Add message to conversation
   */
  async addMessage(sessionId: string, role: ConversationMessage['role'], content: string, metadata?: ConversationMessage['metadata']): Promise<void> {
    const context = this.conversations.get(sessionId);
    if (!context) {
      throw new Error(`Conversation ${sessionId} not found`);
    }

    const message: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      metadata: metadata || {},
    };

    context.thread.push(message);
    context.lastUpdate = Date.now();

    // Extract entities and topics from user messages
    if (role === 'user') {
      const entities = await this.extractEntities(content);
      message.metadata.entities = entities;

      await this.updateConversationTopics(context, content);
      await this.detectConversationIntent(context, message);
    }

    // Update conversation summary periodically
    if (context.thread.length % 10 === 0) {
      await this.updateConversationSummary(context);
    }

    this.emit('messageAdded', { context, message });
  }

  /**
   * End conversation and save context
   */
  async endConversation(sessionId: string): Promise<void> {
    const context = this.conversations.get(sessionId);
    if (!context) {
      return;
    }

    // Update final summary
    await this.updateConversationSummary(context);

    // Extract key insights and decisions
    await this.extractConversationInsights(context);

    // Store important memories from conversation
    await this.storeConversationMemories(context);

    // Save conversation
    await this.saveConversation(context);

    // Remove from active conversations
    this.conversations.delete(sessionId);

    this.emit('conversationEnded', context);
  }

  /**
   * Get conversation context
   */
  getConversationContext(sessionId: string): ConversationContext | null {
    return this.conversations.get(sessionId) || null;
  }

  /**
   * Search across all memories and context
   */
  async search(projectId: string, query: string, options?: {
    includeCode?: boolean;
    includeMemories?: boolean;
    includeConversations?: boolean;
    limit?: number;
  }): Promise<{
    memories: ContextMemory[];
    codeMatches: { file: string; line: number; content: string; score: number }[];
    conversations: ConversationContext[];
  }> {
    const results = {
      memories: [] as ContextMemory[],
      codeMatches: [] as { file: string; line: number; content: string; score: number }[],
      conversations: [] as ConversationContext[],
    };

    // Search memories
    if (options?.includeMemories !== false) {
      results.memories = await this.retrieveMemories(projectId, query, {
        limit: options?.limit || 20,
      });
    }

    // Search code (if enabled)
    if (options?.includeCode) {
      results.codeMatches = await this.searchCode(projectId, query);
    }

    // Search conversations
    if (options?.includeConversations) {
      results.conversations = await this.searchConversations(projectId, query);
    }

    return results;
  }

  /**
   * Get contextual recommendations
   */
  async getContextualRecommendations(projectId: string, currentFile?: string, currentFunction?: string): Promise<{
    relatedMemories: ContextMemory[];
    suggestedActions: string[];
    relevantPatterns: CodePattern[];
    potentialIssues: string[];
  }> {
    const context = await this.getProjectContext(projectId);
    if (!context) {
      throw new Error(`Project context not found: ${projectId}`);
    }

    // Get related memories
    const relatedMemories = await this.retrieveMemories(projectId, '', {
      limit: 10,
    });

    // Filter by current context
    let contextualMemories = relatedMemories;
    if (currentFile) {
      contextualMemories = relatedMemories.filter(m => 
        m.context.files.includes(currentFile) ||
        m.content.includes(path.basename(currentFile))
      );
    }

    // Get relevant patterns
    const relevantPatterns = context.codebase.patterns.filter(p => {
      if (currentFile) {
        return p.files.includes(currentFile);
      }
      return p.confidence > 0.7;
    });

    // Generate suggestions
    const suggestedActions = this.generateContextualSuggestions(context, currentFile, currentFunction);

    // Identify potential issues
    const potentialIssues = this.identifyPotentialIssues(context, currentFile);

    return {
      relatedMemories: contextualMemories,
      suggestedActions,
      relevantPatterns,
      potentialIssues,
    };
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    totalProjects: number;
    totalMemories: number;
    totalConversations: number;
    memoryTypes: Record<string, number>;
    averageMemoriesPerProject: number;
    oldestMemory: number;
    newestMemory: number;
  } {
    const totalProjects = this.projectContexts.size;
    const allMemories = Array.from(this.memories.values()).flat();
    const totalMemories = allMemories.length;
    const totalConversations = this.conversations.size;

    const memoryTypes: Record<string, number> = {};
    allMemories.forEach(memory => {
      memoryTypes[memory.type] = (memoryTypes[memory.type] || 0) + 1;
    });

    const timestamps = allMemories.map(m => m.created);
    const oldestMemory = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const newestMemory = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      totalProjects,
      totalMemories,
      totalConversations,
      memoryTypes,
      averageMemoriesPerProject: totalProjects > 0 ? totalMemories / totalProjects : 0,
      oldestMemory,
      newestMemory,
    };
  }

  /**
   * Private helper methods
   */
  private generateProjectId(projectPath: string): string {
    // Generate deterministic ID based on project path
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 16);
  }

  private async createProjectContext(projectId: string, projectPath: string, metadata?: Partial<ProjectContext>): Promise<ProjectContext> {
    const projectName = path.basename(projectPath);
    
    // Detect project type and technologies
    const technologies = await this.detectTechnologies(projectPath);
    const projectType = this.inferProjectType(technologies);
    const architecture = await this.analyzeArchitecture(projectPath, technologies);

    return {
      id: projectId,
      name: projectName,
      type: projectType,
      language: technologies.find(t => t.type === 'language')?.name || 'unknown',
      technologies,
      architecture,
      codebase: {
        totalFiles: 0,
        totalLines: 0,
        languages: [],
        structure: { name: projectName, type: 'directory', path: projectPath },
        complexity: {
          average: 0,
          maximum: 0,
          distribution: [],
          cyclomaticComplexity: 0,
          cognitiveComplexity: 0,
          maintainabilityIndex: 0,
        },
        quality: {
          testCoverage: 0,
          duplication: 0,
          techDebt: 0,
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 0,
          maintainabilityRating: 'C',
        },
        patterns: [],
        hotspots: [],
        lastAnalyzed: 0,
      },
      dependencies: [],
      team: {
        size: 1,
        roles: [{ role: 'developer', count: 1, seniority: 'mid' }],
        experience: 'mixed',
        timezone: 'UTC',
        workingHours: { start: 9, end: 17 },
        communicationStyle: 'mixed',
      },
      goals: [],
      constraints: [],
      conventions: [],
      created: Date.now(),
      lastUpdated: Date.now(),
      lastAccessed: Date.now(),
      ...metadata,
    };
  }

  private async updateProjectContext(context: ProjectContext, projectPath: string, metadata?: Partial<ProjectContext>): Promise<ProjectContext> {
    // Update technologies if needed
    const currentTechnologies = await this.detectTechnologies(projectPath);
    const newTechnologies = this.mergeTechnologies(context.technologies, currentTechnologies);

    const updatedContext = {
      ...context,
      technologies: newTechnologies,
      lastUpdated: Date.now(),
      lastAccessed: Date.now(),
      ...metadata,
    };

    return updatedContext;
  }

  private async detectTechnologies(projectPath: string): Promise<Technology[]> {
    const technologies: Technology[] = [];

    try {
      // Check package.json for Node.js projects
      const packageJsonPath = path.join(projectPath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        technologies.push({
          name: 'javascript',
          type: 'language',
          purpose: 'Primary development language',
          confidence: 0.9,
          usage: 'primary',
        });

        // Detect frameworks from dependencies
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (allDeps.react) {
          technologies.push({
            name: 'react',
            type: 'framework',
            version: allDeps.react,
            purpose: 'UI framework',
            confidence: 0.9,
            usage: 'primary',
          });
        }

        if (allDeps.vue) {
          technologies.push({
            name: 'vue',
            type: 'framework',
            version: allDeps.vue,
            purpose: 'UI framework',
            confidence: 0.9,
            usage: 'primary',
          });
        }

        if (allDeps.express) {
          technologies.push({
            name: 'express',
            type: 'framework',
            version: allDeps.express,
            purpose: 'Web server framework',
            confidence: 0.9,
            usage: 'primary',
          });
        }

        if (allDeps.typescript || allDeps['@types/node']) {
          technologies.push({
            name: 'typescript',
            type: 'language',
            purpose: 'Type-safe JavaScript development',
            confidence: 0.8,
            usage: 'primary',
          });
        }

      } catch (error) {
        // package.json not found or invalid
      }

      // Check for Python projects
      const requirementsPath = path.join(projectPath, 'requirements.txt');
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      try {
        await fs.access(requirementsPath);
        technologies.push({
          name: 'python',
          type: 'language',
          purpose: 'Primary development language',
          confidence: 0.9,
          usage: 'primary',
        });
      } catch {
        try {
          await fs.access(pyprojectPath);
          technologies.push({
            name: 'python',
            type: 'language',
            purpose: 'Primary development language',
            confidence: 0.9,
            usage: 'primary',
          });
        } catch {
          // No Python indicators found
        }
      }

      // Check for Java projects
      const pomPath = path.join(projectPath, 'pom.xml');
      const gradlePath = path.join(projectPath, 'build.gradle');
      try {
        await fs.access(pomPath);
        technologies.push({
          name: 'java',
          type: 'language',
          purpose: 'Primary development language',
          confidence: 0.9,
          usage: 'primary',
        });
      } catch {
        try {
          await fs.access(gradlePath);
          technologies.push({
            name: 'java',
            type: 'language',
            purpose: 'Primary development language',
            confidence: 0.9,
            usage: 'primary',
          });
        } catch {
          // No Java indicators found
        }
      }

    } catch (error) {
      this.logger.error('Failed to detect technologies:', error);
    }

    return technologies;
  }

  private inferProjectType(technologies: Technology[]): ProjectContext['type'] {
    const techNames = technologies.map(t => t.name.toLowerCase());
    
    if (techNames.includes('react') || techNames.includes('vue') || techNames.includes('angular')) {
      return 'web';
    }
    
    if (techNames.includes('react-native') || techNames.includes('flutter') || techNames.includes('ionic')) {
      return 'mobile';
    }
    
    if (techNames.includes('electron') || techNames.includes('tauri')) {
      return 'desktop';
    }
    
    if (techNames.includes('express') || techNames.includes('fastapi') || techNames.includes('spring')) {
      return 'api';
    }
    
    return 'unknown';
  }

  private async analyzeArchitecture(projectPath: string, technologies: Technology[]): Promise<ProjectArchitecture> {
    // Basic architecture analysis
    const structure = await this.analyzeDirectoryStructure(projectPath);
    
    const hasComponents = this.hasDirectory(structure, ['components', 'src/components']);
    const hasServices = this.hasDirectory(structure, ['services', 'src/services']);
    const hasModels = this.hasDirectory(structure, ['models', 'src/models']);
    const hasControllers = this.hasDirectory(structure, ['controllers', 'src/controllers']);

    let pattern: ProjectArchitecture['pattern'] = 'unknown';
    
    if (hasComponents && hasServices) {
      pattern = 'mvc';
    } else if (technologies.some(t => t.name === 'react' || t.name === 'vue')) {
      pattern = 'mvvm';
    }

    return {
      pattern,
      layers: [
        {
          name: 'presentation',
          type: 'presentation',
          technologies: technologies.filter(t => t.type === 'framework').map(t => t.name),
          responsibilities: ['User interface', 'User interaction'],
          interfaces: ['HTTP', 'WebSocket'],
        },
        {
          name: 'business',
          type: 'business',
          technologies: technologies.filter(t => t.type === 'language').map(t => t.name),
          responsibilities: ['Business logic', 'Data processing'],
          interfaces: ['API', 'Service calls'],
        },
        {
          name: 'data',
          type: 'data',
          technologies: ['database'],
          responsibilities: ['Data persistence', 'Data access'],
          interfaces: ['Database connections'],
        },
      ],
      dataFlow: 'unidirectional',
      scalingStrategy: 'horizontal',
      deploymentPattern: 'containerized',
    };
  }

  private mergeTechnologies(existing: Technology[], detected: Technology[]): Technology[] {
    const merged = [...existing];
    
    detected.forEach(newTech => {
      const existingIndex = merged.findIndex(tech => 
        tech.name === newTech.name && tech.type === newTech.type
      );
      
      if (existingIndex >= 0) {
        // Update existing technology
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...newTech,
          confidence: Math.max(merged[existingIndex].confidence, newTech.confidence),
        };
      } else {
        // Add new technology
        merged.push(newTech);
      }
    });
    
    return merged;
  }

  private async analyzeDirectoryStructure(dirPath: string): Promise<DirectoryStructure> {
    try {
      const stats = await fs.stat(dirPath);
      const name = path.basename(dirPath);
      
      if (stats.isFile()) {
        return {
          name,
          type: 'file',
          path: dirPath,
          size: stats.size,
        };
      }
      
      const entries = await fs.readdir(dirPath);
      const children: DirectoryStructure[] = [];
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        try {
          const child = await this.analyzeDirectoryStructure(entryPath);
          children.push(child);
        } catch (error) {
          // Skip inaccessible files/directories
        }
      }
      
      return {
        name,
        type: 'directory',
        path: dirPath,
        children,
        purpose: this.inferDirectoryPurpose(name),
      };
      
    } catch (error) {
      throw new Error(`Failed to analyze directory structure: ${error.message}`);
    }
  }

  private inferDirectoryPurpose(dirName: string): string {
    const purposeMap: Record<string, string> = {
      src: 'Source code',
      lib: 'Library code',
      components: 'UI components',
      services: 'Business services',
      utils: 'Utility functions',
      helpers: 'Helper functions',
      models: 'Data models',
      controllers: 'Request controllers',
      routes: 'Route definitions',
      middleware: 'Middleware functions',
      config: 'Configuration files',
      tests: 'Test files',
      test: 'Test files',
      docs: 'Documentation',
      assets: 'Static assets',
      public: 'Public files',
      dist: 'Distribution build',
      build: 'Build artifacts',
      node_modules: 'Dependencies',
    };
    
    return purposeMap[dirName.toLowerCase()] || 'Unknown purpose';
  }

  private hasDirectory(structure: DirectoryStructure, paths: string[]): boolean {
    if (structure.type === 'file') return false;
    
    const checkPath = (struct: DirectoryStructure, targetPath: string): boolean => {
      const parts = targetPath.split('/');
      
      if (parts.length === 1) {
        return struct.children?.some(child => child.name === parts[0]) || false;
      }
      
      const firstPart = parts[0];
      const remainingPath = parts.slice(1).join('/');
      const childDir = struct.children?.find(child => child.name === firstPart && child.type === 'directory');
      
      return childDir ? checkPath(childDir, remainingPath) : false;
    };
    
    return paths.some(path => checkPath(structure, path));
  }

  private async countFilesAndLines(projectPath: string): Promise<{
    totalFiles: number;
    totalLines: number;
    languages: { language: string; lines: number; percentage: number }[];
  }> {
    const languageStats = new Map<string, number>();
    let totalFiles = 0;
    let totalLines = 0;

    const processDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath);
        
        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry);
          const stats = await fs.stat(entryPath);
          
          if (stats.isDirectory()) {
            if (!this.shouldIgnoreDirectory(entry)) {
              await processDirectory(entryPath);
            }
          } else if (stats.isFile()) {
            const ext = path.extname(entry).toLowerCase();
            const language = this.getLanguageFromExtension(ext);
            
            if (language) {
              totalFiles++;
              
              try {
                const content = await fs.readFile(entryPath, 'utf8');
                const lines = content.split('\n').length;
                totalLines += lines;
                
                const currentCount = languageStats.get(language) || 0;
                languageStats.set(language, currentCount + lines);
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    await processDirectory(projectPath);

    const languages = Array.from(languageStats.entries()).map(([language, lines]) => ({
      language,
      lines,
      percentage: totalLines > 0 ? (lines / totalLines) * 100 : 0,
    }));

    languages.sort((a, b) => b.lines - a.lines);

    return { totalFiles, totalLines, languages };
  }

  private shouldIgnoreDirectory(dirName: string): boolean {
    const ignoredDirs = [
      'node_modules', '.git', '.svn', '.hg',
      'dist', 'build', 'coverage', '.nyc_output',
      '__pycache__', '.pytest_cache', 'venv', 'env',
      'target', 'bin', 'obj', '.vs', '.vscode',
    ];
    
    return ignoredDirs.includes(dirName) || dirName.startsWith('.');
  }

  private getLanguageFromExtension(ext: string): string | null {
    const extensionMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.clj': 'clojure',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.vue': 'vue',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'shell',
      '.ps1': 'powershell',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.json': 'json',
      '.xml': 'xml',
      '.md': 'markdown',
      '.dockerfile': 'dockerfile',
    };
    
    return extensionMap[ext] || null;
  }

  private async analyzeCodePatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    // This would include more sophisticated pattern detection
    // For now, return basic patterns
    patterns.push({
      name: 'Module Exports',
      type: 'idiom',
      occurrences: 0,
      files: [],
      confidence: 0.8,
      description: 'CommonJS module exports pattern',
    });
    
    return patterns;
  }

  private async detectCodeHotspots(projectPath: string): Promise<CodeHotspot[]> {
    const hotspots: CodeHotspot[] = [];
    
    // This would include complexity analysis, code churn detection, etc.
    // For now, return empty array
    
    return hotspots;
  }

  private async calculateComplexityMetrics(projectPath: string): Promise<ComplexityMetrics> {
    // This would include actual complexity calculation
    // For now, return default values
    return {
      average: 5.2,
      maximum: 15,
      distribution: [
        { range: '1-5', count: 80 },
        { range: '6-10', count: 15 },
        { range: '11-15', count: 4 },
        { range: '16+', count: 1 },
      ],
      cyclomaticComplexity: 5.2,
      cognitiveComplexity: 6.1,
      maintainabilityIndex: 75,
    };
  }

  private async assessQualityMetrics(projectPath: string): Promise<QualityMetrics> {
    // This would include actual quality assessment
    // For now, return default values
    return {
      testCoverage: 68,
      duplication: 5.2,
      techDebt: 2.5,
      bugs: 3,
      vulnerabilities: 1,
      codeSmells: 12,
      maintainabilityRating: 'B',
    };
  }

  private async buildMemoryAssociations(memory: ContextMemory): Promise<void> {
    const projectMemories = this.memories.get(memory.projectId) || [];
    const associations: string[] = [];

    // Find related memories based on content similarity, tags, and context
    for (const existingMemory of projectMemories) {
      if (existingMemory.id === memory.id) continue;

      let similarity = 0;

      // Tag similarity
      const commonTags = memory.tags.filter(tag => existingMemory.tags.includes(tag));
      similarity += commonTags.length * 0.3;

      // Content similarity (basic keyword matching)
      const memoryWords = memory.content.toLowerCase().split(/\s+/);
      const existingWords = existingMemory.content.toLowerCase().split(/\s+/);
      const commonWords = memoryWords.filter(word => existingWords.includes(word) && word.length > 3);
      similarity += commonWords.length * 0.1;

      // Context similarity
      const commonFiles = memory.context.files.filter(file => existingMemory.context.files.includes(file));
      similarity += commonFiles.length * 0.5;

      const commonConcepts = memory.context.concepts.filter(concept => existingMemory.context.concepts.includes(concept));
      similarity += commonConcepts.length * 0.4;

      if (similarity > 1.0) {
        associations.push(existingMemory.id);
      }
    }

    memory.associations = associations;
  }

  private async searchMemories(memories: ContextMemory[], query: string): Promise<ContextMemory[]> {
    if (!query.trim()) return memories;

    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    return memories
      .map(memory => ({
        memory,
        score: this.calculateMemoryRelevance(memory, queryWords),
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.memory);
  }

  private calculateMemoryRelevance(memory: ContextMemory, queryWords: string[]): number {
    let score = 0;
    const content = memory.content.toLowerCase();
    const title = memory.title.toLowerCase();

    // Title matches are more important
    queryWords.forEach(word => {
      if (title.includes(word)) score += 3;
      if (content.includes(word)) score += 1;
      if (memory.tags.some(tag => tag.toLowerCase().includes(word))) score += 2;
    });

    // Boost for importance and confidence
    const importanceWeight = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.8 };
    score *= importanceWeight[memory.importance];
    score *= memory.confidence;

    return score;
  }

  private async extractEntities(text: string): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];
    
    // Use compromise for basic NLP
    const doc = compromise(text);
    
    // Extract people
    const people = doc.people().out('array');
    people.forEach(person => {
      entities.push({
        text: person,
        type: 'person',
        confidence: 0.8,
        start: text.indexOf(person),
        end: text.indexOf(person) + person.length,
      });
    });

    // Extract organizations
    const orgs = doc.organizations().out('array');
    orgs.forEach(org => {
      entities.push({
        text: org,
        type: 'organization',
        confidence: 0.7,
        start: text.indexOf(org),
        end: text.indexOf(org) + org.length,
      });
    });

    // Extract dates
    const dates = doc.dates().out('array');
    dates.forEach(date => {
      entities.push({
        text: date,
        type: 'date',
        confidence: 0.9,
        start: text.indexOf(date),
        end: text.indexOf(date) + date.length,
      });
    });

    // Extract file paths (basic pattern)
    const filePattern = /[\w/\\.-]+\.(js|ts|py|java|cs|cpp|h|css|html|json|yaml|yml|md|txt)/gi;
    let match;
    while ((match = filePattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'file',
        confidence: 0.9,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Extract function names (basic pattern)
    const functionPattern = /function\s+(\w+)|(\w+)\s*\(.*\)\s*{|def\s+(\w+)/gi;
    while ((match = functionPattern.exec(text)) !== null) {
      const functionName = match[1] || match[2] || match[3];
      if (functionName) {
        entities.push({
          text: functionName,
          type: 'function',
          confidence: 0.8,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return entities;
  }

  private async updateConversationTopics(context: ConversationContext, content: string): Promise<void> {
    // Extract topics using basic keyword analysis
    const words = content.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const topicKeywords = ['react', 'vue', 'angular', 'node', 'python', 'java', 'database', 'api', 'frontend', 'backend', 'testing', 'deployment', 'security', 'performance'];

    topicKeywords.forEach(keyword => {
      if (words.includes(keyword)) {
        const existing = context.topics.find(t => t.name === keyword);
        if (existing) {
          existing.mentions++;
          existing.lastMentioned = Date.now();
          existing.relevance = Math.min(1.0, existing.relevance + 0.1);
        } else {
          context.topics.push({
            name: keyword,
            relevance: 0.5,
            mentions: 1,
            firstMentioned: Date.now(),
            lastMentioned: Date.now(),
            sentiment: 'neutral',
          });
        }
      }
    });

    // Sort topics by relevance
    context.topics.sort((a, b) => b.relevance - a.relevance);
    
    // Keep only top 10 topics
    context.topics = context.topics.slice(0, 10);
  }

  private async detectConversationIntent(context: ConversationContext, message: ConversationMessage): Promise<void> {
    const content = message.content.toLowerCase();
    
    // Detect intent patterns
    const intents = {
      'code_generation': ['create', 'generate', 'write', 'implement', 'build'],
      'debugging': ['debug', 'fix', 'error', 'bug', 'issue', 'problem'],
      'explanation': ['explain', 'what', 'how', 'why', 'understand'],
      'refactoring': ['refactor', 'improve', 'optimize', 'clean', 'restructure'],
      'testing': ['test', 'spec', 'unit test', 'integration test'],
    };

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        message.metadata.intent = intent;
        break;
      }
    }
  }

  private async updateConversationSummary(context: ConversationContext): Promise<void> {
    if (context.thread.length === 0) return;

    // Create summary based on topics and key messages
    const userMessages = context.thread.filter(m => m.role === 'user');
    const keyTopics = context.topics.slice(0, 3).map(t => t.name);
    
    let summary = `Conversation about ${keyTopics.join(', ')} with ${userMessages.length} user messages.`;
    
    if (context.decisions.length > 0) {
      summary += ` Made ${context.decisions.length} key decisions.`;
    }
    
    if (context.actions.length > 0) {
      summary += ` Planned ${context.actions.length} actions.`;
    }

    context.summary = summary;
  }

  private async extractConversationInsights(context: ConversationContext): Promise<void> {
    // Extract decisions mentioned in the conversation
    const decisionKeywords = ['decided', 'choose', 'pick', 'select', 'go with'];
    
    context.thread.forEach(message => {
      if (message.role === 'user') {
        const content = message.content.toLowerCase();
        
        decisionKeywords.forEach(keyword => {
          if (content.includes(keyword)) {
            const decision: ConversationDecision = {
              id: uuidv4(),
              description: message.content.substring(0, 200),
              rationale: '',
              alternatives: [],
              impact: 'medium',
              reversible: true,
              timestamp: message.timestamp,
            };
            
            context.decisions.push(decision);
          }
        });
      }
    });
  }

  private async storeConversationMemories(context: ConversationContext): Promise<void> {
    // Store important insights as memories
    if (context.decisions.length > 0) {
      for (const decision of context.decisions) {
        await this.storeMemory({
          projectId: context.projectId,
          type: 'decision',
          title: `Decision: ${decision.description.substring(0, 50)}`,
          content: decision.description,
          tags: ['decision', ...context.topics.slice(0, 3).map(t => t.name)],
          importance: decision.impact === 'high' ? 'high' : 'medium',
          context: {
            files: [],
            functions: [],
            concepts: context.topics.map(t => t.name),
            technologies: [],
            people: [],
            timeframe: { start: context.startTime, end: context.lastUpdate },
            scope: 'project',
          },
          associations: [],
          confidence: 0.8,
          source: 'user',
        });
      }
    }

    // Store conversation summary as memory
    if (context.summary && context.thread.length > 5) {
      await this.storeMemory({
        projectId: context.projectId,
        type: 'conversation',
        title: `Conversation on ${new Date(context.startTime).toLocaleDateString()}`,
        content: context.summary,
        tags: ['conversation', ...context.topics.slice(0, 3).map(t => t.name)],
        importance: 'medium',
        context: {
          files: [],
          functions: [],
          concepts: context.topics.map(t => t.name),
          technologies: [],
          people: [],
          timeframe: { start: context.startTime, end: context.lastUpdate },
          scope: 'project',
        },
        associations: [],
        confidence: 0.7,
        source: 'ai',
      });
    }
  }

  private async searchCode(projectId: string, query: string): Promise<{ file: string; line: number; content: string; score: number }[]> {
    // This would implement actual code search
    // For now, return empty array
    return [];
  }

  private async searchConversations(projectId: string, query: string): Promise<ConversationContext[]> {
    const projectConversations = Array.from(this.conversations.values())
      .filter(conv => conv.projectId === projectId);

    const queryWords = query.toLowerCase().split(/\s+/);
    
    return projectConversations
      .filter(conv => {
        const summary = conv.summary.toLowerCase();
        const topics = conv.topics.map(t => t.name.toLowerCase());
        
        return queryWords.some(word => 
          summary.includes(word) || topics.some(topic => topic.includes(word))
        );
      });
  }

  private generateContextualSuggestions(context: ProjectContext, currentFile?: string, currentFunction?: string): string[] {
    const suggestions: string[] = [];

    // Suggest based on project type
    if (context.type === 'web') {
      suggestions.push('Consider adding error boundaries for better error handling');
      suggestions.push('Implement responsive design patterns');
    }

    // Suggest based on technologies
    if (context.technologies.some(t => t.name === 'react')) {
      suggestions.push('Use React hooks for state management');
      suggestions.push('Consider memoization for performance optimization');
    }

    // Suggest based on code quality
    if (context.codebase.quality.testCoverage < 70) {
      suggestions.push('Increase test coverage to improve code quality');
    }

    if (context.codebase.quality.duplication > 10) {
      suggestions.push('Refactor duplicated code into reusable components');
    }

    // Suggest based on current file context
    if (currentFile) {
      const fileExt = path.extname(currentFile);
      if (fileExt === '.js' || fileExt === '.ts') {
        suggestions.push('Add JSDoc comments for better documentation');
        suggestions.push('Consider extracting complex logic into separate functions');
      }
    }

    return suggestions;
  }

  private identifyPotentialIssues(context: ProjectContext, currentFile?: string): string[] {
    const issues: string[] = [];

    // Check for hotspots in current file
    if (currentFile) {
      const fileHotspots = context.codebase.hotspots.filter(h => h.file === currentFile);
      fileHotspots.forEach(hotspot => {
        if (hotspot.severity === 'high' || hotspot.severity === 'critical') {
          issues.push(`${hotspot.type} issue: ${hotspot.description}`);
        }
      });
    }

    // Check for outdated dependencies
    const outdatedDeps = context.dependencies.filter(dep => dep.updateAvailable);
    if (outdatedDeps.length > 0) {
      issues.push(`${outdatedDeps.length} dependencies have updates available`);
    }

    // Check for security vulnerabilities
    const vulnerableDeps = context.dependencies.filter(dep => dep.vulnerabilities > 0);
    if (vulnerableDeps.length > 0) {
      issues.push(`${vulnerableDeps.length} dependencies have security vulnerabilities`);
    }

    // Check code quality issues
    if (context.codebase.quality.maintainabilityRating === 'D' || context.codebase.quality.maintainabilityRating === 'E') {
      issues.push('Low maintainability rating - consider refactoring');
    }

    return issues;
  }

  private summarizeMemories(memories: ContextMemory[]): string {
    if (memories.length === 0) return '';

    const topicCounts = new Map<string, number>();
    memories.forEach(memory => {
      memory.tags.forEach(tag => {
        topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
      });
    });

    const topTopics = Array.from(topicCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([topic]) => topic);

    return `Recent context includes ${memories.length} memories about ${topTopics.join(', ')}`;
  }

  private startAutoSave(): void {
    if (this.config.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(async () => {
        await this.autoSave();
      }, this.config.autoSaveInterval * 60 * 1000);
    }
  }

  private async autoSave(): Promise<void> {
    try {
      // Save all project contexts
      for (const context of this.projectContexts.values()) {
        await this.saveProjectContext(context);
      }

      // Save all memories
      for (const [projectId, projectMemories] of this.memories.entries()) {
        await this.saveMemories(projectId, projectMemories);
      }

      // Save active conversations
      for (const conversation of this.conversations.values()) {
        await this.saveConversation(conversation);
      }

    } catch (error) {
      this.logger.error('Auto-save failed:', error);
    }
  }

  private async saveProjectContext(context: ProjectContext): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const contextsDir = './project-contexts';
      await fs.mkdir(contextsDir, { recursive: true });

      const filePath = path.join(contextsDir, `${context.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(context, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save project context ${context.id}:`, error);
    }
  }

  private async saveMemories(projectId: string, memories: ContextMemory[]): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const memoriesDir = './project-memories';
      await fs.mkdir(memoriesDir, { recursive: true });

      const filePath = path.join(memoriesDir, `${projectId}.json`);
      await fs.writeFile(filePath, JSON.stringify(memories, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save memories for project ${projectId}:`, error);
    }
  }

  private async saveConversation(conversation: ConversationContext): Promise<void> {
    if (this.config.privacyMode) return;

    try {
      const conversationsDir = './conversations';
      await fs.mkdir(conversationsDir, { recursive: true });

      const filePath = path.join(conversationsDir, `${conversation.sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save conversation ${conversation.sessionId}:`, error);
    }
  }

  private async loadProjectContexts(): Promise<void> {
    try {
      const contextsDir = './project-contexts';
      const files = await fs.readdir(contextsDir).catch(() => []);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(contextsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const context: ProjectContext = JSON.parse(content);
          this.projectContexts.set(context.id, context);
        }
      }

      this.logger.info(`Loaded ${this.projectContexts.size} project contexts`);
    } catch (error) {
      this.logger.error('Failed to load project contexts:', error);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.removeAllListeners();
    this.projectContexts.clear();
    this.memories.clear();
    this.conversations.clear();
    this.memoryCache.clear();
  }
}