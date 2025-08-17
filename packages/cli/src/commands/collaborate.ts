/**
 * Collaboration Command - Real-Time Collaborative Development
 * KILLER FEATURE: Multi-developer + AI agent pair programming
 * Cursor doesn't have real-time collaboration - we do!
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { portManager } from '../utils/port-manager';
import { CollaborationService, CollaborationUser } from '../../../shared/src/collaboration';

export function createCollaborateCommand(collaborationService?: CollaborationService): Command {
  async function getCollaborationService(): Promise<CollaborationService> {
    if (collaborationService) {
      return collaborationService;
    }
    
    // Use PortManager to get available port
    const port = await portManager.getPortForService('collaboration-server');
    
    return new CollaborationService({
      websocketPort: port,
      enableRedis: true
    });
  }
  const collaborate = new Command('collaborate')
    .description('🤝 Start real-time collaborative development (KILLER FEATURE vs Cursor!)')
    .option('-p, --port <port>', 'WebSocket server port (auto-assigned if not specified)')
    .option('--redis-url <url>', 'Redis URL for session persistence')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🤝 RECODER COLLABORATIVE DEVELOPMENT'));
        console.log(chalk.gray('Real-time pair programming with AI agents'));
        console.log(chalk.magenta('🏆 CURSOR CANNOT DO THIS - KILLER COMPETITIVE ADVANTAGE!'));
        console.log();

        const service = await getCollaborationService();
        
        const action = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🚀 Start new collaboration session', value: 'create' },
            { name: '🔗 Join existing session', value: 'join' },
            { name: '📊 View active sessions', value: 'list' },
            { name: '📈 Collaboration analytics', value: 'analytics' },
            { name: '🔌 Start collaboration server', value: 'server' }
          ]
        }]);

        switch (action.action) {
          case 'create':
            await handleCreateSession(service);
            break;
          case 'join':
            await handleJoinSession(service);
            break;
          case 'list':
            await handleListSessions(service);
            break;
          case 'analytics':
            await handleAnalytics(service);
            break;
          case 'server':
            await handleStartServer(service);
            break;
        }

      } catch (error: any) {
        Logger.error('Collaborate command failed', error);
        console.log(chalk.red(`❌ Command failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: Start collaboration server
  collaborate
    .command('server')
    .description('Start the collaboration WebSocket server')
    .option('-p, --port <port>', 'Port to run on (will use PortManager if not specified)')
    .action(async (options) => {
      const port = options.port ? parseInt(options.port) : await portManager.getPortForService('collaboration-server');
      
      const service = new CollaborationService({
        websocketPort: port,
        enableRedis: true
      });

      console.log(chalk.green(`🚀 Collaboration server starting on port ${port}...`));
      
      service.on('session-created', (data) => {
        console.log(chalk.blue(`📝 New session: ${data.session.name} (${data.session.id})`));
      });

      service.on('user-joined-session', (data) => {
        console.log(chalk.green(`👤 ${data.user.name} joined session ${data.session.name}`));
      });

      service.on('user-left-session', (data) => {
        console.log(chalk.yellow(`👋 ${data.user.name} left session ${data.session.name}`));
      });

      console.log(chalk.green('✅ Collaboration server is running!'));
      console.log(chalk.gray(`🔗 Connect at: ws://localhost:${port}/collaboration`));
      console.log(chalk.magenta('🏆 This is a KILLER FEATURE that Cursor cannot match!'));

      // Keep server running
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Shutting down collaboration server...'));
        await service.shutdown();
        process.exit(0);
      });
    });

  // Subcommand: Create session
  collaborate
    .command('create <name>')
    .description('Create a new collaboration session')
    .option('-d, --description <desc>', 'Session description')
    .option('-l, --language <lang>', 'Programming language', 'typescript')
    .option('--max-users <num>', 'Maximum users', '10')
    .option('--ai-agents', 'Enable AI agents', true)
    .action(async (name: string, options) => {
      const service = await getCollaborationService();
      
      const creator: CollaborationUser = {
        id: 'cli-user',
        name: process.env.USER || 'CLI User',
        email: 'user@recoder.dev',
        role: 'developer',
        isActive: true,
        lastSeen: new Date()
      };

      const session = await service.createSession(creator, {
        name,
        metadata: {
          description: options.description || '',
          language: options.language,
          tags: []
        },
        settings: {
          maxUsers: parseInt(options.maxUsers),
          allowAIAgents: options.aiAgents,
          codeReviewMode: false,
          voiceChatEnabled: false,
          autoSave: true
        }
      });

      console.log(chalk.green('✅ Collaboration session created!'));
      console.log(chalk.blue(`📝 Session ID: ${session.id}`));
      console.log(chalk.blue(`📝 Session Name: ${session.name}`));
      console.log(chalk.gray(`🔗 Share this ID with collaborators to join`));
      console.log();
      console.log(chalk.magenta('🏆 COMPETITIVE ADVANTAGE:'));
      console.log(chalk.white('Real-time collaboration with AI agents.'));
      console.log(chalk.white('Cursor is limited to single-user development!'));
    });

  // Subcommand: Join session
  collaborate
    .command('join <sessionId>')
    .description('Join an existing collaboration session')
    .option('-n, --name <name>', 'Your display name')
    .action(async (sessionId: string, options) => {
      const service = await getCollaborationService();
      
      const user: CollaborationUser = {
        id: `user-${Date.now()}`,
        name: options.name || process.env.USER || 'Anonymous',
        email: 'user@recoder.dev',
        role: 'developer',
        isActive: true,
        lastSeen: new Date()
      };

      const success = await service.joinSession(sessionId, user);
      
      if (success) {
        console.log(chalk.green(`✅ Joined session ${sessionId}!`));
        
        const analytics = service.getSessionAnalytics(sessionId);
        if (analytics) {
          console.log(chalk.blue('📊 Session Info:'));
          console.log(`   Users: ${analytics.totalUsers}`);
          console.log(`   Code Changes: ${analytics.codeChanges}`);
          console.log(`   AI Suggestions: ${analytics.aiSuggestions}`);
          console.log(`   Collaboration Score: ${analytics.collaborationScore}/100`);
        }
        
        console.log();
        console.log(chalk.magenta('🏆 You are now in REAL-TIME collaboration!'));
        console.log(chalk.white('Something Cursor users can only dream of!'));
      } else {
        console.log(chalk.red('❌ Failed to join session'));
      }
    });

  return collaborate;
}

async function handleCreateSession(service: CollaborationService): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Session name:',
      validate: (input) => input.length > 0 || 'Session name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):'
    },
    {
      type: 'list',
      name: 'language',
      message: 'Programming language:',
      choices: ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'other']
    },
    {
      type: 'number',
      name: 'maxUsers',
      message: 'Maximum users:',
      default: 5
    },
    {
      type: 'confirm',
      name: 'aiAgents',
      message: 'Enable AI agents?',
      default: true
    }
  ]);

  const creator: CollaborationUser = {
    id: 'cli-creator',
    name: process.env.USER || 'CLI Creator',
    email: 'creator@recoder.dev',
    role: 'developer',
    isActive: true,
    lastSeen: new Date()
  };

  const session = await service.createSession(creator, {
    name: answers.name,
    metadata: {
      description: answers.description || '',
      language: answers.language,
      tags: []
    },
    settings: {
      maxUsers: answers.maxUsers,
      allowAIAgents: answers.aiAgents,
      codeReviewMode: false,
      voiceChatEnabled: false,
      autoSave: true
    }
  });

  console.log(chalk.green('\n✅ Session created successfully!'));
  console.log(chalk.blue(`📝 Session ID: ${session.id}`));
  console.log(chalk.blue(`📝 Name: ${session.name}`));
  console.log(chalk.gray('🔗 Share the Session ID with your team'));
  
  if (answers.aiAgents) {
    console.log(chalk.cyan('\n🤖 Adding AI coding assistant...'));
    await service.addAIAgent(session.id, {
      name: 'Claude Assistant',
      capabilities: ['code-generation', 'code-review', 'debugging', 'refactoring'],
      model: 'claude-3-sonnet',
      personality: 'helpful and collaborative'
    });
    console.log(chalk.green('✅ AI agent added to session'));
  }
}

async function handleJoinSession(service: CollaborationService): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'sessionId',
      message: 'Session ID:',
      validate: (input) => input.length > 0 || 'Session ID is required'
    },
    {
      type: 'input',
      name: 'name',
      message: 'Your display name:',
      default: process.env.USER || 'Anonymous'
    }
  ]);

  const user: CollaborationUser = {
    id: `user-${Date.now()}`,
    name: answers.name,
    email: 'user@recoder.dev',
    role: 'developer',
    isActive: true,
    lastSeen: new Date()
  };

  const success = await service.joinSession(answers.sessionId, user);
  
  if (success) {
    console.log(chalk.green('\n✅ Successfully joined the session!'));
    
    const analytics = service.getSessionAnalytics(answers.sessionId);
    if (analytics) {
      console.log(chalk.blue('\n📊 Session Overview:'));
      console.log(`   👥 Active Users: ${analytics.totalUsers}`);
      console.log(`   📝 Code Changes: ${analytics.codeChanges}`);
      console.log(`   🤖 AI Suggestions: ${analytics.aiSuggestions}`);
      console.log(`   📈 Collaboration Score: ${analytics.collaborationScore}/100`);
    }

    console.log(chalk.magenta('\n🏆 KILLER ADVANTAGE ACTIVATED!'));
    console.log(chalk.white('You are now in real-time collaboration.'));
    console.log(chalk.white('Cursor users are stuck coding alone!'));
  }
}

async function handleListSessions(service: CollaborationService): Promise<void> {
  const stats = await service.getCollaborationStats();
  // const sessions = service.getAllSessions(); // Method not available, using stats instead

  console.log(chalk.blue('📊 COLLABORATION OVERVIEW'));
  console.log(`Total Sessions: ${stats.totalSessions}`);
  console.log(`Active Sessions: ${stats.activeSessions}`);
  console.log(`Total Users: ${stats.totalUsers}`);
  console.log(`Avg Users/Session: ${stats.averageUsersPerSession.toFixed(1)}`);
  console.log();

  // if (sessions.length > 0) {
  //   console.log(chalk.blue('🎯 ACTIVE SESSIONS:'));
  //   sessions.forEach((session, index) => {
  //     const activeUsers = Array.from(session.users.values()).filter(u => u.isActive).length;
  //     console.log(`${index + 1}. ${chalk.cyan(session.name)} (${session.id})`);
  //     console.log(`   👥 ${activeUsers}/${session.users.size} active users`);
  //     console.log(`   📅 Created: ${session.createdAt.toLocaleDateString()}`);
  //     console.log(`   🔧 Language: ${session.metadata.language}`);
  //     console.log();
  //   });
  // } else {
  //   console.log(chalk.yellow('No active sessions'));
  // }
}

async function handleAnalytics(service: CollaborationService): Promise<void> {
  const stats = await service.getCollaborationStats();

  console.log(chalk.blue('📈 COLLABORATION ANALYTICS'));
  console.log();
  console.log(chalk.cyan('📊 Overall Statistics:'));
  console.log(`   Total Sessions Created: ${stats.totalSessions}`);
  console.log(`   Currently Active: ${stats.activeSessions}`);
  console.log(`   Unique Collaborators: ${stats.totalUsers}`);
  console.log(`   Average Session Size: ${stats.averageUsersPerSession.toFixed(1)} users`);
  console.log();

  // const sessions = service.getAllSessions(); // Method not available
  // if (sessions.length > 0) {
  //   console.log(chalk.cyan('🏆 Session Performance:'));
  //   sessions.forEach(session => {
  //     const analytics = service.getSessionAnalytics(session.id);
  //     if (analytics) {
  //       console.log(`   📝 ${session.name}:`);
  //       console.log(`      Code Changes: ${analytics.codeChanges}`);
  //       console.log(`      AI Interactions: ${analytics.aiSuggestions}`);
  //       console.log(`      Collaboration Score: ${analytics.collaborationScore}/100`);
  //       console.log();
  //     }
  //   });
  // }

  console.log(chalk.magenta('🎯 COMPETITIVE INTELLIGENCE:'));
  console.log(chalk.white('This level of collaboration analytics is impossible with Cursor.'));
  console.log(chalk.white('We provide real-time metrics that prove our collaboration advantage!'));
}

async function handleStartServer(service: CollaborationService): Promise<void> {
  console.log(chalk.blue('🚀 Starting Recoder Collaboration Server...'));
  console.log(chalk.gray('Press Ctrl+C to stop'));
  console.log();

  service.on('session-created', (data) => {
    console.log(chalk.green(`📝 New session: ${data.session.name} (${data.session.id})`));
  });

  service.on('user-joined-session', (data) => {
    console.log(chalk.blue(`👤 ${data.user.name} joined "${data.session.name}"`));
  });

  service.on('user-left-session', (data) => {
    console.log(chalk.yellow(`👋 ${data.user.name} left "${data.session.name}"`));
  });

  const port = await portManager.getPortForService('collaboration-server');
  console.log(chalk.green(`✅ Collaboration server is running on port ${port}`));
  console.log(chalk.gray(`🔗 WebSocket endpoint: ws://localhost:${port}/collaboration`));
  console.log();
  console.log(chalk.magenta('🏆 CURSOR KILLER FEATURE ACTIVATED!'));
  console.log(chalk.white('Real-time collaborative development with AI agents.'));
  console.log(chalk.white('Something Cursor will never have!'));

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🛑 Shutting down collaboration server...'));
    await service.shutdown();
    console.log(chalk.green('✅ Server stopped'));
    process.exit(0);
  });

  // Prevent process from exiting
  setInterval(() => {}, 1000);
}