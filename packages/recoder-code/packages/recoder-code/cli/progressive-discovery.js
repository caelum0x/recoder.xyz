/**
 * Progressive Feature Discovery System
 * Shows users advanced features when they're ready for them
 */

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const fs = require('fs');
const path = require('path');
const os = require('os');

class ProgressiveDiscovery {
  constructor() {
    this.userDataDir = path.join(os.homedir(), '.recoder-code');
    this.progressFile = path.join(this.userDataDir, 'user-progress.json');
    this.progress = this.loadProgress();
  }

  /**
   * Load user progress from file
   */
  loadProgress() {
    if (fs.existsSync(this.progressFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
      } catch (error) {
        // If corrupted, start fresh
        return this.createDefaultProgress();
      }
    }
    return this.createDefaultProgress();
  }

  /**
   * Create default progress tracking
   */
  createDefaultProgress() {
    return {
      setupCompleted: false,
      firstChatCompleted: false,
      fileOperationsUsed: 0,
      modelsTriedCount: 0,
      streamingUsed: false,
      sessionsCreated: 0,
      projectsCreated: 0,
      collaborationShown: false,
      mlTrainingShown: false,
      pluginsShown: false,
      advancedFeaturesUnlocked: false,
      lastActiveDate: new Date().toISOString(),
      totalInteractions: 0
    };
  }

  /**
   * Save progress to file
   */
  saveProgress() {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }
      fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not save progress: ${error.message}`));
    }
  }

  /**
   * Track user action and potentially show discovery message
   */
  trackAction(action, data = {}) {
    this.progress.totalInteractions++;
    this.progress.lastActiveDate = new Date().toISOString();

    switch (action) {
      case 'setup-completed':
        this.progress.setupCompleted = true;
        this.showDiscovery('setup', '🎉 Setup complete! Try: recoder-code "Hello world"');
        break;

      case 'first-chat':
        if (!this.progress.firstChatCompleted) {
          this.progress.firstChatCompleted = true;
          this.showDiscovery('first-chat', '💡 Great! Try building something: recoder-code "Create a simple calculator"');
        }
        break;

      case 'file-operation':
        this.progress.fileOperationsUsed++;
        if (this.progress.fileOperationsUsed === 3 && !this.progress.advancedFeaturesUnlocked) {
          this.showDiscovery('file-ops', '🔧 You\'re getting advanced! Try: recoder-code --stream for faster responses');
        }
        break;

      case 'model-switched':
        this.progress.modelsTriedCount++;
        if (this.progress.modelsTriedCount === 2) {
          this.showDiscovery('models', '🤖 Model explorer! See all models: recoder-code --models');
        }
        break;

      case 'streaming-used':
        if (!this.progress.streamingUsed) {
          this.progress.streamingUsed = true;
          this.showDiscovery('streaming', '⚡ Streaming unlocked! Try: recoder-code --fast for speed optimization');
        }
        break;

      case 'project-created':
        this.progress.projectsCreated++;
        if (this.progress.projectsCreated === 2 && !this.progress.collaborationShown) {
          this.progress.collaborationShown = true;
          this.showDiscovery('collaboration', '👥 Ready for teamwork? Enable: recoder-code --enable-services');
        }
        break;

      case 'services-interest':
        if (!this.progress.mlTrainingShown) {
          this.progress.mlTrainingShown = true;
          this.showDiscovery('ml-training', '🧠 Train custom models: recoder-code train --help');
        }
        break;

      case 'advanced-unlocked':
        this.progress.advancedFeaturesUnlocked = true;
        this.showDiscovery('advanced', '🚀 Expert mode unlocked! Full help: recoder-code --help --advanced');
        break;
    }

    this.saveProgress();
  }

  /**
   * Show discovery message to user
   */
  showDiscovery(type, message) {
    console.log();
    console.log(chalk.cyan('💡 Recoder Tip:'), chalk.white(message));
    console.log();
  }

  /**
   * Get user's current level/stage
   */
  getUserLevel() {
    const p = this.progress;
    
    if (!p.setupCompleted) return 'newcomer';
    if (!p.firstChatCompleted) return 'beginner';
    if (p.fileOperationsUsed < 3) return 'learning';
    if (p.modelsTriedCount < 2) return 'exploring';
    if (!p.streamingUsed) return 'developing';
    if (p.projectsCreated < 2) return 'building';
    if (!p.collaborationShown) return 'solo-developer';
    if (!p.advancedFeaturesUnlocked) return 'advanced';
    return 'expert';
  }

  /**
   * Get suggestions based on current level
   */
  getSuggestions() {
    const level = this.getUserLevel();
    const suggestions = {
      newcomer: [
        'Run: recoder-code --setup',
        'Get your free OpenRouter API key at: openrouter.ai'
      ],
      beginner: [
        'Try: recoder-code "Hello world"',
        'Ask me to create files: recoder-code "Create a README.md"'
      ],
      learning: [
        'Build something: recoder-code "Create a simple web page"',
        'Try different models: recoder-code --model deepseek/deepseek-chat "help me"'
      ],
      exploring: [
        'Speed up responses: recoder-code --stream "help me build an app"',
        'See all models: recoder-code --models'
      ],
      developing: [
        'Create larger projects: recoder-code "Build a todo app with React"',
        'Use project sessions: recoder-code --resume <session-id>'
      ],
      building: [
        'Enable collaboration: recoder-code --enable-services',
        'Try ML training: recoder-code train --help'
      ],
      'solo-developer': [
        'Invite team members: recoder-code collab create "My Project"',
        'Install plugins: recoder-code plugins search "linter"'
      ],
      advanced: [
        'Train custom models: recoder-code train merge config.json',
        'Full platform: recoder-code --help --advanced'
      ],
      expert: [
        'Contribute to the platform: GitHub issues welcome!',
        'Share your workflows with the community'
      ]
    };

    return suggestions[level] || [];
  }

  /**
   * Show contextual suggestions when appropriate
   */
  showContextualSuggestion(context) {
    if (Math.random() > 0.3) return; // Only show 30% of the time to avoid spam

    const suggestions = this.getSuggestions();
    if (suggestions.length === 0) return;

    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    this.showDiscovery('contextual', suggestion);
  }

  /**
   * Check if user is ready for advanced features
   */
  isReadyForAdvanced() {
    const p = this.progress;
    return p.setupCompleted && 
           p.firstChatCompleted && 
           p.fileOperationsUsed >= 2 && 
           p.totalInteractions >= 5;
  }

  /**
   * Get progress summary for user
   */
  getProgressSummary() {
    const level = this.getUserLevel();
    const p = this.progress;
    
    return {
      level,
      interactions: p.totalInteractions,
      setupCompleted: p.setupCompleted,
      featuresUsed: {
        fileOperations: p.fileOperationsUsed,
        modelsTriedCount: p.modelsTriedCount,
        streamingUsed: p.streamingUsed,
        projectsCreated: p.projectsCreated
      },
      nextSuggestions: this.getSuggestions().slice(0, 2)
    };
  }

  /**
   * Show user progress when requested
   */
  showProgress() {
    const summary = this.getProgressSummary();
    
    console.log(chalk.cyan.bold('\n🎯 Your Recoder Progress'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.blue('Level:'), chalk.white(summary.level));
    console.log(chalk.blue('Interactions:'), chalk.white(summary.interactions));
    
    console.log(chalk.yellow('\n✨ Features Unlocked:'));
    console.log(chalk.green('✅ File Operations:'), summary.featuresUsed.fileOperations);
    console.log(chalk.green('✅ Models Tried:'), summary.featuresUsed.modelsTriedCount);
    console.log(chalk.green('✅ Streaming:'), summary.featuresUsed.streamingUsed ? 'Yes' : 'Not yet');
    console.log(chalk.green('✅ Projects Created:'), summary.featuresUsed.projectsCreated);
    
    if (summary.nextSuggestions.length > 0) {
      console.log(chalk.cyan('\n💡 Try Next:'));
      summary.nextSuggestions.forEach((suggestion, i) => {
        console.log(chalk.white(`  ${i + 1}. ${suggestion}`));
      });
    }
    
    console.log();
  }

  /**
   * Reset progress (for testing or user request)
   */
  resetProgress() {
    this.progress = this.createDefaultProgress();
    this.saveProgress();
    console.log(chalk.green('✅ Progress reset to beginning'));
  }
}

module.exports = ProgressiveDiscovery;