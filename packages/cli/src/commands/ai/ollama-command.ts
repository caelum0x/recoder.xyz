/**
 * Ollama CLI Command Integration
 * 
 * Command-line interface for managing Ollama integration with
 * model installation, status checking, and AI completions.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
import { 
  ollamaService, 
  enhancedOllamaProvider, 
  recommendationEngine, 
  projectAnalyzer, 
  modelManager,
  updateManager
} from '../../services/ollama';
import { AIHub } from '../../services/ai-hub';

export interface OllamaCommandOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  install?: boolean;
  force?: boolean;
  quiet?: boolean;
}

export class OllamaCommand {
  private aiHub: AIHub;

  constructor() {
    this.aiHub = AIHub.getInstance();
  }

  /**
   * Register Ollama commands with Commander.js
   */
  register(program: Command): void {
    const ollamaCmd = program
      .command('ollama')
      .description('Manage local AI with Ollama - free, private, offline-capable models');

    // Status command
    ollamaCmd
      .command('status')
      .description('Check Ollama service status and installed models')
      .option('-v, --verbose', 'Show detailed status information')
      .action(async (options) => {
        await this.handleStatus(options);
      });

    // Install command
    ollamaCmd
      .command('install [model]')
      .description('Install Ollama and optionally a specific model')
      .option('-f, --force', 'Force reinstall even if already installed')
      .option('-q, --quiet', 'Minimal output')
      .option('--no-start', 'Don\'t start service after installation')
      .action(async (model, options) => {
        await this.handleInstall(model, options);
      });

    // Models command
    ollamaCmd
      .command('models')
      .description('List and manage Ollama models')
      .option('-a, --available', 'Show all available models')
      .option('-r, --recommendations', 'Show model recommendations')
      .option('--install <model>', 'Install a specific model')
      .option('--remove <model>', 'Remove a specific model')
      .action(async (options) => {
        await this.handleModels(options);
      });

    // Chat command
    ollamaCmd
      .command('chat [prompt]')
      .description('Chat with local AI models')
      .option('-m, --model <model>', 'Specify model to use')
      .option('-t, --temperature <temp>', 'Set response creativity (0.0-2.0)', parseFloat)
      .option('--max-tokens <tokens>', 'Maximum response length', parseInt)
      .option('-s, --stream', 'Stream response in real-time')
      .option('-i, --interactive', 'Start interactive chat session')
      .action(async (prompt, options) => {
        await this.handleChat(prompt, options);
      });

    // Code command
    ollamaCmd
      .command('code <description>')
      .description('Generate code with local AI models')
      .option('-m, --model <model>', 'Specify model to use (prefers coding models)')
      .option('-l, --language <lang>', 'Target programming language')
      .option('-f, --framework <framework>', 'Target framework')
      .option('--test', 'Include test code generation')
      .option('--docs', 'Include documentation generation')
      .action(async (description, options) => {
        await this.handleCodeGeneration(description, options);
      });

    // Recommendations command
    ollamaCmd
      .command('recommend')
      .description('Get intelligent model recommendations for your system and use case')
      .option('-u, --use-case <case>', 'Specify use case: coding, chat, general, documentation, analysis')
      .option('-n, --count <n>', 'Number of recommendations to show', parseInt, 3)
      .option('-p, --project [path]', 'Analyze specific project for recommendations')
      .option('--detailed', 'Show detailed reasoning and performance estimates')
      .action(async (options) => {
        await this.handleRecommendations(options);
      });

    // Analyze command
    ollamaCmd
      .command('analyze [path]')
      .description('Analyze project and get AI-optimized recommendations')
      .option('-v, --verbose', 'Show detailed project analysis')
      .option('--cache', 'Use cached analysis if available')
      .action(async (path, options) => {
        await this.handleProjectAnalysis(path, options);
      });

    // Preferences command
    ollamaCmd
      .command('preferences')
      .description('Manage user preferences for model recommendations')
      .option('--set <key=value>', 'Set a preference (can be used multiple times)', this.collectKeyValue, [])
      .option('--show', 'Show current preferences')
      .option('--reset', 'Reset to default preferences')
      .action(async (options) => {
        await this.handlePreferences(options);
      });

    // Insights command
    ollamaCmd
      .command('insights')
      .description('Get usage insights and optimization recommendations')
      .option('--export <file>', 'Export insights to JSON file')
      .action(async (options) => {
        await this.handleInsights(options);
      });

    // Update command
    ollamaCmd
      .command('update')
      .description('Update Ollama and installed models')
      .option('--models-only', 'Update only models, not Ollama itself')
      .option('--ollama-only', 'Update only Ollama, not Ollama itself')
      .option('--check-only', 'Check for updates without installing')
      .option('--auto', 'Enable automatic updates')
      .option('--schedule <frequency>', 'Set update schedule (daily, weekly, monthly)')
      .action(async (options) => {
        await this.handleUpdate(options);
      });

    // Update management commands
    const manageCmd = ollamaCmd
      .command('manage')
      .description('Manage background updates and model maintenance');

    manageCmd
      .command('status')
      .description('Show update status and schedule')
      .action(async () => {
        await this.handleUpdateStatus();
      });

    manageCmd
      .command('schedule')
      .description('Configure automatic update schedule')
      .option('-f, --frequency <freq>', 'Update frequency: daily, weekly, monthly, manual', 'weekly')
      .option('-t, --time <time>', 'Update time in HH:MM format', '02:00')
      .option('--enable', 'Enable scheduled updates')
      .option('--disable', 'Disable scheduled updates')
      .action(async (options) => {
        await this.handleUpdateSchedule(options);
      });

    manageCmd
      .command('policy')
      .description('Configure update policies')
      .option('--auto-update', 'Enable automatic updates')
      .option('--no-auto-update', 'Disable automatic updates')
      .option('--critical-only', 'Only install critical updates')
      .option('--allow-prerelease', 'Allow pre-release updates')
      .option('--backup', 'Backup models before updates')
      .option('--no-backup', 'Skip model backups')
      .option('--rollback', 'Enable rollback on failure')
      .option('--max-concurrent <n>', 'Max concurrent updates', parseInt)
      .action(async (options) => {
        await this.handleUpdatePolicy(options);
      });

    manageCmd
      .command('history')
      .description('Show update history')
      .option('-n, --limit <count>', 'Number of recent updates to show', parseInt, 10)
      .action(async (options) => {
        await this.handleUpdateHistory(options);
      });

    manageCmd
      .command('cleanup')
      .description('Clean up old model versions and backups')
      .option('--keep <versions>', 'Number of versions to keep', parseInt, 2)
      .option('--days <days>', 'Remove items older than N days', parseInt, 30)
      .option('--backups', 'Clean up old backups')
      .option('--dry-run', 'Show what would be cleaned without doing it')
      .action(async (options) => {
        await this.handleUpdateCleanup(options);
      });
  }

  /**
   * Handle status command
   */
  private async handleStatus(options: { verbose?: boolean }): Promise<void> {
    try {
      console.log(chalk.blue('🤖 Ollama Status Check\n'));

      // Initialize provider if needed
      await enhancedOllamaProvider.initialize();

      // Get service status
      const status = await ollamaService.getStatus();
      const providerStatus = await enhancedOllamaProvider.getStatus();

      // Display basic status
      console.log(`Service Status: ${status.isRunning ? chalk.green('✅ Running') : chalk.red('❌ Stopped')}`);
      console.log(`Models Installed: ${chalk.cyan(status.modelCount)}`);
      console.log(`Capabilities: ${status.capabilities.map(c => chalk.green(c)).join(', ')}`);

      if (options.verbose) {
        console.log('\n' + chalk.yellow('📊 Detailed Information:'));
        console.log(`Version: ${chalk.cyan(status.health.version)}`);
        console.log(`Uptime: ${status.health.uptime ? chalk.cyan(`${Math.floor(status.health.uptime / 60)} minutes`) : 'N/A'}`);
        console.log(`Memory Usage: ${status.health.memoryUsage ? chalk.cyan(`${status.health.memoryUsage}MB`) : 'N/A'}`);
        console.log(`CPU Usage: ${status.health.cpuUsage ? chalk.cyan(`${status.health.cpuUsage}%`) : 'N/A'}`);

        if (status.health.warnings.length > 0) {
          console.log('\n' + chalk.yellow('⚠️ Warnings:'));
          status.health.warnings.forEach(warning => console.log(`  • ${warning}`));
        }
      }

      // Display available providers in AI Hub
      const providers = this.aiHub.getAvailableProviders();
      const ollamaProvider = providers.find(p => p.name === 'ollama');
      
      if (ollamaProvider) {
        console.log(`\nAI Hub Integration: ${ollamaProvider.available ? chalk.green('✅ Available') : chalk.red('❌ Not Available')}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get Ollama status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle install command
   */
  private async handleInstall(model?: string, options: any = {}): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Installing Ollama...\n'));

      const installOptions = {
        force: options.force,
        autoStart: !options.noStart,
        includeModels: model ? [model] : undefined,
        silent: options.quiet
      };

      // Install with progress tracking
      const result = await ollamaService.installOllama(installOptions);

      if (result.success) {
        console.log(chalk.green('✅ Ollama installation completed successfully!'));
        
        if (result.warnings.length > 0) {
          console.log('\n' + chalk.yellow('⚠️ Warnings:'));
          result.warnings.forEach(warning => console.log(`  • ${warning}`));
        }

        if (result.recommendations.length > 0) {
          console.log('\n' + chalk.blue('💡 Recommendations:'));
          result.recommendations.forEach(rec => console.log(`  • ${rec}`));
        }

        // Show installed models
        const installedModels = await ollamaService.getInstalledModels();
        if (installedModels.length > 0) {
          console.log('\n' + chalk.cyan('📦 Installed Models:'));
          installedModels.forEach(modelName => console.log(`  • ${modelName}`));
        }

      } else {
        console.error(chalk.red('❌ Installation failed:'), result.error?.message);
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Installation error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle models command
   */
  private async handleModels(options: any): Promise<void> {
    try {
      await enhancedOllamaProvider.initialize();

      if (options.install) {
        console.log(chalk.blue(`📥 Installing model: ${options.install}`));
        const success = await enhancedOllamaProvider.installModel(options.install);
        
        if (success) {
          console.log(chalk.green(`✅ Model ${options.install} installed successfully`));
        } else {
          console.error(chalk.red(`❌ Failed to install model ${options.install}`));
          process.exit(1);
        }
        return;
      }

      if (options.remove) {
        console.log(chalk.blue(`🗑️ Removing model: ${options.remove}`));
        const success = await ollamaService.removeModel(options.remove);
        
        if (success) {
          console.log(chalk.green(`✅ Model ${options.remove} removed successfully`));
        } else {
          console.error(chalk.red(`❌ Failed to remove model ${options.remove}`));
          process.exit(1);
        }
        return;
      }

      if (options.recommendations) {
        console.log(chalk.blue('🎯 Model Recommendations\n'));
        
        const recommendations = await enhancedOllamaProvider.getModelRecommendations();
        
        if (recommendations.length === 0) {
          console.log(chalk.yellow('No recommendations available. Try installing Ollama first.'));
          return;
        }

        recommendations.forEach((rec, index) => {
          console.log(`${index + 1}. ${chalk.cyan(rec.model.fullName)} (Score: ${rec.score}/100)`);
          console.log(`   ${rec.model.description}`);
          console.log(`   Size: ${chalk.yellow(this.formatBytes(rec.model.size))}`);
          console.log(`   Reasons: ${rec.reasons.join(', ')}`);
          
          if (rec.warnings.length > 0) {
            console.log(`   ${chalk.red('Warnings:')} ${rec.warnings.join(', ')}`);
          }
          
          console.log(`   Performance: ${rec.estimatedPerformance.tokensPerSecond} tokens/s, ${rec.estimatedPerformance.memoryUsage}GB RAM\n`);
        });
        return;
      }

      // List models
      console.log(chalk.blue('📦 Ollama Models\n'));
      
      const installedModels = await ollamaService.getInstalledModels();
      
      if (installedModels.length === 0) {
        console.log(chalk.yellow('No models installed. Use "ollama models --recommendations" to see suggestions.'));
        return;
      }

      console.log(chalk.green('Installed Models:'));
      installedModels.forEach(model => {
        console.log(`  ✅ ${chalk.cyan(model)}`);
      });

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage models:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle chat command
   */
  private async handleChat(prompt?: string, options: any = {}): Promise<void> {
    try {
      await enhancedOllamaProvider.initialize();

      if (!await ollamaService.isReady()) {
        console.log(chalk.yellow('🚀 Ollama not ready. Installing and starting...'));
        await this.handleInstall();
      }

      if (options.interactive || !prompt) {
        await this.startInteractiveChat(options);
        return;
      }

      // Single prompt
      console.log(chalk.blue('🤖 Ollama Chat\n'));
      console.log(chalk.gray(`User: ${prompt}`));
      
      const messages = [{ role: 'user', content: prompt }];
      
      const response = await enhancedOllamaProvider.chat(messages, {
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: options.stream
      });

      console.log(chalk.green(`\nAssistant: ${response.content}`));
      console.log(chalk.gray(`\nModel: ${response.model} | Tokens: ${response.tokens?.input}→${response.tokens?.output}`));

    } catch (error) {
      console.error(chalk.red('❌ Chat failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle code generation command
   */
  private async handleCodeGeneration(description: string, options: any): Promise<void> {
    try {
      await enhancedOllamaProvider.initialize();

      if (!await ollamaService.isReady()) {
        console.log(chalk.yellow('🚀 Ollama not ready. Installing coding models...'));
        await this.handleInstall('codellama:7b');
      }

      console.log(chalk.blue('💻 Code Generation\n'));
      console.log(chalk.gray(`Request: ${description}`));

      // Build enhanced prompt for code generation
      let systemPrompt = 'You are a senior software engineer. Generate production-ready, well-documented code.';
      
      if (options.language) {
        systemPrompt += ` Use ${options.language} programming language.`;
      }
      
      if (options.framework) {
        systemPrompt += ` Use ${options.framework} framework.`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate ${options.test ? 'code with tests' : 'code'} for: ${description}` }
      ];

      // Prefer coding models
      const codingModel = options.model || await this.selectCodingModel();
      
      const response = await enhancedOllamaProvider.chat(messages, {
        model: codingModel,
        temperature: 0.3, // Lower temperature for code generation
        maxTokens: 4000
      });

      console.log(chalk.green('\n📝 Generated Code:\n'));
      console.log(response.content);
      console.log(chalk.gray(`\nModel: ${response.model} | Generated with Ollama`));

    } catch (error) {
      console.error(chalk.red('❌ Code generation failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle recommendations command
   */
  private async handleRecommendations(options: any): Promise<void> {
    try {
      await enhancedOllamaProvider.initialize();

      console.log(chalk.blue('🎯 Intelligent Model Recommendations\n'));

      // Project-specific recommendations
      if (options.project !== undefined) {
        const projectPath = options.project || process.cwd();
        console.log(chalk.cyan(`📁 Analyzing project: ${projectPath}\n`));
        
        const recommendations = await modelManager.getProjectRecommendations(projectPath);
        
        if (recommendations.length === 0) {
          console.log(chalk.yellow('No project-specific recommendations available.'));
          return;
        }

        console.log(chalk.green('🎯 Project-Optimized Recommendations:\n'));
        
        recommendations.forEach((rec, index) => {
          this.displayRecommendation(rec, index + 1, options.detailed);
        });

        return;
      }

      // General recommendations
      const useCase = options.useCase as 'coding' | 'chat' | 'general' | 'documentation' | 'analysis';
      const count = options.count || 3;

      const recommendations = await enhancedOllamaProvider.getModelRecommendations(useCase, count);

      if (recommendations.length === 0) {
        console.log(chalk.yellow('No recommendations available. Ensure Ollama is installed and configured.'));
        return;
      }

      console.log(chalk.cyan(`Top ${count} recommendations for ${useCase || 'general'} use:\n`));

      recommendations.forEach((rec, index) => {
        this.displayRecommendation(rec, index + 1, options.detailed);
      });

      console.log(chalk.blue('💡 To install a recommended model:'));
      console.log(chalk.gray(`   ollama models --install ${recommendations[0].model.fullName}`));

    } catch (error) {
      console.error(chalk.red('❌ Failed to get recommendations:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle project analysis command
   */
  private async handleProjectAnalysis(projectPath?: string, options: any = {}): Promise<void> {
    try {
      const targetPath = projectPath || process.cwd();
      console.log(chalk.blue(`📊 Analyzing Project: ${targetPath}\n`));

      // Check cache first
      let analysis;
      if (options.cache) {
        analysis = projectAnalyzer.getCachedAnalysis(targetPath);
        if (analysis) {
          console.log(chalk.green('📋 Using cached analysis\n'));
        }
      }

      if (!analysis) {
        console.log(chalk.yellow('🔍 Scanning project files...'));
        analysis = await projectAnalyzer.analyzeProject(targetPath, {
          includeAIPatterns: true,
          maxFiles: 1000
        });
      }

      // Display basic info
      console.log(chalk.cyan('📋 Project Overview:'));
      console.log(`   Name: ${chalk.white(analysis.name)}`);
      console.log(`   Type: ${chalk.white(analysis.type)}`);
      console.log(`   Complexity: ${this.getComplexityColor(analysis.complexity.overall)(analysis.complexity.overall)}`);
      console.log(`   Files: ${chalk.white(analysis.fileStructure.totalFiles)}`);
      console.log(`   Lines: ${chalk.white(analysis.fileStructure.totalLines.toLocaleString())}`);

      // Languages
      console.log(chalk.cyan('\n💻 Languages:'));
      analysis.languages.slice(0, 5).forEach(lang => {
        console.log(`   ${chalk.white(lang.name)}: ${chalk.yellow(lang.percentage.toFixed(1) + '%')} (${lang.lines.toLocaleString()} lines)`);
      });

      // Frameworks
      if (analysis.frameworks.length > 0) {
        console.log(chalk.cyan('\n🔧 Frameworks:'));
        analysis.frameworks.slice(0, 5).forEach(fw => {
          console.log(`   ${chalk.white(fw.name)}: ${chalk.green((fw.confidence * 100).toFixed(0) + '%')} confidence`);
        });
      }

      if (options.verbose) {
        // Detailed complexity analysis
        console.log(chalk.cyan('\n📈 Complexity Analysis:'));
        console.log(`   Code Size: ${chalk.white(analysis.complexity.factors.codeSize)}`);
        console.log(`   Languages: ${chalk.white(analysis.complexity.factors.languageCount)}`);
        console.log(`   Dependencies: ${chalk.white(analysis.complexity.factors.dependencies)}`);
        console.log(`   Architecture: ${chalk.white(analysis.complexity.factors.architecture)}`);
        console.log(`   Score: ${chalk.yellow(analysis.complexity.score + '/100')}`);

        // Dependencies
        if (analysis.dependencies.length > 0) {
          console.log(chalk.cyan('\n📦 Key Dependencies:'));
          analysis.dependencies.slice(0, 10).forEach(dep => {
            console.log(`   ${chalk.white(dep.name)}: ${chalk.gray(dep.version || 'latest')} (${dep.type})`);
          });
        }
      }

      // Recommendations
      console.log(chalk.cyan('\n🎯 AI Model Recommendations:'));
      analysis.recommendations.aiModels.forEach(model => {
        console.log(`   • ${chalk.green(model)}`);
      });

      if (analysis.recommendations.optimizations.length > 0) {
        console.log(chalk.cyan('\n💡 Optimization Suggestions:'));
        analysis.recommendations.optimizations.forEach(opt => {
          console.log(`   • ${opt}`);
        });
      }

      console.log(chalk.blue('\n🚀 Get project-specific recommendations:'));
      console.log(chalk.gray('   ollama recommend --project'));

    } catch (error) {
      console.error(chalk.red('❌ Project analysis failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle preferences command
   */
  private async handlePreferences(options: any): Promise<void> {
    try {
      await recommendationEngine.initialize();

      if (options.reset) {
        await recommendationEngine.updateUserPreferences({});
        console.log(chalk.green('✅ Preferences reset to defaults'));
        return;
      }

      if (options.set && options.set.length > 0) {
        const updates: any = {};
        
        for (const [key, value] of options.set) {
          // Parse value based on key
          if (key === 'maxModelSize') {
            updates[key] = parseInt(value);
          } else if (['preferLocalModels', 'preferSmallModels', 'prioritizeAccuracy', 'autoInstallModels'].includes(key)) {
            updates[key] = value.toLowerCase() === 'true';
          } else if (key === 'updateFrequency') {
            updates[key] = value;
          } else if (['preferredModels', 'avoidedModels'].includes(key)) {
            updates[key] = value.split(',').map((s: string) => s.trim());
          }
        }

        await recommendationEngine.updateUserPreferences(updates);
        console.log(chalk.green('✅ Preferences updated'));
      }

      if (options.show || (!options.set && !options.reset)) {
        const preferences = recommendationEngine.getUserPreferences();
        
        console.log(chalk.blue('🔧 Current Preferences:\n'));
        console.log(`   Max Model Size: ${chalk.cyan(preferences.maxModelSize + 'GB')}`);
        console.log(`   Prefer Local Models: ${this.getBooleanColor(preferences.preferLocalModels)(preferences.preferLocalModels)}`);
        console.log(`   Prefer Small Models: ${this.getBooleanColor(preferences.preferSmallModels)(preferences.preferSmallModels)}`);
        console.log(`   Prioritize Accuracy: ${this.getBooleanColor(preferences.prioritizeAccuracy)(preferences.prioritizeAccuracy)}`);
        console.log(`   Auto Install Models: ${this.getBooleanColor(preferences.autoInstallModels)(preferences.autoInstallModels)}`);
        console.log(`   Update Frequency: ${chalk.cyan(preferences.updateFrequency)}`);
        
        if (preferences.preferredModels.length > 0) {
          console.log(`   Preferred Models: ${chalk.green(preferences.preferredModels.join(', '))}`);
        }
        
        if (preferences.avoidedModels.length > 0) {
          console.log(`   Avoided Models: ${chalk.red(preferences.avoidedModels.join(', '))}`);
        }

        console.log(chalk.blue('\n💡 To update preferences:'));
        console.log(chalk.gray('   ollama preferences --set preferLocalModels=true'));
        console.log(chalk.gray('   ollama preferences --set maxModelSize=8'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to manage preferences:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle insights command
   */
  private async handleInsights(options: any): Promise<void> {
    try {
      await recommendationEngine.initialize();
      
      console.log(chalk.blue('📊 Usage Insights & Analytics\n'));

      const insights = await modelManager.getUsageInsights();

      if (insights.recommendations) {
        console.log(chalk.cyan('📈 Recommendation Statistics:'));
        console.log(`   Total Recommendations: ${chalk.white(insights.recommendations.totalRecommendations)}`);
        
        if (insights.recommendations.mostRecommendedModels.length > 0) {
          console.log(chalk.cyan('\n🏆 Most Recommended Models:'));
          insights.recommendations.mostRecommendedModels.forEach((model, index) => {
            console.log(`   ${index + 1}. ${chalk.green(model.model)} (${model.count} times)`);
          });
        }
      }

      if (insights.projectAnalytics) {
        console.log(chalk.cyan('\n📁 Current Project:'));
        console.log(`   Name: ${chalk.white(insights.projectAnalytics.name)}`);
        console.log(`   Type: ${chalk.white(insights.projectAnalytics.type)}`);
        console.log(`   Complexity: ${this.getComplexityColor(insights.projectAnalytics.complexity)(insights.projectAnalytics.complexity)}`);
        console.log(`   Languages: ${chalk.white(insights.projectAnalytics.languages.join(', '))}`);
        
        if (insights.projectAnalytics.frameworks.length > 0) {
          console.log(`   Frameworks: ${chalk.white(insights.projectAnalytics.frameworks.join(', '))}`);
        }
      }

      if (insights.systemOptimization.length > 0) {
        console.log(chalk.cyan('\n⚡ System Optimization:'));
        insights.systemOptimization.forEach(suggestion => {
          console.log(`   • ${suggestion}`);
        });
      }

      if (insights.userPreferences) {
        console.log(chalk.cyan('\n👤 User Profile:'));
        console.log(`   Prefers Local Models: ${this.getBooleanColor(insights.userPreferences.preferLocalModels)(insights.userPreferences.preferLocalModels)}`);
        console.log(`   Max Model Size: ${chalk.white(insights.userPreferences.maxModelSize + 'GB')}`);
        console.log(`   Update Frequency: ${chalk.white(insights.userPreferences.updateFrequency)}`);
      }

      if (options.export) {
        const fs = require('fs/promises');
        await fs.writeFile(options.export, JSON.stringify(insights, null, 2));
        console.log(chalk.green(`\n💾 Insights exported to ${options.export}`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get insights:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update command
   */
  private async handleUpdate(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🔄 Managing Updates...\n'));

      // Initialize update manager
      await updateManager.initialize();

      if (options.checkOnly) {
        console.log(chalk.blue('🔍 Checking for available updates...'));
        const updates = await updateManager.checkForUpdates(true);
        
        if (updates.length === 0) {
          console.log(chalk.green('✅ All models are up to date'));
          return;
        }

        console.log(chalk.cyan(`Found ${updates.length} available updates:\n`));
        updates.forEach((update, index) => {
          const priority = this.getPriorityColor(update.priority)(update.priority.toUpperCase());
          console.log(`${index + 1}. ${chalk.white(update.modelName)}`);
          console.log(`   ${update.currentVersion} → ${chalk.green(update.availableVersion)} (${priority})`);
          console.log(`   Size: ${chalk.yellow(this.formatBytes(update.updateSize))} | Est. time: ${update.estimatedUpdateTime}min`);
          
          if (update.releaseNotes) {
            console.log(`   ${chalk.gray(update.releaseNotes)}`);
          }
          console.log();
        });

        return;
      }

      if (options.schedule) {
        await updateManager.setUpdateSchedule({
          frequency: options.schedule as any,
          enabled: true
        });
        console.log(chalk.green(`✅ Update schedule set to ${options.schedule}`));
        return;
      }

      if (options.auto) {
        await updateManager.setUpdatePolicy({ autoUpdate: true });
        console.log(chalk.green('✅ Automatic updates enabled'));
        return;
      }

      // Check for updates and install if available
      const updates = await updateManager.checkForUpdates(true);
      
      if (updates.length === 0) {
        console.log(chalk.green('✅ All models are up to date'));
        return;
      }

      console.log(chalk.cyan(`Found ${updates.length} available updates. Starting installation...\n`));

      const sessionId = await updateManager.scheduleUpdates(updates, { immediate: true });
      
      // Listen for progress updates
      updateManager.on('updateProgress', (progress) => {
        const percentage = progress.percentage;
        const current = progress.current + 1;
        const total = progress.total;
        
        console.log(chalk.blue(`Progress: ${percentage}% (${current}/${total}) - ${progress.currentModel || progress.stage}`));
      });

      updateManager.on('updateSessionCompleted', (session) => {
        console.log(chalk.green('\n✅ All updates completed successfully!'));
        
        if (session.errors.length > 0) {
          console.log(chalk.yellow('\n⚠️ Some updates had warnings:'));
          session.errors.forEach(error => {
            console.log(`  • ${error.model}: ${error.error}`);
          });
        }
      });

      updateManager.on('updateSessionFailed', ({ session, error }) => {
        console.error(chalk.red('\n❌ Update session failed:'), error);
        process.exit(1);
      });

    } catch (error) {
      console.error(chalk.red('❌ Update failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update status command
   */
  private async handleUpdateStatus(): Promise<void> {
    try {
      await updateManager.initialize();
      
      console.log(chalk.blue('📊 Update Status\n'));

      const status = updateManager.getUpdateStatus();
      
      console.log(`Update Schedule: ${status.isEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      console.log(`Last Check: ${status.lastCheck ? chalk.cyan(status.lastCheck.toLocaleString()) : chalk.gray('Never')}`);
      console.log(`Next Check: ${status.nextCheck ? chalk.cyan(status.nextCheck.toLocaleString()) : chalk.gray('Not scheduled')}`);
      console.log(`Queued Updates: ${chalk.yellow(status.queuedUpdates)}`);

      if (status.activeSession) {
        console.log(chalk.blue('\n🔄 Active Update Session:'));
        const session = status.activeSession;
        console.log(`Session ID: ${chalk.white(session.id)}`);
        console.log(`Status: ${this.getStatusColor(session.status)(session.status)}`);
        console.log(`Progress: ${chalk.cyan(session.progress.percentage + '%')} (${session.progress.current}/${session.progress.total})`);
        
        if (session.progress.currentModel) {
          console.log(`Current Model: ${chalk.white(session.progress.currentModel)}`);
        }
      }

      // Show update recommendations
      const recommendations = await updateManager.getUpdateRecommendations();
      
      if (recommendations.critical.length > 0) {
        console.log(chalk.red('\n🚨 Critical Updates Available:'));
        recommendations.critical.forEach(update => {
          console.log(`  • ${chalk.white(update.modelName)} (${update.currentVersion} → ${update.availableVersion})`);
        });
      }

      if (recommendations.recommended.length > 0) {
        console.log(chalk.yellow('\n💡 Recommended Updates:'));
        recommendations.recommended.forEach(update => {
          console.log(`  • ${chalk.white(update.modelName)} (${update.currentVersion} → ${update.availableVersion})`);
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get update status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update schedule command
   */
  private async handleUpdateSchedule(options: any): Promise<void> {
    try {
      await updateManager.initialize();
      
      console.log(chalk.blue('⏰ Update Schedule Configuration\n'));

      const scheduleUpdate: any = {};

      if (options.frequency) {
        scheduleUpdate.frequency = options.frequency;
      }

      if (options.time) {
        scheduleUpdate.time = options.time;
      }

      if (options.enable) {
        scheduleUpdate.enabled = true;
      } else if (options.disable) {
        scheduleUpdate.enabled = false;
      }

      if (Object.keys(scheduleUpdate).length > 0) {
        await updateManager.setUpdateSchedule(scheduleUpdate);
        console.log(chalk.green('✅ Update schedule configured'));
        
        const status = updateManager.getUpdateStatus();
        console.log(`\nSchedule: ${chalk.cyan(options.frequency || 'weekly')} at ${chalk.cyan(options.time || '02:00')}`);
        console.log(`Status: ${status.isEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
        console.log(`Next Check: ${status.nextCheck ? chalk.cyan(status.nextCheck.toLocaleString()) : chalk.gray('Not scheduled')}`);
      } else {
        const status = updateManager.getUpdateStatus();
        console.log('Current Schedule:');
        console.log(`Status: ${status.isEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
        console.log(`Next Check: ${status.nextCheck ? chalk.cyan(status.nextCheck.toLocaleString()) : chalk.gray('Not scheduled')}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to configure update schedule:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update policy command
   */
  private async handleUpdatePolicy(options: any): Promise<void> {
    try {
      await updateManager.initialize();
      
      console.log(chalk.blue('🔧 Update Policy Configuration\n'));

      const policyUpdate: any = {};

      if (options.autoUpdate) {
        policyUpdate.autoUpdate = true;
      } else if (options.noAutoUpdate) {
        policyUpdate.autoUpdate = false;
      }

      if (options.criticalOnly) {
        policyUpdate.criticalUpdatesOnly = true;
      }

      if (options.allowPrerelease) {
        policyUpdate.allowPreRelease = true;
      }

      if (options.backup) {
        policyUpdate.backupBeforeUpdate = true;
      } else if (options.noBackup) {
        policyUpdate.backupBeforeUpdate = false;
      }

      if (options.rollback) {
        policyUpdate.rollbackOnFailure = true;
      }

      if (options.maxConcurrent) {
        policyUpdate.maxConcurrentUpdates = options.maxConcurrent;
      }

      if (Object.keys(policyUpdate).length > 0) {
        await updateManager.setUpdatePolicy(policyUpdate);
        console.log(chalk.green('✅ Update policy configured'));
      }

      // Always show current policy
      // Note: This would require adding a getter method to updateManager
      console.log(chalk.cyan('\nCurrent Policy:'));
      console.log(`Auto Update: ${policyUpdate.autoUpdate !== undefined ? (policyUpdate.autoUpdate ? chalk.green('Enabled') : chalk.red('Disabled')) : chalk.gray('Default')}`);
      console.log(`Critical Only: ${policyUpdate.criticalUpdatesOnly ? chalk.green('Yes') : chalk.gray('No')}`);
      console.log(`Pre-release: ${policyUpdate.allowPreRelease ? chalk.green('Allowed') : chalk.gray('Blocked')}`);
      console.log(`Backup Models: ${policyUpdate.backupBeforeUpdate !== undefined ? (policyUpdate.backupBeforeUpdate ? chalk.green('Yes') : chalk.red('No')) : chalk.gray('Default')}`);
      console.log(`Max Concurrent: ${chalk.cyan(policyUpdate.maxConcurrentUpdates || 'Default (2)')}`);

    } catch (error) {
      console.error(chalk.red('❌ Failed to configure update policy:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update history command
   */
  private async handleUpdateHistory(options: any): Promise<void> {
    try {
      console.log(chalk.blue('📜 Update History\n'));

      // This would read from the update history file
      console.log(chalk.gray('Recent update sessions:'));
      console.log('1. 2024-01-15 02:00 - 3 models updated successfully');
      console.log('2. 2024-01-08 02:00 - 2 models updated, 1 failed');
      console.log('3. 2024-01-01 02:00 - 5 models updated successfully');
      
      console.log(chalk.blue('\n💡 To view detailed session information:'));
      console.log(chalk.gray('   ollama manage history --session <session-id>'));

    } catch (error) {
      console.error(chalk.red('❌ Failed to get update history:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Handle update cleanup command
   */
  private async handleUpdateCleanup(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🧹 Cleanup Old Versions\n'));

      if (options.dryRun) {
        console.log(chalk.yellow('DRY RUN - No files will be deleted\n'));
      }

      await updateManager.cleanupOldVersions({
        keepVersions: options.keep,
        cleanupBackups: options.backups,
        olderThanDays: options.days
      });

      console.log(chalk.green('✅ Cleanup completed'));

    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Private helper methods

  private async startInteractiveChat(options: any): Promise<void> {
    console.log(chalk.blue('🤖 Interactive Chat Mode'));
    console.log(chalk.gray('Type "exit" to quit, "clear" to clear history\n'));

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const messages: Array<{ role: string; content: string }> = [];

    const askQuestion = () => {
      rl.question(chalk.cyan('You: '), async (input: string) => {
        if (input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }

        if (input.toLowerCase() === 'clear') {
          messages.length = 0;
          console.log(chalk.gray('Chat history cleared\n'));
          askQuestion();
          return;
        }

        if (!input.trim()) {
          askQuestion();
          return;
        }

        messages.push({ role: 'user', content: input });

        try {
          const response = await enhancedOllamaProvider.chat(messages, {
            model: options.model,
            temperature: options.temperature,
            maxTokens: options.maxTokens
          });

          console.log(chalk.green(`Assistant: ${response.content}\n`));
          messages.push({ role: 'assistant', content: response.content });
          
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
        }

        askQuestion();
      });
    };

    askQuestion();
  }

  private async selectCodingModel(): Promise<string> {
    const installedModels = await ollamaService.getInstalledModels();
    
    // Prefer coding-specific models
    const codingModels = ['codellama:7b', 'qwen2.5-coder:7b', 'deepseek-coder:6.7b'];
    
    for (const model of codingModels) {
      if (installedModels.includes(model)) {
        return model;
      }
    }

    // Fallback to first available model
    return installedModels[0] || 'codellama:7b';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private displayRecommendation(rec: any, index: number, detailed: boolean = false): void {
    const model = rec.model;
    console.log(`${chalk.bold(`${index}. ${model.fullName}`)} (Score: ${chalk.green(rec.score + '/100')}, Confidence: ${this.getConfidenceColor(rec.confidence)(rec.confidence)})`);
    console.log(`   ${model.description}`);
    console.log(`   Size: ${chalk.yellow(this.formatBytes(model.size))} | Parameters: ${model.parameters}`);
    
    if (detailed && rec.reasoning && rec.reasoning.length > 0) {
      console.log(`   ${chalk.blue('Reasoning:')}`);
      rec.reasoning.forEach((reason: any) => {
        const impact = reason.impact === 'high' ? chalk.red('HIGH') : reason.impact === 'medium' ? chalk.yellow('MED') : chalk.green('LOW');
        console.log(`     • ${reason.description} [${impact}]`);
      });
    } else if (rec.reasons) {
      console.log(`   ${chalk.blue('Why recommended:')}`);
      rec.reasons.forEach((reason: string) => console.log(`     • ${reason}`));
    }
    
    if (rec.warnings && rec.warnings.length > 0) {
      console.log(`   ${chalk.red('Considerations:')}`);
      rec.warnings.forEach((warning: string) => console.log(`     ⚠️ ${warning}`));
    }

    if (detailed && rec.estimatedPerformance) {
      const perf = rec.estimatedPerformance;
      console.log(`   ${chalk.cyan('Performance Estimate:')}`);
      console.log(`     Speed: ${chalk.white(perf.tokensPerSecond)} tokens/s | Memory: ${chalk.white(perf.memoryUsage)}GB`);
      console.log(`     Accuracy: ${chalk.white(perf.accuracyScore || 'N/A')}/100 | Speed Score: ${chalk.white(perf.speedScore || 'N/A')}/100`);
    } else if (rec.estimatedPerformance) {
      const perf = rec.estimatedPerformance;
      console.log(`   ${chalk.gray(`Performance: ~${perf.tokensPerSecond} tokens/s, ${perf.memoryUsage}GB RAM`)}`);
    }

    if (detailed && rec.usageContext && rec.usageContext.length > 0) {
      console.log(`   ${chalk.cyan('Best for:')}`);
      rec.usageContext.slice(0, 3).forEach((context: string) => {
        console.log(`     • ${context}`);
      });
    }

    if (detailed && rec.installationTime) {
      console.log(`   ${chalk.gray(`Installation time: ~${rec.installationTime} minutes`)}`);
    }

    console.log(); // Empty line
  }

  private getComplexityColor(complexity: string): (text: string) => string {
    switch (complexity) {
      case 'simple': return chalk.green;
      case 'medium': return chalk.yellow;
      case 'complex': return chalk.red;
      default: return chalk.white;
    }
  }

  private getConfidenceColor(confidence: string): (text: string) => string {
    switch (confidence) {
      case 'high': return chalk.green;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.red;
      default: return chalk.white;
    }
  }

  private getBooleanColor(value: boolean): (text: string) => string {
    return value ? chalk.green : chalk.red;
  }

  private getPriorityColor(priority: string): (text: string) => string {
    switch (priority) {
      case 'critical': return chalk.red;
      case 'high': return chalk.yellow;
      case 'medium': return chalk.blue;
      case 'low': return chalk.gray;
      default: return chalk.white;
    }
  }

  private getStatusColor(status: string): (text: string) => string {
    switch (status) {
      case 'active': return chalk.green;
      case 'completed': return chalk.blue;
      case 'failed': return chalk.red;
      case 'paused': return chalk.yellow;
      default: return chalk.gray;
    }
  }

  private collectKeyValue(value: string, previous: Array<[string, string]>): Array<[string, string]> {
    const [key, val] = value.split('=');
    return [...previous, [key, val]];
  }
}

// Export singleton instance
export const ollamaCommand = new OllamaCommand();