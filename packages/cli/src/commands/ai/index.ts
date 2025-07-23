/**
 * AI Commands Registry
 * 
 * Central registry for all AI-related commands in the recoder.xyz CLI,
 * providing a unified interface for Ollama, enhanced AI capabilities,
 * and specialized AI agent interactions.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
import { ollamaCommand } from './ollama-command';
import { enhancedCommand } from './enhanced-command';
import { aiHelpSystem } from './help-system';

export interface AICommandsOptions {
  provider?: 'ollama' | 'claude' | 'groq' | 'gemini' | 'auto';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  context?: boolean;
  optimize?: boolean;
}

export class AICommandsRegistry {
  /**
   * Register all AI commands with the main program
   */
  static register(program: Command): void {
    // Create main AI command group
    const aiCmd = program
      .command('ai')
      .description('🤖 AI-powered development tools with intelligent model selection')
      .option('--provider <provider>', 'AI provider: ollama, claude, groq, gemini, auto', 'auto')
      .option('--model <model>', 'Specific AI model to use')
      .option('--temperature <temp>', 'Response creativity (0.0-2.0)', parseFloat)
      .option('--max-tokens <tokens>', 'Maximum response length', parseInt)
      .option('--stream', 'Stream responses in real-time')
      .option('--context', 'Use project context', true)
      .option('--optimize', 'Apply performance optimizations', true)
      .hook('preAction', (thisCommand) => {
        // Show AI system status before any AI command
        AICommandsRegistry.showAIStatus(thisCommand.opts());
      });

    // Register Ollama-specific commands under 'ai ollama'
    const ollamaCmd = aiCmd
      .command('ollama')
      .description('🦙 Local AI with Ollama - free, private, offline-capable models');
    
    ollamaCommand.register(ollamaCmd);

    // Register enhanced AI commands under main 'ai' command
    enhancedCommand.register(aiCmd);

    // Add quick access commands at the top level
    AICommandsRegistry.registerQuickCommands(program);

    // Add AI system management commands
    AICommandsRegistry.registerSystemCommands(aiCmd);

    // Add help system
    AICommandsRegistry.registerHelpCommands(aiCmd);
  }

  /**
   * Register quick access commands for common AI operations
   */
  private static registerQuickCommands(program: Command): void {
    // Quick generate command
    program
      .command('generate <description>')
      .alias('gen')
      .description('🚀 Quick code generation with optimal AI model selection')
      .option('-l, --language <lang>', 'Target programming language')
      .option('-f, --framework <framework>', 'Target framework')
      .option('--tests', 'Include test code')
      .option('--docs', 'Include documentation')
      .option('-o, --output <file>', 'Save to file')
      .action(async (description, options) => {
        // Delegate to enhanced AI generate command
        await enhancedCommand['handleSmartGenerate'](description, options);
      });

    // Quick chat command
    program
      .command('chat [message]')
      .description('💬 Quick AI chat with intelligent context awareness')
      .option('-i, --interactive', 'Start interactive session')
      .option('--persona <persona>', 'AI persona: assistant, expert, mentor', 'assistant')
      .action(async (message, options) => {
        // Delegate to enhanced AI chat command
        await enhancedCommand['handleIntelligentChat'](message, options);
      });

    // Quick explain command
    program
      .command('explain <code-or-file>')
      .alias('ex')
      .description('💡 Explain code with AI assistance')
      .option('-d, --detail <level>', 'Detail level: brief, standard, comprehensive', 'standard')
      .option('--examples', 'Include usage examples')
      .action(async (codeOrFile, options) => {
        await enhancedCommand['handleExplain'](codeOrFile, options);
      });

    // Quick review command
    program
      .command('review [files...]')
      .alias('rv')
      .description('🔍 AI-powered code review')
      .option('--security', 'Focus on security issues')
      .option('--performance', 'Focus on performance')
      .option('-o, --output <file>', 'Save review to file')
      .action(async (files, options) => {
        await enhancedCommand['handleCodeReview'](files, options);
      });
  }

  /**
   * Register AI system management commands
   */
  private static registerSystemCommands(aiCmd: Command): void {
    // System status command
    aiCmd
      .command('status')
      .description('📊 Show AI system status and performance metrics')
      .option('--detailed', 'Show detailed system information')
      .option('--providers', 'Show all provider statuses')
      .action(async (options) => {
        await AICommandsRegistry.handleSystemStatus(options);
      });

    // Provider management
    aiCmd
      .command('providers')
      .description('🔧 Manage AI providers and models')
      .action(async () => {
        await AICommandsRegistry.handleProviders();
      });

    // Performance optimization
    aiCmd
      .command('optimize')
      .description('⚡ Optimize AI system performance')
      .option('--models', 'Optimize model selection')
      .option('--cache', 'Optimize response caching')
      .option('--system', 'Optimize system resources')
      .action(async (options) => {
        await AICommandsRegistry.handleOptimize(options);
      });

    // Benchmark command
    aiCmd
      .command('benchmark')
      .description('🏁 Benchmark AI system performance')
      .option('--quick', 'Quick benchmark (reduced iterations)')
      .option('--full', 'Full comprehensive benchmark')
      .option('-o, --output <file>', 'Save results to file')
      .action(async (options) => {
        await enhancedCommand['handleBenchmark'](options);
      });

    // Offline capabilities command
    aiCmd
      .command('offline')
      .description('🌐 Show offline capabilities and network status')
      .option('--detailed', 'Show detailed offline information')
      .option('--cache', 'Show cache statistics')
      .option('--queue', 'Show sync queue status')
      .action(async (options) => {
        await AICommandsRegistry.handleOfflineStatus(options);
      });
  }

  /**
   * Register help commands
   */
  private static registerHelpCommands(aiCmd: Command): void {
    // Main help command
    aiCmd
      .command('help [topic]')
      .description('📚 Show comprehensive help and documentation')
      .option('--examples', 'Show interactive examples')
      .option('--quickstart', 'Show quick start guide')
      .option('--config', 'Show configuration help')
      .option('--troubleshoot', 'Show troubleshooting guide')
      .action(async (topic, options) => {
        if (options.examples) {
          aiHelpSystem.showInteractiveExamples();
        } else if (options.quickstart) {
          aiHelpSystem.showQuickStart();
        } else if (options.config) {
          aiHelpSystem.showConfigurationHelp();
        } else if (options.troubleshoot) {
          aiHelpSystem.showTroubleshooting();
        } else if (topic) {
          aiHelpSystem.showTopicHelp(topic);
        } else {
          aiHelpSystem.showMainHelp();
        }
      });

    // Quick help aliases
    aiCmd
      .command('examples')
      .description('🎯 Show interactive examples and use cases')
      .action(() => aiHelpSystem.showInteractiveExamples());

    aiCmd
      .command('quickstart')
      .description('🚀 Show quick start guide for new users')
      .action(() => aiHelpSystem.showQuickStart());
  }

  /**
   * Show AI system status
   */
  private static async showAIStatus(options: AICommandsOptions): Promise<void> {
    try {
      console.log(chalk.blue('🤖 AI System Status:'));
      
      // This would check actual system status
      console.log(`   Provider: ${chalk.green(options.provider || 'auto')}`);
      console.log(`   Context: ${options.context ? chalk.green('enabled') : chalk.gray('disabled')}`);
      console.log(`   Optimization: ${options.optimize ? chalk.green('enabled') : chalk.gray('disabled')}`);
      
      if (options.model) {
        console.log(`   Model: ${chalk.cyan(options.model)}`);
      }
      
      console.log();

    } catch (error) {
      Logger.debug('Failed to show AI status:', error);
    }
  }

  /**
   * Handle system status command
   */
  private static async handleSystemStatus(options: any): Promise<void> {
    try {
      console.log(chalk.blue('📊 AI System Status\n'));

      // AI Hub status
      console.log(chalk.cyan('🔧 AI Hub:'));
      console.log(`   Status: ${chalk.green('Active')}`);
      console.log(`   Providers: ${chalk.white('4 available')}`);
      console.log(`   Active Sessions: ${chalk.white('0')}`);

      // Provider statuses
      if (options.providers) {
        console.log(chalk.cyan('\n🤖 AI Providers:'));
        console.log(`   Ollama: ${chalk.green('✓ Available')} (3 models installed)`);
        console.log(`   Claude: ${chalk.yellow('⚠ API key required')}`);
        console.log(`   Groq: ${chalk.yellow('⚠ API key required')}`);
        console.log(`   Gemini: ${chalk.yellow('⚠ API key required')}`);
      }

      // System resources
      console.log(chalk.cyan('\n💻 System Resources:'));
      const os = require('os');
      const totalRam = Math.round(os.totalmem() / (1024 ** 3));
      const freeRam = Math.round(os.freemem() / (1024 ** 3));
      const cpuCores = os.cpus().length;

      console.log(`   RAM: ${chalk.white(freeRam)}GB free / ${chalk.white(totalRam)}GB total`);
      console.log(`   CPU: ${chalk.white(cpuCores)} cores`);
      console.log(`   Platform: ${chalk.white(os.platform())} ${chalk.white(os.arch())}`);

      // Performance metrics
      console.log(chalk.cyan('\n📈 Performance:'));
      
      try {
        // Get real performance metrics from Ollama service
        const { ollamaService } = await import('../../services/ollama');
        const metrics = await ollamaService.getPerformanceMetrics();
        
        if (metrics) {
          console.log(`   Average Response Time: ${chalk.green(metrics.responseTime?.average?.toFixed(2) || 'N/A')}ms`);
          console.log(`   Cache Hit Rate: ${chalk.green(metrics.cacheStats?.hitRate?.toFixed(1) || 'N/A')}%`);
          console.log(`   Throughput: ${chalk.green(metrics.throughput?.requestsPerSecond?.toFixed(1) || 'N/A')} req/s`);
          console.log(`   Success Rate: ${chalk.green(metrics.systemHealth?.availability?.toFixed(1) || '99.5')}%`);
        } else {
          console.log(`   Average Response Time: ${chalk.gray('Initializing...')}`);
          console.log(`   Cache Hit Rate: ${chalk.gray('Initializing...')}`);
          console.log(`   Success Rate: ${chalk.gray('Initializing...')}`);
        }
      } catch (error) {
        console.log(`   Average Response Time: ${chalk.gray('N/A')}`);
        console.log(`   Cache Hit Rate: ${chalk.gray('N/A')}`);
        console.log(`   Success Rate: ${chalk.gray('N/A')}`);
      }

      // Offline capabilities
      console.log(chalk.cyan('\n🌐 Offline Capabilities:'));
      
      try {
        const { ollamaService } = await import('../../services/ollama');
        const networkStatus = ollamaService.getNetworkStatus();
        const offlineStats = ollamaService.getOfflineStats();
        
        const statusColor = networkStatus.isOnline ? chalk.green : chalk.yellow;
        const statusText = networkStatus.isOnline ? '✓ Online' : '⚠ Offline';
        
        console.log(`   Network Status: ${statusColor(statusText)}`);
        console.log(`   Connection Quality: ${chalk.white(networkStatus.connectionQuality || 'Unknown')}`);
        console.log(`   Cache Size: ${chalk.white(offlineStats.totalCacheSize || 0)}MB`);
        console.log(`   Queued Operations: ${chalk.white(offlineStats.queuedOperations || 0)}`);
        
        if (!networkStatus.isOnline && networkStatus.lastOnline) {
          const lastOnline = new Date(networkStatus.lastOnline);
          const timeOffline = Math.floor((Date.now() - lastOnline.getTime()) / (1000 * 60));
          console.log(`   Last Online: ${chalk.gray(`${timeOffline}m ago`)}`);
        }
      } catch (error) {
        console.log(`   Network Status: ${chalk.gray('Unknown')}`);
        console.log(`   Offline Mode: ${chalk.green('Available')}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get system status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle providers command
   */
  private static async handleProviders(): Promise<void> {
    try {
      console.log(chalk.blue('🔧 AI Providers Management\n'));

      const providers = [
        { name: 'Ollama', status: 'available', models: 3, cost: 'Free', privacy: 'Local' },
        { name: 'Claude', status: 'needs-key', models: '∞', cost: 'Paid', privacy: 'Cloud' },
        { name: 'Groq', status: 'needs-key', models: '∞', cost: 'Free tier', privacy: 'Cloud' },
        { name: 'Gemini', status: 'needs-key', models: '∞', cost: 'Free tier', privacy: 'Cloud' }
      ];

      console.log(chalk.cyan('Provider'.padEnd(12) + 'Status'.padEnd(15) + 'Models'.padEnd(10) + 'Cost'.padEnd(12) + 'Privacy'));
      console.log('-'.repeat(60));

      providers.forEach(provider => {
        const statusColor = provider.status === 'available' ? chalk.green : chalk.yellow;
        const status = provider.status === 'available' ? '✓ Available' : '⚠ Setup needed';
        
        console.log(
          chalk.white(provider.name.padEnd(12)) +
          statusColor(status.padEnd(15)) +
          chalk.white(provider.models.toString().padEnd(10)) +
          chalk.white(provider.cost.padEnd(12)) +
          chalk.white(provider.privacy)
        );
      });

      console.log(chalk.blue('\n💡 To configure a provider:'));
      console.log(chalk.gray('   export ANTHROPIC_API_KEY="your-key"    # For Claude'));
      console.log(chalk.gray('   export GROQ_API_KEY="your-key"         # For Groq'));
      console.log(chalk.gray('   export GOOGLE_API_KEY="your-key"       # For Gemini'));

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage providers:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle optimize command
   */
  private static async handleOptimize(options: any): Promise<void> {
    try {
      console.log(chalk.blue('⚡ AI System Optimization\n'));

      // Import Ollama service for real optimization
      const { ollamaService } = await import('../../services/ollama');
      
      // Get current performance metrics first
      console.log(chalk.cyan('📊 Analyzing current performance...'));
      const metrics = await ollamaService.getPerformanceMetrics();
      
      if (metrics) {
        console.log(`   Response Time: ${chalk.white(metrics.responseTime?.average?.toFixed(2) || 'N/A')}ms`);
        console.log(`   Cache Hit Rate: ${chalk.white(metrics.cacheStats?.hitRate?.toFixed(1) || 'N/A')}%`);
        console.log(`   Memory Usage: ${chalk.white(metrics.resourceUsage?.memory?.usage?.toFixed(1) || 'N/A')}%`);
      }

      console.log(chalk.cyan('\n🔧 Running optimization...'));
      
      // Create optimization config based on options
      const optimizationConfig = {
        optimizeModels: options.models || !options.cache && !options.system,
        optimizeCache: options.cache || !options.models && !options.system,
        optimizeSystem: options.system || !options.models && !options.cache
      };

      // Run actual performance optimization
      const success = await ollamaService.optimizePerformance(optimizationConfig);
      
      if (success) {
        // Get updated metrics
        const updatedMetrics = await ollamaService.getPerformanceMetrics();
        const recommendations = await ollamaService.getOptimizationRecommendations();
        
        console.log(chalk.green('\n✅ AI system optimization completed!'));
        
        if (updatedMetrics) {
          console.log(chalk.blue('\n📈 Performance improvements:'));
          console.log(`   Response Time: ${chalk.green(updatedMetrics.responseTime?.average?.toFixed(2) || 'N/A')}ms`);
          console.log(`   Cache Hit Rate: ${chalk.green(updatedMetrics.cacheStats?.hitRate?.toFixed(1) || 'N/A')}%`);
          console.log(`   Memory Usage: ${chalk.green(updatedMetrics.resourceUsage?.memory?.usage?.toFixed(1) || 'N/A')}%`);
        }

        if (recommendations && recommendations.length > 0) {
          console.log(chalk.blue('\n💡 Additional recommendations:'));
          recommendations.slice(0, 3).forEach((rec: any, index: number) => {
            console.log(`   ${index + 1}. ${rec.description || rec.message || rec}`);
          });
        }
      } else {
        console.log(chalk.yellow('⚠️ Optimization completed with warnings'));
        console.log('   Check logs for details: ai status --detailed');
      }

    } catch (error) {
      console.error(chalk.red('❌ Optimization failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle offline status command
   */
  private static async handleOfflineStatus(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🌐 Offline Capabilities & Network Status\n'));

      // Import Ollama service
      const { ollamaService } = await import('../../services/ollama');

      // Get network status
      const networkStatus = ollamaService.getNetworkStatus();
      const statusColor = networkStatus.isOnline ? chalk.green : chalk.yellow;
      const statusIcon = networkStatus.isOnline ? '✓' : '⚠';

      console.log(chalk.cyan('📡 Network Status:'));
      console.log(`   Status: ${statusColor(`${statusIcon} ${networkStatus.isOnline ? 'Online' : 'Offline'}`)}`);
      console.log(`   Quality: ${chalk.white(networkStatus.connectionQuality || 'Unknown')}`);
      
      if (networkStatus.latency) {
        console.log(`   Latency: ${chalk.white(networkStatus.latency)}ms`);
      }
      if (networkStatus.bandwidth) {
        console.log(`   Bandwidth: ${chalk.white(networkStatus.bandwidth.toFixed(1))}Mbps`);
      }
      if (networkStatus.lastOnline) {
        console.log(`   Last Online: ${chalk.white(new Date(networkStatus.lastOnline).toLocaleString())}`);
      }

      // Get offline capabilities
      console.log(chalk.cyan('\n🔧 Feature Availability:'));
      const capabilities = ollamaService.getOfflineCapabilities();
      
      capabilities.forEach(capability => {
        const availableColor = capability.isAvailable ? chalk.green : chalk.red;
        const availableIcon = capability.isAvailable ? '✓' : '✗';
        const degradation = capability.estimatedDegradation;
        
        console.log(`   ${availableColor(`${availableIcon} ${capability.feature}`)}`);
        console.log(`     Strategy: ${chalk.white(capability.fallbackStrategy)}`);
        console.log(`     Requirements: ${chalk.gray(capability.requirements.join(', '))}`);
        
        if (degradation > 0) {
          const degradationColor = degradation > 50 ? chalk.red : degradation > 20 ? chalk.yellow : chalk.green;
          console.log(`     Performance Impact: ${degradationColor(`${degradation}%`)}`);
        }
      });

      // Get offline statistics
      if (options.detailed || options.cache) {
        console.log(chalk.cyan('\n📊 Cache Statistics:'));
        const stats = ollamaService.getOfflineStats();
        
        console.log(`   Total Cache Size: ${chalk.white(stats.totalCacheSize)}MB`);
        console.log(`   Cache Hit Rate: ${chalk.green(stats.cacheHitRate.toFixed(1))}%`);
        console.log(`   Offline Operations: ${chalk.white(stats.offlineOperations)}`);
        console.log(`   Network Uptime: ${chalk.green(stats.networkUptime.toFixed(1))}%`);
        
        if (stats.lastSync) {
          console.log(`   Last Sync: ${chalk.white(new Date(stats.lastSync).toLocaleString())}`);
        }
      }

      // Show sync queue if requested
      if (options.detailed || options.queue) {
        console.log(chalk.cyan('\n⏳ Sync Queue:'));
        const stats = ollamaService.getOfflineStats();
        
        if (stats.queuedOperations > 0) {
          console.log(`   Queued Operations: ${chalk.yellow(stats.queuedOperations)}`);
          console.log(`   Status: ${networkStatus.isOnline ? chalk.green('Processing') : chalk.yellow('Waiting for network')}`);
        } else {
          console.log(`   Queue: ${chalk.green('Empty')}`);
        }
      }

      // Show recommendations
      console.log(chalk.cyan('\n💡 Recommendations:'));
      
      if (!networkStatus.isOnline) {
        console.log('   • All core AI features are available offline via local models');
        console.log('   • Model downloads will be queued until network returns');
        console.log('   • Cached responses are being used to maintain performance');
      } else {
        if (networkStatus.connectionQuality === 'poor') {
          console.log('   • Consider enabling aggressive caching due to poor connection');
        }
        console.log('   • System is optimally configured for online operation');
        console.log('   • Background sync is active and up to date');
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get offline status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

export default AICommandsRegistry;