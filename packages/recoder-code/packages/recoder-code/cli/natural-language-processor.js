#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Natural Language Processor
 * Intelligent intent recognition for conversational feature access
 */
class NaturalLanguageProcessor {
  constructor(recoderInstance) {
    this.recoder = recoderInstance;
    
    // Intent patterns with confidence scoring
    this.intentPatterns = new Map();
    this.commandMappings = new Map();
    this.contextMemory = [];
    this.conversationContext = {
      lastIntent: null,
      currentTopic: null,
      awaitingResponse: false,
      projectContext: null,
      fileContext: null
    };
    this.smartSuggestions = new Map();
    
    this.initializeIntentPatterns();
    this.initializeCommandMappings();
    
    console.log(chalk.cyan('🧠 Natural Language Processor ready'));
  }

  /**
   * Initialize intent recognition patterns
   */
  initializeIntentPatterns() {
    // Core development workflow intents - these should be intercepted
    this.addIntentPattern('build_app', [
      /^(?:build|create|make).{0,30}(?:app|application|website|project|tool)/i,
      /^(?:help|need).{0,10}(?:me|to).{0,10}(?:build|create|make)/i,
      /^(?:i want to|let me|can you).{0,10}(?:build|create|make)/i
    ], 0.95);

    this.addIntentPattern('fix_error', [
      /(?:fix|solve|debug|resolve).{0,20}(?:error|bug|issue|problem)/i,
      /(?:error|bug|issue|problem).{0,20}(?:in|with)/i,
      /(?:broken|not working|failing)/i,
      /(?:help|debug).{0,10}(?:this|my|the).{0,10}(?:code|function|error)/i
    ], 0.95);

    this.addIntentPattern('code_review', [
      /(?:review|check|analyze).{0,20}(?:my|this|the).{0,20}code/i,
      /(?:code|security).{0,20}review/i,
      /(?:check|find).{0,20}(?:bugs|issues|problems)/i
    ], 0.9);

    this.addIntentPattern('deploy_project', [
      /(?:deploy|publish|release).{0,20}(?:project|app|code)/i,
      /(?:go|put).{0,20}live/i,
      /(?:production|staging)/i
    ], 0.9);

    // Model management - only when explicitly requested
    this.addIntentPattern('model_list', [
      /^(?:show|list|what).{0,20}(?:models?|ai.{0,10}models?)/i,
      /^what.{0,20}models?.{0,20}(?:available|can.{0,10}use)/i
    ], 0.9);

    this.addIntentPattern('model_switch', [
      /^(?:switch|change|use).{0,20}(?:model|to).{0,20}(\w+)/i,
      /^(?:use|select).{0,20}(\w+).{0,20}model/i
    ], 0.85);

    // Vision analysis - when file mentioned
    this.addIntentPattern('analyze_image', [
      /(?:analyze|examine|look at|review).{0,20}(?:image|picture|screenshot|photo)/i,
      /(?:analyze|check).{0,20}this.{0,20}(?:image|picture|screenshot)/i
    ], 0.9);
  }

  /**
   * Add intent pattern with confidence score
   */
  addIntentPattern(intent, patterns, confidence) {
    this.intentPatterns.set(intent, {
      patterns: patterns,
      confidence: confidence
    });
  }

  /**
   * Initialize command mappings for intents
   */
  initializeCommandMappings() {
    // Core development workflow
    this.commandMappings.set('build_app', {
      action: 'createProject',
      message: 'I\'ll help you build that! Let me create a project plan...'
    });

    this.commandMappings.set('fix_error', {
      action: 'passToAI',
      enhancePrompt: true,
      message: 'Let me help you debug that...'
    });

    this.commandMappings.set('code_review', {
      action: 'executeSlashCommand',
      command: '/review',
      message: 'Running code review...'
    });

    this.commandMappings.set('deploy_project', {
      action: 'executeSlashCommand', 
      command: '/deploy',
      message: 'Starting deployment...'
    });

    // Model management
    this.commandMappings.set('model_list', {
      action: 'listModels',
      message: 'Here are the available AI models:'
    });

    this.commandMappings.set('model_switch', {
      action: 'switchModel',
      message: 'Switching models...'
    });

    // Vision analysis
    this.commandMappings.set('analyze_image', {
      action: 'analyzeImage',
      message: 'Analyzing image...'
    });
  }

  /**
   * Process natural language input and detect intent
   */
  async processInput(userInput) {
    const intent = this.detectIntent(userInput);
    
    if (intent && intent.confidence > 0.85) {
      console.log(chalk.gray(`🧠 ${intent.name} detected`));
      
      const result = await this.executeIntent(intent, userInput);
      
      // Add to memory for context
      this.contextMemory.push({
        input: userInput,
        intent: intent.name,
        timestamp: new Date().toISOString(),
        result: result
      });
      
      // Keep memory limited
      if (this.contextMemory.length > 20) {
        this.contextMemory = this.contextMemory.slice(-10);
      }
      
      return result;
    }
    
    return null; // Pass through to normal AI processing
  }

  /**
   * Detect intent from user input
   */
  detectIntent(input) {
    let bestMatch = null;
    let highestConfidence = 0;
    
    for (const [intentName, intentData] of this.intentPatterns.entries()) {
      for (const pattern of intentData.patterns) {
        const match = input.match(pattern);
        if (match) {
          let confidence = intentData.confidence;
          
          // Boost confidence for exact keyword matches
          const keywords = this.getIntentKeywords(intentName);
          for (const keyword of keywords) {
            if (input.toLowerCase().includes(keyword)) {
              confidence += 0.05;
            }
          }
          
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = {
              name: intentName,
              confidence: Math.min(confidence, 1.0),
              match: match,
              extractedData: this.extractData(match, intentName)
            };
          }
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Get keywords for intent confidence boosting
   */
  getIntentKeywords(intent) {
    const keywordMap = {
      'model_list': ['models', 'ai', 'available'],
      'model_switch': ['switch', 'change', 'use'],
      'analyze_image': ['analyze', 'image', 'picture', 'screenshot'],
      'code_review': ['review', 'code', 'check'],
      'security_audit': ['security', 'vulnerability', 'audit'],
      'optimize_performance': ['optimize', 'performance', 'faster'],
      'generate_docs': ['documentation', 'docs', 'document'],
      'project_status': ['status', 'project'],
      'backup_project': ['backup', 'save'],
      'show_sessions': ['sessions', 'history'],
      'create_task': ['task', 'todo', 'create'],
      'analyze_architecture': ['architecture', 'design', 'system'],
      'generate_tests': ['tests', 'testing']
    };
    
    return keywordMap[intent] || [];
  }

  /**
   * Extract data from regex matches
   */
  extractData(match, intentName) {
    const data = {};
    
    if (intentName === 'model_switch' || intentName === 'model_info') {
      // Extract model name from capture groups
      if (match[1]) {
        data.modelName = match[1].toLowerCase();
      }
    }
    
    if (intentName === 'analyze_image') {
      // Look for image paths in the input
      const pathMatch = match.input.match(/[\w\-\.\s\/\\]+\.(png|jpg|jpeg|gif|webp|svg)/i);
      if (pathMatch) {
        data.imagePath = pathMatch[0].trim();
      }
    }
    
    return data;
  }

  /**
   * Execute the detected intent
   */
  async executeIntent(intent, originalInput) {
    const mapping = this.commandMappings.get(intent.name);
    
    if (!mapping) {
      return null;
    }
    
    console.log(chalk.gray(mapping.message));
    
    try {
      switch (mapping.action) {
        case 'createProject':
          return await this.handleCreateProject(originalInput);
          
        case 'passToAI':
          return await this.handlePassToAI(originalInput, mapping);
          
        case 'listModels':
          return await this.handleListModels();
          
        case 'switchModel':
          return await this.handleSwitchModel(intent.extractedData);
          
        case 'analyzeImage':
          return await this.handleAnalyzeImage(intent.extractedData, originalInput);
          
        case 'executeSlashCommand':
          return await this.handleSlashCommand(mapping.command);
          
        case 'showProjectStatus':
          return await this.handleShowProjectStatus();
          
        case 'backupProject':
          return await this.handleBackupProject();
          
        case 'showSessions':
          return await this.handleShowSessions();
          
        case 'createTask':
          return await this.handleCreateTask(originalInput);
          
        case 'handleConfirmation':
          return await this.handleConfirmation();
          
        case 'handleCancellation':
          return await this.handleCancellation();
          
        case 'showContextualHelp':
          return await this.handleShowContextualHelp(originalInput);
          
        case 'startNewProject':
          return await this.handleStartNewProject(originalInput);
          
        case 'deployProject':
          return await this.handleDeployProject(originalInput);
          
        case 'buildApp':
          return await this.handleBuildApp(originalInput);
          
        case 'fixError':
          return await this.handleFixError(originalInput);
          
        case 'explainCode':
          return await this.handleExplainCode(originalInput);
          
        case 'addFeature':
          return await this.handleAddFeature(originalInput);
          
        default:
          console.log(chalk.yellow(`⚠️  Unknown action: ${mapping.action}`));
          return null;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error executing intent: ${error.message}`));
      return null;
    }
  }

  /**
   * Handle list models intent
   */
  async handleListModels() {
    if (this.recoder.modelManager) {
      this.recoder.modelManager.listModels();
      return {
        type: 'system_command',
        executed: true,
        action: 'list_models'
      };
    } else {
      console.log(chalk.yellow('⚠️  Model manager not available'));
      return null;
    }
  }

  /**
   * Handle switch model intent
   */
  async handleSwitchModel(data) {
    if (!this.recoder.modelManager) {
      console.log(chalk.yellow('⚠️  Model manager not available'));
      return null;
    }
    
    if (!data.modelName) {
      // Show model picker if no specific model mentioned
      await this.recoder.modelManager.pickModel();
    } else {
      // Try to find and switch to the specified model
      const modelId = this.findModelByName(data.modelName);
      if (modelId) {
        await this.recoder.modelManager.switchToModel(modelId, 'natural-language');
      } else {
        console.log(chalk.yellow(`⚠️  Model '${data.modelName}' not found. Here are available models:`));
        this.recoder.modelManager.listModels();
      }
    }
    
    return {
      type: 'system_command',
      executed: true,
      action: 'switch_model',
      modelName: data.modelName
    };
  }

  /**
   * Handle show model info intent
   */
  async handleShowModelInfo(data) {
    if (!this.recoder.modelManager) {
      console.log(chalk.yellow('⚠️  Model manager not available'));
      return null;
    }
    
    const modelId = data.modelName ? this.findModelByName(data.modelName) : null;
    this.recoder.modelManager.displayModelInfo(modelId);
    
    return {
      type: 'system_command',
      executed: true,
      action: 'show_model_info'
    };
  }

  /**
   * Handle build app intent
   */
  async handleBuildApp(originalInput) {
    console.log(chalk.green('🚀 Let\'s build that app!'));
    
    // Create a development task
    if (this.recoder.taskManager) {
      try {
        const taskId = await this.recoder.taskManager.createTask('feature-development', {
          description: `Build app: ${originalInput}`,
          priority: 'high',
          creator: 'user'
        });
        console.log(chalk.blue(`📋 Created development task: ${taskId}`));
      } catch (error) {
        // Continue without task if manager not available
      }
    }
    
    // Return null to pass to AI for detailed implementation
    return null;
  }

  /**
   * Handle fix error intent
   */
  async handleFixError(originalInput) {
    console.log(chalk.blue('🔧 Let me help you debug that...'));
    
    // Add debugging context if available
    if (this.recoder.projectManager) {
      try {
        const projectStatus = this.recoder.projectManager.getProjectStatus();
        if (projectStatus.exists) {
          console.log(chalk.gray(`Project: ${projectStatus.context.name}`));
        }
      } catch (error) {
        // Continue without project context
      }
    }
    
    // Return null to pass to AI with debugging context
    return null;
  }

  /**
   * Handle explain code intent
   */
  async handleExplainCode(originalInput) {
    console.log(chalk.cyan('📖 I\'ll explain that code for you...'));
    
    // Return null to pass to AI for code explanation
    return null;
  }

  /**
   * Handle add feature intent
   */
  async handleAddFeature(originalInput) {
    console.log(chalk.green('✨ Adding new feature...'));
    
    // Create a feature task
    if (this.recoder.taskManager) {
      try {
        const taskId = await this.recoder.taskManager.createTask('feature-development', {
          description: originalInput,
          priority: 'medium',
          creator: 'user'
        });
        console.log(chalk.blue(`📋 Created feature task: ${taskId}`));
      } catch (error) {
        // Continue without task if manager not available
      }
    }
    
    // Return null to pass to AI for implementation
    return null;
  }

  /**
   * Handle analyze image intent
   */
  async handleAnalyzeImage(data, originalInput) {
    if (!this.recoder.visionAnalyzer) {
      console.log(chalk.yellow('⚠️  Vision analyzer not available'));
      return null;
    }
    
    let imagePath = data.imagePath;
    
    if (!imagePath) {
      // Prompt for image path
      const inquirer = require('inquirer');
      const result = await inquirer.prompt([{
        type: 'input',
        name: 'imagePath',
        message: 'Please provide the path to the image you want to analyze:',
        validate: (input) => {
          if (!input) return 'Please provide an image path';
          if (!fs.existsSync(input)) return 'File does not exist';
          const ext = path.extname(input).toLowerCase();
          if (!this.recoder.visionAnalyzer.supportedFormats.includes(ext)) {
            return `Unsupported format. Supported: ${this.recoder.visionAnalyzer.supportedFormats.join(', ')}`;
          }
          return true;
        }
      }]);
      imagePath = result.imagePath;
    }
    
    if (imagePath) {
      const analysisResult = await this.recoder.visionAnalyzer.analyzeImage(imagePath, 'auto-detect', {
        detailed: originalInput.includes('detailed') || originalInput.includes('thorough'),
        generateCode: originalInput.includes('code') || originalInput.includes('implement')
      });
      
      return {
        type: 'system_command',
        executed: true,
        action: 'analyze_image',
        result: analysisResult
      };
    }
    
    return null;
  }

  /**
   * Handle show vision templates intent
   */
  async handleShowVisionTemplates() {
    if (this.recoder.visionAnalyzer) {
      this.recoder.visionAnalyzer.listTemplates();
      return {
        type: 'system_command',
        executed: true,
        action: 'show_vision_templates'
      };
    } else {
      console.log(chalk.yellow('⚠️  Vision analyzer not available'));
      return null;
    }
  }

  /**
   * Handle slash command execution
   */
  async handleSlashCommand(command) {
    if (this.recoder.slashCommands) {
      const result = await this.recoder.slashCommands.executeCommand(command);
      return {
        type: 'system_command',
        executed: true,
        action: 'slash_command',
        command: command,
        result: result
      };
    } else {
      console.log(chalk.yellow('⚠️  Slash commands not available'));
      return null;
    }
  }

  /**
   * Handle show project status intent
   */
  async handleShowProjectStatus() {
    if (this.recoder.projectManager) {
      this.recoder.projectManager.showStatus();
      return {
        type: 'system_command',
        executed: true,
        action: 'show_project_status'
      };
    } else {
      console.log(chalk.yellow('⚠️  Project manager not available'));
      return null;
    }
  }

  /**
   * Handle backup project intent
   */
  async handleBackupProject() {
    if (this.recoder.projectManager) {
      this.recoder.projectManager.createSmartBackup('Natural language request');
      return {
        type: 'system_command',
        executed: true,
        action: 'backup_project'
      };
    } else {
      console.log(chalk.yellow('⚠️  Project manager not available'));
      return null;
    }
  }

  /**
   * Handle show sessions intent
   */
  async handleShowSessions() {
    if (this.recoder.projectManager) {
      this.recoder.projectManager.showSessions();
      return {
        type: 'system_command',
        executed: true,
        action: 'show_sessions'
      };
    } else {
      console.log(chalk.yellow('⚠️  Project manager not available'));
      return null;
    }
  }

  /**
   * Handle create task intent
   */
  async handleCreateTask(originalInput) {
    if (this.recoder.taskManager) {
      // Extract task details from input
      const taskType = this.inferTaskType(originalInput);
      const taskId = await this.recoder.taskManager.createTask(taskType, {
        description: originalInput,
        priority: 'medium',
        creator: 'natural-language'
      });
      
      console.log(chalk.green(`✅ Created task: ${taskId}`));
      
      return {
        type: 'system_command',
        executed: true,
        action: 'create_task',
        taskId: taskId
      };
    } else {
      console.log(chalk.yellow('⚠️  Task manager not available'));
      return null;
    }
  }

  /**
   * Find model by partial name
   */
  findModelByName(partialName) {
    if (!this.recoder.modelManager) return null;
    
    const searchTerm = partialName.toLowerCase();
    
    for (const [modelId, model] of this.recoder.modelManager.models.entries()) {
      if (modelId.toLowerCase().includes(searchTerm) || 
          model.name.toLowerCase().includes(searchTerm) ||
          model.family.toLowerCase().includes(searchTerm)) {
        return modelId;
      }
    }
    
    return null;
  }

  /**
   * Infer task type from input
   */
  inferTaskType(input) {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('review') || lowerInput.includes('check')) {
      return 'code-review';
    }
    if (lowerInput.includes('feature') || lowerInput.includes('implement')) {
      return 'feature-development';
    }
    if (lowerInput.includes('bug') || lowerInput.includes('fix')) {
      return 'bug-fix';
    }
    if (lowerInput.includes('deploy') || lowerInput.includes('release')) {
      return 'deployment';
    }
    if (lowerInput.includes('security') || lowerInput.includes('audit')) {
      return 'security-audit';
    }
    if (lowerInput.includes('performance') || lowerInput.includes('optimize')) {
      return 'performance-optimization';
    }
    
    return 'feature-development'; // Default
  }

  /**
   * Get processing statistics
   */
  getStats() {
    const intentCounts = {};
    for (const memory of this.contextMemory) {
      intentCounts[memory.intent] = (intentCounts[memory.intent] || 0) + 1;
    }
    
    return {
      totalProcessed: this.contextMemory.length,
      intentDistribution: intentCounts,
      recentActivity: this.contextMemory.slice(-5)
    };
  }

  /**
   * Create project from natural language request
   */
  async handleCreateProject(originalInput) {
    console.log(chalk.green('🚀 I\'ll help you build that!'));
    
    // Create a todo task for the project
    if (this.recoder.taskManager) {
      try {
        const taskId = await this.recoder.taskManager.createTask('feature-development', {
          description: originalInput,
          priority: 'high',
          creator: 'user'
        });
        console.log(chalk.blue(`📋 Created project task: ${taskId}`));
      } catch (error) {
        // Continue without task if manager not available
      }
    }
    
    // Return null to pass to AI for detailed implementation
    return null;
  }

  /**
   * Pass to AI with enhanced context
   */
  async handlePassToAI(originalInput, mapping) {
    if (mapping.enhancePrompt) {
      console.log(chalk.blue('🔍 Analyzing your request...'));
      
      // Add context about the current project if available
      let enhancedPrompt = originalInput;
      
      if (this.recoder.projectManager) {
        try {
          const projectStatus = this.recoder.projectManager.getProjectStatus();
          if (projectStatus.exists) {
            enhancedPrompt = `Project context: ${projectStatus.context.name}\n\nUser request: ${originalInput}`;
          }
        } catch (error) {
          // Continue without project context
        }
      }
      
      // Return null to pass enhanced prompt to AI
      return null;
    }
    
    return null;
  }

  /**
   * Update conversation context
   */
  updateConversationContext(userInput) {
    // Extract file references
    const fileMatch = userInput.match(/(\w+\.\w+)/);
    if (fileMatch) {
      this.conversationContext.fileContext = fileMatch[0];
    }
    
    // Update project context if available
    if (this.recoder.projectManager) {
      try {
        const projectStatus = this.recoder.projectManager.getProjectStatus();
        this.conversationContext.projectContext = projectStatus;
      } catch (error) {
        // Ignore errors
      }
    }
  }

  /**
   * Handle contextual input when awaiting response
   */
  async handleContextualInput(userInput) {
    const lowerInput = userInput.toLowerCase().trim();
    
    if (['yes', 'y', 'ok', 'sure', 'go ahead', 'proceed'].includes(lowerInput)) {
      return await this.handleConfirmation();
    }
    
    if (['no', 'n', 'cancel', 'abort', 'stop'].includes(lowerInput)) {
      return await this.handleCancellation();
    }
    
    return null;
  }

  /**
   * Show smart suggestions based on context
   */
  showSmartSuggestions(intentName, userInput) {
    const suggestions = this.generateContextualSuggestions(intentName, userInput);
    
    if (suggestions.length > 0) {
      console.log(chalk.gray('💡 Smart suggestions:'));
      suggestions.forEach(suggestion => {
        console.log(chalk.gray(`   • ${suggestion}`));
      });
    }
  }

  /**
   * Generate contextual suggestions
   */
  generateContextualSuggestions(intentName, userInput) {
    const suggestions = [];
    
    switch (intentName) {
      case 'model_list':
        suggestions.push('Try: "switch to claude" to change models');
        suggestions.push('Try: "tell me about deepseek" for model details');
        break;
        
      case 'analyze_image':
        suggestions.push('Try: "what vision templates are available" for analysis types');
        suggestions.push('Try: "analyze with detailed output" for comprehensive analysis');
        break;
        
      case 'code_review':
        suggestions.push('Try: "check for security issues" for security focus');
        suggestions.push('Try: "optimize performance" for speed improvements');
        break;
        
      case 'project_status':
        suggestions.push('Try: "backup my project" to save current state');
        suggestions.push('Try: "create a new task" to add todos');
        break;
    }
    
    return suggestions;
  }

  /**
   * Infer topic from intent
   */
  inferTopic(intentName) {
    const topicMap = {
      'model_list': 'models',
      'model_switch': 'models', 
      'model_info': 'models',
      'analyze_image': 'vision',
      'vision_templates': 'vision',
      'code_review': 'development',
      'security_audit': 'security',
      'optimize_performance': 'performance',
      'generate_docs': 'documentation',
      'project_status': 'project',
      'backup_project': 'project',
      'show_sessions': 'sessions',
      'create_task': 'tasks'
    };
    
    return topicMap[intentName] || 'general';
  }

  /**
   * Generate suggestions for unrecognized input
   */
  generateSuggestions(userInput) {
    const lowerInput = userInput.toLowerCase();
    const suggestions = [];
    
    if (lowerInput.includes('model')) {
      suggestions.push('"show me all models" - List available AI models');
      suggestions.push('"switch to claude" - Change current model');
    }
    
    if (lowerInput.includes('image') || lowerInput.includes('picture') || lowerInput.includes('photo')) {
      suggestions.push('"analyze this image file.png" - AI vision analysis');
      suggestions.push('"what vision templates are available" - Show analysis types');
    }
    
    if (lowerInput.includes('code') || lowerInput.includes('review')) {
      suggestions.push('"review my code" - AI-powered code review');
      suggestions.push('"check for security issues" - Security audit');
    }
    
    if (suggestions.length > 0) {
      console.log(chalk.yellow('🤔 Did you mean:'));
      suggestions.forEach(suggestion => {
        console.log(chalk.gray(`   • ${suggestion}`));
      });
    }
  }

  /**
   * Handle confirmation action
   */
  async handleConfirmation() {
    this.conversationContext.awaitingResponse = false;
    
    if (this.conversationContext.lastIntent) {
      console.log(chalk.green('✅ Confirmed! Proceeding with the action...'));
      // Execute the pending action based on context
      return {
        type: 'system_command',
        executed: true,
        action: 'confirmation',
        context: this.conversationContext.lastIntent
      };
    }
    
    return null;
  }

  /**
   * Handle cancellation action
   */
  async handleCancellation() {
    this.conversationContext.awaitingResponse = false;
    this.conversationContext.lastIntent = null;
    
    console.log(chalk.yellow('❌ Action cancelled.'));
    
    return {
      type: 'system_command',
      executed: true,
      action: 'cancellation'
    };
  }

  /**
   * Handle contextual help request
   */
  async handleShowContextualHelp(originalInput) {
    console.log(chalk.bold.cyan('\n🤖 Contextual Help\n'));
    
    if (this.conversationContext.currentTopic) {
      console.log(chalk.yellow(`Current topic: ${this.conversationContext.currentTopic}\n`));
      
      switch (this.conversationContext.currentTopic) {
        case 'models':
          console.log(chalk.white('Model Management Commands:'));
          console.log(chalk.gray('  "show me all models" - List available models'));
          console.log(chalk.gray('  "switch to [model]" - Change current model'));
          console.log(chalk.gray('  "tell me about [model]" - Get model details'));
          break;
          
        case 'vision':
          console.log(chalk.white('Vision Analysis Commands:'));
          console.log(chalk.gray('  "analyze this image [path]" - Analyze any image'));
          console.log(chalk.gray('  "what vision templates are available" - Show types'));
          console.log(chalk.gray('  "examine with detailed output" - Detailed analysis'));
          break;
          
        case 'development':
          console.log(chalk.white('Development Commands:'));
          console.log(chalk.gray('  "review my code" - Code review'));
          console.log(chalk.gray('  "check for security issues" - Security audit'));
          console.log(chalk.gray('  "optimize performance" - Speed improvements'));
          console.log(chalk.gray('  "generate documentation" - Create docs'));
          break;
          
        default:
          this.showHelp();
          return {
            type: 'system_command',
            executed: true,
            action: 'show_help'
          };
      }
    } else {
      this.showHelp();
    }
    
    return {
      type: 'system_command',
      executed: true,
      action: 'contextual_help',
      topic: this.conversationContext.currentTopic
    };
  }

  /**
   * Handle start new project
   */
  async handleStartNewProject(originalInput) {
    console.log(chalk.green('🚀 Starting new project setup...'));
    
    if (this.recoder.projectManager) {
      // Set awaiting response for project type
      this.conversationContext.awaitingResponse = true;
      
      console.log(chalk.cyan('What type of project would you like to create?'));
      console.log(chalk.gray('  • Web App (React, Vue, etc.)'));
      console.log(chalk.gray('  • API/Backend (Node.js, Python, etc.)'));
      console.log(chalk.gray('  • Mobile App'));
      console.log(chalk.gray('  • CLI Tool'));
      console.log(chalk.gray('  • Library/Package'));
      console.log(chalk.yellow('💬 Just tell me what you want to build!'));
      
      return {
        type: 'system_command',
        executed: true,
        action: 'start_project_wizard',
        awaitingInput: true
      };
    }
    
    return null;
  }

  /**
   * Handle deploy project
   */
  async handleDeployProject(originalInput) {
    console.log(chalk.blue('🚀 Analyzing deployment options...'));
    
    if (this.recoder.taskManager) {
      const taskId = await this.recoder.taskManager.createTask('deployment', {
        description: 'Deploy project to production',
        priority: 'high',
        creator: 'natural-language'
      });
      
      console.log(chalk.green(`✅ Created deployment task: ${taskId}`));
    }
    
    // Execute deployment slash command
    if (this.recoder.slashCommands) {
      await this.recoder.slashCommands.executeCommand('/deploy');
    }
    
    return {
      type: 'system_command',
      executed: true,
      action: 'deploy_project'
    };
  }

  /**
   * Show general help
   */
  showHelp() {
    console.log(chalk.bold.cyan('\n🤖 Recoder Code - Natural Language Help\n'));
    
    console.log(chalk.white('Just talk naturally! Here are some examples:\n'));
    
    console.log(chalk.green('💬 Building Apps:'));
    console.log(chalk.gray('   "build a todo app with React"'));
    console.log(chalk.gray('   "create a REST API with Node.js"'));
    console.log(chalk.gray('   "help me make a mobile app"'));
    
    console.log(chalk.green('\n🐛 Fixing Issues:'));
    console.log(chalk.gray('   "fix this login error"'));
    console.log(chalk.gray('   "my code is broken, help debug it"'));
    console.log(chalk.gray('   "resolve authentication issues"'));
    
    console.log(chalk.green('\n🤖 AI Models:'));
    console.log(chalk.gray('   "show me all models"'));
    console.log(chalk.gray('   "switch to claude"'));
    console.log(chalk.gray('   "use the free model"'));
    
    console.log(chalk.green('\n👁️ Vision Analysis:'));
    console.log(chalk.gray('   "analyze this image file.png"'));
    console.log(chalk.gray('   "examine my UI design"'));
    
    console.log(chalk.green('\n📋 Code Review:'));
    console.log(chalk.gray('   "review my code"'));
    console.log(chalk.gray('   "check for security issues"'));
    
    console.log(chalk.yellow('\n💡 Pro Tip: Just type naturally like you\'re talking to a developer!'));
  }
}

module.exports = NaturalLanguageProcessor;