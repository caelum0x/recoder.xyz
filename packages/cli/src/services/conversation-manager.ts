/**
 * Conversation Manager - Handles conversational AI interface
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { Logger } from '../../../shared/src/logger';
import { ConfigManager } from '../utils/config';
import { AIHub } from './ai-hub';
import { AgentManager } from './agent-manager';
import { ProjectPlanner } from './project-planner';
import { CodeGenerator } from './code-generator';

export interface ConversationContext {
  id: string;
  userId: string;
  projectId?: string;
  activeAgent?: string;
  history: ConversationMessage[];
  metadata: {
    startedAt: Date;
    lastActivity: Date;
    messageCount: number;
    activeWorkspace?: string;
    currentTask?: string;
  };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    agent?: string;
    command?: string;
    files?: string[];
    tokens?: number;
    model?: string;
  };
}

export interface ConversationIntent {
  type: 'generate' | 'plan' | 'agent' | 'chat' | 'help' | 'config';
  confidence: number;
  entity?: string;
  parameters?: Record<string, any>;
}

export class ConversationManager {
  private static instance: ConversationManager;
  private currentContext: ConversationContext | null = null;
  private aiHub: AIHub;
  private agentManager: AgentManager;
  private projectPlanner: ProjectPlanner;
  private codeGenerator: CodeGenerator;
  private isInteractiveMode = false;

  private constructor() {
    this.aiHub = AIHub.getInstance();
    this.agentManager = AgentManager.getInstance();
    this.projectPlanner = ProjectPlanner.getInstance();
    this.codeGenerator = CodeGenerator.getInstance();
  }

  public static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  /**
   * Start interactive conversation mode
   */
  public async startInteractiveMode(): Promise<void> {
    this.isInteractiveMode = true;
    
    console.log(chalk.cyan('\n🤖 Welcome to Recoder AI - Interactive Mode'));
    console.log(chalk.gray('Type your requests in natural language. Examples:'));
    console.log(chalk.gray('  • "Create a React app with authentication"'));
    console.log(chalk.gray('  • "Build a Solana DEX with real trading"'));
    console.log(chalk.gray('  • "blockchain agent, create an NFT marketplace"'));
    console.log(chalk.gray('  • Type "exit" to quit\n'));

    // Initialize conversation context
    this.currentContext = await this.createConversationContext();

    while (this.isInteractiveMode) {
      try {
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.blue('recoder>'),
            prefix: '',
          }
        ]);

        if (this.shouldExit(input)) {
          break;
        }

        await this.processConversationalInput(input);
      } catch (error) {
        if (error.isTtyError) {
          console.log(chalk.red('Interactive mode not supported in this environment'));
          break;
        }
        Logger.error(`Conversation error: ${error}`);
      }
    }

    await this.endConversation();
  }

  /**
   * Process natural language input and execute appropriate actions
   */
  public async processConversationalInput(input: string): Promise<void> {
    if (!this.currentContext) {
      this.currentContext = await this.createConversationContext();
    }

    // Add user message to history
    const userMessage = this.addMessage('user', input);
    
    try {
      // Parse intent from natural language
      const intent = await this.parseIntent(input);
      
      // Execute based on intent
      const response = await this.executeIntent(intent, input);
      
      // Add assistant response to history
      this.addMessage('assistant', response, {
        command: intent.type,
        model: ConfigManager.getChatConfig().model,
      });

      // Update context
      this.updateContext();
      
    } catch (error) {
      const errorMessage = `I encountered an error: ${error.message}`;
      console.log(chalk.red(errorMessage));
      this.addMessage('assistant', errorMessage);
    }
  }

  /**
   * Parse natural language input to determine intent
   */
  private async parseIntent(input: string): Promise<ConversationIntent> {
    const normalizedInput = input.toLowerCase().trim();

    // Agent-specific commands
    if (normalizedInput.includes('agent,') || normalizedInput.includes('agent:')) {
      const agentMatch = normalizedInput.match(/([\w\s]+)\s+agent[,:]\s*(.+)/);
      if (agentMatch) {
        return {
          type: 'agent',
          confidence: 0.95,
          entity: agentMatch[1].trim(),
          parameters: { task: agentMatch[2].trim() }
        };
      }
    }

    // Generation commands
    const generateKeywords = ['create', 'build', 'generate', 'make', 'develop', 'code'];
    if (generateKeywords.some(keyword => normalizedInput.includes(keyword))) {
      // Detect project type
      let projectType = 'web';
      if (normalizedInput.includes('solana') || normalizedInput.includes('blockchain') || normalizedInput.includes('dex') || normalizedInput.includes('nft')) {
        projectType = 'blockchain';
      } else if (normalizedInput.includes('ai') || normalizedInput.includes('chatbot') || normalizedInput.includes('ml')) {
        projectType = 'ai';
      } else if (normalizedInput.includes('mobile') || normalizedInput.includes('react native')) {
        projectType = 'mobile';
      }

      return {
        type: 'generate',
        confidence: 0.9,
        parameters: { 
          description: input,
          type: projectType
        }
      };
    }

    // Planning commands
    const planKeywords = ['plan', 'architecture', 'design', 'structure'];
    if (planKeywords.some(keyword => normalizedInput.includes(keyword))) {
      return {
        type: 'plan',
        confidence: 0.85,
        parameters: { description: input }
      };
    }

    // Help commands
    const helpKeywords = ['help', 'how', 'what', '?'];
    if (helpKeywords.some(keyword => normalizedInput.includes(keyword))) {
      return {
        type: 'help',
        confidence: 0.8
      };
    }

    // Configuration commands
    const configKeywords = ['config', 'settings', 'preferences'];
    if (configKeywords.some(keyword => normalizedInput.includes(keyword))) {
      return {
        type: 'config',
        confidence: 0.8
      };
    }

    // Default to chat
    return {
      type: 'chat',
      confidence: 0.6,
      parameters: { message: input }
    };
  }

  /**
   * Execute intent and return response
   */
  private async executeIntent(intent: ConversationIntent, originalInput: string): Promise<string> {
    switch (intent.type) {
      case 'generate':
        return await this.handleGeneration(intent.parameters);
        
      case 'plan':
        return await this.handlePlanning(intent.parameters);
        
      case 'agent':
        return await this.handleAgentConversation(intent.entity!, intent.parameters);
        
      case 'help':
        return this.handleHelp();
        
      case 'config':
        return this.handleConfig();
        
      case 'chat':
        return await this.handleChat(originalInput);
        
      default:
        return 'I\'m not sure how to help with that. Try asking me to generate code, create a plan, or work with a specific agent.';
    }
  }

  /**
   * Handle code generation requests
   */
  private async handleGeneration(parameters: any): Promise<string> {
    console.log(chalk.green('\n🎯 Starting Code Generation...'));
    
    try {
      const result = await this.codeGenerator.generateFromDescription(
        parameters.description,
        {
          type: parameters.type,
          outputDir: './generated',
          features: ['auth', 'database', 'api']
        }
      );

      console.log(chalk.blue(`\n📁 Generated project: ${result.projectPath}`));
      console.log(chalk.gray(`Files created: ${result.files.length}`));
      
      if (result.files.length > 0) {
        console.log(chalk.cyan('\n📄 Key files:'));
        result.files.slice(0, 5).forEach(file => {
          console.log(chalk.gray(`  • ${file}`));
        });
        if (result.files.length > 5) {
          console.log(chalk.gray(`  ... and ${result.files.length - 5} more files`));
        }
      }

      return `Successfully generated ${parameters.type} project with ${result.files.length} files. Ready for development!`;
      
    } catch (error) {
      Logger.error(`Generation failed: ${error}`);
      return `Generation failed: ${error.message}`;
    }
  }

  /**
   * Handle project planning requests
   */
  private async handlePlanning(parameters: any): Promise<string> {
    console.log(chalk.green('\n📋 Creating Project Plan...'));
    
    try {
      const plan = await this.projectPlanner.createDetailedPlan(parameters.description);
      
      console.log(chalk.blue(`\n📊 Project: ${plan.name}`));
      console.log(chalk.gray(`Estimated timeline: ${plan.timeline.total}`));
      console.log(chalk.gray(`Technology stack: ${plan.stack.join(', ')}`));
      
      console.log(chalk.cyan('\n🎯 Key phases:'));
      plan.phases.forEach((phase, index) => {
        console.log(chalk.white(`  ${index + 1}. ${phase.name} (${phase.duration})`));
        phase.tasks.slice(0, 3).forEach(task => {
          console.log(chalk.gray(`     • ${task}`));
        });
      });

      return `Created detailed project plan with ${plan.phases.length} phases. Total estimated time: ${plan.timeline.total}`;
      
    } catch (error) {
      Logger.error(`Planning failed: ${error}`);
      return `Planning failed: ${error.message}`;
    }
  }

  /**
   * Handle agent-specific conversations
   */
  private async handleAgentConversation(agentName: string, parameters: any): Promise<string> {
    console.log(chalk.green(`\n🤖 Activating ${agentName} Agent...`));
    
    try {
      // Set active agent in context
      if (this.currentContext) {
        this.currentContext.activeAgent = agentName;
      }

      const result = await this.agentManager.executeAgentTask(agentName, parameters.task);
      
      console.log(chalk.blue(`\n✅ ${agentName} Agent completed the task`));
      if (result.files && result.files.length > 0) {
        console.log(chalk.gray(`Files modified: ${result.files.length}`));
      }

      return `${agentName} agent successfully completed: ${parameters.task}`;
      
    } catch (error) {
      Logger.error(`Agent execution failed: ${error}`);
      return `${agentName} agent failed: ${error.message}`;
    }
  }

  /**
   * Handle help requests
   */
  private handleHelp(): string {
    console.log(chalk.cyan('\n🆘 Recoder AI Help'));
    console.log(chalk.white('\nNatural Language Commands:'));
    console.log(chalk.gray('  • "Create a React app with authentication"'));
    console.log(chalk.gray('  • "Build a Solana DEX with real trading functionality"'));
    console.log(chalk.gray('  • "Generate an AI chatbot with memory"'));
    console.log(chalk.gray('  • "Plan a social media platform architecture"'));
    
    console.log(chalk.white('\nAgent Commands:'));
    console.log(chalk.gray('  • "blockchain agent, create an NFT marketplace"'));
    console.log(chalk.gray('  • "security agent, audit my smart contract"'));
    console.log(chalk.gray('  • "mobile agent, add camera functionality"'));
    
    console.log(chalk.white('\nOther Commands:'));
    console.log(chalk.gray('  • "help" - Show this help'));
    console.log(chalk.gray('  • "config" - View configuration'));
    console.log(chalk.gray('  • "exit" - Leave interactive mode'));

    return 'Help information displayed above. What would you like to create?';
  }

  /**
   * Handle configuration requests
   */
  private handleConfig(): string {
    const config = ConfigManager.getChatConfig();
    const user = ConfigManager.getCurrentUser();
    
    console.log(chalk.cyan('\n⚙️  Current Configuration'));
    console.log(chalk.white('Chat Settings:'));
    console.log(chalk.gray(`  Model: ${config.model}`));
    console.log(chalk.gray(`  Max Tokens: ${config.maxTokens}`));
    console.log(chalk.gray(`  Temperature: ${config.temperature}`));
    
    if (user) {
      console.log(chalk.white('\nUser:'));
      console.log(chalk.gray(`  Name: ${user.name}`));
      console.log(chalk.gray(`  Email: ${user.email}`));
    }

    return 'Configuration displayed above. You can modify settings with "recoder config set <key> <value>"';
  }

  /**
   * Handle general chat conversations
   */
  private async handleChat(input: string): Promise<string> {
    try {
      const chatConfig = ConfigManager.getChatConfig();
      
      // Use AI to generate a helpful response
      const response = await this.aiHub.generateResponse(input, {
        model: chatConfig.model,
        maxTokens: chatConfig.maxTokens,
        temperature: chatConfig.temperature,
        context: this.getConversationContext()
      });

      console.log(chalk.blue('\n💬 AI Response:'));
      console.log(chalk.white(response));

      return response;
      
    } catch (error) {
      Logger.error(`Chat failed: ${error}`);
      return 'I\'m having trouble processing that request. Could you try rephrasing or asking for something specific like code generation?';
    }
  }

  /**
   * Create new conversation context
   */
  private async createConversationContext(): Promise<ConversationContext> {
    const user = ConfigManager.getCurrentUser();
    
    return {
      id: this.generateConversationId(),
      userId: user?.id || 'anonymous',
      history: [],
      metadata: {
        startedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0
      }
    };
  }

  /**
   * Add message to conversation history
   */
  private addMessage(role: 'user' | 'assistant' | 'agent' | 'system', content: string, metadata?: any): ConversationMessage {
    if (!this.currentContext) {
      throw new Error('No active conversation context');
    }

    const message: ConversationMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      metadata
    };

    this.currentContext.history.push(message);
    this.currentContext.metadata.messageCount++;
    
    return message;
  }

  /**
   * Update conversation context
   */
  private updateContext(): void {
    if (this.currentContext) {
      this.currentContext.metadata.lastActivity = new Date();
    }
  }

  /**
   * Get conversation context for AI
   */
  private getConversationContext(): string {
    if (!this.currentContext || this.currentContext.history.length === 0) {
      return 'New conversation started.';
    }

    // Get recent messages for context
    const recentMessages = this.currentContext.history
      .slice(-5)
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    return `Recent conversation:\n${recentMessages}`;
  }

  /**
   * Check if user wants to exit
   */
  private shouldExit(input: string): boolean {
    const exitCommands = ['exit', 'quit', 'bye', 'goodbye'];
    return exitCommands.includes(input.toLowerCase().trim());
  }

  /**
   * End conversation and cleanup
   */
  private async endConversation(): Promise<void> {
    this.isInteractiveMode = false;
    
    if (this.currentContext) {
      // Save conversation history if enabled
      const saveHistory = ConfigManager.get('chat.saveHistory');
      if (saveHistory) {
        await this.saveConversationHistory();
      }
    }

    console.log(chalk.cyan('\n👋 Thanks for using Recoder AI! Happy coding!'));
    this.currentContext = null;
  }

  /**
   * Save conversation history
   */
  private async saveConversationHistory(): Promise<void> {
    try {
      // This would typically save to a database or file
      // For now, we'll just log that we would save it
      Logger.info(`Conversation ${this.currentContext?.id} completed with ${this.currentContext?.metadata.messageCount} messages`);
    } catch (error) {
      Logger.error(`Failed to save conversation history: ${error}`);
    }
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process single command (non-interactive)
   */
  public async processSingleCommand(input: string): Promise<void> {
    // Create temporary context for single command
    this.currentContext = await this.createConversationContext();
    
    console.log(chalk.cyan('\n🤖 Processing your request...'));
    await this.processConversationalInput(input);
    
    // Clean up
    this.currentContext = null;
  }

  /**
   * Get conversation statistics
   */
  public getStats(): any {
    if (!this.currentContext) {
      return null;
    }

    return {
      id: this.currentContext.id,
      messageCount: this.currentContext.metadata.messageCount,
      startedAt: this.currentContext.metadata.startedAt,
      lastActivity: this.currentContext.metadata.lastActivity,
      activeAgent: this.currentContext.activeAgent
    };
  }
}