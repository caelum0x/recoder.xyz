/**
 * Real-time Collaboration System for Recoder.xyz
 * Supports multi-user AI-assisted development with live sync
 */

import { EventEmitter } from 'events';

interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  cursor?: {
    line: number;
    column: number;
    selection?: { start: number; end: number };
  };
  status: 'active' | 'idle' | 'away';
  lastActivity: number;
  color: string; // User highlight color
}

interface CodeChange {
  id: string;
  userId: string;
  timestamp: number;
  type: 'insert' | 'delete' | 'replace';
  position: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  content: string;
  metadata: {
    aiGenerated?: boolean;
    aiProvider?: string;
    aiModel?: string;
    confidence?: number;
  };
}

interface CollaborationSession {
  id: string;
  name: string;
  description: string;
  projectId: string;
  participants: CollaborationUser[];
  permissions: {
    canEdit: string[];
    canComment: string[];
    canInvite: string[];
    isPublic: boolean;
  };
  aiContext: {
    sharedHistory: any[];
    preferredModels: string[];
    collaborativePrompts: boolean;
  };
  createdAt: number;
  lastActivity: number;
}

/**
 * Real-time Collaboration Engine
 */
export class CollaborationEngine extends EventEmitter {
  private sessions = new Map<string, CollaborationSession>();
  private connections = new Map<string, WebSocket>();
  private changeHistory = new Map<string, CodeChange[]>();
  private cursorPositions = new Map<string, CollaborationUser['cursor']>();
  
  constructor() {
    super();
    this.setupHeartbeat();
  }

  /**
   * Create a new collaboration session
   */
  async createSession(
    userId: string,
    projectData: {
      name: string;
      description: string;
      projectId: string;
      isPublic?: boolean;
    }
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    
    const session: CollaborationSession = {
      id: sessionId,
      name: projectData.name,
      description: projectData.description,
      projectId: projectData.projectId,
      participants: [],
      permissions: {
        canEdit: [userId], // Creator can edit
        canComment: [userId],
        canInvite: [userId],
        isPublic: projectData.isPublic || false
      },
      aiContext: {
        sharedHistory: [],
        preferredModels: ['local-chat-model'],
        collaborativePrompts: true
      },
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    this.sessions.set(sessionId, session);
    this.changeHistory.set(sessionId, []);
    
    console.log(`🤝 Created collaboration session: ${sessionId}`);\n    
    return sessionId;
  }

  /**
   * Join an existing collaboration session
   */
  async joinSession(
    sessionId: string,
    user: Omit<CollaborationUser, 'color' | 'status' | 'lastActivity'>
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);\n    
    if (!session) {\n      console.warn(`Session ${sessionId} not found`);\n      return false;\n    }\n\n    // Check permissions\n    if (!session.permissions.isPublic && \n        !session.permissions.canEdit.includes(user.id) &&\n        !session.permissions.canComment.includes(user.id)) {\n      console.warn(`User ${user.id} not authorized for session ${sessionId}`);\n      return false;\n    }\n\n    // Add user to session\n    const collaborationUser: CollaborationUser = {\n      ...user,\n      status: 'active',\n      lastActivity: Date.now(),\n      color: this.generateUserColor(user.id)\n    };\n    \n    // Remove existing user if already in session\n    session.participants = session.participants.filter(p => p.id !== user.id);\n    session.participants.push(collaborationUser);\n    session.lastActivity = Date.now();\n    \n    // Notify other participants\n    this.broadcastToSession(sessionId, {\n      type: 'user_joined',\n      user: collaborationUser,\n      timestamp: Date.now()\n    });\n    \n    console.log(`👤 User ${user.name} joined session ${sessionId}`);\n    return true;\n  }\n\n  /**\n   * Leave a collaboration session\n   */\n  async leaveSession(sessionId: string, userId: string): Promise<void> {\n    const session = this.sessions.get(sessionId);\n    if (!session) return;\n    \n    // Remove user from participants\n    session.participants = session.participants.filter(p => p.id !== userId);\n    session.lastActivity = Date.now();\n    \n    // Clean up cursor position\n    this.cursorPositions.delete(`${sessionId}:${userId}`);\n    \n    // Notify other participants\n    this.broadcastToSession(sessionId, {\n      type: 'user_left',\n      userId,\n      timestamp: Date.now()\n    });\n    \n    // Clean up empty sessions\n    if (session.participants.length === 0) {\n      this.sessions.delete(sessionId);\n      this.changeHistory.delete(sessionId);\n      console.log(`🗑️ Cleaned up empty session ${sessionId}`);\n    }\n    \n    console.log(`👋 User ${userId} left session ${sessionId}`);\n  }\n\n  /**\n   * Apply a code change to the session\n   */\n  async applyChange(\n    sessionId: string,\n    userId: string,\n    change: Omit<CodeChange, 'id' | 'timestamp' | 'userId'>\n  ): Promise<boolean> {\n    const session = this.sessions.get(sessionId);\n    if (!session) return false;\n    \n    // Check edit permissions\n    if (!session.permissions.canEdit.includes(userId)) {\n      console.warn(`User ${userId} not authorized to edit session ${sessionId}`);\n      return false;\n    }\n    \n    const codeChange: CodeChange = {\n      id: this.generateChangeId(),\n      userId,\n      timestamp: Date.now(),\n      ...change\n    };\n    \n    // Store change in history\n    const history = this.changeHistory.get(sessionId) || [];\n    history.push(codeChange);\n    this.changeHistory.set(sessionId, history);\n    \n    // Update session activity\n    session.lastActivity = Date.now();\n    \n    // Broadcast change to all participants except sender\n    this.broadcastToSession(sessionId, {\n      type: 'code_change',\n      change: codeChange\n    }, userId);\n    \n    console.log(`📝 Applied change ${codeChange.id} in session ${sessionId}`);\n    return true;\n  }\n\n  /**\n   * Update user cursor position\n   */\n  updateCursor(\n    sessionId: string,\n    userId: string,\n    cursor: CollaborationUser['cursor']\n  ): void {\n    const session = this.sessions.get(sessionId);\n    if (!session) return;\n    \n    const user = session.participants.find(p => p.id === userId);\n    if (!user) return;\n    \n    user.cursor = cursor;\n    user.lastActivity = Date.now();\n    \n    // Broadcast cursor update\n    this.broadcastToSession(sessionId, {\n      type: 'cursor_update',\n      userId,\n      cursor\n    }, userId);\n  }\n\n  /**\n   * Share AI generation with the team\n   */\n  async shareAIGeneration(\n    sessionId: string,\n    userId: string,\n    generation: {\n      prompt: string;\n      response: string;\n      model: string;\n      provider: string;\n      position?: { line: number; column: number };\n    }\n  ): Promise<void> {\n    const session = this.sessions.get(sessionId);\n    if (!session) return;\n    \n    // Add to shared AI context\n    session.aiContext.sharedHistory.push({\n      userId,\n      timestamp: Date.now(),\n      ...generation\n    });\n    \n    // Broadcast AI generation to team\n    this.broadcastToSession(sessionId, {\n      type: 'ai_generation_shared',\n      userId,\n      generation,\n      timestamp: Date.now()\n    });\n    \n    console.log(`🤖 Shared AI generation in session ${sessionId}`);\n  }\n\n  /**\n   * Get session information\n   */\n  getSession(sessionId: string): CollaborationSession | null {\n    return this.sessions.get(sessionId) || null;\n  }\n\n  /**\n   * Get change history for a session\n   */\n  getChangeHistory(sessionId: string, fromTimestamp?: number): CodeChange[] {\n    const history = this.changeHistory.get(sessionId) || [];\n    if (!fromTimestamp) return history;\n    \n    return history.filter(change => change.timestamp > fromTimestamp);\n  }\n\n  /**\n   * Broadcast message to all session participants\n   */\n  private broadcastToSession(\n    sessionId: string,\n    message: any,\n    excludeUserId?: string\n  ): void {\n    const session = this.sessions.get(sessionId);\n    if (!session) return;\n    \n    session.participants.forEach(participant => {\n      if (excludeUserId && participant.id === excludeUserId) return;\n      \n      const connection = this.connections.get(participant.id);\n      if (connection && connection.readyState === WebSocket.OPEN) {\n        connection.send(JSON.stringify({\n          sessionId,\n          ...message\n        }));\n      }\n    });\n  }\n\n  /**\n   * Generate unique session ID\n   */\n  private generateSessionId(): string {\n    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;\n  }\n\n  /**\n   * Generate unique change ID\n   */\n  private generateChangeId(): string {\n    return `change_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;\n  }\n\n  /**\n   * Generate consistent user color based on user ID\n   */\n  private generateUserColor(userId: string): string {\n    const colors = [\n      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',\n      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43'\n    ];\n    \n    let hash = 0;\n    for (let i = 0; i < userId.length; i++) {\n      hash = userId.charCodeAt(i) + ((hash << 5) - hash);\n    }\n    \n    return colors[Math.abs(hash) % colors.length];\n  }\n\n  /**\n   * Setup heartbeat to clean up inactive sessions\n   */\n  private setupHeartbeat(): void {\n    setInterval(() => {\n      const now = Date.now();\n      const inactiveThreshold = 1000 * 60 * 30; // 30 minutes\n      \n      for (const [sessionId, session] of this.sessions.entries()) {\n        if (now - session.lastActivity > inactiveThreshold) {\n          console.log(`💤 Cleaning up inactive session ${sessionId}`);\n          this.sessions.delete(sessionId);\n          this.changeHistory.delete(sessionId);\n        }\n      }\n    }, 1000 * 60 * 5); // Check every 5 minutes\n  }\n\n  /**\n   * Register WebSocket connection for real-time updates\n   */\n  registerConnection(userId: string, ws: WebSocket): void {\n    this.connections.set(userId, ws);\n    \n    ws.on('close', () => {\n      this.connections.delete(userId);\n      // Leave all sessions for this user\n      for (const sessionId of this.sessions.keys()) {\n        this.leaveSession(sessionId, userId);\n      }\n    });\n  }\n\n  /**\n   * Get collaboration statistics\n   */\n  getStats() {\n    const totalSessions = this.sessions.size;\n    const totalParticipants = Array.from(this.sessions.values())\n      .reduce((sum, session) => sum + session.participants.length, 0);\n    const totalChanges = Array.from(this.changeHistory.values())\n      .reduce((sum, history) => sum + history.length, 0);\n    \n    return {\n      activeSessions: totalSessions,\n      totalParticipants,\n      totalChanges,\n      avgParticipantsPerSession: totalSessions > 0 ? totalParticipants / totalSessions : 0\n    };\n  }\n}\n\n// Singleton instance\nexport const collaborationEngine = new CollaborationEngine();\n\nexport default collaborationEngine;"