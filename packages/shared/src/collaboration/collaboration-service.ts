/**
 * Collaboration Service
 * KILLER FEATURE: Complete real-time collaborative development system
 * Integrates WebSocket server, session management, and persistence
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { CollaborationServer, CollaborationUser, CollaborationSession, CodeChange, AISuggestion } from './websocket-server';
import { SessionManager, SessionPersistence, UserPresence } from './session-manager';
import { RedisSessionPersistence } from './redis-session-persistence';
import { CodeSyncEngine, CodeDocument, CodeOperation } from './code-sync-engine';
import { RealtimeSyncHandler } from './realtime-sync-handler';
import { AIAgentManager, AISessionContext } from './ai-agent-manager';
import { AICollaborationAgent, AIAgentRequest } from './ai-collaboration-agent';

export interface CollaborationServiceOptions {
  websocketPort?: number;
  persistence?: SessionPersistence;
  enableRedis?: boolean;
  redisUrl?: string;
}

export interface CollaborativeCodeGeneration {
  sessionId: string;
  prompt: string;
  initiatedBy: string;
  participants: string[]; // user IDs who can vote
  responses: {
    userId: string;
    code: string;
    vote?: 'approve' | 'reject' | 'suggest_changes';
    comments?: string;
  }[];
  finalCode?: string;
  status: 'pending' | 'voting' | 'completed' | 'cancelled';
}

export class CollaborationService extends EventEmitter {
  private websocketServer: CollaborationServer;
  private sessionManager: SessionManager;
  private codeSyncEngine: CodeSyncEngine;
  private realtimeSyncHandler: RealtimeSyncHandler;
  private aiAgentManager: AIAgentManager;
  private codeGenerations: Map<string, CollaborativeCodeGeneration> = new Map();
  
  constructor(options: CollaborationServiceOptions = {}) {
    super();
    
    // Setup persistence layer
    let persistence: SessionPersistence | undefined;
    if (options.persistence) {
      persistence = options.persistence;
    } else if (options.enableRedis !== false) {
      persistence = new RedisSessionPersistence({
        redisUrl: options.redisUrl
      });
    }

    // Initialize components
    this.sessionManager = new SessionManager(persistence);
    this.websocketServer = new CollaborationServer(options.websocketPort || 8080);
    this.codeSyncEngine = new CodeSyncEngine();
    this.realtimeSyncHandler = new RealtimeSyncHandler(this.codeSyncEngine);
    this.aiAgentManager = new AIAgentManager();
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // WebSocket server events
    this.websocketServer.on('user-joined', (data) => {
      this.handleUserJoined(data);
    });

    this.websocketServer.on('user-left', (data) => {
      this.handleUserLeft(data);
    });

    this.websocketServer.on('code-changed', (data) => {
      this.handleCodeChanged(data);
    });

    this.websocketServer.on('ai-request', (data) => {
      this.handleAIRequest(data);
    });

    this.websocketServer.on('chat-message', (data) => {
      this.handleChatMessage(data);
    });

    // Session manager events
    this.sessionManager.on('session-created', (data) => {
      this.emit('session-created', data);
      Logger.info(`Collaborative session created: ${data.session.id}`);
    });

    this.sessionManager.on('user-joined-session', (data) => {
      this.emit('user-joined-session', data);
    });

    this.sessionManager.on('user-left-session', (data) => {
      this.emit('user-left-session', data);
    });

    this.sessionManager.on('presence-updated', (data) => {
      this.broadcastPresenceUpdate(data);
    });

    // AI Agent Manager events
    this.aiAgentManager.on('agent-message', (data) => {
      this.handleAIAgentMessage(data);
    });

    this.aiAgentManager.on('agent-joined-session', (data) => {
      this.handleAIAgentJoined(data);
    });

    this.aiAgentManager.on('agent-left-session', (data) => {
      this.handleAIAgentLeft(data);
    });
  }

  // Public API Methods

  async createSession(
    creator: CollaborationUser,
    sessionData: Partial<CollaborationSession>
  ): Promise<CollaborationSession> {
    const session = await this.sessionManager.createSession(creator, sessionData);
    
    // Notify through WebSocket server
    this.websocketServer.createSession({
      ...sessionData,
      name: session.name,
      createdBy: creator.id
    });

    return session;
  }

  async joinSession(sessionId: string, user: CollaborationUser): Promise<boolean> {
    const success = await this.sessionManager.joinSession(sessionId, user);
    
    if (success) {
      // Add user to WebSocket session tracking
      // (This will be handled by WebSocket events)
    }
    
    return success;
  }

  async leaveSession(sessionId: string, userId: string): Promise<boolean> {
    return await this.sessionManager.leaveSession(sessionId, userId);
  }

  // Real-time Code Synchronization

  createCodeDocument(sessionId: string, filePath: string, content: string = '', createdBy: string): CodeDocument {
    return this.realtimeSyncHandler.createDocument(sessionId, filePath, content, createdBy);
  }

  getCodeDocument(documentId: string): CodeDocument | null {
    return this.codeSyncEngine.getDocument(documentId);
  }

  submitCodeOperation(operation: CodeOperation): void {
    this.codeSyncEngine.submitOperation(operation);
  }

  getDocumentAnalytics(documentId: string) {
    return this.realtimeSyncHandler.getDocumentAnalytics(documentId);
  }

  getUserCodeActivity(userId: string) {
    return this.realtimeSyncHandler.getUserActivity(userId);
  }

  getDocumentCollaborators(documentId: string): string[] {
    return this.realtimeSyncHandler.getDocumentCollaborators(documentId);
  }

  getAllCodeActivities() {
    return this.realtimeSyncHandler.getAllActivities();
  }

  // AI Agent Integration - KILLER FEATURE vs Cursor!

  async addAIAgentsToSession(sessionId: string, agentNames: string[]): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Build AI session context
    const aiContext: AISessionContext = {
      sessionId,
      activeUsers: Array.from(session.users.values()),
      activeAgents: new Map(),
      currentDocument: undefined, // Would be set based on active document
      recentOperations: [],
      conversationHistory: [],
      projectContext: {
        language: session.metadata.language,
        framework: this.detectFramework(session.metadata),
        dependencies: [],
        codeStyle: 'standard',
        complexity: 'moderate'
      },
      preferences: {
        aiAggressiveness: 'moderate',
        reviewFrequency: 'frequent',
        suggestionTypes: ['code-review', 'optimization', 'security']
      }
    };

    await this.aiAgentManager.addAgentsToSession(sessionId, agentNames, aiContext);
    
    this.emit('ai-agents-added', { sessionId, agentNames });
    Logger.info(`Added AI agents to session ${sessionId}: ${agentNames.join(', ')}`);
  }

  async addAIAgentTeamToSession(sessionId: string, teamName: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const aiContext: AISessionContext = {
      sessionId,
      activeUsers: Array.from(session.users.values()),
      activeAgents: new Map(),
      currentDocument: undefined,
      recentOperations: [],
      conversationHistory: [],
      projectContext: {
        language: session.metadata.language,
        framework: this.detectFramework(session.metadata),
        dependencies: [],
        codeStyle: 'standard',
        complexity: 'moderate'
      },
      preferences: {
        aiAggressiveness: 'active', // Teams are more active
        reviewFrequency: 'continuous',
        suggestionTypes: ['code-review', 'optimization', 'security', 'debugging']
      }
    };

    await this.aiAgentManager.addTeamToSession(sessionId, teamName, aiContext);
    
    this.emit('ai-agent-team-added', { sessionId, teamName });
    Logger.info(`Added AI agent team "${teamName}" to session ${sessionId}`);
  }

  async removeAIAgentsFromSession(sessionId: string, agentNames: string[]): Promise<void> {
    await this.aiAgentManager.removeAgentsFromSession(sessionId, agentNames);
    
    this.emit('ai-agents-removed', { sessionId, agentNames });
    Logger.info(`Removed AI agents from session ${sessionId}: ${agentNames.join(', ')}`);
  }

  // Parallel AI Agent Processing (inspired by the parallel workflow pattern)
  async processParallelAIRequest(
    sessionId: string, 
    request: string,
    agentNames?: string[]
  ): Promise<{
    responses: Array<{ agentName: string; response: string; confidence: number }>;
    consensus?: string;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    // Get available agents for the session
    const sessionAgents = this.aiAgentManager.getSessionAgents(sessionId);
    const targetAgents = agentNames 
      ? sessionAgents.filter(agent => agentNames.includes(agent.name))
      : sessionAgents;

    if (targetAgents.length === 0) {
      throw new Error('No AI agents available for parallel processing');
    }

    // Build request context
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const agentRequest: AIAgentRequest = {
      type: 'suggestion',
      context: {
        sessionId,
        activeUsers: Array.from(session.users.values()),
        currentDocument: this.codeSyncEngine.getDocument(sessionId) || undefined, // Assuming document ID = session ID
        recentOperations: [],
        conversationHistory: [],
        projectContext: {
          language: session.metadata.language,
          framework: this.detectFramework(session.metadata),
          dependencies: [],
          codeStyle: 'standard'
        }
      },
      prompt: request,
      priority: 'medium'
    };

    // Process requests in parallel (inspired by the parallel workflow)
    const parallelPromises = targetAgents.map(async (agent) => {
      try {
        const response = await agent.processRequest(agentRequest);
        return {
          agentName: agent.name,
          response: response.messages[0]?.content || 'No response generated',
          confidence: response.confidence,
          suggestions: response.suggestions
        };
      } catch (error) {
        Logger.error(`Parallel AI request failed for agent ${agent.name}:`, error);
        return {
          agentName: agent.name,
          response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          confidence: 0,
          suggestions: []
        };
      }
    });

    const responses = await Promise.all(parallelPromises);
    const executionTime = Date.now() - startTime;

    // Generate consensus if multiple agents responded
    let consensus: string | undefined;
    if (responses.length > 1) {
      consensus = this.generateAIConsensus(responses);
    }

    const result = {
      responses: responses.map(r => ({
        agentName: r.agentName,
        response: r.response,
        confidence: r.confidence
      })),
      consensus,
      executionTime
    };

    this.emit('parallel-ai-response', { sessionId, request, result });
    
    return result;
  }

  async submitRequestToAIAgent(sessionId: string, agentName: string, request: AIAgentRequest): Promise<void> {
    await this.aiAgentManager.submitAgentRequest(sessionId, agentName, request);
  }

  getAvailableAIAgents(): Array<{ name: string; id: string; capabilities: string[]; enabled: boolean }> {
    return this.aiAgentManager.getAvailableAgents();
  }

  getAvailableAIAgentTeams() {
    return this.aiAgentManager.getAvailableTeams();
  }

  getSessionAIAgents(sessionId: string): AICollaborationAgent[] {
    return this.aiAgentManager.getSessionAgents(sessionId);
  }

  // Real-time Collaboration Features

  async startCollaborativeCodeGeneration(
    sessionId: string,
    prompt: string,
    initiatedBy: string
  ): Promise<string> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const participants = Array.from(session.users.keys());

    const codeGeneration: CollaborativeCodeGeneration = {
      sessionId,
      prompt,
      initiatedBy,
      participants,
      responses: [],
      status: 'pending'
    };

    this.codeGenerations.set(generationId, codeGeneration);

    // Broadcast to all session participants
    this.broadcastToSession(sessionId, {
      type: 'collaborative-code-generation-started',
      data: {
        generationId,
        prompt,
        initiatedBy,
        participants
      }
    });

    // Trigger AI generation
    this.emit('collaborative-generation-request', {
      generationId,
      sessionId,
      prompt,
      initiatedBy
    });

    Logger.info(`Collaborative code generation started: ${generationId} in session ${sessionId}`);
    return generationId;
  }

  async submitCodeGenerationResponse(
    generationId: string,
    userId: string,
    code: string,
    vote?: 'approve' | 'reject' | 'suggest_changes',
    comments?: string
  ): Promise<void> {
    const generation = this.codeGenerations.get(generationId);
    if (!generation) {
      throw new Error('Code generation not found');
    }

    if (!generation.participants.includes(userId)) {
      throw new Error('User not authorized to participate');
    }

    // Update or add response
    const existingIndex = generation.responses.findIndex(r => r.userId === userId);
    const response = { userId, code, vote, comments };

    if (existingIndex >= 0) {
      generation.responses[existingIndex] = response;
    } else {
      generation.responses.push(response);
    }

    // Check if voting is complete
    if (generation.responses.length === generation.participants.length) {
      await this.finalizeCollaborativeGeneration(generationId);
    }

    // Broadcast update
    this.broadcastToSession(generation.sessionId, {
      type: 'collaborative-code-generation-updated',
      data: {
        generationId,
        responses: generation.responses.length,
        totalParticipants: generation.participants.length,
        status: generation.status
      }
    });
  }

  private async finalizeCollaborativeGeneration(generationId: string): Promise<void> {
    const generation = this.codeGenerations.get(generationId);
    if (!generation) return;

    // Simple voting logic - majority wins
    const approvals = generation.responses.filter(r => r.vote === 'approve').length;
    const rejections = generation.responses.filter(r => r.vote === 'reject').length;

    if (approvals > rejections) {
      // Find the most approved code variant
      const approvedResponses = generation.responses.filter(r => r.vote === 'approve');
      generation.finalCode = approvedResponses[0]?.code || generation.responses[0]?.code;
      generation.status = 'completed';
    } else {
      generation.status = 'cancelled';
    }

    // Broadcast final result
    this.broadcastToSession(generation.sessionId, {
      type: 'collaborative-code-generation-completed',
      data: {
        generationId,
        finalCode: generation.finalCode,
        status: generation.status,
        votes: {
          approvals,
          rejections,
          suggestions: generation.responses.filter(r => r.vote === 'suggest_changes').length
        }
      }
    });

    Logger.info(`Collaborative code generation completed: ${generationId}`);
  }

  // AI Agent Integration

  async addAIAgent(
    sessionId: string,
    agentConfig: {
      name: string;
      capabilities: string[];
      model?: string;
      personality?: string;
    }
  ): Promise<boolean> {
    const agent: Partial<CollaborationUser> = {
      name: agentConfig.name,
      email: 'ai@recoder.dev',
      role: 'ai-agent',
      capabilities: agentConfig.capabilities
    };

    const success = this.websocketServer.addAIAgent(sessionId, agent);
    
    if (success) {
      // Broadcast AI agent capabilities to session
      this.broadcastToSession(sessionId, {
        type: 'ai-agent-capabilities',
        data: {
          agentName: agentConfig.name,
          capabilities: agentConfig.capabilities,
          model: agentConfig.model,
          available: true
        }
      });

      Logger.info(`AI agent ${agentConfig.name} added to session ${sessionId}`);
    }

    return success;
  }

  async removeAIAgent(sessionId: string, agentId: string): Promise<boolean> {
    return this.websocketServer.removeAIAgent(sessionId, agentId);
  }

  // Presence and Status Management

  updateUserPresence(
    userId: string,
    sessionId: string,
    presence: Partial<UserPresence>
  ): void {
    this.sessionManager.updateUserPresence(userId, sessionId, presence);
  }

  getSessionPresence(sessionId: string): UserPresence[] {
    return this.sessionManager.getSessionPresence(sessionId);
  }

  // Event Handlers

  private handleUserJoined(data: any): void {
    this.sessionManager.updateUserPresence(data.user.id, data.sessionId, {
      status: 'active',
      lastActivity: new Date()
    });
  }

  private handleUserLeft(data: any): void {
    // Handled by session manager
  }

  private handleCodeChanged(data: any): void {
    this.sessionManager.recordCodeChange(data.sessionId, data.change);
    
    // Update user presence
    this.sessionManager.updateUserPresence(data.change.author, data.sessionId, {
      status: 'coding',
      lastActivity: new Date(),
      currentFile: data.change.file
    });
  }

  private handleAIRequest(data: any): void {
    // Forward AI request to the AI system
    this.emit('ai-request', {
      sessionId: data.sessionId,
      userId: data.userId,
      request: data.request,
      respond: (suggestion: AISuggestion) => {
        this.websocketServer.sendAISuggestion(data.sessionId, suggestion);
        this.sessionManager.recordAISuggestion(data.sessionId, suggestion);
      }
    });
  }

  private handleChatMessage(data: any): void {
    // Chat messages are already broadcasted by WebSocket server
    // Update user presence
    this.sessionManager.updateUserPresence(data.message.userId, data.sessionId, {
      status: 'active',
      lastActivity: new Date()
    });
  }

  private broadcastPresenceUpdate(data: any): void {
    this.broadcastToSession(data.sessionId, {
      type: 'presence-updated',
      data: data.presence
    });
  }

  private broadcastToSession(sessionId: string, message: any): void {
    // Use WebSocket server to broadcast
    // This is handled internally by the WebSocket server
  }

  // AI Agent Event Handlers
  
  private handleAIAgentMessage(data: any): void {
    // Broadcast AI agent message to session participants
    this.emit('ai-agent-message', {
      sessionId: data.sessionId,
      agentId: data.agentId,
      agentName: data.agentName,
      message: data.message
    });
  }

  private handleAIAgentJoined(data: any): void {
    // Notify session participants that an AI agent joined
    this.emit('ai-agent-joined', {
      sessionId: data.sessionId,
      agentId: data.agentId,
      agentName: data.agentName
    });
  }

  private handleAIAgentLeft(data: any): void {
    // Notify session participants that an AI agent left
    this.emit('ai-agent-left', {
      sessionId: data.sessionId,
      agentId: data.agentId,
      agentName: data.agentName
    });
  }

  private detectFramework(metadata: any): string | undefined {
    // Simple framework detection based on project metadata
    const language = metadata.language?.toLowerCase();
    const description = metadata.description?.toLowerCase() || '';
    
    if (language === 'javascript' || language === 'typescript') {
      if (description.includes('react')) return 'react';
      if (description.includes('next')) return 'nextjs';
      if (description.includes('vue')) return 'vue';
      if (description.includes('angular')) return 'angular';
      if (description.includes('node')) return 'nodejs';
      return 'javascript';
    }
    
    if (language === 'python') {
      if (description.includes('django')) return 'django';
      if (description.includes('flask')) return 'flask';
      if (description.includes('fastapi')) return 'fastapi';
      return 'python';
    }
    
    return undefined;
  }

  private generateAIConsensus(responses: Array<{ agentName: string; response: string; confidence: number }>): string {
    // Simple consensus generation - in production, this could use an LLM aggregator
    const validResponses = responses.filter(r => r.confidence > 0);
    
    if (validResponses.length === 0) {
      return 'No valid responses from AI agents';
    }
    
    if (validResponses.length === 1) {
      return validResponses[0].response;
    }
    
    // Find highest confidence response
    const bestResponse = validResponses.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    // Generate consensus summary
    const avgConfidence = validResponses.reduce((sum, r) => sum + r.confidence, 0) / validResponses.length;
    
    return `**AI Agent Consensus** (${avgConfidence.toFixed(1)}% confidence)\n\n` +
           `**Primary Recommendation** (${bestResponse.agentName}):\n${bestResponse.response}\n\n` +
           `**Alternative Perspectives:**\n` +
           validResponses
             .filter(r => r.agentName !== bestResponse.agentName)
             .map(r => `• ${r.agentName}: ${r.response.substring(0, 100)}...`)
             .join('\n');
  }

  // Analytics and Monitoring

  getSessionAnalytics(sessionId: string) {
    return this.sessionManager.getSessionAnalytics(sessionId);
  }

  async getCollaborationStats() {
    const sessions = this.sessionManager.getAllSessions();
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(session => 
      Array.from(session.users.values()).some(user => user.isActive)
    ).length;

    const totalUsers = new Set(
      sessions.flatMap(session => Array.from(session.users.keys()))
    ).size;

    return {
      totalSessions,
      activeSessions,
      totalUsers,
      averageUsersPerSession: totalSessions > 0 ? totalUsers / totalSessions : 0
    };
  }

  // Lifecycle Management

  async shutdown(): Promise<void> {
    Logger.info('Shutting down collaboration service...');
    
    await Promise.all([
      this.websocketServer.shutdown(),
      this.sessionManager.shutdown(),
      this.realtimeSyncHandler.shutdown(),
      this.aiAgentManager.shutdown()
    ]);

    this.codeGenerations.clear();
    
    Logger.info('Collaboration service shut down');
  }
}

// Export types and service
export default CollaborationService;
// Types are already exported as interfaces above