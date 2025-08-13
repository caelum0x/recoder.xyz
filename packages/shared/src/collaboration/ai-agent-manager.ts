/**
 * AI Agent Manager for Collaborative Sessions
 * KILLER FEATURE: Orchestrates multiple AI agents in real-time collaboration
 * Cursor has ZERO AI agents in collaboration - massive competitive advantage!
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { 
  AICollaborationAgent, 
  AIAgentCapability, 
  AIAgentPersonality, 
  AIAgentContext,
  AIAgentRequest,
  AIMessage
} from './ai-collaboration-agent';
import { CollaborationUser } from './websocket-server';
import { CodeOperation, CodeDocument } from './code-sync-engine';

export interface AIAgentConfig {
  name: string;
  personality: AIAgentPersonality;
  capabilities: AIAgentCapability[];
  priority: number; // 1-10, higher = more priority for responses
  enabled: boolean;
  maxSessionsPerAgent: number;
}

export interface AIAgentTeam {
  name: string;
  description: string;
  agents: string[]; // agent IDs
  specialization: string;
  maxConcurrentSessions: number;
}

export interface AISessionContext {
  sessionId: string;
  activeUsers: CollaborationUser[];
  activeAgents: Map<string, AICollaborationAgent>;
  currentDocument?: CodeDocument;
  recentOperations: CodeOperation[];
  conversationHistory: AIMessage[];
  projectContext: {
    language: string;
    framework?: string;
    dependencies: string[];
    codeStyle: string;
    complexity: 'simple' | 'moderate' | 'complex';
  };
  preferences: {
    aiAggressiveness: 'passive' | 'moderate' | 'active';
    reviewFrequency: 'on-demand' | 'frequent' | 'continuous';
    suggestionTypes: string[];
  };
}

export class AIAgentManager extends EventEmitter {
  private agents: Map<string, AICollaborationAgent> = new Map();
  private agentConfigs: Map<string, AIAgentConfig> = new Map();
  private sessionAgents: Map<string, Set<string>> = new Map(); // sessionId -> Set<agentId>
  private agentTeams: Map<string, AIAgentTeam> = new Map();
  private sessionContexts: Map<string, AISessionContext> = new Map();
  
  private requestQueue: Map<string, AIAgentRequest[]> = new Map(); // agentId -> requests
  private responseHistory: Map<string, AIMessage[]> = new Map(); // sessionId -> messages
  
  constructor() {
    super();
    this.initializeDefaultAgents();
    Logger.info('AI Agent Manager initialized');
  }

  // Initialize default AI agents with different personalities
  private initializeDefaultAgents(): void {
    // Claude - Code Review Specialist
    this.registerAgent({
      name: 'Claude Reviewer',
      personality: {
        name: 'Claude',
        style: 'expert',
        responsePattern: 'thoughtful',
        specialties: ['code-review', 'architecture', 'best-practices'],
        communicationStyle: 'Professional and thorough, provides detailed explanations with examples'
      },
      capabilities: [
        {
          name: 'Code Review',
          description: 'Comprehensive code analysis and improvement suggestions',
          triggers: ['review', 'check', 'analyze'],
          confidence: 0.95
        },
        {
          name: 'Architecture Guidance',
          description: 'Software architecture and design pattern recommendations',
          triggers: ['architecture', 'design', 'structure'],
          confidence: 0.9
        },
        {
          name: 'Best Practices',
          description: 'Industry standard best practices and conventions',
          triggers: ['best-practice', 'convention', 'standard'],
          confidence: 0.92
        }
      ],
      priority: 8,
      enabled: true,
      maxSessionsPerAgent: 3
    });

    // GPT - Quick Helper
    this.registerAgent({
      name: 'GPT Assistant',
      personality: {
        name: 'GPT',
        style: 'helpful',
        responsePattern: 'immediate',
        specialties: ['quick-help', 'explanations', 'problem-solving'],
        communicationStyle: 'Friendly and approachable, provides quick solutions and explanations'
      },
      capabilities: [
        {
          name: 'Quick Help',
          description: 'Immediate assistance with coding problems',
          triggers: ['help', 'how-to', 'explain'],
          confidence: 0.85
        },
        {
          name: 'Code Completion',
          description: 'Smart code completion and suggestions',
          triggers: ['complete', 'finish', 'suggest'],
          confidence: 0.8
        },
        {
          name: 'Debug Assistant',
          description: 'Debugging help and error resolution',
          triggers: ['debug', 'error', 'bug', 'fix'],
          confidence: 0.88
        }
      ],
      priority: 6,
      enabled: true,
      maxSessionsPerAgent: 5
    });

    // DeepSeek - Performance Optimizer
    this.registerAgent({
      name: 'DeepSeek Optimizer',
      personality: {
        name: 'DeepSeek',
        style: 'optimizer',
        responsePattern: 'detailed',
        specialties: ['performance', 'optimization', 'efficiency'],
        communicationStyle: 'Technical and precise, focuses on performance metrics and optimizations'
      },
      capabilities: [
        {
          name: 'Performance Analysis',
          description: 'Code performance analysis and optimization suggestions',
          triggers: ['performance', 'optimize', 'speed', 'efficiency'],
          confidence: 0.93
        },
        {
          name: 'Memory Optimization',
          description: 'Memory usage analysis and optimization',
          triggers: ['memory', 'leak', 'allocation'],
          confidence: 0.9
        },
        {
          name: 'Algorithm Improvement',
          description: 'Algorithm complexity analysis and improvements',
          triggers: ['algorithm', 'complexity', 'big-o'],
          confidence: 0.95
        }
      ],
      priority: 7,
      enabled: true,
      maxSessionsPerAgent: 2
    });

    // Security Sentinel
    this.registerAgent({
      name: 'Security Sentinel',
      personality: {
        name: 'Sentinel',
        style: 'reviewer',
        responsePattern: 'thoughtful',
        specialties: ['security', 'vulnerabilities', 'compliance'],
        communicationStyle: 'Cautious and security-focused, provides detailed security analysis'
      },
      capabilities: [
        {
          name: 'Security Analysis',
          description: 'Comprehensive security vulnerability assessment',
          triggers: ['security', 'vulnerability', 'exploit'],
          confidence: 0.94
        },
        {
          name: 'Compliance Check',
          description: 'Code compliance with security standards',
          triggers: ['compliance', 'gdpr', 'hipaa', 'pci'],
          confidence: 0.91
        },
        {
          name: 'Threat Detection',
          description: 'Potential security threat identification',
          triggers: ['threat', 'attack', 'injection'],
          confidence: 0.89
        }
      ],
      priority: 9,
      enabled: true,
      maxSessionsPerAgent: 2
    });

    // Create default teams
    this.createAgentTeam({
      name: 'Full Stack Team',
      description: 'Complete development support with all aspects covered',
      agents: ['Claude Reviewer', 'GPT Assistant', 'DeepSeek Optimizer'],
      specialization: 'full-stack-development',
      maxConcurrentSessions: 3
    });

    this.createAgentTeam({
      name: 'Security Team',
      description: 'Security-focused development with compliance checks',
      agents: ['Claude Reviewer', 'Security Sentinel'],
      specialization: 'secure-development',
      maxConcurrentSessions: 2
    });
  }

  // Register a new AI agent
  registerAgent(config: AIAgentConfig): AICollaborationAgent {
    const agent = new AICollaborationAgent({
      name: config.name,
      personality: config.personality,
      capabilities: config.capabilities,
      responseDelay: this.getResponseDelayFromPersonality(config.personality),
      maxConcurrentRequests: 3
    });

    this.agents.set(agent.id, agent);
    this.agentConfigs.set(agent.id, config);
    this.requestQueue.set(agent.id, []);

    // Setup agent event handlers
    this.setupAgentEventHandlers(agent);

    this.emit('agent-registered', { agent, config });
    Logger.info(`AI Agent registered: ${config.name} (${agent.id})`);

    return agent;
  }

  // Add agents to a collaboration session
  async addAgentsToSession(sessionId: string, agentNames: string[], context: AISessionContext): Promise<void> {
    this.sessionContexts.set(sessionId, context);
    
    if (!this.sessionAgents.has(sessionId)) {
      this.sessionAgents.set(sessionId, new Set());
    }

    const sessionAgentSet = this.sessionAgents.get(sessionId)!;
    const addedAgents: AICollaborationAgent[] = [];

    for (const agentName of agentNames) {
      const agent = this.findAgentByName(agentName);
      if (agent && !sessionAgentSet.has(agent.id)) {
        const config = this.agentConfigs.get(agent.id);
        if (config?.enabled) {
          await agent.joinSession(sessionId, this.buildAgentContext(sessionId));
          sessionAgentSet.add(agent.id);
          context.activeAgents.set(agent.id, agent);
          addedAgents.push(agent);
        }
      }
    }

    if (addedAgents.length > 0) {
      this.emit('agents-added-to-session', { sessionId, agents: addedAgents });
      Logger.info(`Added ${addedAgents.length} AI agents to session ${sessionId}`);
    }
  }

  // Add an entire team to a session
  async addTeamToSession(sessionId: string, teamName: string, context: AISessionContext): Promise<void> {
    const team = this.agentTeams.get(teamName);
    if (!team) {
      throw new Error(`Agent team not found: ${teamName}`);
    }

    await this.addAgentsToSession(sessionId, team.agents, context);
    
    this.emit('team-added-to-session', { sessionId, teamName, agentCount: team.agents.length });
    Logger.info(`Added team "${teamName}" to session ${sessionId}`);
  }

  // Remove agents from session
  async removeAgentsFromSession(sessionId: string, agentNames: string[]): Promise<void> {
    const sessionAgentSet = this.sessionAgents.get(sessionId);
    if (!sessionAgentSet) return;

    const removedAgents: AICollaborationAgent[] = [];

    for (const agentName of agentNames) {
      const agent = this.findAgentByName(agentName);
      if (agent && sessionAgentSet.has(agent.id)) {
        await agent.leaveSession(sessionId);
        sessionAgentSet.delete(agent.id);
        
        const context = this.sessionContexts.get(sessionId);
        if (context) {
          context.activeAgents.delete(agent.id);
        }
        
        removedAgents.push(agent);
      }
    }

    // Clean up empty session
    if (sessionAgentSet.size === 0) {
      this.sessionAgents.delete(sessionId);
      this.sessionContexts.delete(sessionId);
    }

    if (removedAgents.length > 0) {
      this.emit('agents-removed-from-session', { sessionId, agents: removedAgents });
      Logger.info(`Removed ${removedAgents.length} AI agents from session ${sessionId}`);
    }
  }

  // Process code change and notify relevant agents
  async processCodeChange(sessionId: string, operation: CodeOperation): Promise<void> {
    const context = this.sessionContexts.get(sessionId);
    if (!context) return;

    // Update context with new operation
    context.recentOperations.push(operation);
    if (context.recentOperations.length > 50) {
      context.recentOperations = context.recentOperations.slice(-50); // Keep last 50 operations
    }

    // Find agents that should react to this change
    const sessionAgentSet = this.sessionAgents.get(sessionId);
    if (!sessionAgentSet) return;

    const relevantAgents = this.findRelevantAgentsForOperation(operation, sessionAgentSet);
    
    // Notify relevant agents in order of priority
    const sortedAgents = relevantAgents.sort((a, b) => {
      const configA = this.agentConfigs.get(a.id);
      const configB = this.agentConfigs.get(b.id);
      return (configB?.priority || 0) - (configA?.priority || 0);
    });

    for (const agent of sortedAgents) {
      try {
        await agent.reactToCodeChange(operation, this.buildAgentContext(sessionId));
      } catch (error) {
        Logger.error(`Agent ${agent.name} failed to process code change:`, error);
      }
    }
  }

  // Process user message and route to appropriate agents
  async processUserMessage(sessionId: string, userId: string, message: string): Promise<void> {
    const context = this.sessionContexts.get(sessionId);
    if (!context) return;

    const sessionAgentSet = this.sessionAgents.get(sessionId);
    if (!sessionAgentSet) return;

    // Find agents that should respond to this message
    const relevantAgents = this.findRelevantAgentsForMessage(message, sessionAgentSet);

    for (const agent of relevantAgents) {
      try {
        await agent.reactToUserMessage(userId, message, this.buildAgentContext(sessionId));
      } catch (error) {
        Logger.error(`Agent ${agent.name} failed to process user message:`, error);
      }
    }
  }

  // Submit explicit request to specific agent
  async submitAgentRequest(sessionId: string, agentName: string, request: AIAgentRequest): Promise<void> {
    const agent = this.findAgentByName(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const sessionAgentSet = this.sessionAgents.get(sessionId);
    if (!sessionAgentSet?.has(agent.id)) {
      throw new Error(`Agent ${agentName} is not in session ${sessionId}`);
    }

    try {
      const response = await agent.processRequest(request);
      this.emit('agent-request-processed', { sessionId, agentName, request, response });
    } catch (error) {
      Logger.error(`Agent request failed for ${agentName}:`, error);
      throw error;
    }
  }

  // Create agent team
  createAgentTeam(team: AIAgentTeam): void {
    // Validate that all agents exist
    for (const agentName of team.agents) {
      if (!this.findAgentByName(agentName)) {
        throw new Error(`Agent not found for team: ${agentName}`);
      }
    }

    this.agentTeams.set(team.name, team);
    this.emit('team-created', team);
    Logger.info(`AI Agent team created: ${team.name} with ${team.agents.length} agents`);
  }

  // Helper methods
  private findAgentByName(name: string): AICollaborationAgent | undefined {
    for (const [_, agent] of this.agents) {
      if (agent.name === name) {
        return agent;
      }
    }
    return undefined;
  }

  private findRelevantAgentsForOperation(operation: CodeOperation, sessionAgents: Set<string>): AICollaborationAgent[] {
    const relevantAgents: AICollaborationAgent[] = [];

    for (const agentId of sessionAgents) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      // Check if any agent capability is triggered by this operation
      const hasRelevantCapability = agent.capabilities.some(capability => {
        if (operation.type === 'insert' && capability.triggers.includes('code-insertion')) return true;
        if (operation.content?.includes('TODO') && capability.triggers.includes('todo')) return true;
        if (operation.content?.includes('security') && capability.triggers.includes('security')) return true;
        return false;
      });

      if (hasRelevantCapability) {
        relevantAgents.push(agent);
      }
    }

    return relevantAgents;
  }

  private findRelevantAgentsForMessage(message: string, sessionAgents: Set<string>): AICollaborationAgent[] {
    const relevantAgents: AICollaborationAgent[] = [];

    for (const agentId of sessionAgents) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      // Check if message mentions the agent or contains relevant keywords
      const isRelevant = agent.capabilities.some(capability => 
        capability.triggers.some(trigger => 
          message.toLowerCase().includes(trigger.toLowerCase())
        )
      ) || message.toLowerCase().includes(agent.name.toLowerCase());

      if (isRelevant) {
        relevantAgents.push(agent);
      }
    }

    return relevantAgents;
  }

  private buildAgentContext(sessionId: string): AIAgentContext {
    const context = this.sessionContexts.get(sessionId);
    if (!context) {
      throw new Error(`Session context not found: ${sessionId}`);
    }

    return {
      sessionId,
      activeUsers: context.activeUsers,
      currentDocument: context.currentDocument,
      recentOperations: context.recentOperations.slice(-10), // Last 10 operations
      conversationHistory: context.conversationHistory.slice(-20), // Last 20 messages
      projectContext: context.projectContext
    };
  }

  private getResponseDelayFromPersonality(personality: AIAgentPersonality): number {
    const baseDelays = {
      'immediate': 500,
      'thoughtful': 2000,
      'detailed': 3000,
      'concise': 800
    };
    return baseDelays[personality.responsePattern] || 1500;
  }

  private setupAgentEventHandlers(agent: AICollaborationAgent): void {
    agent.on('message-sent', (data) => {
      this.emit('agent-message', { 
        agentId: agent.id, 
        agentName: agent.name, 
        ...data 
      });
    });

    agent.on('session-joined', (data) => {
      this.emit('agent-joined-session', { 
        agentId: agent.id, 
        agentName: agent.name, 
        ...data 
      });
    });

    agent.on('session-left', (data) => {
      this.emit('agent-left-session', { 
        agentId: agent.id, 
        agentName: agent.name, 
        ...data 
      });
    });
  }

  // Public API methods
  getAvailableAgents(): Array<{ name: string; id: string; capabilities: string[]; enabled: boolean }> {
    return Array.from(this.agents.values()).map(agent => ({
      name: agent.name,
      id: agent.id,
      capabilities: agent.capabilities.map(c => c.name),
      enabled: this.agentConfigs.get(agent.id)?.enabled || false
    }));
  }

  getAvailableTeams(): AIAgentTeam[] {
    return Array.from(this.agentTeams.values());
  }

  getSessionAgents(sessionId: string): AICollaborationAgent[] {
    const sessionAgentSet = this.sessionAgents.get(sessionId);
    if (!sessionAgentSet) return [];

    return Array.from(sessionAgentSet)
      .map(agentId => this.agents.get(agentId))
      .filter(agent => agent !== undefined) as AICollaborationAgent[];
  }

  getAgentStatus(agentId: string) {
    const agent = this.agents.get(agentId);
    return agent?.getStatus();
  }

  updateAgentConfig(agentId: string, updates: Partial<AIAgentConfig>): void {
    const config = this.agentConfigs.get(agentId);
    if (config) {
      Object.assign(config, updates);
      this.agentConfigs.set(agentId, config);
      this.emit('agent-config-updated', { agentId, config });
    }
  }

  // Shutdown all agents
  async shutdown(): Promise<void> {
    Logger.info('Shutting down AI Agent Manager...');

    const shutdownPromises = Array.from(this.agents.values()).map(agent => agent.shutdown());
    await Promise.all(shutdownPromises);

    this.agents.clear();
    this.agentConfigs.clear();
    this.sessionAgents.clear();
    this.agentTeams.clear();
    this.sessionContexts.clear();
    this.requestQueue.clear();
    this.responseHistory.clear();

    Logger.info('AI Agent Manager shut down');
  }
}

// Types are already exported as interfaces above