/**
 * Interactive chat commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import readline from 'readline';
import { Logger } from '@recoder/shared';
import { ChatService } from '../services/chat';
import { ConfigManager } from '../utils/config';
import { requireAuth } from '../utils/auth';

export function setupChatCommands(program: Command): void {
  const chat = program
    .command('chat')
    .description('Interactive AI conversation and assistance');

  // Start interactive chat
  chat
    .command('start')
    .description('Start interactive chat session')
    .option('-a, --agent <agentId>', 'specific agent to chat with')
    .option('-m, --model <model>', 'AI model to use')
    .option('-c, --context <file>', 'load context from file')
    .option('-s, --session <sessionId>', 'resume existing session')
    .option('--stream', 'enable streaming responses')
    .option('--voice', 'enable voice input/output')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleStartChat(options);
      } catch (error) {
        Logger.error(`Chat failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Quick ask command
  chat
    .command('ask <question>')
    .description('Ask a quick question')
    .option('-a, --agent <agentId>', 'specific agent to ask')
    .option('-m, --model <model>', 'AI model to use')
    .option('-c, --context <file>', 'include context from file')
    .option('--stream', 'stream response')
    .action(async (question, options) => {
      try {
        await requireAuth();
        await handleQuickAsk(question, options);
      } catch (error) {
        Logger.error(`Question failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Code review command
  chat
    .command('review [file]')
    .description('Get AI code review and suggestions')
    .option('-a, --agent <agentId>', 'code review agent')
    .option('-d, --diff', 'review git diff')
    .option('-f, --format <format>', 'output format (text|json|markdown)', 'text')
    .option('--suggestions', 'include improvement suggestions')
    .option('--security', 'focus on security issues')
    .option('--performance', 'focus on performance issues')
    .action(async (file, options) => {
      try {
        await requireAuth();
        await handleCodeReview(file, options);
      } catch (error) {
        Logger.error(`Code review failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Explain code command
  chat
    .command('explain [file]')
    .description('Get AI explanation of code')
    .option('-a, --agent <agentId>', 'explanation agent')
    .option('-l, --lines <range>', 'specific line range (e.g., 10-20)')
    .option('-f, --function <name>', 'specific function to explain')
    .option('--simple', 'use simple language')
    .option('--detailed', 'provide detailed explanation')
    .action(async (file, options) => {
      try {
        await requireAuth();
        await handleExplainCode(file, options);
      } catch (error) {
        Logger.error(`Code explanation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Debug command
  chat
    .command('debug [file]')
    .description('Get AI debugging assistance')
    .option('-a, --agent <agentId>', 'debugging agent')
    .option('-e, --error <message>', 'error message to debug')
    .option('-l, --logs <file>', 'log file to analyze')
    .option('--trace', 'include stack trace analysis')
    .action(async (file, options) => {
      try {
        await requireAuth();
        await handleDebugAssistance(file, options);
      } catch (error) {
        Logger.error(`Debug assistance failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Session management
  chat
    .command('sessions')
    .description('Manage chat sessions')
    .option('-l, --list', 'list all sessions')
    .option('-s, --show <sessionId>', 'show session details')
    .option('-d, --delete <sessionId>', 'delete session')
    .option('-c, --clear', 'clear all sessions')
    .option('-j, --json', 'output as JSON')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleSessionManagement(options);
      } catch (error) {
        Logger.error(`Session management failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Export conversation
  chat
    .command('export <sessionId>')
    .description('Export chat conversation')
    .option('-f, --format <format>', 'export format (json|markdown|txt)', 'markdown')
    .option('-o, --output <file>', 'output file')
    .action(async (sessionId, options) => {
      try {
        await requireAuth();
        await handleExportConversation(sessionId, options);
      } catch (error) {
        Logger.error(`Export failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleStartChat(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🤖 Recoder AI Assistant') + '\n' +
      chalk.gray('Type "/help" for commands, "/exit" to quit'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let agentId = options.agent;
  let model = options.model;
  let sessionId = options.session;

  // Agent selection if not specified
  if (!agentId && !model) {
    const token = ConfigManager.get('auth.token');
    const agentsResult = await ChatService.getAvailableAgents(token);
    
    if (agentsResult.success && agentsResult.agents.length > 0) {
      const response = await inquirer.prompt([
        {
          type: 'list',
          name: 'agent',
          message: 'Choose an agent:',
          choices: [
            { name: 'Default Assistant', value: 'default' },
            ...agentsResult.agents.map((agent: any) => ({
              name: `${agent.name} (${agent.type})`,
              value: agent.id,
            })),
          ],
        },
      ]);
      agentId = response.agent;
    }
  }

  // Load context if specified
  let context = '';
  if (options.context) {
    try {
      const fs = require('fs-extra');
      context = await fs.readFile(options.context, 'utf8');
      console.log(chalk.green(`📄 Loaded context from: ${options.context}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to load context file: ${error}`));
    }
  }

  // Create or resume session
  const token = ConfigManager.get('auth.token');
  let session;

  if (sessionId) {
    const sessionResult = await ChatService.getSession(token, sessionId);
    if (sessionResult.success) {
      session = sessionResult.session;
      console.log(chalk.green(`📝 Resumed session: ${session.id}`));
    } else {
      console.log(chalk.yellow('⚠️  Session not found, starting new session'));
    }
  }

  if (!session) {
    const newSessionResult = await ChatService.createSession(token, {
      agentId,
      model,
      context,
      stream: options.stream,
    });
    
    if (newSessionResult.success) {
      session = newSessionResult.session;
      console.log(chalk.green(`🆕 Started new session: ${session.id}`));
    } else {
      console.log(chalk.red('Failed to create chat session'));
      return;
    }
  }

  // Setup readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You: '),
  });

  console.log('\n' + chalk.yellow('💬 Chat started! Ask me anything about code, projects, or development.'));
  rl.prompt();

  rl.on('line', async (input) => {
    const message = input.trim();
    
    if (!message) {
      rl.prompt();
      return;
    }

    // Handle special commands
    if (message.startsWith('/')) {
      await handleChatCommand(message, session, rl);
      return;
    }

    // Send message to AI
    const spinner = ora('🤔 Thinking...').start();
    
    try {
      if (options.stream) {
        spinner.succeed();
        console.log(chalk.blue('Assistant: '));
        
        await ChatService.sendMessageStream(token, session.id, message, (chunk: string) => {
          process.stdout.write(chunk);
        });
        
        console.log('\n');
      } else {
        const response = await ChatService.sendMessage(token, session.id, message);
        
        if (response.success) {
          spinner.succeed();
          console.log(chalk.blue('Assistant: ') + response.message);
        } else {
          spinner.fail(chalk.red('Failed to get response'));
          console.log(chalk.red(response.error || 'Unknown error'));
        }
      }
    } catch (error) {
      spinner.fail(chalk.red('Error sending message'));
      console.log(chalk.red(`Error: ${error}`));
    }
    
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\n👋 Chat session ended. Session saved as: ') + chalk.cyan(session.id));
    process.exit(0);
  });
}

async function handleChatCommand(command: string, session: any, rl: any): Promise<void> {
  const [cmd, ...args] = command.slice(1).split(' ');
  
  switch (cmd) {
    case 'help':
      console.log(
        boxen(
          chalk.white('📚 Chat Commands\n') +
          chalk.gray('/help - Show this help\n') +
          chalk.gray('/exit - Exit chat\n') +
          chalk.gray('/clear - Clear conversation\n') +
          chalk.gray('/save <name> - Save conversation\n') +
          chalk.gray('/load <file> - Load context from file\n') +
          chalk.gray('/agent <id> - Switch agent\n') +
          chalk.gray('/model <name> - Switch model\n') +
          chalk.gray('/tokens - Show token usage\n') +
          chalk.gray('/export <format> - Export conversation'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
            title: 'Commands',
          }
        )
      );
      break;

    case 'exit':
    case 'quit':
      rl.close();
      return;

    case 'clear':
      const token = ConfigManager.get('auth.token');
      await ChatService.clearSession(token, session.id);
      console.log(chalk.green('🧹 Conversation cleared'));
      break;

    case 'save':
      const name = args.join(' ') || `chat-${Date.now()}`;
      console.log(chalk.green(`💾 Conversation saved as: ${name}`));
      break;

    case 'tokens':
      const usage = await ChatService.getSessionUsage(ConfigManager.get('auth.token'), session.id);
      if (usage.success) {
        console.log(
          boxen(
            chalk.white('📊 Token Usage\n') +
            chalk.gray(`Input tokens: ${usage.usage.inputTokens}\n`) +
            chalk.gray(`Output tokens: ${usage.usage.outputTokens}\n`) +
            chalk.gray(`Total tokens: ${usage.usage.totalTokens}\n`) +
            chalk.gray(`Estimated cost: $${usage.usage.cost || 'N/A'}`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Usage',
            }
          )
        );
      }
      break;

    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}`));
      console.log(chalk.gray('Type /help for available commands'));
  }
  
  rl.prompt();
}

async function handleQuickAsk(question: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('❓ Quick Question'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  console.log(chalk.white('Question: ') + chalk.gray(question));

  const spinner = ora('🤔 Getting answer...').start();

  try {
    const token = ConfigManager.get('auth.token');
    
    // Load context if specified
    let context = '';
    if (options.context) {
      const fs = require('fs-extra');
      context = await fs.readFile(options.context, 'utf8');
    }

    const result = await ChatService.quickAsk(token, question, {
      agentId: options.agent,
      model: options.model,
      context,
      stream: options.stream,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Answer received'));
      
      if (options.stream) {
        console.log(chalk.blue('\nAnswer: '));
        await ChatService.streamResponse(result.responseStream, (chunk: string) => {
          process.stdout.write(chunk);
        });
        console.log('\n');
      } else {
        console.log(
          boxen(
            result.answer,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
              title: 'Answer',
            }
          )
        );
      }

      if (result.usage) {
        console.log(chalk.gray(`\n💰 Tokens used: ${result.usage.totalTokens} | Cost: $${result.usage.cost || 'N/A'}`));
      }
    } else {
      spinner.fail(chalk.red('Failed to get answer'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Question failed'));
    throw error;
  }
}

async function handleCodeReview(file: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🔍 AI Code Review'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let codeContent = '';
  
  try {
    if (options.diff) {
      // Get git diff
      const { execSync } = require('child_process');
      codeContent = execSync('git diff', { encoding: 'utf8' });
      if (!codeContent.trim()) {
        console.log(chalk.yellow('No changes in git diff'));
        return;
      }
      console.log(chalk.gray('📝 Reviewing git diff...'));
    } else if (file) {
      // Read specific file
      const fs = require('fs-extra');
      codeContent = await fs.readFile(file, 'utf8');
      console.log(chalk.gray(`📝 Reviewing file: ${file}`));
    } else {
      console.log(chalk.red('Please specify a file or use --diff for git changes'));
      return;
    }
  } catch (error) {
    console.log(chalk.red(`Failed to read code: ${error}`));
    return;
  }

  const spinner = ora('🔍 Analyzing code...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ChatService.reviewCode(token, codeContent, {
      agentId: options.agent,
      focusAreas: {
        security: options.security,
        performance: options.performance,
        suggestions: options.suggestions,
      },
      format: options.format,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Code review completed'));
      
      const review = result.review;

      if (options.format === 'json') {
        console.log(JSON.stringify(review, null, 2));
      } else if (options.format === 'markdown') {
        console.log(review.markdown);
      } else {
        // Display formatted review
        if (review.summary) {
          console.log(
            boxen(
              chalk.white('📊 Review Summary\n') +
              chalk.gray(`Overall Score: ${review.summary.score}/10\n`) +
              chalk.gray(`Issues Found: ${review.summary.issuesCount}\n`) +
              chalk.gray(`Suggestions: ${review.summary.suggestionsCount}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Summary',
              }
            )
          );
        }

        if (review.issues && review.issues.length > 0) {
          console.log(
            boxen(
              chalk.white('🚨 Issues Found\n') +
              review.issues.map((issue: any) => 
                chalk.red(`• ${issue.severity.toUpperCase()}: ${issue.message}\n`) +
                chalk.gray(`  Line ${issue.line}: ${issue.description}\n`) +
                (issue.suggestion ? chalk.yellow(`  💡 ${issue.suggestion}`) : '')
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'red',
                title: 'Issues',
              }
            )
          );
        }

        if (review.suggestions && review.suggestions.length > 0) {
          console.log(
            boxen(
              chalk.white('💡 Suggestions\n') +
              review.suggestions.map((suggestion: any) => 
                chalk.green(`• ${suggestion.title}\n`) +
                chalk.gray(`  ${suggestion.description}\n`) +
                (suggestion.example ? chalk.gray(`  Example: ${suggestion.example}`) : '')
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'green',
                title: 'Suggestions',
              }
            )
          );
        }

        if (review.compliments && review.compliments.length > 0) {
          console.log(
            boxen(
              chalk.white('✅ Good Practices\n') +
              review.compliments.map((compliment: string) => 
                chalk.green(`• ${compliment}`)
              ).join('\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'green',
                title: 'Well Done',
              }
            )
          );
        }
      }
    } else {
      spinner.fail(chalk.red('Code review failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Code review failed'));
    throw error;
  }
}

async function handleExplainCode(file: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('📚 Code Explanation'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  if (!file) {
    console.log(chalk.red('Please specify a file to explain'));
    return;
  }

  let codeContent = '';
  
  try {
    const fs = require('fs-extra');
    codeContent = await fs.readFile(file, 'utf8');
    
    // Filter by line range if specified
    if (options.lines) {
      const [start, end] = options.lines.split('-').map(Number);
      const lines = codeContent.split('\n');
      codeContent = lines.slice(start - 1, end).join('\n');
      console.log(chalk.gray(`📝 Explaining lines ${start}-${end} of ${file}`));
    } else {
      console.log(chalk.gray(`📝 Explaining file: ${file}`));
    }
  } catch (error) {
    console.log(chalk.red(`Failed to read file: ${error}`));
    return;
  }

  const spinner = ora('🤔 Analyzing code...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ChatService.explainCode(token, codeContent, {
      agentId: options.agent,
      filename: file,
      specificFunction: options.function,
      explanationLevel: options.simple ? 'simple' : options.detailed ? 'detailed' : 'normal',
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Explanation ready'));
      
      console.log(
        boxen(
          result.explanation,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Code Explanation',
          }
        )
      );

      if (result.keypoints && result.keypoints.length > 0) {
        console.log(
          boxen(
            chalk.white('🔑 Key Points\n') +
            result.keypoints.map((point: string) => chalk.gray(`• ${point}`)).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Key Points',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Code explanation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Code explanation failed'));
    throw error;
  }
}

async function handleDebugAssistance(file: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🐛 Debug Assistance'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let debugContext = '';
  
  // Gather debug information
  if (file) {
    try {
      const fs = require('fs-extra');
      debugContext += `Code:\n${await fs.readFile(file, 'utf8')}\n\n`;
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not read file ${file}`));
    }
  }

  if (options.error) {
    debugContext += `Error Message:\n${options.error}\n\n`;
  }

  if (options.logs) {
    try {
      const fs = require('fs-extra');
      debugContext += `Logs:\n${await fs.readFile(options.logs, 'utf8')}\n\n`;
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not read log file ${options.logs}`));
    }
  }

  if (!debugContext.trim()) {
    console.log(chalk.red('Please provide a file, error message, or log file to debug'));
    return;
  }

  const spinner = ora('🔍 Analyzing debug information...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ChatService.debugAssist(token, debugContext, {
      agentId: options.agent,
      includeStackTrace: options.trace,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Debug analysis completed'));
      
      const debug = result.debug;

      if (debug.problemIdentified) {
        console.log(
          boxen(
            chalk.white('🎯 Problem Identified\n') +
            chalk.gray(debug.problemIdentified),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'red',
              title: 'Problem',
            }
          )
        );
      }

      if (debug.possibleCauses && debug.possibleCauses.length > 0) {
        console.log(
          boxen(
            chalk.white('🤔 Possible Causes\n') +
            debug.possibleCauses.map((cause: string, index: number) => 
              chalk.gray(`${index + 1}. ${cause}`)
            ).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
              title: 'Causes',
            }
          )
        );
      }

      if (debug.solutions && debug.solutions.length > 0) {
        console.log(
          boxen(
            chalk.white('💡 Suggested Solutions\n') +
            debug.solutions.map((solution: any, index: number) => 
              chalk.green(`${index + 1}. ${solution.title}\n`) +
              chalk.gray(`   ${solution.description}\n`) +
              (solution.code ? chalk.gray(`   Code: ${solution.code}`) : '')
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
              title: 'Solutions',
            }
          )
        );
      }

      if (debug.preventionTips && debug.preventionTips.length > 0) {
        console.log(
          boxen(
            chalk.white('🛡️  Prevention Tips\n') +
            debug.preventionTips.map((tip: string) => chalk.gray(`• ${tip}`)).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Prevention',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Debug assistance failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Debug assistance failed'));
    throw error;
  }
}

async function handleSessionManagement(options: any): Promise<void> {
  const token = ConfigManager.get('auth.token');

  if (options.list) {
    const spinner = ora('Fetching chat sessions...').start();
    
    try {
      const result = await ChatService.listSessions(token);
      
      if (result.success) {
        spinner.succeed(chalk.green(`Found ${result.sessions.length} sessions`));
        
        if (result.sessions.length === 0) {
          console.log(chalk.yellow('No chat sessions found.'));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(result.sessions, null, 2));
        } else {
          console.log(
            boxen(
              chalk.white('💬 Chat Sessions\n') +
              result.sessions.map((session: any) => 
                chalk.cyan(`• ${session.id}\n`) +
                chalk.gray(`  Created: ${new Date(session.createdAt).toLocaleString()}\n`) +
                chalk.gray(`  Messages: ${session.messageCount}\n`) +
                chalk.gray(`  Agent: ${session.agentName || 'Default'}`)
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
              }
            )
          );
        }
      } else {
        spinner.fail(chalk.red('Failed to fetch sessions'));
        console.log(chalk.red(result.error || 'Unknown error'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch sessions'));
      throw error;
    }
  } else if (options.show) {
    const spinner = ora('Fetching session details...').start();
    
    try {
      const result = await ChatService.getSession(token, options.show);
      
      if (result.success) {
        spinner.succeed(chalk.green('Session details retrieved'));
        
        if (options.json) {
          console.log(JSON.stringify(result.session, null, 2));
        } else {
          const session = result.session;
          console.log(
            boxen(
              chalk.white(`💬 Session: ${session.id}\n`) +
              chalk.gray(`Created: ${new Date(session.createdAt).toLocaleString()}\n`) +
              chalk.gray(`Messages: ${session.messages.length}\n`) +
              chalk.gray(`Agent: ${session.agentName || 'Default'}\n`) +
              chalk.gray(`Model: ${session.model || 'Default'}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: 'Session Details',
              }
            )
          );

          // Show recent messages
          if (session.messages && session.messages.length > 0) {
            const recentMessages = session.messages.slice(-5);
            console.log(
              boxen(
                chalk.white('Recent Messages\n') +
                recentMessages.map((msg: any) => 
                  chalk.blue(msg.role === 'user' ? 'You: ' : 'AI: ') + chalk.gray(msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''))
                ).join('\n'),
                {
                  padding: 1,
                  borderStyle: 'round',
                  borderColor: 'blue',
                  title: 'Messages',
                }
              )
            );
          }
        }
      } else {
        spinner.fail(chalk.red('Failed to fetch session'));
        console.log(chalk.red(result.error || 'Session not found'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch session'));
      throw error;
    }
  } else if (options.delete) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'delete',
        message: `Delete session "${options.delete}"?`,
        default: false,
      },
    ]);

    if (!confirmed.delete) {
      console.log(chalk.yellow('Session deletion cancelled.'));
      return;
    }

    const spinner = ora('Deleting session...').start();
    
    try {
      const result = await ChatService.deleteSession(token, options.delete);
      
      if (result.success) {
        spinner.succeed(chalk.green('Session deleted successfully'));
      } else {
        spinner.fail(chalk.red('Failed to delete session'));
        console.log(chalk.red(result.error || 'Unknown error'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to delete session'));
      throw error;
    }
  } else if (options.clear) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'clear',
        message: 'Delete ALL chat sessions?',
        default: false,
      },
    ]);

    if (!confirmed.clear) {
      console.log(chalk.yellow('Clear operation cancelled.'));
      return;
    }

    const spinner = ora('Clearing all sessions...').start();
    
    try {
      const result = await ChatService.clearAllSessions(token);
      
      if (result.success) {
        spinner.succeed(chalk.green(`Cleared ${result.deletedCount} sessions`));
      } else {
        spinner.fail(chalk.red('Failed to clear sessions'));
        console.log(chalk.red(result.error || 'Unknown error'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to clear sessions'));
      throw error;
    }
  } else {
    console.log(chalk.yellow('Please specify an action: --list, --show, --delete, or --clear'));
  }
}

async function handleExportConversation(sessionId: string, options: any): Promise<void> {
  const spinner = ora('Exporting conversation...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ChatService.exportSession(token, sessionId, {
      format: options.format,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Conversation exported'));
      
      const outputFile = options.output || `chat-${sessionId}.${options.format}`;
      const fs = require('fs-extra');
      
      await fs.writeFile(outputFile, result.content);
      
      console.log(
        boxen(
          chalk.white(`📄 Exported to: ${outputFile}\n`) +
          chalk.gray(`Format: ${options.format}\n`) +
          chalk.gray(`Size: ${result.content.length} characters`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Export Complete',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Export failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Export failed'));
    throw error;
  }
}