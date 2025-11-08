const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const crypto = require('crypto');

class CollaborationManager {
  constructor() {
    this.teamWorkspaces = new Map();
    this.activeCollaborations = new Map();
    this.sharedSessions = new Map();
    this.collaborationId = null;
    this.isHost = false;
    this.teamMembers = new Set();
    this.collaborationMode = 'none'; // 'none', 'shared-session', 'team-workspace'
    this.collaborationDir = path.join(process.cwd(), 'collaboration');
    this.sharedSessionsDir = path.join(this.collaborationDir, 'shared-sessions');
    this.teamWorkspacesDir = path.join(this.collaborationDir, 'team-workspaces');
    
    // Ensure collaboration directories exist
    [this.collaborationDir, this.sharedSessionsDir, this.teamWorkspacesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    this.initializeCollaboration();
  }

  async initializeCollaboration() {
    try {
      // Load existing team workspaces
      await this.loadTeamWorkspaces();
      // Silent initialization - no console output
    } catch (error) {
      // Silent error handling
    }
  }

  // Team Workspace Management
  async createTeamWorkspace(name, description = '') {
    const workspaceId = crypto.randomBytes(8).toString('hex');
    const workspace = {
      id: workspaceId,
      name: name,
      description: description,
      created: new Date(),
      owner: this.getCurrentUser(),
      members: [this.getCurrentUser()],
      sharedConversations: [],
      sharedFiles: [],
      settings: {
        allowGuestAccess: false,
        requireApproval: true,
        defaultModel: 'anthropic/claude-3.5-sonnet'
      }
    };

    this.teamWorkspaces.set(workspaceId, workspace);
    await this.saveTeamWorkspace(workspace);
    
    console.log(chalk.green(`✅ Created team workspace: ${name} (${workspaceId})`));
    return workspaceId;
  }

  async joinTeamWorkspace(workspaceId, userName = null) {
    const workspace = this.teamWorkspaces.get(workspaceId) || await this.loadTeamWorkspace(workspaceId);
    
    if (!workspace) {
      console.log(chalk.red(`❌ Team workspace not found: ${workspaceId}`));
      return false;
    }

    const user = userName || this.getCurrentUser();
    
    if (workspace.settings.requireApproval && workspace.owner !== user) {
      console.log(chalk.yellow(`⏳ Join request pending approval for: ${workspace.name}`));
      // In a real implementation, this would send a notification to the owner
      return false;
    }

    if (!workspace.members.includes(user)) {
      workspace.members.push(user);
      await this.saveTeamWorkspace(workspace);
    }

    this.teamWorkspaces.set(workspaceId, workspace);
    console.log(chalk.green(`✅ Joined team workspace: ${workspace.name}`));
    return true;
  }

  // Shared Session Management
  async createSharedSession(sessionData, workspaceId = null) {
    const sharedSessionId = crypto.randomBytes(8).toString('hex');
    const sharedSession = {
      id: sharedSessionId,
      owner: this.getCurrentUser(),
      created: new Date(),
      lastUpdated: new Date(),
      workspaceId: workspaceId,
      sessionData: sessionData,
      collaborators: [this.getCurrentUser()],
      permissions: {
        canEdit: [this.getCurrentUser()],
        canView: [],
        isPublic: false
      }
    };

    this.sharedSessions.set(sharedSessionId, sharedSession);
    await this.saveSharedSession(sharedSession);
    
    console.log(chalk.green(`✅ Created shared session: ${sharedSessionId}`));
    return sharedSessionId;
  }

  async joinSharedSession(sharedSessionId) {
    const sharedSession = this.sharedSessions.get(sharedSessionId) || await this.loadSharedSession(sharedSessionId);
    
    if (!sharedSession) {
      console.log(chalk.red(`❌ Shared session not found: ${sharedSessionId}`));
      return null;
    }

    const user = this.getCurrentUser();
    
    // Check permissions
    if (!sharedSession.permissions.isPublic && 
        !sharedSession.permissions.canView.includes(user) &&
        !sharedSession.permissions.canEdit.includes(user) &&
        sharedSession.owner !== user) {
      console.log(chalk.red(`❌ Access denied to shared session: ${sharedSessionId}`));
      return null;
    }

    if (!sharedSession.collaborators.includes(user)) {
      sharedSession.collaborators.push(user);
      await this.saveSharedSession(sharedSession);
    }

    this.sharedSessions.set(sharedSessionId, sharedSession);
    console.log(chalk.green(`✅ Joined shared session: ${sharedSessionId}`));
    return sharedSession.sessionData;
  }

  // Real-time Collaboration Simulation
  async startCollaboration(sessionId, mode = 'shared-session') {
    this.collaborationId = sessionId;
    this.collaborationMode = mode;
    this.isHost = true;
    
    console.log(chalk.blue(`🤝 Started ${mode} collaboration: ${sessionId}`));
    console.log(chalk.gray('Share this ID with team members to collaborate'));
    
    // In a real implementation, this would:
    // - Set up WebSocket connections
    // - Enable real-time synchronization
    // - Handle conflict resolution
    
    return sessionId;
  }

  async broadcastMessage(message, metadata = {}) {
    if (!this.collaborationId) {
      return false;
    }

    const broadcastData = {
      sessionId: this.collaborationId,
      sender: this.getCurrentUser(),
      timestamp: new Date().toISOString(),
      message: message,
      metadata: metadata
    };

    // Simulate broadcasting to team members
    console.log(chalk.gray(`📡 Broadcasting to ${this.teamMembers.size} collaborators`));
    
    // In a real implementation, this would send via WebSocket/Socket.IO
    await this.logCollaborationActivity(broadcastData);
    
    return true;
  }

  // File Sharing and Collaboration
  async shareFile(filePath, workspaceId = null) {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`❌ File not found: ${filePath}`));
      return null;
    }

    const fileId = crypto.randomBytes(6).toString('hex');
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    const sharedFile = {
      id: fileId,
      name: fileName,
      originalPath: filePath,
      content: fileContent,
      owner: this.getCurrentUser(),
      workspaceId: workspaceId,
      created: new Date(),
      lastModified: new Date(),
      version: 1,
      collaborators: [this.getCurrentUser()]
    };

    const sharedFilePath = path.join(this.collaborationDir, `shared-file-${fileId}.json`);
    fs.writeFileSync(sharedFilePath, JSON.stringify(sharedFile, null, 2));
    
    console.log(chalk.green(`✅ File shared: ${fileName} (${fileId})`));
    return fileId;
  }

  async editSharedFile(fileId, newContent, lineNumber = null) {
    const sharedFilePath = path.join(this.collaborationDir, `shared-file-${fileId}.json`);
    
    if (!fs.existsSync(sharedFilePath)) {
      console.log(chalk.red(`❌ Shared file not found: ${fileId}`));
      return false;
    }

    const sharedFile = JSON.parse(fs.readFileSync(sharedFilePath, 'utf8'));
    
    // Simple edit tracking (in real implementation, use operational transforms)
    const edit = {
      user: this.getCurrentUser(),
      timestamp: new Date().toISOString(),
      lineNumber: lineNumber,
      oldContent: sharedFile.content,
      newContent: newContent
    };

    sharedFile.content = newContent;
    sharedFile.lastModified = new Date();
    sharedFile.version += 1;
    
    if (!sharedFile.edits) {
      sharedFile.edits = [];
    }
    sharedFile.edits.push(edit);

    fs.writeFileSync(sharedFilePath, JSON.stringify(sharedFile, null, 2));
    
    console.log(chalk.green(`✅ Updated shared file: ${sharedFile.name} (v${sharedFile.version})`));
    
    // Notify collaborators
    await this.broadcastMessage(`File updated: ${sharedFile.name}`, {
      type: 'file_update',
      fileId: fileId,
      version: sharedFile.version
    });
    
    return true;
  }

  // Collaboration Status and Management
  getCollaborationStatus() {
    return {
      mode: this.collaborationMode,
      collaborationId: this.collaborationId,
      isHost: this.isHost,
      teamMembers: Array.from(this.teamMembers),
      activeWorkspaces: this.teamWorkspaces.size,
      sharedSessions: this.sharedSessions.size
    };
  }

  listTeamWorkspaces() {
    const workspaces = Array.from(this.teamWorkspaces.values());
    return workspaces.sort((a, b) => b.created - a.created);
  }

  listSharedSessions(workspaceId = null) {
    let sessions = Array.from(this.sharedSessions.values());
    
    if (workspaceId) {
      sessions = sessions.filter(session => session.workspaceId === workspaceId);
    }
    
    return sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  // User Management
  getCurrentUser() {
    // In a real implementation, this would get from authentication
    return process.env.USER || process.env.USERNAME || 'anonymous';
  }

  addTeamMember(userName) {
    this.teamMembers.add(userName);
    console.log(chalk.green(`✅ Added team member: ${userName}`));
  }

  removeTeamMember(userName) {
    this.teamMembers.delete(userName);
    console.log(chalk.yellow(`⚠️  Removed team member: ${userName}`));
  }

  // File I/O Operations
  async saveTeamWorkspace(workspace) {
    const filePath = path.join(this.teamWorkspacesDir, `${workspace.id}.json`);
    const workspaceData = {
      ...workspace,
      created: workspace.created.toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(workspaceData, null, 2));
  }

  async loadTeamWorkspace(workspaceId) {
    const filePath = path.join(this.teamWorkspacesDir, `${workspaceId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const workspace = {
        ...data,
        created: new Date(data.created),
        lastUpdated: new Date(data.lastUpdated || data.created)
      };
      
      return workspace;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Error loading workspace ${workspaceId}: ${error.message}`));
      return null;
    }
  }

  async loadTeamWorkspaces() {
    if (!fs.existsSync(this.teamWorkspacesDir)) {
      return;
    }

    const files = fs.readdirSync(this.teamWorkspacesDir)
      .filter(file => file.endsWith('.json'));

    for (const file of files) {
      const workspaceId = file.replace('.json', '');
      const workspace = await this.loadTeamWorkspace(workspaceId);
      if (workspace) {
        this.teamWorkspaces.set(workspaceId, workspace);
      }
    }
  }

  async saveSharedSession(sharedSession) {
    const filePath = path.join(this.sharedSessionsDir, `${sharedSession.id}.json`);
    const sessionData = {
      ...sharedSession,
      created: sharedSession.created.toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
  }

  async loadSharedSession(sessionId) {
    const filePath = path.join(this.sharedSessionsDir, `${sessionId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const session = {
        ...data,
        created: new Date(data.created),
        lastUpdated: new Date(data.lastUpdated || data.created)
      };
      
      return session;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Error loading shared session ${sessionId}: ${error.message}`));
      return null;
    }
  }

  async logCollaborationActivity(activity) {
    const logFile = path.join(this.collaborationDir, 'activity.log');
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(activity)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
  }

  async showHelp() {
    console.log(chalk.cyan.bold('🤝 Collaboration System'));
    console.log('');
    console.log(chalk.yellow('📋 COMMANDS:'));
    console.log('  create <name>      Create new collaboration session');
    console.log('  join <id>          Join existing collaboration session');
    console.log('  list               List available sessions');
    console.log('  status             Show collaboration status');
    console.log('  share <file>       Share a file with collaborators');
    console.log('  stop               Stop current collaboration');
    console.log('');
    console.log(chalk.yellow('📝 EXAMPLES:'));
    console.log('  recoder-code collab create "Team Project"');
    console.log('  recoder-code collab join session-123');
    console.log('  recoder-code collab share myfile.js');
    console.log('  recoder-code collab list');
    console.log('  recoder-code collab status');
    console.log('');
    console.log(chalk.gray('💡 Real-time collaboration with file sharing'));
  }

  cleanup() {
    // Clean up any active collaborations
    if (this.collaborationId) {
      console.log(chalk.yellow('🔄 Ending collaboration session'));
      this.collaborationId = null;
      this.collaborationMode = 'none';
      this.isHost = false;
    }
  }
}

module.exports = CollaborationManager;