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
import { unifiedAPI } from './services/unified-api-adapter';
import { AIModelHub } from './services/ai-models/ai-hub';
import { RepositoryRefactoringEngine } from './services/ai-models/repository-refactoring-engine';

// Import integrated packages

import { 
  AIPromptSanitizer, 
  CodeVulnerabilityScanner, 
  SecurityMonitor 
} from '@recoder/security';
import { 
  UsageAnalytics, 
  QualityAssessor, 
  ABTestingSystem,
  initializeMonitoring,
  getSystemHealthSummary,
  RecoderAnalytics
} from '@recoder/analytics';

// Import commands
import { createOllamaCommand } from './commands/ollama';
import AICommandsRegistry from './commands/ai';
import { createAuthCommand } from './commands/auth';
import { createIntegrationStatusCommand } from './commands/integration-status';
import { createWebCommand } from './commands/web';
import { createAssistantCommand } from './commands/assistant';
import { createPluginsCommand } from './commands/plugins';
import { createConsensusCommand } from './commands/consensus';
import { createCollaborateCommand } from './commands/collaborate';
import { CollaborationService } from '../../shared/src/collaboration';

// Production-ready command setup with unified configuration
async function setupProductionCommands(program: Command): Promise<void> {
  const config = cliConfig();
  const sessionManager = cliSessionManager();
  const aiHub = AIHub.getInstance();
  // Production Engine Client for real code generation
  
  // Initialize package registry with core packages
  packageRegistry.registerCorePackages();
  const validator = new RealityValidationSystem();
  const agentManager = new AgentManager();
  const contextAnalyzer = new ProjectContextAnalyzer();
  
  // Initialize AI Model Hub with enhanced features
  const aiModelHub = new AIModelHub({
    providers: {
      openai: { enabled: !!process.env.OPENAI_API_KEY, apiKey: process.env.OPENAI_API_KEY },
      anthropic: { enabled: !!process.env.ANTHROPIC_API_KEY, apiKey: process.env.ANTHROPIC_API_KEY },
      ollama: { enabled: true, host: 'http://localhost:11434' }
    } as any,
    router: {
      defaultPrivacyLevel: 'INTERNAL' as any,
      enableHybridProcessing: true,
      hybridConfig: {} as any,
      routingRules: [],
      fallbackChains: {},
      performanceWeights: { speed: 0.3, cost: 0.4, quality: 0.3, availability: 0.0 }
    },
    localModels: {} as any,
    hybrid: {} as any,
    defaultSettings: {
      privacyLevel: 'INTERNAL' as any,
      timeout: 30000,
      retryCount: 3,
      temperature: 0.7,
      maxTokens: 4000
    },
    features: {
      enableCaching: true,
      enableMonitoring: true,
      enableAnalytics: true,
      enableAutoInstall: false,
      enableHybridProcessing: false
    }
  });
  
  try {
    await aiModelHub.initialize();
    Logger.info('AI Model Hub initialized with enhanced features');
  } catch (error) {
    Logger.warn('AI Model Hub initialization failed:', error);
  }
  
  // Initialize repository refactoring engine
  const refactoringEngine = new RepositoryRefactoringEngine(aiModelHub);
  
  // Initialize collaboration service for real-time code sync
  const collaborationService = new CollaborationService({
    websocketPort: parseInt(process.env.COLLAB_PORT || '8080'),
    enableRedis: process.env.NODE_ENV === 'production'
  });
  
  // Initialize integrated systems
  const usageAnalytics = RecoderAnalytics.forPlatform('cli');
  const qualityAssessor = new QualityAssessor();
  const abTestingSystem = new ABTestingSystem();
  const promptSanitizer = new AIPromptSanitizer();
  const vulnerabilityScanner = new CodeVulnerabilityScanner();
  const securityMonitor = new SecurityMonitor();
  
  // Initialize monitoring system
  try {
    await initializeMonitoring();
    Logger.info('Analytics and monitoring system initialized');
  } catch (error) {
    Logger.warn('Analytics system failed to initialize:', error);
  }

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
      
      // Track feature usage
      await backendClient.trackFeatureUsage({
        featureName: 'code_generation',
        context: 'cli_generate',
        metadata: {
          type: options.type,
          complexity: options.complexity,
          hasValidation: options.validate,
          description: description.substring(0, 100) // Truncate for privacy
        }
      });
      
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
        
        // Sanitize the prompt for security
        const sanitizationResult = promptSanitizer.sanitizePrompt(description);
        if (sanitizationResult.threats.length > 0) {
          console.log(chalk.yellow('🔒 Security warnings detected and handled'));
          sanitizationResult.threats.forEach(threat => {
            console.log(chalk.gray(`  • ${threat}`));
          });
        }

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
        
        // Perform additional security scan if score is low
        if (report.summary.score < 70) {
          console.log(chalk.yellow('\n🔒 Running additional security scan due to low validation score...'));
          try {
            const securityScan = await securityMonitor.generateSecurityReport(projectPath);
            
            if (securityScan.vulnerabilities.length > 0 || securityScan.secrets.length > 0) {
              console.log(chalk.red(`\n⚠️ Security Issues Found:`));
              if (securityScan.vulnerabilities.length > 0) {
                console.log(chalk.red(`  • ${securityScan.vulnerabilities.length} vulnerabilities`));
              }
              if (securityScan.secrets.length > 0) {
                console.log(chalk.yellow(`  • ${securityScan.secrets.length} exposed secrets`));
              }
              console.log(chalk.white('\nRun: recoder scan --deep for detailed security analysis'));
            }
          } catch (secError) {
            console.log(chalk.gray('\n(Security scan failed - continuing with validation)'));
          }
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

  // Add integration status command  
  program.addCommand(createIntegrationStatusCommand());
  
  // Add web ecosystem commands
  program.addCommand(createWebCommand());
  program.addCommand(createAssistantCommand());
  program.addCommand(createPluginsCommand());
  
  // Add unified AI commands with enhanced capabilities
  AICommandsRegistry.register(program);
  
  // Add consensus command - KILLER FEATURE vs Cursor/Copilot
  program.addCommand(createConsensusCommand(aiModelHub));
  
  // Add collaboration command - KILLER FEATURE: Real-time collaboration
  program.addCommand(createCollaborateCommand(collaborationService));
  
  // Repository refactoring command - KILLER FEATURE vs Cursor (limited context)
  program
    .command('refactor')
    .description('🔄 Repository-wide refactoring with 1M+ token context (beats Cursor!)')
    .argument('<description>', 'What to refactor (e.g. "modernize to React 18")')
    .option('-s, --scope <scope>', 'Scope: entire-repo, directory, file-pattern', 'entire-repo')
    .option('-t, --target <target>', 'Target directory or pattern if not entire repo')
    .option('--type <type>', 'Refactoring type', 'custom')
    .option('--max-files <number>', 'Maximum files to process', '100')
    .option('--backup', 'Create backup before refactoring', false)
    .option('--dry-run', 'Show plan without executing', false)
    .action(async (description: string, options: any) => {
      console.log(chalk.cyan('\n🔄 RECODER - Repository-Wide Refactoring\n'));
      console.log(chalk.white(`Refactoring: ${description}`));
      console.log(chalk.gray(`Scope: ${options.scope} | Max Files: ${options.maxFiles}\n`));

      try {
        const request = {
          id: `refactor_${Date.now()}`,
          repositoryPath: process.cwd(),
          scope: options.scope,
          target: options.target,
          refactoringType: options.type,
          description,
          preserveHistory: true,
          createBackup: options.backup,
          maxFiles: parseInt(options.maxFiles),
          preferences: {
            preserveTests: true,
            updateDocumentation: true,
            followConventions: true,
            addComments: false
          }
        };

        if (options.dryRun) {
          console.log(chalk.blue('📋 Generating refactoring plan...'));
          const plan = await refactoringEngine.generateRefactoringPlan(request);
          
          console.log(chalk.green(`\n✅ Refactoring Plan Generated:`));
          console.log(chalk.white(`Summary: ${plan.summary}`));
          console.log(chalk.white(`Impact: ${plan.impact.toUpperCase()}`));
          console.log(chalk.white(`Files Affected: ${plan.filesAffected.length}`));
          console.log(chalk.white(`Estimated Time: ${plan.estimatedTime} minutes\n`));
          
          console.log(chalk.cyan('📁 Files to Change:'));
          plan.changes.slice(0, 10).forEach((change, i) => {
            const icon = change.type === 'modify' ? '✏️' : change.type === 'create' ? '➕' : '🗑️';
            console.log(chalk.white(`  ${icon} ${change.file}: ${change.description}`));
          });
          
          if (plan.risks.length > 0) {
            console.log(chalk.yellow('\n⚠️  Risks:'));
            plan.risks.forEach(risk => console.log(chalk.yellow(`  • ${risk}`)));
          }
          
          if (plan.benefits.length > 0) {
            console.log(chalk.green('\n✨ Benefits:'));
            plan.benefits.forEach(benefit => console.log(chalk.green(`  • ${benefit}`)));
          }
          
          console.log(chalk.blue('\n🚀 Run without --dry-run to execute the refactoring'));
        } else {
          console.log(chalk.blue('🤖 Starting repository-wide refactoring with Qwen3-Coder...'));
          console.log(chalk.gray('This uses 1M+ token context - something Cursor cannot do!\n'));
          
          const result = await refactoringEngine.executeRefactoring(request);
          
          if (result.success) {
            console.log(chalk.green(`\n🎉 Refactoring completed successfully!`));
            console.log(chalk.white(`Files Changed: ${result.filesChanged}`));
            console.log(chalk.white(`Lines Changed: ${result.linesChanged}`));
            console.log(chalk.white(`Quality Improvement: +${result.qualityImprovement.improvement}%`));
            
            if (result.backupPath) {
              console.log(chalk.cyan(`\n💾 Backup created: ${result.backupPath}`));
            }
            
            if (result.validationResults.syntaxErrors.length === 0) {
              console.log(chalk.green('✅ No syntax errors introduced'));
            } else {
              console.log(chalk.yellow(`⚠️  ${result.validationResults.syntaxErrors.length} syntax errors to fix`));
            }
            
            console.log(chalk.magenta('\n🏆 COMPETITIVE ADVANTAGE:'));
            console.log(chalk.white('Repository-wide refactoring with full context understanding.'));
            console.log(chalk.white('Cursor is limited to current file + few related files.'));
            console.log(chalk.green('✨ This is why Recoder will dominate the market!'));
            
          } else {
            console.log(chalk.red(`\n❌ Refactoring failed: ${result.error}`));
          }
        }

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Refactoring failed: ${error.message}`));
        Logger.error(`Refactoring failed: ${error.message}`);
      }
    });
  
  // Analytics and monitoring commands
  program
    .command('analytics')
    .alias('stats')
    .description('View system analytics and performance metrics')
    .option('--health', 'Show system health status')
    .option('--usage', 'Show usage statistics')
    .option('--costs', 'Show cost analysis')
    .option('--models', 'Show model performance metrics')
    .action(async (options: any) => {
      console.log(chalk.cyan('\\n📊 RECODER - Analytics Dashboard\\n'));
      
      try {
        if (options.health) {
          console.log(chalk.blue('🔍 Checking system health...'));
          const healthSummary = await getSystemHealthSummary();
          
          const statusColor = healthSummary.overall.overall === 'healthy' ? chalk.green :
                             healthSummary.overall.overall === 'degraded' ? chalk.yellow : chalk.red;
          
          console.log(chalk.white('\\n🏥 System Health Status:'));
          console.log(statusColor(`  Overall: ${healthSummary.overall.overall.toUpperCase()}`));
          console.log(chalk.white(`  Score: ${healthSummary.overall.score}/100`));
          console.log(chalk.white(`  Active Models: ${healthSummary.overall.activeModels}`));
          console.log(chalk.white(`  Healthy Models: ${healthSummary.overall.healthyModels}`));
          if (healthSummary.overall.degradedModels > 0) {
            console.log(chalk.yellow(`  Degraded Models: ${healthSummary.overall.degradedModels}`));
          }
          if (healthSummary.overall.criticalModels > 0) {
            console.log(chalk.red(`  Critical Models: ${healthSummary.overall.criticalModels}`));
          }
          
          console.log(chalk.cyan('\\n🚨 Active Alerts:'));
          console.log(chalk.white(`  Total: ${healthSummary.alerts.active}`));
          if (healthSummary.alerts.critical > 0) {
            console.log(chalk.red(`  Critical: ${healthSummary.alerts.critical}`));
          }
          
          console.log(chalk.cyan('\\n💰 Cost Summary:'));
          console.log(chalk.white(`  Daily Spend: $${healthSummary.costs.dailySpend.toFixed(2)}`));
          console.log(chalk.white(`  Budget Status: ${healthSummary.costs.budgetStatus}`));
          
          console.log(chalk.cyan('\\n🌐 Availability:'));
          console.log(chalk.white(`  Average Uptime: ${healthSummary.availability.average.toFixed(1)}%`));
        }
        
        if (options.models) {
          console.log(chalk.blue('🤖 Analyzing model performance...'));
          const healthSummary = await getSystemHealthSummary();
          
          console.log(chalk.cyan('\\n🤖 Model Performance:'));
          healthSummary.models.slice(0, 10).forEach((model: any) => {
            const statusIcon = model.availability > 0.95 ? '✅' :
                              model.availability > 0.9 ? '⚠️' : '❌';
            console.log(chalk.white(`  ${statusIcon} ${model.modelName}:`));
            console.log(chalk.gray(`    Availability: ${(model.availability * 100).toFixed(1)}%`));
            console.log(chalk.gray(`    Avg Latency: ${model.avgLatency.toFixed(0)}ms`));
            console.log(chalk.gray(`    Error Rate: ${(model.errorRate * 100).toFixed(2)}%`));
            console.log(chalk.gray(`    Quality Score: ${(model.qualityScore * 100).toFixed(0)}/100`));
          });
        }
        
        if (options.usage) {
          console.log(chalk.blue('📈 Analyzing usage patterns...'));
          const patterns = await usageAnalytics.getUsagePatterns();
          
          console.log(chalk.cyan('\\n📈 Usage Statistics:'));
          console.log(chalk.white(`  Total Requests: ${patterns.totalRequests}`));
          console.log(chalk.white(`  Success Rate: ${(patterns.successRate * 100).toFixed(1)}%`));
          console.log(chalk.white(`  Avg Response Time: ${patterns.avgResponseTime}ms`));
          
          console.log(chalk.cyan('\\n🏆 Top Models:'));
          patterns.topModels.forEach((model: any, i: number) => {
            console.log(chalk.white(`  ${i + 1}. ${model.name}: ${model.usage} requests`));
          });
          
          console.log(chalk.cyan('\\n📊 Peak Hours:'));
          patterns.peakHours.forEach((hour: any) => {
            console.log(chalk.white(`  ${hour.time}: ${hour.requests} requests`));
          });
        }
        
        if (options.costs) {
          console.log(chalk.blue('💰 Analyzing cost breakdown...'));
          const costAnalysis = await usageAnalytics.getCostAnalysis();
          
          console.log(chalk.cyan('\\n💰 Cost Analysis:'));
          console.log(chalk.white(`  Total Spend (30d): $${costAnalysis.totalSpend.toFixed(2)}`));
          console.log(chalk.white(`  Daily Average: $${costAnalysis.dailyAverage.toFixed(2)}`));
          console.log(chalk.white(`  Cost Per Request: $${costAnalysis.costPerRequest.toFixed(4)}`));
          
          console.log(chalk.cyan('\\n📊 Cost by Provider:'));
          costAnalysis.byProvider.forEach((provider: any) => {
            console.log(chalk.white(`  ${provider.name}: $${provider.cost.toFixed(2)} (${provider.percentage.toFixed(1)}%)`));
          });
          
          if (costAnalysis.recommendations.length > 0) {
            console.log(chalk.cyan('\\n💡 Cost Optimization Recommendations:'));
            costAnalysis.recommendations.slice(0, 3).forEach((rec: any, i: number) => {
              console.log(chalk.yellow(`  ${i + 1}. ${rec.title}: Save $${rec.potentialSavings.toFixed(2)}/month`));
              console.log(chalk.gray(`     ${rec.description}`));
            });
          }
        }
        
        if (!options.health && !options.usage && !options.costs && !options.models) {
          // Show general analytics overview
          console.log(chalk.blue('📊 Loading analytics overview...'));
          const healthSummary = await getSystemHealthSummary();
          
          console.log(chalk.green('\\n✅ Quick System Overview:'));
          console.log(chalk.white(`  System Health: ${healthSummary.overall.overall.toUpperCase()}`));
          console.log(chalk.white(`  Active Models: ${healthSummary.overall.activeModels}`));
          console.log(chalk.white(`  Daily Spend: $${healthSummary.costs.dailySpend.toFixed(2)}`));
          console.log(chalk.white(`  Active Alerts: ${healthSummary.alerts.active}`));
          
          console.log(chalk.cyan('\\n📋 Available Analytics Commands:'));
          console.log(chalk.white('  recoder analytics --health    # Detailed health status'));
          console.log(chalk.white('  recoder analytics --models    # Model performance metrics'));
          console.log(chalk.white('  recoder analytics --usage     # Usage patterns and statistics'));
          console.log(chalk.white('  recoder analytics --costs     # Cost analysis and optimization'));
        }
        
      } catch (error: any) {
        console.log(chalk.red(`\\n❌ Analytics failed: ${error.message}`));
        Logger.error(`Analytics failed: ${error.message}`);
      }
    });
  
  // Security scanning command
  program
    .command('scan')
    .alias('security')
    .description('Security scanning and vulnerability assessment')
    .argument('[path]', 'Path to scan (defaults to current directory)')
    .option('--deep', 'Perform deep security analysis')
    .option('--secrets', 'Scan for exposed secrets and credentials')
    .option('--dependencies', 'Check dependencies for vulnerabilities')
    .option('--compliance', 'Check compliance requirements')
    .action(async (scanPath?: string, options?: any) => {
      const targetPath = scanPath || process.cwd();
      console.log(chalk.cyan('\\n🔒 RECODER - Security Scanner\\n'));
      console.log(chalk.white(`Scanning: ${targetPath}\\n`));
      
      try {
        console.log(chalk.blue('🔍 Initializing security scan...'));
        
        const scanOptions = {
          deepScan: options.deep || false,
          scanSecrets: options.secrets || true,
          scanDependencies: options.dependencies || true,
          checkCompliance: options.compliance || false
        };
        
        const scanResult = await securityMonitor.generateSecurityReport(targetPath);
        
        // Display security score
        const scoreColor = scanResult.securityScore >= 80 ? chalk.green :
                          scanResult.securityScore >= 60 ? chalk.yellow : chalk.red;
        console.log(chalk.white('\\n🛡️ Security Assessment:'));
        console.log(scoreColor(`  Security Score: ${scanResult.securityScore}/100`));
        
        // Display vulnerabilities
        if (scanResult.vulnerabilities.length > 0) {
          const critical = scanResult.vulnerabilities.filter(v => v.severity === 'critical').length;
          const high = scanResult.vulnerabilities.filter(v => v.severity === 'high').length;
          const medium = scanResult.vulnerabilities.filter(v => v.severity === 'medium').length;
          const low = scanResult.vulnerabilities.filter(v => v.severity === 'low').length;
          
          console.log(chalk.red(`\\n⚠️ Vulnerabilities Found: ${scanResult.vulnerabilities.length}`));
          if (critical > 0) console.log(chalk.red(`  🔴 Critical: ${critical}`));
          if (high > 0) console.log(chalk.yellow(`  🟡 High: ${high}`));
          if (medium > 0) console.log(chalk.white(`  🟠 Medium: ${medium}`));
          if (low > 0) console.log(chalk.gray(`  🟢 Low: ${low}`));
          
          // Show top vulnerabilities
          console.log(chalk.cyan('\\n🔍 Top Vulnerabilities:'));
          scanResult.vulnerabilities
            .sort((a, b) => {
              const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
              return severityOrder[b.severity] - severityOrder[a.severity];
            })
            .slice(0, 5)
            .forEach((vuln, i) => {
              const severityColor = vuln.severity === 'critical' ? chalk.red :
                                   vuln.severity === 'high' ? chalk.yellow : chalk.white;
              console.log(severityColor(`  ${i + 1}. [${vuln.severity.toUpperCase()}] ${vuln.title}`));
              console.log(chalk.gray(`     File: ${vuln.location}`));
              console.log(chalk.gray(`     ${vuln.description}`));
            });
        } else {
          console.log(chalk.green('\\n✅ No vulnerabilities detected'));
        }
        
        // Display secrets found
        if (scanResult.secrets.length > 0) {
          console.log(chalk.yellow(`\\n🔑 Exposed Secrets: ${scanResult.secrets.length}`));
          scanResult.secrets.slice(0, 5).forEach((secret, i) => {
            console.log(chalk.yellow(`  ${i + 1}. ${secret.type} in ${secret.file}:${secret.line}`));
          });
        } else {
          console.log(chalk.green('\\n✅ No exposed secrets detected'));
        }
        
        // Display compliance issues
        if (scanResult.complianceIssues.length > 0) {
          console.log(chalk.yellow(`\\n📋 Compliance Issues: ${scanResult.complianceIssues.length}`));
          scanResult.complianceIssues.slice(0, 3).forEach((issue, i) => {
            console.log(chalk.white(`  ${i + 1}. ${issue.rule}: ${issue.description}`));
          });
        } else {
          console.log(chalk.green('\\n✅ No compliance issues detected'));
        }
        
        // Display recommendations
        if (scanResult.recommendations.length > 0) {
          console.log(chalk.cyan('\\n💡 Security Recommendations:'));
          scanResult.recommendations.slice(0, 5).forEach((rec, i) => {
            const priorityColor = rec.priority === 'critical' ? chalk.red :
                                rec.priority === 'high' ? chalk.yellow : chalk.white;
            console.log(priorityColor(`  ${i + 1}. ${rec.title}`));
            console.log(chalk.gray(`     ${rec.description}`));
          });
        }
        
        console.log(chalk.green('\\n🔒 Security scan completed!'));
        
      } catch (error: any) {
        console.log(chalk.red(`\\n❌ Security scan failed: ${error.message}`));
        Logger.error(`Security scan failed: ${error.message}`);
      }
    });
}

async function main() {
  let analyticsSessionId: string | null = null;

  try {
    // Initialize unified API system (happens in constructor)
    
    // Start analytics session if user is authenticated
    if (backendClient.isAuthenticated()) {
      analyticsSessionId = await backendClient.startAnalyticsSession();
      if (analyticsSessionId) {
        Logger.debug('Analytics session started:', analyticsSessionId);
      }
    }

    // Track CLI startup
    if (analyticsSessionId) {
      await backendClient.trackActivity({
        sessionId: analyticsSessionId,
        type: 'feature_use',
        category: 'navigation',
        action: 'cli_startup',
        properties: {
          version: VERSION,
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          args: process.argv.slice(2)
        }
      });
    }
    
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
    await setupProductionCommands(program);

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
      (args.length >= 1 && !args[0].startsWith('-') && !['generate', 'plan', 'validate', 'chat', 'agent', 'context', 'analytics', 'scan', 'stats', 'security', 'consensus', 'refactor', 'collaborate', 'help', 'version'].includes(args[0]))
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
            content: 'You are a command interpreter for Recoder CLI. Analyze the user\'s natural language input and respond with the appropriate Recoder command. Available commands: generate, plan, validate, chat, agent, context, analytics, scan. Respond with just the command and any necessary flags.'
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
  } finally {
    // End analytics session
    if (analyticsSessionId) {
      try {
        await backendClient.endAnalyticsSession(analyticsSessionId);
        Logger.debug('Analytics session ended');
      } catch (error) {
        Logger.warn('Failed to end analytics session:', error);
      }
    }
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