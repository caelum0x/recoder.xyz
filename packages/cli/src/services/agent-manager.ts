/**
 * Agent Manager - Handles agent storage, validation, and management
 */

import fs from 'fs-extra';
import path from 'path';
import { Logger } from '@recoder/shared';
import {
  Agent,
  AgentStatus,
  AgentCategory,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentListFilter,
  AgentListSort,
  AgentValidationResult,
  ValidationError,
  ValidationWarning,
  AgentExportData,
  ExpertiseLevel,
  PersonalityTone,
  VerbosityLevel,
  FormalityLevel,
  ApproachStyle,
  FeedbackStyle,
  CommunicationStyle,
  ResponseFormat
} from '@recoder/shared/types/agent';

export class AgentManager {
  private logger: Logger;
  private dataDir: string;
  private agentsFile: string;
  private agents: Map<string, Agent> = new Map();

  constructor(dataDir?: string) {
    this.logger = Logger.getInstance();
    this.dataDir = dataDir || path.join(process.cwd(), '.recoder', 'agents');
    this.agentsFile = path.join(this.dataDir, 'agents.json');
  }

  public async initialize(): Promise<void> {
    await fs.ensureDir(this.dataDir);
    await this.loadAgents();
    
    this.logger.info('Agent manager initialized', {
      dataDir: this.dataDir,
      agentCount: this.agents.size
    });
  }

  public async createAgent(request: CreateAgentRequest): Promise<Agent> {
    // Validate request
    const validation = this.validateCreateRequest(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const agent: Agent = {
      id: this.generateAgentId(),
      name: request.name,
      description: request.description,
      model: request.model,
      capabilities: this.buildDefaultCapabilities(request.capabilities),
      preferences: this.buildDefaultPreferences(request.preferences),
      personality: this.buildDefaultPersonality(request.personality),
      instructions: this.buildDefaultInstructions(request.instructions),
      metadata: this.buildDefaultMetadata(request.metadata),
      status: AgentStatus.ACTIVE,
      settings: this.buildDefaultSettings(request.settings),
      performance: this.buildDefaultPerformance(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.agents.set(agent.id, agent);
    await this.saveAgents();

    this.logger.info('Agent created', { agentId: agent.id, name: agent.name });
    return agent;
  }

  public async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  public async updateAgent(id: string, request: UpdateAgentRequest): Promise<Agent> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Validate update request
    const validation = this.validateUpdateRequest(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Update agent properties
    if (request.name !== undefined) agent.name = request.name;
    if (request.description !== undefined) agent.description = request.description;
    if (request.model !== undefined) agent.model = request.model;
    if (request.capabilities !== undefined) {
      agent.capabilities = { ...agent.capabilities, ...request.capabilities };
    }
    if (request.preferences !== undefined) {
      agent.preferences = { ...agent.preferences, ...request.preferences };
    }
    if (request.personality !== undefined) {
      agent.personality = { ...agent.personality, ...request.personality };
    }
    if (request.instructions !== undefined) {
      agent.instructions = { ...agent.instructions, ...request.instructions };
    }
    if (request.metadata !== undefined) {
      agent.metadata = { ...agent.metadata, ...request.metadata };
    }
    if (request.settings !== undefined) {
      agent.settings = { ...agent.settings, ...request.settings };
    }
    if (request.status !== undefined) agent.status = request.status;

    agent.updatedAt = new Date();

    this.agents.set(id, agent);
    await this.saveAgents();

    this.logger.info('Agent updated', { agentId: id, name: agent.name });
    return agent;
  }

  public async deleteAgent(id: string): Promise<boolean> {
    const agent = this.agents.get(id);
    if (!agent) {
      return false;
    }

    this.agents.delete(id);
    await this.saveAgents();

    this.logger.info('Agent deleted', { agentId: id, name: agent.name });
    return true;
  }

  public async listAgents(
    filter?: AgentListFilter,
    sort?: AgentListSort,
    limit?: number,
    offset?: number
  ): Promise<Agent[]> {
    let agents = Array.from(this.agents.values());

    // Apply filters
    if (filter) {
      agents = this.applyFilters(agents, filter);
    }

    // Apply sorting
    if (sort) {
      agents = this.applySorting(agents, sort);
    }

    // Apply pagination
    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      agents = agents.slice(start, end);
    }

    return agents;
  }

  public async exportAgents(agentIds?: string[]): Promise<AgentExportData> {
    const agents = agentIds 
      ? agentIds.map(id => this.agents.get(id)).filter(Boolean) as Agent[]
      : Array.from(this.agents.values());

    const categories = [...new Set(agents.map(a => a.metadata.category))];
    const capabilities = [...new Set(agents.flatMap(a => 
      Object.keys(a.capabilities).filter(k => (a.capabilities as any)[k].enabled)
    ))];

    return {
      version: '1.0',
      exportDate: new Date(),
      agents,
      metadata: {
        totalAgents: agents.length,
        categories,
        capabilities
      }
    };
  }

  public async importAgents(data: AgentExportData): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const result = { imported: 0, skipped: 0, errors: [] };

    for (const agentData of data.agents) {
      try {
        // Check if agent already exists
        if (this.agents.has(agentData.id)) {
          result.skipped++;
          continue;
        }

        // Validate agent data
        const validation = this.validateAgent(agentData);
        if (!validation.valid) {
          result.errors.push(`Agent ${agentData.name}: ${validation.errors.map(e => e.message).join(', ')}`);
          continue;
        }

        // Import agent
        this.agents.set(agentData.id, agentData);
        result.imported++;
      } catch (error) {
        result.errors.push(`Agent ${agentData.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (result.imported > 0) {
      await this.saveAgents();
    }

    this.logger.info('Agents import completed', result);
    return result;
  }

  public getAgentStats(): {
    total: number;
    byStatus: Record<AgentStatus, number>;
    byCategory: Record<AgentCategory, number>;
    recentlyUsed: number;
  } {
    const agents = Array.from(this.agents.values());
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const byStatus = Object.values(AgentStatus).reduce((acc, status) => {
      acc[status] = agents.filter(a => a.status === status).length;
      return acc;
    }, {} as Record<AgentStatus, number>);

    const byCategory = Object.values(AgentCategory).reduce((acc, category) => {
      acc[category] = agents.filter(a => a.metadata.category === category).length;
      return acc;
    }, {} as Record<AgentCategory, number>);

    const recentlyUsed = agents.filter(a => 
      a.lastUsed && new Date(a.lastUsed) > weekAgo
    ).length;

    return {
      total: agents.length,
      byStatus,
      byCategory,
      recentlyUsed
    };
  }

  private async loadAgents(): Promise<void> {
    try {
      if (await fs.pathExists(this.agentsFile)) {
        const data = await fs.readJson(this.agentsFile);
        
        if (data.agents && Array.isArray(data.agents)) {
          this.agents.clear();
          
          for (const agentData of data.agents) {
            // Convert date strings back to Date objects
            agentData.createdAt = new Date(agentData.createdAt);
            agentData.updatedAt = new Date(agentData.updatedAt);
            if (agentData.lastUsed) {
              agentData.lastUsed = new Date(agentData.lastUsed);
            }
            
            this.agents.set(agentData.id, agentData);
          }
        }
        
        this.logger.info('Agents loaded', { count: this.agents.size });
      }
    } catch (error) {
      this.logger.warn('Failed to load agents', { error });
      this.agents.clear();
    }
  }

  private async saveAgents(): Promise<void> {
    try {
      const data = {
        version: '1.0',
        lastSaved: new Date().toISOString(),
        agentCount: this.agents.size,
        agents: Array.from(this.agents.values())
      };
      
      await fs.writeJson(this.agentsFile, data, { spaces: 2 });
      this.logger.debug('Agents saved', { count: this.agents.size });
    } catch (error) {
      this.logger.error('Failed to save agents', { error });
      throw error;
    }
  }

  private validateCreateRequest(request: CreateAgentRequest): AgentValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    if (!request.name || request.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Agent name is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!request.description || request.description.trim().length === 0) {
      errors.push({
        field: 'description',
        message: 'Agent description is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!request.model || request.model.trim().length === 0) {
      errors.push({
        field: 'model',
        message: 'Agent model is required',
        code: 'REQUIRED_FIELD'
      });
    }

    // Validate name uniqueness
    const existingAgent = Array.from(this.agents.values()).find(a => 
      a.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existingAgent) {
      errors.push({
        field: 'name',
        message: 'Agent name must be unique',
        code: 'DUPLICATE_NAME'
      });
    }

    // Validate name format
    if (request.name && !/^[a-zA-Z0-9\s\-_]+$/.test(request.name)) {
      errors.push({
        field: 'name',
        message: 'Agent name contains invalid characters',
        code: 'INVALID_FORMAT'
      });
    }

    // Validate description length
    if (request.description && request.description.length > 500) {
      warnings.push({
        field: 'description',
        message: 'Description is very long, consider shortening it',
        suggestion: 'Keep description under 200 characters for better readability'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateUpdateRequest(request: UpdateAgentRequest): AgentValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate name if provided
    if (request.name !== undefined) {
      if (!request.name || request.name.trim().length === 0) {
        errors.push({
          field: 'name',
          message: 'Agent name cannot be empty',
          code: 'REQUIRED_FIELD'
        });
      }

      if (request.name && !/^[a-zA-Z0-9\s\-_]+$/.test(request.name)) {
        errors.push({
          field: 'name',
          message: 'Agent name contains invalid characters',
          code: 'INVALID_FORMAT'
        });
      }
    }

    // Validate description if provided
    if (request.description !== undefined) {
      if (!request.description || request.description.trim().length === 0) {
        errors.push({
          field: 'description',
          message: 'Agent description cannot be empty',
          code: 'REQUIRED_FIELD'
        });
      }

      if (request.description && request.description.length > 500) {
        warnings.push({
          field: 'description',
          message: 'Description is very long, consider shortening it',
          suggestion: 'Keep description under 200 characters for better readability'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateAgent(agent: Agent): AgentValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    if (!agent.id) {
      errors.push({ field: 'id', message: 'Agent ID is required', code: 'REQUIRED_FIELD' });
    }
    if (!agent.name) {
      errors.push({ field: 'name', message: 'Agent name is required', code: 'REQUIRED_FIELD' });
    }
    if (!agent.description) {
      errors.push({ field: 'description', message: 'Agent description is required', code: 'REQUIRED_FIELD' });
    }
    if (!agent.model) {
      errors.push({ field: 'model', message: 'Agent model is required', code: 'REQUIRED_FIELD' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private applyFilters(agents: Agent[], filter: AgentListFilter): Agent[] {
    return agents.filter(agent => {
      // Status filter
      if (filter.status && !filter.status.includes(agent.status)) {
        return false;
      }

      // Category filter
      if (filter.category && !filter.category.includes(agent.metadata.category)) {
        return false;
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const searchableText = [
          agent.name,
          agent.description,
          ...agent.metadata.tags
        ].join(' ').toLowerCase();
        
        if (!searchableText.includes(searchLower)) {
          return false;
        }
      }

      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        const hasTag = filter.tags.some(tag => 
          agent.metadata.tags.includes(tag)
        );
        if (!hasTag) {
          return false;
        }
      }

      // Author filter
      if (filter.author && agent.metadata.author !== filter.author) {
        return false;
      }

      return true;
    });
  }

  private applySorting(agents: Agent[], sort: AgentListSort): Agent[] {
    return agents.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sort.field) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt.getTime();
          bValue = b.createdAt.getTime();
          break;
        case 'updatedAt':
          aValue = a.updatedAt.getTime();
          bValue = b.updatedAt.getTime();
          break;
        case 'lastUsed':
          aValue = a.lastUsed ? a.lastUsed.getTime() : 0;
          bValue = b.lastUsed ? b.lastUsed.getTime() : 0;
          break;
        case 'performance':
          aValue = a.performance.successRate;
          bValue = b.performance.successRate;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sort.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  private buildDefaultCapabilities(capabilities?: any): any {
    return {
      web: {
        enabled: capabilities?.web?.enabled || false,
        frameworks: capabilities?.web?.frameworks || [],
        languages: capabilities?.web?.languages || [],
        features: capabilities?.web?.features || [],
        expertise: capabilities?.web?.expertise || ExpertiseLevel.INTERMEDIATE
      },
      mobile: {
        enabled: capabilities?.mobile?.enabled || false,
        platforms: capabilities?.mobile?.platforms || [],
        frameworks: capabilities?.mobile?.frameworks || [],
        languages: capabilities?.mobile?.languages || [],
        features: capabilities?.mobile?.features || [],
        expertise: capabilities?.mobile?.expertise || ExpertiseLevel.INTERMEDIATE
      },
      blockchain: {
        enabled: capabilities?.blockchain?.enabled || false,
        networks: capabilities?.blockchain?.networks || [],
        protocols: capabilities?.blockchain?.protocols || [],
        languages: capabilities?.blockchain?.languages || [],
        features: capabilities?.blockchain?.features || [],
        expertise: capabilities?.blockchain?.expertise || ExpertiseLevel.INTERMEDIATE
      },
      ai: {
        enabled: capabilities?.ai?.enabled || false,
        domains: capabilities?.ai?.domains || [],
        frameworks: capabilities?.ai?.frameworks || [],
        languages: capabilities?.ai?.languages || [],
        features: capabilities?.ai?.features || [],
        expertise: capabilities?.ai?.expertise || ExpertiseLevel.INTERMEDIATE
      },
      general: {
        codeGeneration: capabilities?.general?.codeGeneration !== false,
        codeReview: capabilities?.general?.codeReview !== false,
        debugging: capabilities?.general?.debugging !== false,
        testing: capabilities?.general?.testing !== false,
        documentation: capabilities?.general?.documentation !== false,
        refactoring: capabilities?.general?.refactoring !== false,
        architecture: capabilities?.general?.architecture !== false,
        security: capabilities?.general?.security !== false,
        performance: capabilities?.general?.performance !== false,
        deployment: capabilities?.general?.deployment !== false
      }
    };
  }

  private buildDefaultPreferences(preferences?: any): any {
    return {
      languages: preferences?.languages || [],
      frameworks: preferences?.frameworks || [],
      tools: preferences?.tools || [],
      patterns: preferences?.patterns || [],
      style: {
        indentation: preferences?.style?.indentation || 'spaces',
        indentSize: preferences?.style?.indentSize || 2,
        lineLength: preferences?.style?.lineLength || 100,
        namingConvention: preferences?.style?.namingConvention || 'camelCase',
        comments: preferences?.style?.comments || 'moderate',
        documentation: preferences?.style?.documentation || 'inline',
        errorHandling: preferences?.style?.errorHandling || 'explicit',
        testing: preferences?.style?.testing || 'unit'
      },
      priorities: preferences?.priorities || []
    };
  }

  private buildDefaultPersonality(personality?: any): any {
    return {
      tone: personality?.tone || PersonalityTone.PROFESSIONAL,
      verbosity: personality?.verbosity || VerbosityLevel.CONCISE,
      formality: personality?.formality || FormalityLevel.NEUTRAL,
      approach: personality?.approach || ApproachStyle.PRAGMATIC,
      feedback: personality?.feedback || FeedbackStyle.CONSTRUCTIVE,
      communication: personality?.communication || CommunicationStyle.TECHNICAL,
      customTraits: personality?.customTraits || []
    };
  }

  private buildDefaultInstructions(instructions?: any): any {
    return {
      system: instructions?.system || 'You are a helpful AI coding assistant.',
      context: instructions?.context || '',
      constraints: instructions?.constraints || [],
      examples: instructions?.examples || [],
      specializations: instructions?.specializations || [],
      customPrompts: instructions?.customPrompts || []
    };
  }

  private buildDefaultMetadata(metadata?: any): any {
    return {
      version: metadata?.version || '1.0.0',
      tags: metadata?.tags || [],
      category: metadata?.category || AgentCategory.GENERAL,
      visibility: metadata?.visibility || 'private',
      author: metadata?.author || 'user',
      license: metadata?.license || 'MIT',
      repository: metadata?.repository,
      documentation: metadata?.documentation
    };
  }

  private buildDefaultSettings(settings?: any): any {
    return {
      temperature: settings?.temperature || 0.7,
      maxTokens: settings?.maxTokens || 2000,
      topP: settings?.topP || 1.0,
      frequencyPenalty: settings?.frequencyPenalty || 0,
      presencePenalty: settings?.presencePenalty || 0,
      responseFormat: settings?.responseFormat || ResponseFormat.MARKDOWN,
      streaming: settings?.streaming !== false,
      timeout: settings?.timeout || 60000,
      retries: settings?.retries || 3,
      fallbackModel: settings?.fallbackModel
    };
  }

  private buildDefaultPerformance(): any {
    return {
      totalRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      averageTokens: 0,
      totalCost: 0,
      ratings: [],
      feedback: [],
      lastEvaluated: null
    };
  }

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}