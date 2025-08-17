/**
 * Context Memory System - Revolutionary AI Memory
 * KILLER FEATURE: AI remembers everything about your projects, chats, preferences
 * 
 * This system gives Recoder a massive competitive advantage by providing
 * persistent context across all interactions and projects.
 */

import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';
import path from 'path';
import fs from 'fs/promises';

interface MemoryEntry {
  id: string;
  type: 'chat' | 'project' | 'code' | 'preference' | 'learning';
  timestamp: string;
  data: any;
  context: {
    projectPath?: string;
    command?: string;
    user?: string;
    session?: string;
  };
  metadata: {
    importance: number; // 0-1
    accessed: number;
    lastModified: string;
    tags: string[];
  };
}

interface ProjectMemory {
  path: string;
  name: string;
  language: string;
  framework: string;
  patterns: string[];
  conventions: any;
  lastInteraction: string;
  totalInteractions: number;
  userPreferences: any;
  codeStyle: any;
  commonTasks: string[];
  aiPerformance: {
    [modelName: string]: {
      successRate: number;
      avgCost: number;
      userSatisfaction: number;
    };
  };
}

interface ChatMemory {
  sessionId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    metadata?: any;
  }>;
  summary: string;
  learnings: string[];
  userFeedback?: number;
}

export class ContextMemorySystem extends EventEmitter {
  private static instance: ContextMemorySystem;
  private memoryDir: string;
  private memories: Map<string, MemoryEntry> = new Map();
  private projectMemories: Map<string, ProjectMemory> = new Map();
  private chatHistory: Map<string, ChatMemory> = new Map();
  private isLoaded = false;

  constructor() {
    super();
    this.memoryDir = path.join(process.env.HOME || process.cwd(), '.recoder', 'memory');
    this.initializeMemorySystem();
  }

  static getInstance(): ContextMemorySystem {
    if (!ContextMemorySystem.instance) {
      ContextMemorySystem.instance = new ContextMemorySystem();
    }
    return ContextMemorySystem.instance;
  }

  /**
   * Revolutionary: Store any interaction for future learning
   */
  async remember(type: MemoryEntry['type'], data: any, context: any = {}): Promise<string> {
    const id = this.generateMemoryId();
    const entry: MemoryEntry = {
      id,
      type,
      timestamp: new Date().toISOString(),
      data,
      context,
      metadata: {
        importance: this.calculateImportance(type, data),
        accessed: 1,
        lastModified: new Date().toISOString(),
        tags: this.extractTags(data, context)
      }
    };

    this.memories.set(id, entry);
    await this.persistMemory(entry);
    
    Logger.info('🧠 Memory stored', { id, type, importance: entry.metadata.importance });
    this.emit('memoryStored', entry);
    
    return id;
  }

  /**
   * Recall relevant memories based on context
   */
  async recall(query: string, type?: MemoryEntry['type'], limit = 10): Promise<MemoryEntry[]> {
    const relevantMemories = Array.from(this.memories.values())
      .filter(memory => {
        if (type && memory.type !== type) return false;
        return this.isRelevant(memory, query);
      })
      .sort((a, b) => {
        const relevanceA = this.calculateRelevance(a, query);
        const relevanceB = this.calculateRelevance(b, query);
        return relevanceB - relevanceA;
      })
      .slice(0, limit);

    // Update access counts
    relevantMemories.forEach(memory => {
      memory.metadata.accessed++;
      memory.metadata.lastModified = new Date().toISOString();
    });

    Logger.info('🔍 Memory recall', { query, found: relevantMemories.length });
    return relevantMemories;
  }

  /**
   * Learn from project context and remember patterns
   */
  async learnFromProject(projectPath: string): Promise<ProjectMemory> {
    const existing = this.projectMemories.get(projectPath);
    const analysis = await this.analyzeProject(projectPath);
    
    const projectMemory: ProjectMemory = {
      path: projectPath,
      name: path.basename(projectPath),
      language: analysis.primaryLanguage,
      framework: analysis.framework,
      patterns: analysis.patterns,
      conventions: analysis.conventions,
      lastInteraction: new Date().toISOString(),
      totalInteractions: (existing?.totalInteractions || 0) + 1,
      userPreferences: existing?.userPreferences || {},
      codeStyle: analysis.codeStyle,
      commonTasks: existing?.commonTasks || [],
      aiPerformance: existing?.aiPerformance || {}
    };

    this.projectMemories.set(projectPath, projectMemory);
    await this.persistProjectMemory(projectMemory);
    
    Logger.info('📁 Project learned', { 
      path: projectPath, 
      interactions: projectMemory.totalInteractions 
    });
    
    return projectMemory;
  }

  /**
   * Remember chat conversations for learning
   */
  async rememberChat(sessionId: string, role: 'user' | 'assistant', content: string, metadata?: any): Promise<void> {
    let chatMemory = this.chatHistory.get(sessionId);
    
    if (!chatMemory) {
      chatMemory = {
        sessionId,
        messages: [],
        summary: '',
        learnings: []
      };
      this.chatHistory.set(sessionId, chatMemory);
    }

    chatMemory.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata
    });

    // Auto-generate summary every 10 messages
    if (chatMemory.messages.length % 10 === 0) {
      chatMemory.summary = await this.generateChatSummary(chatMemory.messages);
    }

    await this.persistChatMemory(chatMemory);
    Logger.info('💬 Chat remembered', { sessionId, messages: chatMemory.messages.length });
  }

  /**
   * Get project-specific context for AI
   */
  async getProjectContext(projectPath: string): Promise<any> {
    const projectMemory = this.projectMemories.get(projectPath);
    const relevantMemories = await this.recall(`project:${projectPath}`, 'project', 5);
    const recentChats = await this.getRecentChats(5);

    return {
      project: projectMemory,
      recentInteractions: relevantMemories,
      recentChats: recentChats,
      patterns: projectMemory?.patterns || [],
      preferences: projectMemory?.userPreferences || {},
      codeStyle: projectMemory?.codeStyle || {}
    };
  }

  /**
   * Learn user preferences from interactions
   */
  async learnUserPreferences(preferences: any, context: any = {}): Promise<void> {
    await this.remember('preference', preferences, context);
    
    // Update project-specific preferences if in a project
    if (context.projectPath) {
      const projectMemory = this.projectMemories.get(context.projectPath);
      if (projectMemory) {
        projectMemory.userPreferences = { ...projectMemory.userPreferences, ...preferences };
        await this.persistProjectMemory(projectMemory);
      }
    }

    Logger.info('⚙️ User preferences learned', { preferences });
  }

  /**
   * Get AI performance history for smart model selection
   */
  getAIPerformanceHistory(projectPath?: string): any {
    if (projectPath) {
      const projectMemory = this.projectMemories.get(projectPath);
      return projectMemory?.aiPerformance || {};
    }

    // Aggregate across all projects
    const aggregated: any = {};
    for (const project of this.projectMemories.values()) {
      for (const [model, performance] of Object.entries(project.aiPerformance)) {
        if (!aggregated[model]) {
          aggregated[model] = { successRate: 0, avgCost: 0, userSatisfaction: 0, count: 0 };
        }
        const p = performance as any;
        aggregated[model].successRate += p.successRate;
        aggregated[model].avgCost += p.avgCost;
        aggregated[model].userSatisfaction += p.userSatisfaction;
        aggregated[model].count++;
      }
    }

    // Calculate averages
    for (const model of Object.keys(aggregated)) {
      const count = aggregated[model].count;
      aggregated[model].successRate /= count;
      aggregated[model].avgCost /= count;
      aggregated[model].userSatisfaction /= count;
    }

    return aggregated;
  }

  /**
   * Export memories for backup/sharing
   */
  async exportMemories(): Promise<any> {
    return {
      memories: Array.from(this.memories.values()),
      projects: Array.from(this.projectMemories.values()),
      chats: Array.from(this.chatHistory.values()),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Get memory system statistics
   */
  getStats(): any {
    return {
      totalMemories: this.memories.size,
      projectsTracked: this.projectMemories.size,
      chatSessions: this.chatHistory.size,
      memoryTypes: this.getMemoryTypeDistribution(),
      diskUsage: this.calculateDiskUsage(),
      avgImportance: this.calculateAverageImportance()
    };
  }

  // Private methods
  private async initializeMemorySystem(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await this.loadMemories();
      this.isLoaded = true;
      Logger.info('🧠 Context Memory System initialized', this.getStats());
    } catch (error) {
      Logger.error('Memory system initialization failed', { error });
    }
  }

  private async loadMemories(): Promise<void> {
    try {
      // Load main memories
      const memoriesFile = path.join(this.memoryDir, 'memories.json');
      if (await this.fileExists(memoriesFile)) {
        const data = JSON.parse(await fs.readFile(memoriesFile, 'utf-8'));
        data.forEach((entry: MemoryEntry) => this.memories.set(entry.id, entry));
      }

      // Load project memories
      const projectsFile = path.join(this.memoryDir, 'projects.json');
      if (await this.fileExists(projectsFile)) {
        const data = JSON.parse(await fs.readFile(projectsFile, 'utf-8'));
        data.forEach((project: ProjectMemory) => this.projectMemories.set(project.path, project));
      }

      // Load chat history
      const chatsFile = path.join(this.memoryDir, 'chats.json');
      if (await this.fileExists(chatsFile)) {
        const data = JSON.parse(await fs.readFile(chatsFile, 'utf-8'));
        data.forEach((chat: ChatMemory) => this.chatHistory.set(chat.sessionId, chat));
      }
    } catch (error) {
      Logger.warn('Failed to load some memories', { error });
    }
  }

  private async persistMemory(entry: MemoryEntry): Promise<void> {
    try {
      const memoriesFile = path.join(this.memoryDir, 'memories.json');
      const memories = Array.from(this.memories.values());
      await fs.writeFile(memoriesFile, JSON.stringify(memories, null, 2));
    } catch (error) {
      Logger.error('Failed to persist memory', { error, id: entry.id });
    }
  }

  private async persistProjectMemory(project: ProjectMemory): Promise<void> {
    try {
      const projectsFile = path.join(this.memoryDir, 'projects.json');
      const projects = Array.from(this.projectMemories.values());
      await fs.writeFile(projectsFile, JSON.stringify(projects, null, 2));
    } catch (error) {
      Logger.error('Failed to persist project memory', { error, path: project.path });
    }
  }

  private async persistChatMemory(chat: ChatMemory): Promise<void> {
    try {
      const chatsFile = path.join(this.memoryDir, 'chats.json');
      const chats = Array.from(this.chatHistory.values());
      await fs.writeFile(chatsFile, JSON.stringify(chats, null, 2));
    } catch (error) {
      Logger.error('Failed to persist chat memory', { error, sessionId: chat.sessionId });
    }
  }

  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateImportance(type: MemoryEntry['type'], data: any): number {
    // User feedback and code generation are more important
    if (type === 'preference' || type === 'code') return 0.9;
    if (type === 'learning') return 0.8;
    if (type === 'project') return 0.7;
    if (type === 'chat') return 0.5;
    return 0.3;
  }

  private extractTags(data: any, context: any): string[] {
    const tags: string[] = [];
    
    if (context.projectPath) tags.push(`project:${path.basename(context.projectPath)}`);
    if (context.command) tags.push(`command:${context.command}`);
    if (data.language) tags.push(`lang:${data.language}`);
    if (data.framework) tags.push(`framework:${data.framework}`);
    
    return tags;
  }

  private isRelevant(memory: MemoryEntry, query: string): boolean {
    const queryLower = query.toLowerCase();
    const content = JSON.stringify(memory.data).toLowerCase();
    const tags = memory.metadata.tags.join(' ').toLowerCase();
    
    return content.includes(queryLower) || tags.includes(queryLower);
  }

  private calculateRelevance(memory: MemoryEntry, query: string): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    const content = JSON.stringify(memory.data).toLowerCase();
    
    // Exact matches get higher scores
    if (content.includes(queryLower)) score += 10;
    
    // Recent memories are more relevant
    const age = Date.now() - new Date(memory.timestamp).getTime();
    const ageDays = age / (1000 * 60 * 60 * 24);
    score += Math.max(0, 5 - ageDays); // Recent memories boost
    
    // Frequently accessed memories are more relevant
    score += Math.min(memory.metadata.accessed * 0.1, 2);
    
    // Importance boost
    score += memory.metadata.importance * 3;
    
    return score;
  }

  private async analyzeProject(projectPath: string): Promise<any> {
    // Simplified project analysis - in real implementation,
    // this would analyze files, package.json, etc.
    return {
      primaryLanguage: 'typescript',
      framework: 'react',
      patterns: ['hooks', 'components', 'typescript'],
      conventions: { indentation: 2, quotes: 'single' },
      codeStyle: { functional: true, clean: true }
    };
  }

  private async generateChatSummary(messages: any[]): Promise<string> {
    // In real implementation, this would use AI to summarize
    return `Chat summary with ${messages.length} messages`;
  }

  private async getRecentChats(limit: number): Promise<ChatMemory[]> {
    return Array.from(this.chatHistory.values())
      .sort((a, b) => new Date(b.messages[b.messages.length - 1]?.timestamp || 0).getTime() - 
                     new Date(a.messages[a.messages.length - 1]?.timestamp || 0).getTime())
      .slice(0, limit);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getMemoryTypeDistribution(): any {
    const distribution: any = {};
    for (const memory of this.memories.values()) {
      distribution[memory.type] = (distribution[memory.type] || 0) + 1;
    }
    return distribution;
  }

  private calculateDiskUsage(): string {
    // Simplified calculation
    return `${(this.memories.size * 0.5).toFixed(1)} KB`;
  }

  private calculateAverageImportance(): number {
    if (this.memories.size === 0) return 0;
    const total = Array.from(this.memories.values()).reduce((sum, m) => sum + m.metadata.importance, 0);
    return total / this.memories.size;
  }
}

export default ContextMemorySystem;