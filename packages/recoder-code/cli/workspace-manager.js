/**
 * Workspace Manager - CLI integration for collaboration workspace functionality
 * Uses collaboration/ directory for workspace management
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class WorkspaceManager {
  constructor() {
    this.collaborationPath = path.join(__dirname, '../collaboration');
    this.sharedSessionsPath = path.join(this.collaborationPath, 'shared-sessions');
    this.teamWorkspacesPath = path.join(this.collaborationPath, 'team-workspaces');
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.workspacesConfigFile = path.join(this.configDir, 'workspaces.json');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    // Ensure all necessary directories exist
    const dirs = [
      this.collaborationPath,
      this.sharedSessionsPath, 
      this.teamWorkspacesPath,
      this.configDir
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async createWorkspace(workspaceName) {
    console.log(chalk.cyan(`📁 Creating workspace: "${workspaceName}"`));
    
    if (!workspaceName) {
      console.log(chalk.red('❌ Workspace name is required'));
      console.log(chalk.blue('Usage: recoder-code workspace create <workspace-name>'));
      return;
    }

    try {
      const workspaceDir = path.join(this.teamWorkspacesPath, workspaceName);
      
      if (fs.existsSync(workspaceDir)) {
        console.log(chalk.yellow(`⚠️  Workspace "${workspaceName}" already exists`));
        return;
      }

      // Create workspace directory structure
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.mkdirSync(path.join(workspaceDir, 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(workspaceDir, 'shared-files'), { recursive: true });
      fs.mkdirSync(path.join(workspaceDir, 'templates'), { recursive: true });
      
      // Create workspace configuration
      const workspaceConfig = {
        name: workspaceName,
        created: new Date().toISOString(),
        owner: os.userInfo().username,
        members: [os.userInfo().username],
        settings: {
          autoSave: true,
          shareByDefault: false,
          maxMembers: 10
        }
      };

      fs.writeFileSync(
        path.join(workspaceDir, 'workspace.json'),
        JSON.stringify(workspaceConfig, null, 2)
      );

      // Create README for workspace
      const readme = `# ${workspaceName} Workspace

This is a collaborative workspace created with Recoder-Code.

## Directory Structure
- \`sessions/\` - Shared coding sessions
- \`shared-files/\` - Files shared among team members  
- \`templates/\` - Project templates and snippets

## Commands
- \`recoder-code workspace share ${workspaceName}\` - Share workspace
- \`recoder-code workspace session ${workspaceName}\` - Start collaborative session
- \`recoder-code workspace invite ${workspaceName} <username>\` - Invite member

Created: ${new Date().toLocaleString()}
Owner: ${os.userInfo().username}
`;

      fs.writeFileSync(path.join(workspaceDir, 'README.md'), readme);

      // Update global workspaces registry
      this.registerWorkspace(workspaceName, workspaceDir);

      console.log(chalk.green(`✅ Workspace "${workspaceName}" created successfully`));
      console.log(chalk.gray(`   Location: ${workspaceDir}`));
      console.log(chalk.cyan('💡 Next steps:'));
      console.log(`   recoder-code workspace share ${workspaceName}`);
      console.log(`   recoder-code workspace session ${workspaceName}`);

    } catch (error) {
      console.log(chalk.red('❌ Failed to create workspace'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async shareWorkspace(workspaceName) {
    console.log(chalk.cyan(`🔗 Sharing workspace: "${workspaceName}"`));
    
    try {
      const workspaceDir = path.join(this.teamWorkspacesPath, workspaceName);
      
      if (!fs.existsSync(workspaceDir)) {
        console.log(chalk.red(`❌ Workspace "${workspaceName}" not found`));
        return;
      }

      // Create shared session entry
      const sessionId = `session-${Date.now()}`;
      const sessionPath = path.join(this.sharedSessionsPath, `${sessionId}.json`);
      
      const sessionConfig = {
        workspaceName,
        sessionId,
        created: new Date().toISOString(),
        owner: os.userInfo().username,
        participants: [],
        status: 'active',
        shareUrl: `recoder://workspace/${workspaceName}/${sessionId}`
      };

      fs.writeFileSync(sessionPath, JSON.stringify(sessionConfig, null, 2));

      console.log(chalk.green('✅ Workspace shared successfully'));
      console.log(chalk.cyan(`🆔 Session ID: ${sessionId}`));
      console.log(chalk.blue(`🔗 Share URL: recoder://workspace/${workspaceName}/${sessionId}`));
      console.log('');
      console.log(chalk.yellow('💡 Share this with team members:'));
      console.log(`   recoder-code workspace join ${sessionId}`);

    } catch (error) {
      console.log(chalk.red('❌ Failed to share workspace'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async listWorkspaces() {
    console.log(chalk.cyan.bold('📋 Available Workspaces'));
    console.log('');

    try {
      // List team workspaces
      const teamWorkspaces = fs.existsSync(this.teamWorkspacesPath) 
        ? fs.readdirSync(this.teamWorkspacesPath)
        : [];

      if (teamWorkspaces.length === 0) {
        console.log(chalk.gray('No workspaces found. Create one with:'));
        console.log(chalk.blue('  recoder-code workspace create <workspace-name>'));
        return;
      }

      console.log(chalk.yellow('🏢 Team Workspaces:'));
      teamWorkspaces.forEach(workspace => {
        const workspaceDir = path.join(this.teamWorkspacesPath, workspace);
        const configFile = path.join(workspaceDir, 'workspace.json');
        
        if (fs.existsSync(configFile)) {
          try {
            const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            const memberCount = config.members ? config.members.length : 1;
            console.log(`  📁 ${workspace} (${memberCount} member${memberCount > 1 ? 's' : ''})`);
            console.log(chalk.gray(`     Owner: ${config.owner || 'Unknown'}`));
            console.log(chalk.gray(`     Created: ${new Date(config.created).toLocaleDateString()}`));
          } catch (err) {
            console.log(`  📁 ${workspace} (config error)`);
          }
        } else {
          console.log(`  📁 ${workspace}`);
        }
      });

      // List active shared sessions
      const sharedSessions = fs.existsSync(this.sharedSessionsPath)
        ? fs.readdirSync(this.sharedSessionsPath)
        : [];

      if (sharedSessions.length > 0) {
        console.log('');
        console.log(chalk.yellow('🔗 Active Shared Sessions:'));
        sharedSessions.forEach(sessionFile => {
          const sessionPath = path.join(this.sharedSessionsPath, sessionFile);
          try {
            const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            console.log(`  🌐 ${session.workspaceName} - ${session.sessionId}`);
            console.log(chalk.gray(`     Participants: ${session.participants.length}`));
          } catch (err) {
            console.log(`  🌐 ${sessionFile} (config error)`);
          }
        });
      }

    } catch (error) {
      console.log(chalk.red('❌ Failed to list workspaces'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async joinSession(sessionId) {
    console.log(chalk.cyan(`🤝 Joining shared session: ${sessionId}`));
    
    try {
      const sessionPath = path.join(this.sharedSessionsPath, `${sessionId}.json`);
      
      if (!fs.existsSync(sessionPath)) {
        console.log(chalk.red(`❌ Session "${sessionId}" not found`));
        return;
      }

      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      const currentUser = os.userInfo().username;
      
      // Add user to participants if not already present
      if (!session.participants.includes(currentUser)) {
        session.participants.push(currentUser);
        session.lastActivity = new Date().toISOString();
        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      }

      console.log(chalk.green(`✅ Joined session for workspace "${session.workspaceName}"`));
      console.log(chalk.cyan(`👥 Participants: ${session.participants.length}`));
      console.log(chalk.blue(`📁 Workspace: ${session.workspaceName}`));

    } catch (error) {
      console.log(chalk.red('❌ Failed to join session'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  async deleteWorkspace(workspaceName) {
    console.log(chalk.yellow(`🗑️  Deleting workspace: "${workspaceName}"`));
    
    try {
      const workspaceDir = path.join(this.teamWorkspacesPath, workspaceName);
      
      if (!fs.existsSync(workspaceDir)) {
        console.log(chalk.red(`❌ Workspace "${workspaceName}" not found`));
        return;
      }

      // Remove directory recursively
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      
      // Remove from registry
      this.unregisterWorkspace(workspaceName);

      console.log(chalk.green(`✅ Workspace "${workspaceName}" deleted`));

    } catch (error) {
      console.log(chalk.red('❌ Failed to delete workspace'));
      console.log(chalk.gray(`Error: ${error.message}`));
    }
  }

  registerWorkspace(name, path) {
    let workspaces = {};
    if (fs.existsSync(this.workspacesConfigFile)) {
      workspaces = JSON.parse(fs.readFileSync(this.workspacesConfigFile, 'utf8'));
    }
    
    workspaces[name] = {
      path,
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };
    
    fs.writeFileSync(this.workspacesConfigFile, JSON.stringify(workspaces, null, 2));
  }

  unregisterWorkspace(name) {
    if (fs.existsSync(this.workspacesConfigFile)) {
      const workspaces = JSON.parse(fs.readFileSync(this.workspacesConfigFile, 'utf8'));
      delete workspaces[name];
      fs.writeFileSync(this.workspacesConfigFile, JSON.stringify(workspaces, null, 2));
    }
  }

  async showHelp() {
    console.log(chalk.cyan.bold('🤝 Workspace CLI Commands'));
    console.log('');
    console.log(chalk.yellow('📁 WORKSPACE MANAGEMENT:'));
    console.log('  create <name>      Create a new team workspace');
    console.log('  list               List all available workspaces');
    console.log('  delete <name>      Delete a workspace');
    console.log('');
    console.log(chalk.yellow('🔗 COLLABORATION:'));
    console.log('  share <name>       Share workspace for collaboration');
    console.log('  join <session-id>  Join a shared session');
    console.log('');
    console.log(chalk.yellow('📝 EXAMPLES:'));
    console.log('  recoder-code workspace create "My Team Project"');
    console.log('  recoder-code workspace share "My Team Project"');
    console.log('  recoder-code workspace list');
    console.log('  recoder-code workspace join session-1234567890');
    console.log('  recoder-code workspace delete "Old Project"');
    console.log('');
    console.log(chalk.yellow('📂 DIRECTORY STRUCTURE:'));
    console.log('  collaboration/team-workspaces/  - Team workspace storage');
    console.log('  collaboration/shared-sessions/  - Active collaboration sessions');
    console.log('  ~/.recoder-code/workspaces.json - Workspace registry');
    console.log('');
    console.log(chalk.gray('💡 Uses collaboration/ directory for workspace data'));
  }
}

module.exports = WorkspaceManager;