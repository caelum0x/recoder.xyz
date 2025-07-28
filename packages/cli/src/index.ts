#!/usr/bin/env node

/**
 * Recoder CLI
 * AI-powered development platform with production-ready code generation
 * Integrated with unified configuration and session management
 */

import { Command } from 'commander';
import chalk from 'chalk';
// import figlet from 'figlet';
import boxen from 'boxen';
import { Logger } from '@recoder/shared';

// Import unified ecosystem components
import { cliConfig, UnifiedConfigManager } from '../../shared/src/config/unified-config';
import { cliSessionManager, SessionManager } from '../../shared/src/session/session-manager';
import { packageRegistry } from '../../shared/src/registry/package-registry';

const VERSION = '1.0.0';

// Import real AI services
import { AIHub, TaskContext } from './services/ai-hub';
import { productionEngineClient, CodeGenerationRequest } from './services/production-engine-client';
import { RealityValidationSystem } from './services/reality-validator';
import { AgentManager, AgentRequest } from './services/specialized-agents';
import { ProjectContextAnalyzer } from './services/project-context';
import { backendClient } from './services/backend-client';

// Import commands
import { createOllamaCommand } from './commands/ollama';
import AICommandsRegistry from './commands/ai';
import { createAuthCommand } from './commands/auth';

// Production-ready command setup with unified configuration
function setupProductionCommands(program: Command): void {
  const config = cliConfig();
  const sessionManager = cliSessionManager();
  const aiHub = AIHub.getInstance();
  // Production Engine Client for real code generation
  
  // Initialize package registry with core packages
  packageRegistry.registerCorePackages();
  const validator = new RealityValidationSystem();
  const agentManager = new AgentManager();
  const contextAnalyzer = new ProjectContextAnalyzer();

  // Generate command - REAL AI-powered code generation with backend integration
  program
    .command('generate')
    .alias('gen')
    .description('Generate REAL, production-ready code using AI (not mock!)')
    .argument('<description>', 'What to build (e.g. "Solana DEX with token swapping")')
    .option('-o, --output <path>', 'Output directory', './generated')
    .option('-t, --type <type>', 'Project type', 'web')
    .option('--complexity <level>', 'Complexity level', 'medium')
    .option('--validate', 'Validate generated code functionality', false)
    .action(async (description: string, options: any) => {
      console.log(chalk.cyan('\n🚀 RECODER - Production-Ready Code Generation\n'));
      
      // Check backend connection and user session
      const isBackendAvailable = await backendClient.isBackendAvailable();
      const userSession = backendClient.getCurrentSession();
      
      if (isBackendAvailable && userSession) {
        console.log(chalk.green(`👤 Logged in as ${userSession.email} (${userSession.plan} plan)`));
        console.log(chalk.gray(`📊 Quota: ${userSession.quotas.usedRequests}/${userSession.quotas.totalRequests} requests used\n`));
        
        // Check quota before proceeding
        const hasQuota = await backendClient.checkQuota();
        if (!hasQuota) {
          console.log(chalk.red('❌ Request quota exceeded. Please upgrade your plan or wait for reset.'));
          return;
        }
      } else if (isBackendAvailable && !userSession) {
        console.log(chalk.yellow('⚠️ Not logged in. Run "recoder auth login" to sync across platforms and track usage.'));
      } else {
        console.log(chalk.gray('📴 Backend offline - running in local mode'));
      }

      console.log(chalk.white(`Generating: ${description}`));
      console.log(chalk.gray(`Type: ${options.type} | Complexity: ${options.complexity}`));
      console.log(chalk.gray(`Output: ${options.output}\n`));

      const startTime = Date.now();
      try {
        // Analyze project context first
        let projectContext;
        try {
          console.log(chalk.blue('🔍 Analyzing project context...'));
          projectContext = await contextAnalyzer.analyzeProject(process.cwd());
          console.log(chalk.green(`✅ Detected ${projectContext.type} project with ${projectContext.framework || 'custom'} framework`));
        } catch {
          console.log(chalk.gray('📂 No existing project context found - creating new project'));
        }

        // Check AI providers
        const providers = aiHub.getAvailableProviders();
        const availableProviders = providers.filter(p => p.available);
        
        if (availableProviders.length === 0) {
          console.log(chalk.red('❌ No AI providers available!'));
          console.log(chalk.yellow('Please set up at least one API key:'));
          console.log(chalk.white('  • ANTHROPIC_API_KEY for Claude'));
          console.log(chalk.white('  • GROQ_API_KEY for Groq/Llama'));
          console.log(chalk.white('  • GOOGLE_API_KEY for Gemini'));
          return;
        }

        // Select best agent for the task
        const bestAgent = agentManager.findBestAgent(description, projectContext);
        console.log(chalk.blue(`🎯 Selected ${bestAgent.capability.name} for this task`));

        console.log(chalk.green('✅ AI Providers:'));
        availableProviders.forEach(p => {
          console.log(chalk.white(`  • ${p.name} - ${p.specialties.slice(0, 2).join(', ')}`));
        });
        console.log('');

        // Generate the application using production engine
        const request: CodeGenerationRequest = {
          description,
          type: options.type as any,
          framework: projectContext?.framework,
          features: [], // Could extract from description
          outputPath: options.output,
          userId: userSession?.userId
        };

        console.log(chalk.blue('🤖 Production engine is generating your application...'));
        const result = await productionEngineClient.generateCode(request);

        if (result.success) {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          console.log(chalk.green(`\n✅ Generation completed! Created ${result.files.length} files.`));
          console.log(chalk.white('\n📁 Generated Files:'));
          result.files.forEach(file => {
            console.log(chalk.gray(`  • ${file.path}`));
          });

          // Display security validation results
          if (result.securityValidation) {
            const security = result.securityValidation;
            console.log(chalk.cyan('\n🔒 Security Validation:'));
            
            // Security score with color coding
            const scoreColor = security.securityScore >= 80 ? chalk.green : 
                              security.securityScore >= 60 ? chalk.yellow : chalk.red;
            console.log(scoreColor(`  Security Score: ${security.securityScore}/100`));
            
            // Vulnerabilities
            if (security.vulnerabilities.length > 0) {
              const critical = security.vulnerabilities.filter(v => v.severity === 'critical').length;
              const high = security.vulnerabilities.filter(v => v.severity === 'high').length;
              const medium = security.vulnerabilities.filter(v => v.severity === 'medium').length;
              const low = security.vulnerabilities.filter(v => v.severity === 'low').length;
              
              console.log(chalk.red(`  ⚠️ Vulnerabilities: ${security.vulnerabilities.length} total`));
              if (critical > 0) console.log(chalk.red(`    • Critical: ${critical}`));
              if (high > 0) console.log(chalk.yellow(`    • High: ${high}`));
              if (medium > 0) console.log(chalk.white(`    • Medium: ${medium}`));
              if (low > 0) console.log(chalk.gray(`    • Low: ${low}`));
            } else {
              console.log(chalk.green(`  ✅ No vulnerabilities detected`));
            }
            
            // Secrets
            if (security.secrets.length > 0) {
              console.log(chalk.yellow(`  🔑 Secrets detected: ${security.secrets.length}`));
            } else {
              console.log(chalk.green(`  ✅ No secrets detected`));
            }
            
            // Compliance issues
            if (security.complianceIssues.length > 0) {
              console.log(chalk.yellow(`  📋 Compliance issues: ${security.complianceIssues.length}`));
            } else {
              console.log(chalk.green(`  ✅ No compliance issues`));
            }
            
            // Recommendations
            if (security.recommendations.length > 0) {
              console.log(chalk.cyan('\n💡 Security Recommendations:'));
              security.recommendations.slice(0, 3).forEach(rec => {
                const priorityColor = rec.priority === 'critical' ? chalk.red :
                                    rec.priority === 'high' ? chalk.yellow : chalk.white;
                console.log(priorityColor(`  • ${rec.title}: ${rec.description}`));
              });
            }
          }

          if (result.instructions) {
            console.log(chalk.cyan('\n📋 Setup Instructions:'));
            console.log(chalk.white(result.instructions));
          }

          // Track usage in backend
          if (isBackendAvailable) {
            await backendClient.trackUsage({
              platform: 'cli',
              command: `generate ${options.type}`,
              tokens: 1000, // Estimate based on generation complexity
              model: 'recoder-ai',
              timestamp: new Date()
            });

            // Save project to backend
            await backendClient.saveProject({
              name: description.substring(0, 50),
              description,
              type: options.type,
              files: result.files,
              metadata: {
                complexity: options.complexity,
                validated: options.validate,
                duration,
                generatedAt: new Date()
              }
            });
          }

          if (options.validate) {
            console.log(chalk.blue('\n🔍 Validating generated code...'));
            const validationResult = await validator.validateProject(options.output, {
              includeCategories: [
                'code_quality' as any,
                'integration' as any,
                'production' as any
              ]
            });

            console.log(chalk.white(`\n📊 Validation Score: ${validationResult.summary.score}/100`));
            if (validationResult.summary.score >= 70) {
              console.log(chalk.green('✅ Code passes production readiness checks!'));
            } else {
              console.log(chalk.yellow('⚠️ Code needs improvements for production'));
            }
          }

          console.log(chalk.green('\n🎉 Your production-ready application is ready!'));
          console.log(chalk.white(`📂 Location: ${options.output}`));
          
        } else {
          console.log(chalk.red(`\n❌ Generation failed: ${result.error}`));
        }

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        Logger.error(`Generation failed: ${error.message}`);
      }
    });

  // Plan command - REAL AI-powered project planning
  program
    .command('plan')
    .description('Create a detailed project plan with real architecture')
    .argument('<description>', 'Project description')
    .option('--detailed', 'Generate detailed implementation plan')
    .option('--budget', 'Include cost and time estimates')
    .action(async (description: string, options: any) => {
      console.log(chalk.cyan('\n📋 RECODER - AI Project Planning\n'));
      console.log(chalk.white(`Planning: ${description}\n`));

      try {
        const context: TaskContext = {
          type: 'general',
          complexity: 'medium',
          priority: 'quality'
        };

        const planningPrompt = `Create a comprehensive project plan for: ${description}

Generate a REAL, actionable project plan including:
1. Architecture Overview
2. Technology Stack Recommendations
3. Development Phases with timelines
4. Required Resources and Dependencies
5. Risk Assessment and Mitigation
6. Deployment Strategy
7. Testing Strategy
${options.budget ? '8. Budget and Time Estimates' : ''}
${options.detailed ? '9. Detailed Implementation Steps' : ''}

Make this a production-ready plan that can actually be executed.`;

        console.log(chalk.blue('🤖 AI is analyzing and planning your project...'));
        const response = await aiHub.chat([
          { role: 'user', content: planningPrompt }
        ], context, { maxTokens: 6000 });

        console.log(chalk.green('\n✅ Project Plan Generated:\n'));
        console.log(chalk.white(response.content));

        console.log(chalk.green('\n🎯 Next Steps:'));
        console.log(chalk.white('  • Review the project plan'));
        console.log(chalk.white('  • Run: recoder generate "' + description + '" to start building'));
        console.log(chalk.white('  • Use --validate flag to ensure production readiness'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Planning failed: ${error.message}`));
        Logger.error(`Planning failed: ${error.message}`);
      }
    });

  // Validate command - Real functionality validation
  program
    .command('validate')
    .description('Validate that generated code has REAL functionality')
    .argument('<project-path>', 'Path to the project to validate')
    .option('--type <type>', 'Project type to validate', 'web')
    .option('--fix', 'Show fixes for validation failures')
    .action(async (projectPath: string, options: any) => {
      console.log(chalk.cyan('\n🔍 RECODER - Reality Validation\n'));
      console.log(chalk.white(`Validating: ${projectPath}`));
      console.log(chalk.gray(`Type: ${options.type}\n`));

      try {
        console.log(chalk.blue('🔍 Analyzing project for real functionality...'));
        const report = await validator.validateProject(projectPath, {
          includeCategories: ['code_quality', 'integration', 'production', 'blockchain'].filter(Boolean) as any[]
        });

        console.log(chalk.white(`\n📊 Validation Results:`));
        console.log(chalk.white(`  Score: ${report.summary.score}/100`));
        console.log(chalk.white(`  Tests: ${report.summary.passed}/${report.summary.totalRules} passed`));
        console.log(chalk.white(`  Warnings: ${report.summary.warnings}`));
        console.log(chalk.white(`  Errors: ${report.summary.failed}`));

        // Show category breakdown
        console.log(chalk.cyan('\n📈 Category Breakdown:'));
        Object.entries(report.categories).forEach(([category, results]) => {
          const total = results.rules.length;
          const passed = results.passed;
          const score = total > 0 ? Math.round((passed / total) * 100) : 0;
          const icon = score >= 70 ? '✅' : score >= 40 ? '⚠️' : '❌';
          console.log(chalk.white(`  ${icon} ${category}: ${passed}/${total} (${score}%)`));
        });

        if (report.summary.score >= 90) {
          console.log(chalk.green('\n🎉 EXCELLENT! This is production-ready code with real functionality!'));
        } else if (report.summary.score >= 70) {
          console.log(chalk.green('\n✅ GOOD! Code has real functionality with minor improvements needed.'));
        } else if (report.summary.score >= 50) {
          console.log(chalk.yellow('\n⚠️ FAIR. Code has some real functionality but needs work for production.'));
        } else {
          console.log(chalk.red('\n❌ POOR. Code appears to have mostly mock/placeholder implementations.'));
        }

        if (options.fix && report.fixes.length > 0) {
          console.log(chalk.cyan('\n🔧 Recommended Fixes:'));
          report.fixes.slice(0, 10).forEach((fix, i) => {
            console.log(chalk.white(`  ${i + 1}. ${fix}`));
          });
        }

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Validation failed: ${error.message}`));
        Logger.error(`Validation failed: ${error.message}`);
      }
    });

  // Chat command - Real AI chat interface
  program
    .command('chat')
    .alias('c')
    .description('Interactive AI chat for development assistance')
    .option('--model <model>', 'Specific AI model to use')
    .action(async (options: any) => {
      console.log(chalk.cyan('\n💬 RECODER - AI Development Chat\n'));
      
      const providers = aiHub.getAvailableProviders();
      const available = providers.filter(p => p.available);
      
      if (available.length === 0) {
        console.log(chalk.red('❌ No AI providers available. Please configure API keys.'));
        return;
      }

      console.log(chalk.green('Available AI Providers:'));
      available.forEach(p => {
        console.log(chalk.white(`  • ${p.name} - ${p.specialties.join(', ')}`));
      });
      console.log(chalk.gray('\nType "help" for commands, "exit" to quit.\n'));

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const context: TaskContext = {
        type: 'general',
        complexity: 'medium',
        priority: 'quality'
      };

      const conversationHistory: any[] = [];

      const askQuestion = () => {
        rl.question(chalk.cyan('You: '), async (input: string) => {
          if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log(chalk.green('\n👋 Thanks for using Recoder! Keep building amazing things!\n'));
            rl.close();
            return;
          }

          if (input.toLowerCase() === 'help') {
            console.log(chalk.white('\n🤖 Recoder AI Commands:'));
            console.log(chalk.gray('  • Ask any development question'));
            console.log(chalk.gray('  • Request code generation: "generate a React component"'));
            console.log(chalk.gray('  • Ask for architecture advice: "how should I structure my app?"'));
            console.log(chalk.gray('  • Get deployment help: "deploy my app to AWS"'));
            console.log(chalk.gray('  • Type "exit" to quit\n'));
            askQuestion();
            return;
          }

          try {
            conversationHistory.push({ role: 'user', content: input });
            
            console.log(chalk.blue('\n🤖 AI: '), { color: false });
            const response = await aiHub.chat(conversationHistory, context, { maxTokens: 2000 });
            
            console.log(chalk.white(response.content + '\n'));
            conversationHistory.push({ role: 'assistant', content: response.content });
            
          } catch (error: any) {
            console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
          }
          
          askQuestion();
        });
      };

      askQuestion();
    });

  // Agent command - Work with specialized AI agents
  program
    .command('agent')
    .description('Work with specialized AI agents')
    .argument('[task]', 'Task to execute with an agent')
    .option('--list', 'List all available agents')
    .option('--agent <name>', 'Use specific agent')
    .option('--consensus', 'Get multiple agent opinions')
    .action(async (task?: string, options?: any) => {
      console.log(chalk.cyan('\n🤖 RECODER - AI Agent System\n'));

      if (options.list) {
        const agents = agentManager.getAvailableAgents();
        console.log(chalk.green('Available Specialized Agents:\n'));
        
        agents.forEach(agent => {
          console.log(chalk.white(`${agent.description}`));
          console.log(chalk.gray(`  Specializations: ${agent.specializations.slice(0, 4).join(', ')}`));
          console.log(chalk.gray(`  Preferred Models: ${agent.preferredModels.join(', ')}\n`));
        });
        return;
      }

      if (!task) {
        console.log(chalk.yellow('Please provide a task or use --list to see available agents'));
        console.log(chalk.gray('Example: recoder agent "create a Solana smart contract"'));
        return;
      }

      try {
        // Analyze project context if in a project directory
        let projectContext;
        try {
          projectContext = await contextAnalyzer.analyzeProject(process.cwd());
        } catch {
          // Not in a project directory, continue without context
        }

        const request: AgentRequest = {
          task,
          context: projectContext
        };

        if (options.consensus) {
          console.log(chalk.blue('🔍 Getting consensus from multiple agents...'));
          const result = await agentManager.getConsensus(request);
          
          console.log(chalk.green(`\n✅ Consensus Result (${result.confidence}% confidence):\n`));
          console.log(chalk.white(result.consensus));
          
          if (result.responses.length > 1) {
            console.log(chalk.cyan('\n📊 Agent Contributions:'));
            result.responses.forEach(response => {
              console.log(chalk.white(`  • ${response.agentName}: ${response.confidence}% confidence`));
            });
          }
        } else {
          let agent;
          if (options.agent) {
            agent = agentManager.getAgent(options.agent);
            if (!agent) {
              console.log(chalk.red(`❌ Agent '${options.agent}' not found`));
              return;
            }
          } else {
            agent = agentManager.findBestAgent(task, projectContext);
          }

          console.log(chalk.blue(`🎯 Selected: ${agent.capability.name}`));
          console.log(chalk.blue('🔍 Analyzing and executing task...\n'));
          
          const response = await agentManager.executeTask(request);
          
          console.log(chalk.green(`✅ ${response.agentName} Response (${response.confidence}% confidence):\n`));
          console.log(chalk.white(response.content));
          
          if (response.recommendations && response.recommendations.length > 0) {
            console.log(chalk.cyan('\n💡 Recommendations:'));
            response.recommendations.forEach((rec, i) => {
              console.log(chalk.white(`  ${i + 1}. ${rec}`));
            });
          }

          if (response.nextSteps && response.nextSteps.length > 0) {
            console.log(chalk.cyan('\n🎯 Next Steps:'));
            response.nextSteps.forEach((step, i) => {
              console.log(chalk.white(`  ${i + 1}. ${step}`));
            });
          }
        }

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Agent execution failed: ${error.message}`));
        Logger.error(`Agent execution failed: ${error.message}`);
      }
    });

  // Context command - Analyze and manage project context
  program
    .command('context')
    .description('Analyze and manage project context')
    .option('--analyze', 'Analyze current project context')
    .option('--create-config', 'Create example recoder.md configuration')
    .action(async (options: any) => {
      console.log(chalk.cyan('\n📋 RECODER - Project Context Analysis\n'));

      try {
        if (options.createConfig) {
          await contextAnalyzer.createExampleRecoderConfig(process.cwd());
          console.log(chalk.green('✅ Created example recoder.md configuration file'));
          console.log(chalk.white('Edit this file to customize AI behavior for your project'));
          return;
        }

        console.log(chalk.blue('🔍 Analyzing project context...'));
        const context = await contextAnalyzer.analyzeProject(process.cwd());

        console.log(chalk.green('\n✅ Project Analysis Complete:\n'));
        
        console.log(chalk.white(`📂 Project Type: ${context.type}`));
        if (context.framework) {
          console.log(chalk.white(`⚡ Framework: ${context.framework}`));
        }
        
        if (context.techStack.length > 0) {
          console.log(chalk.white(`🔧 Tech Stack: ${context.techStack.join(', ')}`));
        }

        console.log(chalk.cyan('\n🛠️ Configuration:'));
        const config = context.configuration;
        console.log(chalk.white(`  • TypeScript: ${config.hasTypeScript ? '✅' : '❌'}`));
        console.log(chalk.white(`  • Testing: ${config.hasTesting ? '✅' : '❌'}`));
        console.log(chalk.white(`  • Linting: ${config.hasLinting ? '✅' : '❌'}`));
        console.log(chalk.white(`  • Docker: ${config.hasDocker ? '✅' : '❌'}`));
        console.log(chalk.white(`  • CI/CD: ${config.hasCI ? '✅' : '❌'}`));

        console.log(chalk.cyan('\n📚 Documentation:'));
        console.log(chalk.white(`  • README: ${context.documentation.readme ? '✅' : '❌'}`));
        console.log(chalk.white(`  • Knowledge.md: ${context.documentation.knowledgeMd ? '✅' : '❌'}`));
        console.log(chalk.white(`  • Architecture: ${context.documentation.architecture ? '✅' : '❌'}`));

        console.log(chalk.cyan('\n🤖 AI Preferences:'));
        console.log(chalk.white(`  • Preferred Models: ${context.preferences.preferredModels.join(', ')}`));
        console.log(chalk.white(`  • Security Level: ${context.preferences.securityLevel}`));
        console.log(chalk.white(`  • Code Style: ${context.preferences.codeStyle}`));

        if (context.dependencies.length > 0) {
          console.log(chalk.cyan(`\n📦 Dependencies: ${context.dependencies.length} packages`));
          const mainDeps = context.dependencies.slice(0, 10);
          console.log(chalk.gray(`  Key packages: ${mainDeps.join(', ')}`));
        }

        console.log(chalk.green('\n💡 This context will be used to customize AI responses for your project!'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Context analysis failed: ${error.message}`));
        Logger.error(`Context analysis failed: ${error.message}`);
      }
    });

  // Add authentication commands for unified user management
  program.addCommand(createAuthCommand());

  // Add Ollama management command (legacy)
  program.addCommand(createOllamaCommand());
  
  // Add unified AI commands with enhanced capabilities
  AICommandsRegistry.register(program);
}

async function main() {
  try {
    // Display Recoder banner
    console.log(
      chalk.cyan(
        '██████  ███████  ██████  ██████  ██████  ███████ ██████ \n' +
        '██   ██ ██      ██      ██    ██ ██   ██ ██      ██   ██\n' +
        '██████  █████   ██      ██    ██ ██   ██ █████   ██████ \n' +
        '██   ██ ██      ██      ██    ██ ██   ██ ██      ██   ██\n' +
        '██   ██ ███████  ██████  ██████  ██████  ███████ ██   ██'
      )
    );

    console.log(
      boxen(
        chalk.white('🚀 AI-powered development platform with production-ready code generation\n') +
        chalk.gray('Generate real working code, not mock implementations'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          textAlignment: 'center',
        }
      )
    );

    // Create main program
    const program = new Command();
    
    program
      .name('recoder')
      .description('AI-powered development platform with production-ready code generation')
      .version(VERSION, '-v, --version', 'display version number')
      .option('--verbose', 'enable verbose logging')
      .option('--no-color', 'disable colored output')
      .hook('preAction', async (thisCommand) => {
        // Set up logging based on verbose flag
        if (thisCommand.opts().verbose) {
          process.env.LOG_LEVEL = 'debug';
        }
        
        // Disable colors if requested
        if (thisCommand.opts().noColor) {
          chalk.level = 0;
        }
      });

    // Setup production-ready AI commands
    setupProductionCommands(program);

    // Handle unknown commands
    program.on('command:*', (operands) => {
      Logger.error(`Unknown command: ${operands[0]}`);
      console.log(chalk.yellow('Run ') + chalk.cyan('recoder --help') + chalk.yellow(' to see available commands.'));
      process.exitCode = 1;
    });

    // Handle natural language commands with REAL AI processing
    const args = process.argv.slice(2);
    
    // If just "recoder" is called with no arguments, show help
    if (args.length === 0) {
      program.help();
      return;
    }
    
    // Check if this looks like a natural language command
    const isNaturalLanguage = (
      (args.length === 1 && args[0].includes(' ') && !args[0].startsWith('-')) ||
      (args.length >= 1 && !args[0].startsWith('-') && !['generate', 'plan', 'validate', 'chat', 'agent', 'context', 'help', 'version'].includes(args[0]))
    );
    
    if (isNaturalLanguage) {
      const naturalCommand = args.join(' ');
      console.log(chalk.cyan('\n🤖 RECODER - Natural Language Processing\n'));
      console.log(chalk.white(`Understanding: "${naturalCommand}"\n`));

      try {
        const aiHub = AIHub.getInstance();
        const providers = aiHub.getAvailableProviders().filter(p => p.available);
        
        if (providers.length === 0) {
          console.log(chalk.yellow('⚠️ Natural language commands require AI providers.'));
          console.log(chalk.white('Please configure at least one API key and try: recoder generate "' + naturalCommand + '"'));
          return;
        }

        // Analyze the intent
        console.log(chalk.blue('🔍 Analyzing your request...'));
        const context: TaskContext = { type: 'general', complexity: 'medium', priority: 'quality' };
        
        const intentAnalysis = await aiHub.chat([
          {
            role: 'system',
            content: 'You are a command interpreter for Recoder CLI. Analyze the user\'s natural language input and respond with the appropriate Recoder command. Available commands: generate, plan, validate, chat, agent, context. Respond with just the command and any necessary flags.'
          },
          {
            role: 'user',
            content: `What Recoder command should I run for: "${naturalCommand}"`
          }
        ], context, { maxTokens: 200 });

        const suggestion = intentAnalysis.content.trim();
        console.log(chalk.green(`✅ I think you want to run:`));
        console.log(chalk.white(`   recoder ${suggestion}\n`));

        // Ask for confirmation or auto-execute for simple cases
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        rl.question(chalk.cyan('Execute this command? (y/N): '), async (answer: string) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            console.log(chalk.blue('\n🚀 Executing command...\n'));
            
            // Parse and execute the suggested command
            const commandArgs = suggestion.split(' ');
            process.argv = ['node', 'recoder', ...commandArgs];
            
            try {
              await program.parseAsync(['node', 'recoder', ...commandArgs]);
            } catch (execError: any) {
              console.log(chalk.red(`\n❌ Command execution failed: ${execError.message}`));
            }
          } else {
            console.log(chalk.gray('\nCommand not executed. You can run it manually or try: recoder --help'));
          }
          rl.close();
        });

        return; // Don't continue to normal parsing

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Natural language processing failed: ${error.message}`));
        console.log(chalk.white('Try using specific commands: recoder --help\n'));
        return;
      }
    }

    // Parse command line arguments normally
    await program.parseAsync(process.argv);
  } catch (error) {
    Logger.error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught Exception: ${error.message}`);
  process.exitCode = 1;
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    Logger.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  });
}

export default main;