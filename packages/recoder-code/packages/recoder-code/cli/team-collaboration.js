#!/usr/bin/env node

/**
 * Team Collaboration Manager for Recoder Code
 * Handles shared sessions, team workspaces, and collaborative features
 */

const fs = require('fs').promises;
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;;
const crypto = require('crypto');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TeamCollaborationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseDir = options.baseDir || process.cwd();
    this.collaborationDir = path.join(this.baseDir, '.recoder', 'collaboration');
    this.sessionsDir = path.join(this.collaborationDir, 'shared-sessions');
    this.workspacesDir = path.join(this.collaborationDir, 'team-workspaces');
    this.config = options.config || {};
    this.userId = options.userId || this.generateUserId();
    this.userName = options.userName || 'Anonymous';
    this.sessions = new Map();
    this.workspaces = new Map();
    this.connections = new Map();
    this.wsServer = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.collaborationDir, { recursive: true });
      await fs.mkdir(this.sessionsDir, { recursive: true });
      await fs.mkdir(this.workspacesDir, { recursive: true });
      
      await this.loadExistingSessions();
      await this.loadExistingWorkspaces();
      await this.initializeWebSocketServer();
      
      this.initialized = true;
      console.log(chalk.green('🤝 Team Collaboration Manager initialized'));
    } catch (error) {
      console.error(chalk.red('Failed to initialize Team Collaboration Manager:'), error.message);
      throw error;
    }
  }

  async loadExistingSessions() {
    try {
      const sessionFiles = await fs.readdir(this.sessionsDir);
      
      for (const file of sessionFiles) {
        if (file.endsWith('.json')) {
          const sessionPath = path.join(this.sessionsDir, file);
          const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
          this.sessions.set(sessionData.id, sessionData);
        }
      }

      console.log(chalk.blue(`📋 Loaded ${this.sessions.size} collaboration sessions`));
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load existing sessions'), error.message);
    }
  }

  async loadExistingWorkspaces() {
    try {
      const workspaceFiles = await fs.readdir(this.workspacesDir);
      
      for (const file of workspaceFiles) {
        if (file.endsWith('.json')) {
          const workspacePath = path.join(this.workspacesDir, file);
          const workspaceData = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
          this.workspaces.set(workspaceData.id, workspaceData);
        }
      }

      console.log(chalk.blue(`🏢 Loaded ${this.workspaces.size} team workspaces`));
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load existing workspaces'), error.message);
    }
  }

  async initializeWebSocketServer() {
    const port = this.config.collaborationPort || 8765;
    
    this.wsServer = new WebSocket.Server({ 
      port,
      verifyClient: (info) => {
        // Add authentication logic here
        return true;
      }
    });

    this.wsServer.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(ws, connectionId, message);
        } catch (error) {
          console.error(chalk.red('WebSocket message error:'), error.message);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid message format' 
          }));
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
        this.broadcastUserDisconnected(connectionId);
      });

      console.log(chalk.blue(`🔗 New collaboration connection: ${connectionId}`));
    });

    console.log(chalk.green(`🌐 Collaboration server listening on port ${port}`));
  }

  async handleWebSocketMessage(ws, connectionId, message) {
    switch (message.type) {
      case 'join_session':
        await this.handleJoinSession(ws, connectionId, message);
        break;
      
      case 'leave_session':
        await this.handleLeaveSession(ws, connectionId, message);
        break;
      
      case 'sync_code':
        await this.handleCodeSync(ws, connectionId, message);
        break;
      
      case 'cursor_position':
        await this.handleCursorPosition(ws, connectionId, message);
        break;
      
      case 'chat_message':
        await this.handleChatMessage(ws, connectionId, message);
        break;
      
      case 'workspace_action':
        await this.handleWorkspaceAction(ws, connectionId, message);
        break;
      
      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: `Unknown message type: ${message.type}` 
        }));
    }
  }

  async createSharedSession(options = {}) {
    await this.initialize();

    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      name: options.name || `Shared Session ${sessionId.slice(0, 8)}`,
      description: options.description || '',
      createdBy: this.userId,
      createdAt: new Date().toISOString(),
      participants: [{
        userId: this.userId,
        userName: this.userName,
        role: 'owner',
        joinedAt: new Date().toISOString()
      }],
      settings: {
        maxParticipants: options.maxParticipants || 10,
        allowGuestAccess: options.allowGuestAccess || false,
        syncMode: options.syncMode || 'real-time', // real-time, on-save, manual
        permissions: {
          edit: options.permissions?.edit || 'all',
          comment: options.permissions?.comment || 'all',
          viewHistory: options.permissions?.viewHistory || 'participants'
        }
      },
      workspace: {
        files: new Map(),
        cursors: new Map(),
        selections: new Map(),
        chat: [],
        history: []
      },
      status: 'active'
    };

    this.sessions.set(sessionId, session);
    await this.saveSessionData(session);

    console.log(chalk.green(`🔗 Created shared session: ${session.name}`));
    console.log(chalk.blue(`   Session ID: ${sessionId}`));
    console.log(chalk.blue(`   Invitation Link: ${this.generateInvitationLink(sessionId)}`));

    this.emit('sessionCreated', session);
    return session;
  }

  async joinSession(sessionId, userData = {}) {
    await this.initialize();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active`);
    }

    // Check if user is already in session
    const existingParticipant = session.participants.find(p => p.userId === this.userId);
    if (existingParticipant) {
      console.log(chalk.blue(`🔄 Rejoining session: ${session.name}`));
      return session;
    }

    // Check participant limit
    if (session.participants.length >= session.settings.maxParticipants) {
      throw new Error('Session is full');
    }

    // Add participant
    const participant = {
      userId: this.userId,
      userName: userData.userName || this.userName,
      role: userData.role || 'participant',
      joinedAt: new Date().toISOString(),
      permissions: this.calculateUserPermissions(session, userData.role || 'participant')
    };

    session.participants.push(participant);
    await this.saveSessionData(session);

    console.log(chalk.green(`✅ Joined session: ${session.name}`));
    
    // Notify other participants
    this.broadcastToSession(sessionId, {
      type: 'user_joined',
      user: participant,
      timestamp: new Date().toISOString()
    });

    this.emit('sessionJoined', session, participant);
    return session;
  }

  async leaveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const participantIndex = session.participants.findIndex(p => p.userId === this.userId);
    if (participantIndex === -1) {
      throw new Error('User is not a participant in this session');
    }

    const participant = session.participants[participantIndex];
    session.participants.splice(participantIndex, 1);

    // Handle ownership transfer if owner leaves
    if (participant.role === 'owner' && session.participants.length > 0) {
      session.participants[0].role = 'owner';
      console.log(chalk.yellow(`👑 Ownership transferred to: ${session.participants[0].userName}`));
    }

    // Close session if empty
    if (session.participants.length === 0) {
      session.status = 'closed';
      session.closedAt = new Date().toISOString();
    }

    await this.saveSessionData(session);

    console.log(chalk.yellow(`👋 Left session: ${session.name}`));

    // Notify other participants
    this.broadcastToSession(sessionId, {
      type: 'user_left',
      user: participant,
      timestamp: new Date().toISOString()
    });

    this.emit('sessionLeft', session, participant);
  }

  async syncCodeChanges(sessionId, fileChanges) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const participant = session.participants.find(p => p.userId === this.userId);
    if (!participant) {
      throw new Error('User is not a participant in this session');
    }

    if (!participant.permissions.edit) {
      throw new Error('User does not have edit permissions');
    }

    // Apply changes to session workspace
    for (const change of fileChanges) {
      const { file, content, operation, range } = change;
      
      if (!session.workspace.files.has(file)) {
        session.workspace.files.set(file, { content: '', version: 0 });
      }

      const fileData = session.workspace.files.get(file);
      
      switch (operation) {
        case 'replace':
          fileData.content = content;
          break;
        case 'insert':
          // Insert content at specified position
          const lines = fileData.content.split('\n');
          lines.splice(range.start.line, 0, content);
          fileData.content = lines.join('\n');
          break;
        case 'delete':
          // Delete content in specified range
          const deleteLines = fileData.content.split('\n');
          deleteLines.splice(range.start.line, range.end.line - range.start.line + 1);
          fileData.content = deleteLines.join('\n');
          break;
      }

      fileData.version++;
      fileData.lastModified = new Date().toISOString();
      fileData.lastModifiedBy = this.userId;
    }

    // Add to history
    session.workspace.history.push({
      timestamp: new Date().toISOString(),
      userId: this.userId,
      userName: participant.userName,
      changes: fileChanges,
      type: 'code_sync'
    });

    await this.saveSessionData(session);

    // Broadcast changes to other participants
    this.broadcastToSession(sessionId, {
      type: 'code_changes',
      changes: fileChanges,
      user: { userId: this.userId, userName: participant.userName },
      timestamp: new Date().toISOString()
    }, this.userId); // Exclude sender

    this.emit('codeSync', session, fileChanges);
  }

  async updateCursorPosition(sessionId, fileName, position) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.workspace.cursors.has(fileName)) {
      session.workspace.cursors.set(fileName, new Map());
    }

    const fileCursors = session.workspace.cursors.get(fileName);
    fileCursors.set(this.userId, {
      position,
      userName: this.userName,
      timestamp: new Date().toISOString()
    });

    // Broadcast cursor position to other participants
    this.broadcastToSession(sessionId, {
      type: 'cursor_update',
      fileName,
      userId: this.userId,
      userName: this.userName,
      position,
      timestamp: new Date().toISOString()
    }, this.userId); // Exclude sender
  }

  async sendChatMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const participant = session.participants.find(p => p.userId === this.userId);
    if (!participant) {
      throw new Error('User is not a participant in this session');
    }

    const chatMessage = {
      id: this.generateMessageId(),
      userId: this.userId,
      userName: participant.userName,
      content: message,
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    session.workspace.chat.push(chatMessage);
    await this.saveSessionData(session);

    // Broadcast message to all participants
    this.broadcastToSession(sessionId, {
      type: 'chat_message',
      message: chatMessage
    });

    this.emit('chatMessage', session, chatMessage);
    return chatMessage;
  }

  async createTeamWorkspace(options = {}) {
    await this.initialize();

    const workspaceId = this.generateWorkspaceId();
    const workspace = {
      id: workspaceId,
      name: options.name || `Team Workspace ${workspaceId.slice(0, 8)}`,
      description: options.description || '',
      createdBy: this.userId,
      createdAt: new Date().toISOString(),
      team: [{
        userId: this.userId,
        userName: this.userName,
        role: 'admin',
        joinedAt: new Date().toISOString()
      }],
      settings: {
        visibility: options.visibility || 'private', // private, team, public
        features: {
          codeReview: options.features?.codeReview !== false,
          realTimeCollab: options.features?.realTimeCollab !== false,
          issueTracking: options.features?.issueTracking !== false,
          documentation: options.features?.documentation !== false
        },
        integrations: {
          git: options.integrations?.git || null,
          slack: options.integrations?.slack || null,
          jira: options.integrations?.jira || null
        }
      },
      projects: [],
      sessions: [],
      resources: {
        documents: [],
        templates: [],
        workflows: []
      },
      activity: [],
      status: 'active'
    };

    this.workspaces.set(workspaceId, workspace);
    await this.saveWorkspaceData(workspace);

    console.log(chalk.green(`🏢 Created team workspace: ${workspace.name}`));
    console.log(chalk.blue(`   Workspace ID: ${workspaceId}`));

    this.emit('workspaceCreated', workspace);
    return workspace;
  }

  async inviteToWorkspace(workspaceId, invitations) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const inviter = workspace.team.find(m => m.userId === this.userId);
    if (!inviter || !['admin', 'owner'].includes(inviter.role)) {
      throw new Error('Insufficient permissions to invite users');
    }

    const invitationResults = [];

    for (const invitation of invitations) {
      try {
        const inviteId = this.generateInviteId();
        const inviteData = {
          id: inviteId,
          workspaceId,
          workspaceName: workspace.name,
          invitedBy: this.userId,
          inviterName: this.userName,
          email: invitation.email,
          role: invitation.role || 'member',
          message: invitation.message || '',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          status: 'pending'
        };

        // In a real implementation, this would send an email
        await this.sendWorkspaceInvitation(inviteData);

        invitationResults.push({
          email: invitation.email,
          status: 'sent',
          inviteId
        });

        console.log(chalk.green(`📧 Sent workspace invitation to: ${invitation.email}`));

      } catch (error) {
        invitationResults.push({
          email: invitation.email,
          status: 'failed',
          error: error.message
        });
        console.error(chalk.red(`❌ Failed to invite ${invitation.email}:`), error.message);
      }
    }

    return invitationResults;
  }

  async sendWorkspaceInvitation(inviteData) {
    // Simulate email sending
    console.log(chalk.blue(`📬 Sending invitation email to ${inviteData.email}`));
    
    // In a real implementation, this would integrate with email services
    const invitationContent = `
You've been invited to join the workspace "${inviteData.workspaceName}" by ${inviteData.inviterName}.

Invitation details:
- Workspace: ${inviteData.workspaceName}
- Role: ${inviteData.role}
- Message: ${inviteData.message || 'No message provided'}

To accept this invitation, use the following invite code: ${inviteData.id}

This invitation expires on ${new Date(inviteData.expiresAt).toLocaleDateString()}.
    `;

    // Save invitation for tracking
    const invitationsDir = path.join(this.collaborationDir, 'invitations');
    await fs.mkdir(invitationsDir, { recursive: true });
    
    await fs.writeFile(
      path.join(invitationsDir, `${inviteData.id}.json`),
      JSON.stringify(inviteData, null, 2)
    );
  }

  async generateInvitationLink(sessionId) {
    const baseUrl = this.config.baseUrl || 'https://collaborate.recoder-code.com';
    return `${baseUrl}/join/${sessionId}`;
  }

  async getCollaborationStats() {
    await this.initialize();

    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');
    const activeWorkspaces = Array.from(this.workspaces.values()).filter(w => w.status === 'active');

    return {
      sessions: {
        total: this.sessions.size,
        active: activeSessions.length,
        totalParticipants: activeSessions.reduce((sum, s) => sum + s.participants.length, 0)
      },
      workspaces: {
        total: this.workspaces.size,
        active: activeWorkspaces.length,
        totalMembers: activeWorkspaces.reduce((sum, w) => sum + w.team.length, 0)
      },
      user: {
        id: this.userId,
        name: this.userName,
        activeSessions: activeSessions.filter(s => 
          s.participants.some(p => p.userId === this.userId)
        ).length,
        activeWorkspaces: activeWorkspaces.filter(w => 
          w.team.some(m => m.userId === this.userId)
        ).length
      }
    };
  }

  broadcastToSession(sessionId, message, excludeUserId = null) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [connectionId, connection] of this.connections) {
      if (connection.sessionId === sessionId && 
          connection.userId !== excludeUserId &&
          connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
      }
    }
  }

  broadcastUserDisconnected(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection && connection.sessionId) {
      this.broadcastToSession(connection.sessionId, {
        type: 'user_disconnected',
        userId: connection.userId,
        timestamp: new Date().toISOString()
      });
    }
  }

  calculateUserPermissions(session, role) {
    const defaultPermissions = {
      edit: false,
      comment: true,
      viewHistory: false,
      invite: false,
      manageSession: false
    };

    switch (role) {
      case 'owner':
        return {
          edit: true,
          comment: true,
          viewHistory: true,
          invite: true,
          manageSession: true
        };
      case 'moderator':
        return {
          edit: true,
          comment: true,
          viewHistory: true,
          invite: true,
          manageSession: false
        };
      case 'participant':
        return {
          edit: session.settings.permissions.edit === 'all',
          comment: session.settings.permissions.comment === 'all',
          viewHistory: session.settings.permissions.viewHistory !== 'owner',
          invite: false,
          manageSession: false
        };
      default:
        return defaultPermissions;
    }
  }

  async saveSessionData(session) {
    const sessionPath = path.join(this.sessionsDir, `${session.id}.json`);
    
    // Convert Maps to Objects for JSON serialization
    const sessionData = {
      ...session,
      workspace: {
        ...session.workspace,
        files: Object.fromEntries(session.workspace.files),
        cursors: Object.fromEntries(session.workspace.cursors),
        selections: Object.fromEntries(session.workspace.selections)
      }
    };

    await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
  }

  async saveWorkspaceData(workspace) {
    const workspacePath = path.join(this.workspacesDir, `${workspace.id}.json`);
    await fs.writeFile(workspacePath, JSON.stringify(workspace, null, 2));
  }

  generateUserId() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateSessionId() {
    return crypto.randomBytes(12).toString('hex');
  }

  generateWorkspaceId() {
    return crypto.randomBytes(12).toString('hex');
  }

  generateConnectionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  generateInviteId() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateMessageId() {
    return crypto.randomBytes(8).toString('hex');
  }
}

module.exports = TeamCollaborationManager;

// CLI interface
if (require.main === module) {
  const collaborationManager = new TeamCollaborationManager();

  async function handleCommand() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      switch (command) {
        case 'create-session':
          const session = await collaborationManager.createSharedSession({
            name: args[0] || 'New Shared Session',
            maxParticipants: parseInt(args[1]) || 10
          });
          console.log(JSON.stringify({
            id: session.id,
            name: session.name,
            invitationLink: await collaborationManager.generateInvitationLink(session.id)
          }, null, 2));
          break;

        case 'join-session':
          if (!args[0]) {
            console.error('Usage: team-collaboration.js join-session <session-id>');
            process.exit(1);
          }
          await collaborationManager.joinSession(args[0]);
          break;

        case 'create-workspace':
          const workspace = await collaborationManager.createTeamWorkspace({
            name: args[0] || 'New Team Workspace'
          });
          console.log(JSON.stringify({
            id: workspace.id,
            name: workspace.name
          }, null, 2));
          break;

        case 'stats':
          const stats = await collaborationManager.getCollaborationStats();
          console.log(JSON.stringify(stats, null, 2));
          break;

        case 'start-server':
          await collaborationManager.initialize();
          console.log(chalk.green('🌐 Collaboration server started'));
          // Keep process alive
          setInterval(() => {}, 1000);
          break;

        default:
          console.log('Team Collaboration Manager for Recoder Code');
          console.log('');
          console.log('Usage:');
          console.log('  team-collaboration.js create-session [name] [max-participants]');
          console.log('  team-collaboration.js join-session <session-id>');
          console.log('  team-collaboration.js create-workspace [name]');
          console.log('  team-collaboration.js stats');
          console.log('  team-collaboration.js start-server');
          break;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  handleCommand();
}