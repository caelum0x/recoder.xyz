#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const inquirer = require('inquirer');

/**
 * Multi-Model Picker and Management System
 * Intelligent model selection, switching, and optimization
 */
class ModelManager {
  constructor(mcpClient, contextEngine) {
    this.mcpClient = mcpClient;
    this.contextEngine = contextEngine;
    
    this.models = new Map();
    this.profiles = new Map();
    this.currentModel = null;
    this.modelHistory = [];
    this.performanceMetrics = new Map();
    this.costTracking = new Map();
    
    // Model categories and use cases
    this.categories = {
      'coding': {
        name: 'Code Generation & Analysis',
        description: 'Optimized for programming tasks, code review, and technical documentation',
        icon: '💻'
      },
      'writing': {
        name: 'Content Writing',
        description: 'Best for documentation, blogs, and general writing tasks',
        icon: '✍️'
      },
      'analysis': {
        name: 'Data Analysis & Research',
        description: 'Specialized in data interpretation, research, and analytical tasks',
        icon: '📊'
      },
      'creative': {
        name: 'Creative Tasks',
        description: 'Ideal for creative writing, brainstorming, and ideation',
        icon: '🎨'
      },
      'general': {
        name: 'General Purpose',
        description: 'Balanced performance across all task types',
        icon: '🎯'
      }
    };
    
    // Initialize synchronously to avoid constructor issues
    this.loadModelDefinitionsSync();
    this.initializeAsync();
  }

  /**
   * Initialize async components
   */
  async initializeAsync() {
    try {
      console.log(chalk.cyan('🤖 Initializing Model Manager...'));
      
      await this.loadModelProfiles();
      await this.loadPerformanceHistory();
      
      // Set default model if none selected
      if (!this.currentModel) {
        this.currentModel = this.selectDefaultModel();
      }
      
      console.log(chalk.green('✅ Model Manager ready'));
      console.log(chalk.gray(`   Available models: ${this.models.size}`));
      console.log(chalk.gray(`   Current model: ${this.currentModel || 'none'}`));
      console.log(chalk.gray(`   Profiles: ${this.profiles.size}`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Model Manager partial initialization: ${error.message}`));
    }
  }

  /**
   * Load model definitions synchronously
   */
  loadModelDefinitionsSync() {
    console.log(chalk.gray('📋 Loading model definitions...'));
    
    // Claude models - Updated with latest Sonnet 4
    this.addModel('claude-sonnet-4', {
      provider: 'anthropic',
      family: 'claude-4',
      name: 'Claude Sonnet 4',
      description: 'Latest Claude model with enhanced reasoning and coding capabilities',
      categories: ['coding', 'analysis', 'writing'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'highest',
        cost: 'high'
      },
      pricing: {
        input: 0.015,
        output: 0.075
      },
      strengths: ['advanced reasoning', 'complex coding', 'analysis', 'latest capabilities'],
      weaknesses: ['cost'],
      priority: 1 // Highest priority
    });

    this.addModel('claude-3-opus', {
      provider: 'anthropic',
      family: 'claude-3',
      name: 'Claude 3 Opus',
      description: 'Most capable Claude model for complex reasoning and analysis',
      categories: ['coding', 'analysis', 'writing'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'slow',
        quality: 'highest',
        cost: 'high'
      },
      pricing: {
        input: 0.015,  // per 1K tokens
        output: 0.075
      },
      strengths: ['complex reasoning', 'code analysis', 'research', 'writing'],
      weaknesses: ['speed', 'cost']
    });
    
    this.addModel('claude-3-sonnet', {
      provider: 'anthropic',
      family: 'claude-3',
      name: 'Claude 3 Sonnet',
      description: 'Balanced performance and intelligence for most tasks',
      categories: ['coding', 'general', 'writing'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'medium'
      },
      pricing: {
        input: 0.003,
        output: 0.015
      },
      strengths: ['balanced performance', 'coding', 'general tasks'],
      weaknesses: ['specialized tasks']
    });
    
    this.addModel('claude-3-haiku', {
      provider: 'anthropic',
      family: 'claude-3',
      name: 'Claude 3 Haiku',
      description: 'Fast and efficient for quick tasks and high-volume processing',
      categories: ['general', 'coding'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'good',
        cost: 'low'
      },
      pricing: {
        input: 0.00025,
        output: 0.00125
      },
      strengths: ['speed', 'efficiency', 'cost-effective'],
      weaknesses: ['complex reasoning', 'specialized tasks']
    });
    
    // OpenAI models
    this.addModel('gpt-4-turbo', {
      provider: 'openai',
      family: 'gpt-4',
      name: 'GPT-4 Turbo',
      description: 'Latest GPT-4 with improved speed and extended context',
      categories: ['coding', 'writing', 'analysis'],
      capabilities: {
        maxTokens: 128000,
        contextWindow: 128000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'medium'
      },
      pricing: {
        input: 0.01,
        output: 0.03
      },
      strengths: ['coding', 'reasoning', 'multimodal'],
      weaknesses: ['cost', 'context length']
    });
    
    this.addModel('gpt-3.5-turbo', {
      provider: 'openai',
      family: 'gpt-3.5',
      name: 'GPT-3.5 Turbo',
      description: 'Fast and cost-effective for general tasks',
      categories: ['general', 'coding'],
      capabilities: {
        maxTokens: 16385,
        contextWindow: 16385,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'good',
        cost: 'low'
      },
      pricing: {
        input: 0.0005,
        output: 0.0015
      },
      strengths: ['speed', 'cost', 'general tasks'],
      weaknesses: ['context length', 'complex reasoning']
    });
    
    // MoonshotAI models - From your requirements
    this.addModel('moonshotai/kimi-k2-0711', {
      provider: 'moonshotai',
      family: 'kimi-k2',
      name: 'Kimi K2 0711',
      description: 'Trillion-parameter MoE model optimized for agentic capabilities',
      categories: ['coding', 'analysis', 'general'],
      capabilities: {
        maxTokens: 128000,
        contextWindow: 128000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['agentic capabilities', 'tool use', 'reasoning', 'free'],
      weaknesses: ['newer model'],
      priority: 2
    });

    this.addModel('moonshotai/kimi-dev-72b', {
      provider: 'moonshotai',
      family: 'kimi-dev',
      name: 'Kimi Dev 72B',
      description: 'Specialized for software engineering and issue resolution',
      categories: ['coding'],
      capabilities: {
        maxTokens: 131000,
        contextWindow: 131000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['software engineering', 'bug fixing', 'code reasoning', 'free'],
      weaknesses: ['specialized scope'],
      priority: 3
    });

    this.addModel('moonshotai/kimi-vl-a3b-thinking', {
      provider: 'moonshotai',
      family: 'kimi-vl',
      name: 'Kimi VL A3B Thinking',
      description: 'Lightweight MoE vision-language model with chain-of-thought',
      categories: ['analysis', 'creative'],
      capabilities: {
        maxTokens: 131000,
        contextWindow: 131000,
        multimodal: true,
        toolUse: false,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['visual reasoning', 'multimodal', 'thinking', 'free'],
      weaknesses: ['specialized use case'],
      priority: 4
    });

    // Qwen models
    this.addModel('qwen/qwen-2.5-coder-32b-instruct', {
      provider: 'qwen',
      family: 'qwen-2.5',
      name: 'Qwen2.5 Coder 32B',
      description: 'Code-specific model with enhanced programming capabilities',
      categories: ['coding'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['code generation', 'code reasoning', 'mathematics', 'free'],
      weaknesses: ['specialized scope'],
      priority: 5
    });

    this.addModel('qwen/qwen-2.5-vl-72b-instruct', {
      provider: 'qwen',
      family: 'qwen-2.5-vl',
      name: 'Qwen2.5 VL 72B',
      description: 'Multimodal vision-language model for visual analysis',
      categories: ['analysis', 'creative'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: true,
        toolUse: false,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['object recognition', 'visual analysis', 'image interpretation', 'free'],
      weaknesses: ['specialized use case'],
      priority: 6
    });

    this.addModel('qwen/qwq-32b', {
      provider: 'qwen',
      family: 'qwq',
      name: 'QwQ 32B',
      description: 'Reasoning model capable of thinking and complex problem solving',
      categories: ['analysis', 'coding'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: false,
        toolUse: false,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['reasoning', 'thinking', 'problem solving', 'free'],
      weaknesses: ['specialized scope'],
      priority: 7
    });

    // DeepSeek models
    this.addModel('deepseek/deepseek-v3.1', {
      provider: 'deepseek',
      family: 'deepseek-v3',
      name: 'DeepSeek V3.1',
      description: 'Large hybrid reasoning model with thinking and non-thinking modes',
      categories: ['coding', 'analysis', 'general'],
      capabilities: {
        maxTokens: 164000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['reasoning', 'tool use', 'code generation', 'long context', 'free'],
      weaknesses: ['complexity'],
      priority: 8
    });

    this.addModel('deepseek/r1-0528', {
      provider: 'deepseek',
      family: 'deepseek-r1',
      name: 'DeepSeek R1 0528',
      description: 'Upgraded reasoning model with enhanced performance',
      categories: ['analysis', 'coding'],
      capabilities: {
        maxTokens: 164000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: false,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'highest',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['reasoning', 'math', 'programming', 'logic', 'free'],
      weaknesses: ['specialized scope'],
      priority: 9
    });

    // Local models
    this.addModel('codellama-34b', {
      provider: 'local',
      family: 'codellama',
      name: 'Code Llama 34B',
      description: 'Large local model optimized for code generation',
      categories: ['coding'],
      capabilities: {
        maxTokens: 16384,
        contextWindow: 16384,
        multimodal: false,
        toolUse: false,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'good',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['code generation', 'free', 'privacy'],
      weaknesses: ['general knowledge', 'setup complexity']
    });
    
    // MoonshotAI models - Excellent free models optimized for coding
    this.addModel('kimi-k2-0711', {
      provider: 'moonshotai',
      family: 'kimi',
      name: 'Kimi K2 0711',
      description: '1T parameter MoE model optimized for agentic capabilities and code synthesis',
      categories: ['coding', 'analysis'],
      capabilities: {
        maxTokens: 128000,
        contextWindow: 128000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['coding', 'tool use', 'reasoning', 'free', 'agentic capabilities'],
      weaknesses: ['none'],
      priority: 2 // High priority due to being free and optimized for coding
    });

    this.addModel('kimi-dev-72b', {
      provider: 'moonshotai',
      family: 'kimi',
      name: 'Kimi Dev 72B',
      description: 'Specialized model for software engineering and issue resolution (60.4% on SWE-bench)',
      categories: ['coding'],
      capabilities: {
        maxTokens: 131000,
        contextWindow: 131000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['software engineering', 'bug fixing', 'code reasoning', 'free', 'SWE-bench optimized'],
      weaknesses: ['specialized focus'],
      priority: 1 // Highest priority for coding tasks due to SWE-bench performance
    });

    // DeepSeek models - Advanced reasoning models (free)
    this.addModel('deepseek-v3-1', {
      provider: 'deepseek',
      family: 'deepseek-v3',
      name: 'DeepSeek V3.1',
      description: 'Large hybrid reasoning model with thinking and non-thinking modes',
      categories: ['coding', 'analysis', 'general'],
      capabilities: {
        maxTokens: 128000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'highest',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['reasoning', 'code generation', 'tool use', 'free', 'thinking mode'],
      weaknesses: ['none'],
      priority: 2
    });

    this.addModel('deepseek-r1-0528', {
      provider: 'deepseek',
      family: 'deepseek-r1',
      name: 'DeepSeek R1 0528',
      description: 'Advanced reasoning model on par with OpenAI o1, fully open-source',
      categories: ['analysis', 'coding'],
      capabilities: {
        maxTokens: 164000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'slow',
        quality: 'highest',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['advanced reasoning', 'math', 'programming', 'logic', 'free', 'o1-level performance'],
      weaknesses: ['slower inference'],
      priority: 2
    });

    // Qwen models - Excellent free coding and reasoning models
    this.addModel('qwen2-5-coder-32b', {
      provider: 'qwen',
      family: 'qwen2.5',
      name: 'Qwen2.5 Coder 32B',
      description: 'Specialized coding model with enhanced code generation and reasoning',
      categories: ['coding'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['code generation', 'code reasoning', 'code fixing', 'free', 'mathematics'],
      weaknesses: ['shorter context'],
      priority: 2
    });

    this.addModel('qwen2-5-72b', {
      provider: 'qwen',
      family: 'qwen2.5',
      name: 'Qwen2.5 72B',
      description: 'Large general-purpose model with strong coding and math capabilities',
      categories: ['coding', 'general', 'analysis'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 128000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['coding', 'mathematics', 'long context', 'multilingual', 'free'],
      weaknesses: ['none'],
      priority: 2
    });

    this.addModel('qwq-32b', {
      provider: 'qwen',
      family: 'qwq',
      name: 'QwQ 32B',
      description: 'Reasoning model with enhanced thinking and problem-solving capabilities',
      categories: ['analysis', 'coding'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['reasoning', 'thinking', 'problem solving', 'free', 'competitive with o1-mini'],
      weaknesses: ['shorter context'],
      priority: 2
    });

    // Cutting-edge new models - Latest releases
    this.addModel('grok-code-fast-1', {
      provider: 'x-ai',
      family: 'grok',
      name: 'Grok Code Fast 1',
      description: 'Ultra-fast coding model from X.AI with 3.21T tokens processed',
      categories: ['coding'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fastest',
        quality: 'highest',
        cost: 'medium'
      },
      pricing: {
        input: 0.01,
        output: 0.03
      },
      strengths: ['ultra-fast coding', 'high throughput', 'latest technology'],
      weaknesses: ['cost'],
      priority: 1
    });

    this.addModel('gemini-2-5-flash', {
      provider: 'google',
      family: 'gemini-2.5',
      name: 'Gemini 2.5 Flash',
      description: 'Google\'s fast multimodal model with excellent performance',
      categories: ['coding', 'general', 'analysis'],
      capabilities: {
        maxTokens: 100000,
        contextWindow: 1000000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fastest',
        quality: 'high',
        cost: 'low'
      },
      pricing: {
        input: 0.0005,
        output: 0.002
      },
      strengths: ['speed', 'multimodal', 'long context', 'cost-effective'],
      weaknesses: ['none'],
      priority: 2
    });

    this.addModel('gemini-2-5-pro', {
      provider: 'google',
      family: 'gemini-2.5',
      name: 'Gemini 2.5 Pro',
      description: 'Google\'s most capable multimodal model',
      categories: ['coding', 'analysis', 'writing'],
      capabilities: {
        maxTokens: 100000,
        contextWindow: 2000000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'highest',
        cost: 'medium'
      },
      pricing: {
        input: 0.003,
        output: 0.012
      },
      strengths: ['multimodal excellence', 'huge context', 'reasoning'],
      weaknesses: ['cost'],
      priority: 2
    });

    // TNG Chimera models - Optimized hybrid models
    this.addModel('deepseek-r1t2-chimera', {
      provider: 'tngtech',
      family: 'deepseek-chimera',
      name: 'DeepSeek R1T2 Chimera',
      description: 'Second-gen hybrid model, 20% faster than R1 with maintained reasoning',
      categories: ['coding', 'analysis'],
      capabilities: {
        maxTokens: 164000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'highest',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['optimized reasoning', 'faster inference', 'cost-effective', 'free'],
      weaknesses: ['none'],
      priority: 1
    });

    this.addModel('deepseek-r1t-chimera', {
      provider: 'tngtech',
      family: 'deepseek-chimera',
      name: 'DeepSeek R1T Chimera',
      description: 'Merged R1 + V3 for balanced reasoning and efficiency',
      categories: ['coding', 'general'],
      capabilities: {
        maxTokens: 164000,
        contextWindow: 164000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['balanced performance', 'efficiency', 'free', 'MIT licensed'],
      weaknesses: ['none'],
      priority: 2
    });

    // Additional Qwen models - Vision and specialized variants
    this.addModel('qwen2-5-vl-72b', {
      provider: 'qwen',
      family: 'qwen2.5-vl',
      name: 'Qwen2.5 VL 72B',
      description: 'Large vision-language model for multimodal tasks',
      categories: ['analysis', 'coding'],
      capabilities: {
        maxTokens: 33000,
        contextWindow: 33000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['vision analysis', 'object recognition', 'chart interpretation', 'free'],
      weaknesses: ['shorter context'],
      priority: 2
    });

    this.addModel('qwen2-5-vl-32b', {
      provider: 'qwen',
      family: 'qwen2.5-vl',
      name: 'Qwen2.5 VL 32B',
      description: 'Enhanced vision model with mathematical reasoning capabilities',
      categories: ['analysis'],
      capabilities: {
        maxTokens: 8000,
        contextWindow: 8000,
        multimodal: true,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['visual reasoning', 'math problems', 'video analysis', 'free'],
      weaknesses: ['limited context'],
      priority: 2
    });

    this.addModel('deepseek-r1-qwen3-8b', {
      provider: 'deepseek',
      family: 'deepseek-r1',
      name: 'DeepSeek R1 Qwen3 8B',
      description: 'Distilled reasoning model in compact 8B form, beats larger models',
      categories: ['coding', 'analysis'],
      capabilities: {
        maxTokens: 131000,
        contextWindow: 131000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fastest',
        quality: 'high',
        cost: 'free'
      },
      pricing: {
        input: 0,
        output: 0
      },
      strengths: ['compact size', 'reasoning', 'efficiency', 'free', 'beats larger models'],
      weaknesses: ['smaller parameters'],
      priority: 2
    });

    // Add latest Qwen3 models
    this.addModel('qwen3-30b-a3b', {
      provider: 'qwen',
      family: 'qwen3',
      name: 'Qwen3 30B A3B',
      description: 'Latest Qwen3 generation with advanced capabilities',
      categories: ['coding', 'general'],
      capabilities: {
        maxTokens: 100000,
        contextWindow: 100000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'fast',
        quality: 'high',
        cost: 'medium'
      },
      pricing: {
        input: 0.001,
        output: 0.003
      },
      strengths: ['latest generation', 'balanced performance', 'good speed'],
      weaknesses: ['cost'],
      priority: 2
    });

    this.addModel('qwen3-coder-480b-a35b', {
      provider: 'qwen',
      family: 'qwen3',
      name: 'Qwen3 Coder 480B A35B',
      description: 'Massive coding-specialized model with 480B parameters',
      categories: ['coding'],
      capabilities: {
        maxTokens: 200000,
        contextWindow: 200000,
        multimodal: false,
        toolUse: true,
        codeExecution: false
      },
      performance: {
        speed: 'medium',
        quality: 'highest',
        cost: 'medium'
      },
      pricing: {
        input: 0.002,
        output: 0.008
      },
      strengths: ['massive parameters', 'coding excellence', 'comprehensive'],
      weaknesses: ['cost', 'speed'],
      priority: 1
    });

    // Load custom models (async in background)
    this.loadCustomModels().catch(err => 
      console.log(chalk.yellow(`⚠️  Custom models loading failed: ${err.message}`))
    );
  }

  /**
   * Add model definition
   */
  addModel(id, definition) {
    this.models.set(id, {
      id,
      ...definition,
      lastUsed: null,
      totalUsage: 0,
      averageRating: 0,
      enabled: true
    });
  }

  /**
   * Load custom model definitions
   */
  async loadCustomModels() {
    try {
      const customModelsPath = path.join(process.cwd(), '.recoder', 'models.json');
      if (fs.existsSync(customModelsPath)) {
        const customModels = JSON.parse(fs.readFileSync(customModelsPath, 'utf8'));
        
        for (const [id, definition] of Object.entries(customModels)) {
          this.addModel(id, definition);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load custom models: ${error.message}`));
    }
  }

  /**
   * Load model profiles
   */
  async loadModelProfiles() {
    console.log(chalk.gray('👤 Loading model profiles...'));
    
    // Default profiles
    this.addProfile('development', {
      name: 'Development',
      description: 'Optimized for coding and development tasks',
      preferences: {
        categories: ['coding'],
        prioritizeSpeed: false,
        prioritizeCost: false,
        prioritizeQuality: true
      },
      modelRanking: ['claude-sonnet-4', 'kimi-dev-72b', 'deepseek-v3-1', 'qwen2-5-coder-32b', 'claude-3-opus'],
      autoSwitch: true,
      contextOptimization: true
    });
    
    this.addProfile('research', {
      name: 'Research & Analysis',
      description: 'Best for research, analysis, and complex reasoning',
      preferences: {
        categories: ['analysis', 'writing'],
        prioritizeSpeed: false,
        prioritizeCost: false,
        prioritizeQuality: true
      },
      modelRanking: ['claude-sonnet-4', 'deepseek-r1-0528', 'qwq-32b', 'claude-3-opus', 'deepseek-v3-1'],
      autoSwitch: true,
      contextOptimization: true
    });
    
    this.addProfile('speed', {
      name: 'Speed Optimized',
      description: 'Fast responses for quick tasks',
      preferences: {
        categories: ['general'],
        prioritizeSpeed: true,
        prioritizeCost: true,
        prioritizeQuality: false
      },
      modelRanking: ['kimi-k2-0711', 'qwen2-5-coder-32b', 'claude-3-haiku', 'kimi-dev-72b', 'gpt-3.5-turbo'],
      autoSwitch: true,
      contextOptimization: false
    });
    
    this.addProfile('cost-effective', {
      name: 'Cost Effective',
      description: 'Minimize costs while maintaining quality',
      preferences: {
        categories: ['general'],
        prioritizeSpeed: false,
        prioritizeCost: true,
        prioritizeQuality: false
      },
      modelRanking: ['kimi-dev-72b', 'deepseek-v3-1', 'kimi-k2-0711', 'qwen2-5-72b', 'qwen2-5-coder-32b', 'qwq-32b', 'deepseek-r1-0528', 'codellama-34b'],
      autoSwitch: true,
      contextOptimization: true
    });
    
    this.addProfile('privacy', {
      name: 'Privacy Focused',
      description: 'Use only local models for maximum privacy',
      preferences: {
        categories: ['coding', 'general'],
        prioritizeSpeed: false,
        prioritizeCost: false,
        prioritizeQuality: false
      },
      modelRanking: ['codellama-34b'],
      autoSwitch: false,
      contextOptimization: true
    });
    
    // Load custom profiles
    await this.loadCustomProfiles();
  }

  /**
   * Add model profile
   */
  addProfile(id, profile) {
    this.profiles.set(id, {
      id,
      ...profile,
      createdAt: new Date().toISOString(),
      lastUsed: null
    });
  }

  /**
   * Load custom profiles
   */
  async loadCustomProfiles() {
    try {
      const profilesPath = path.join(process.cwd(), '.recoder', 'profiles.json');
      if (fs.existsSync(profilesPath)) {
        const customProfiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        
        for (const [id, profile] of Object.entries(customProfiles)) {
          this.addProfile(id, profile);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load custom profiles: ${error.message}`));
    }
  }

  /**
   * Select best model for task
   */
  selectBestModel(taskType, context = {}, options = {}) {
    const candidates = this.getAvailableModels();
    
    if (candidates.length === 0) {
      throw new Error('No available models');
    }
    
    // Apply current profile if set
    if (options.profile) {
      const profile = this.profiles.get(options.profile);
      if (profile) {
        return this.selectModelWithProfile(profile, taskType, context);
      }
    }
    
    // Score models based on task requirements
    const scoredModels = candidates.map(model => ({
      model,
      score: this.calculateModelScore(model, taskType, context, options)
    }));
    
    // Sort by score (descending)
    scoredModels.sort((a, b) => b.score - a.score);
    
    const bestModel = scoredModels[0].model;
    
    console.log(chalk.gray(`🎯 Selected ${bestModel.name} for ${taskType} (score: ${scoredModels[0].score.toFixed(2)})`));
    
    return bestModel.id;
  }

  /**
   * Calculate model score for task
   */
  calculateModelScore(model, taskType, context, options) {
    let score = 0;
    
    // Base priority score (Claude Sonnet 4 gets highest priority)
    if (model.priority) {
      score += (10 - model.priority); // Lower priority number = higher score
    }
    
    // Category alignment - heavily weighted
    if (model.categories.includes(taskType)) {
      score += 15;
    }
    
    // Specific task optimizations
    switch (taskType) {
      case 'coding':
        if (model.id === 'claude-sonnet-4') score += 20; // Highest for latest Claude
        if (model.id === 'moonshotai/kimi-dev-72b') score += 18; // Specialized for dev
        if (model.id === 'qwen/qwen-2.5-coder-32b-instruct') score += 16; // Code-specific
        if (model.strengths.includes('software engineering') || 
            model.strengths.includes('code generation') ||
            model.strengths.includes('code reasoning')) {
          score += 12;
        }
        break;
        
      case 'analysis':
        if (model.id === 'claude-sonnet-4') score += 20;
        if (model.id === 'deepseek/r1-0528') score += 18; // Enhanced reasoning
        if (model.id === 'qwen/qwq-32b') score += 16; // Specialized reasoning
        if (model.strengths.includes('reasoning') || 
            model.strengths.includes('analysis') ||
            model.strengths.includes('thinking')) {
          score += 12;
        }
        break;
        
      case 'writing':
        if (model.id === 'claude-sonnet-4') score += 20;
        if (model.id === 'claude-3-opus') score += 18;
        if (model.strengths.includes('writing')) score += 12;
        break;
        
      case 'general':
        if (model.id === 'claude-sonnet-4') score += 20;
        if (model.id === 'moonshotai/kimi-k2-0711') score += 16; // Good general model
        if (model.id === 'deepseek/deepseek-v3.1') score += 14; // Hybrid reasoning
        break;
    }
    
    // Performance quality bonus
    if (model.performance.quality === 'highest') {
      score += 10;
    } else if (model.performance.quality === 'high') {
      score += 7;
    }
    
    // Speed considerations
    if (options.prioritizeSpeed && model.performance.speed === 'fast') {
      score += 8;
    } else if (!options.prioritizeSpeed && model.performance.speed === 'slow') {
      score -= 3; // Slight penalty for slow models unless speed is prioritized
    }
    
    // Cost considerations - free models get significant bonus
    if (model.performance.cost === 'free') {
      score += 8; // Strong preference for free models
    } else if (options.prioritizeCost) {
      if (model.performance.cost === 'low') {
        score += 6;
      } else if (model.performance.cost === 'high') {
        score -= 4;
      }
    }
    
    // Context length requirements
    if (context.estimatedTokens) {
      if (context.estimatedTokens > model.capabilities.contextWindow * 0.8) {
        score -= 10; // Heavy penalty if close to context limit
      } else if (model.capabilities.contextWindow > 100000) {
        score += 3; // Bonus for large context window
      }
    }
    
    // Multimodal requirements
    if (context.hasImages && model.capabilities.multimodal) {
      score += 8;
    } else if (context.hasImages && !model.capabilities.multimodal) {
      score -= 15; // Heavy penalty if images needed but not supported
    }
    
    // Tool use requirements
    if (context.needsTools && model.capabilities.toolUse) {
      score += 5;
    } else if (context.needsTools && !model.capabilities.toolUse) {
      score -= 10; // Penalty if tools needed but not supported
    }
    
    // Codebase context boost for coding models
    if (context.codebaseSize && context.codebaseSize > 0 && taskType === 'coding') {
      if (model.strengths.includes('code reasoning') || 
          model.strengths.includes('software engineering')) {
        score += 5;
      }
    }
    
    // Historical performance
    const metrics = this.performanceMetrics.get(model.id);
    if (metrics) {
      score += (metrics.averageRating || 0) * 2; // Weight historical performance
      if (metrics.successRate && metrics.successRate > 0.9) {
        score += 3; // Bonus for high success rate
      }
    }
    
    // Availability check
    if (this.mcpClient && this.mcpClient.getServerStatus) {
      const serverStatus = this.mcpClient.getServerStatus();
      const modelAvailable = this.isModelAvailable(model.id, serverStatus);
      if (!modelAvailable) {
        score -= 25; // Heavy penalty for unavailable models
      }
    }
    
    return Math.max(0, score); // Ensure non-negative score
  }

  /**
   * Select model with profile
   */
  selectModelWithProfile(profile, taskType, context) {
    const availableModels = this.getAvailableModels();
    
    // Filter by profile preferences
    let candidates = availableModels.filter(model => {
      return profile.preferences.categories.some(cat => 
        model.categories.includes(cat)
      );
    });
    
    if (candidates.length === 0) {
      candidates = availableModels; // Fallback to all models
    }
    
    // Apply profile ranking
    const rankedCandidates = [];
    
    for (const modelId of profile.modelRanking) {
      const model = candidates.find(m => m.id === modelId);
      if (model) {
        rankedCandidates.push(model);
      }
    }
    
    // Add remaining candidates
    for (const model of candidates) {
      if (!rankedCandidates.find(m => m.id === model.id)) {
        rankedCandidates.push(model);
      }
    }
    
    // Apply profile preferences to scoring
    const options = {
      prioritizeSpeed: profile.preferences.prioritizeSpeed,
      prioritizeCost: profile.preferences.prioritizeCost,
      prioritizeQuality: profile.preferences.prioritizeQuality
    };
    
    // Use the first available model from ranking, or fallback to scoring
    for (const model of rankedCandidates) {
      if (this.isModelAvailable(model.id)) {
        return model.id;
      }
    }
    
    // Fallback to scoring if no ranked model is available
    return this.selectBestModel(taskType, context, options);
  }

  /**
   * Switch to model
   */
  async switchToModel(modelId, reason = 'manual') {
    const model = this.models.get(modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    
    if (!model.enabled) {
      throw new Error(`Model ${modelId} is disabled`);
    }
    
    const previousModel = this.currentModel;
    this.currentModel = modelId;
    
    // Update model usage
    model.lastUsed = new Date().toISOString();
    model.totalUsage++;
    
    // Add to history
    this.modelHistory.push({
      from: previousModel,
      to: modelId,
      reason: reason,
      timestamp: new Date().toISOString()
    });
    
    // Keep history limited
    if (this.modelHistory.length > 100) {
      this.modelHistory = this.modelHistory.slice(-50);
    }
    
    console.log(chalk.green(`🔄 Switched to ${model.name} (${reason})`));
    
    // Update MCP client if available
    if (this.mcpClient && this.mcpClient.setDefaultModel) {
      await this.mcpClient.setDefaultModel(modelId);
    }
    
    return model;
  }

  /**
   * Auto-switch model based on task
   */
  async autoSwitchModel(taskType, context = {}) {
    const currentProfile = this.getCurrentProfile();
    
    if (currentProfile && !currentProfile.autoSwitch) {
      return this.currentModel; // Auto-switching disabled
    }
    
    const bestModelId = this.selectBestModel(taskType, context, {
      profile: currentProfile?.id
    });
    
    if (bestModelId !== this.currentModel) {
      await this.switchToModel(bestModelId, 'auto-optimization');
    }
    
    return bestModelId;
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Array.from(this.models.values()).filter(model => model.enabled);
  }

  /**
   * Check if model is available
   */
  isModelAvailable(modelId, serverStatus = null) {
    const model = this.models.get(modelId);
    if (!model || !model.enabled) {
      return false;
    }
    
    // Check server availability
    if (serverStatus) {
      for (const [serverName, status] of Object.entries(serverStatus)) {
        if (status.connected && status.config.models.includes(modelId)) {
          return true;
        }
      }
      return false;
    }
    
    return true;
  }

  /**
   * Interactive model picker
   */
  async pickModel(taskType = 'general', context = {}) {
    const availableModels = this.getAvailableModels();
    
    if (availableModels.length === 0) {
      throw new Error('No available models');
    }
    
    // Group models by category
    const modelsByCategory = {};
    
    for (const model of availableModels) {
      for (const category of model.categories) {
        if (!modelsByCategory[category]) {
          modelsByCategory[category] = [];
        }
        modelsByCategory[category].push(model);
      }
    }
    
    console.log(chalk.bold.cyan('\n🤖 Model Selection\n'));
    
    // Show current model
    if (this.currentModel) {
      const current = this.models.get(this.currentModel);
      console.log(chalk.green(`Current: ${current.name}`));
    }
    
    // Show recommendations
    const recommended = this.selectBestModel(taskType, context);
    const recommendedModel = this.models.get(recommended);
    console.log(chalk.blue(`Recommended: ${recommendedModel.name} (for ${taskType})`));
    console.log();
    
    const choices = [];
    
    // Add quick options
    choices.push(new inquirer.Separator('Quick Options:'));
    choices.push({
      name: `✅ Use Recommended (${recommendedModel.name})`,
      value: recommended
    });
    
    if (this.currentModel && this.currentModel !== recommended) {
      const current = this.models.get(this.currentModel);
      choices.push({
        name: `🔄 Keep Current (${current.name})`,
        value: this.currentModel
      });
    }
    
    choices.push(new inquirer.Separator('Browse by Category:'));
    
    // Add models by category
    for (const [categoryId, categoryModels] of Object.entries(modelsByCategory)) {
      const category = this.categories[categoryId];
      if (category) {
        choices.push(new inquirer.Separator(`${category.icon} ${category.name}:`));
        
        for (const model of categoryModels) {
          const performance = `${model.performance.speed}/${model.performance.quality}/${model.performance.cost}`;
          const status = this.isModelAvailable(model.id) ? '🟢' : '🔴';
          
          choices.push({
            name: `  ${status} ${model.name} (${performance})`,
            value: model.id,
            short: model.name
          });
        }
      }
    }
    
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'modelId',
        message: 'Select a model:',
        choices: choices,
        pageSize: 15
      }
    ]);
    
    if (answer.modelId !== this.currentModel) {
      await this.switchToModel(answer.modelId, 'user-selection');
    }
    
    return answer.modelId;
  }

  /**
   * Display model information
   */
  displayModelInfo(modelId = null) {
    const model = modelId ? this.models.get(modelId) : this.models.get(this.currentModel);
    
    if (!model) {
      console.log(chalk.red('Model not found'));
      return;
    }
    
    console.log(chalk.bold.cyan(`\n🤖 ${model.name}\n`));
    
    console.log(chalk.gray(`Provider: ${model.provider}`));
    console.log(chalk.gray(`Family: ${model.family}`));
    console.log(chalk.gray(`Description: ${model.description}`));
    console.log();
    
    console.log(chalk.bold('Categories:'));
    for (const categoryId of model.categories) {
      const category = this.categories[categoryId];
      if (category) {
        console.log(chalk.blue(`  ${category.icon} ${category.name}`));
      }
    }
    console.log();
    
    console.log(chalk.bold('Capabilities:'));
    console.log(chalk.gray(`  Context Window: ${model.capabilities.contextWindow.toLocaleString()} tokens`));
    console.log(chalk.gray(`  Max Tokens: ${model.capabilities.maxTokens.toLocaleString()}`));
    console.log(chalk.gray(`  Multimodal: ${model.capabilities.multimodal ? '✅' : '❌'}`));
    console.log(chalk.gray(`  Tool Use: ${model.capabilities.toolUse ? '✅' : '❌'}`));
    console.log(chalk.gray(`  Code Execution: ${model.capabilities.codeExecution ? '✅' : '❌'}`));
    console.log();
    
    console.log(chalk.bold('Performance:'));
    console.log(chalk.gray(`  Speed: ${model.performance.speed}`));
    console.log(chalk.gray(`  Quality: ${model.performance.quality}`));
    console.log(chalk.gray(`  Cost: ${model.performance.cost}`));
    console.log();
    
    console.log(chalk.bold('Pricing:'));
    console.log(chalk.gray(`  Input: $${model.pricing.input}/1K tokens`));
    console.log(chalk.gray(`  Output: $${model.pricing.output}/1K tokens`));
    console.log();
    
    console.log(chalk.bold('Strengths:'));
    for (const strength of model.strengths) {
      console.log(chalk.green(`  + ${strength}`));
    }
    console.log();
    
    console.log(chalk.bold('Weaknesses:'));
    for (const weakness of model.weaknesses) {
      console.log(chalk.yellow(`  - ${weakness}`));
    }
    
    // Usage statistics
    if (model.totalUsage > 0) {
      console.log();
      console.log(chalk.bold('Usage Statistics:'));
      console.log(chalk.gray(`  Total Usage: ${model.totalUsage} times`));
      console.log(chalk.gray(`  Last Used: ${model.lastUsed ? new Date(model.lastUsed).toLocaleDateString() : 'Never'}`));
      console.log(chalk.gray(`  Average Rating: ${model.averageRating.toFixed(1)}/5`));
    }
  }

  /**
   * List all models
   */
  listModels(categoryFilter = null) {
    console.log(chalk.bold.cyan('\n🤖 Available Models\n'));
    
    const models = this.getAvailableModels();
    
    if (categoryFilter) {
      const filteredModels = models.filter(model => 
        model.categories.includes(categoryFilter)
      );
      
      const category = this.categories[categoryFilter];
      console.log(chalk.bold.yellow(`${category.icon} ${category.name}\n`));
      
      this.displayModelList(filteredModels);
    } else {
      // Group by category
      const modelsByCategory = {};
      
      for (const model of models) {
        for (const categoryId of model.categories) {
          if (!modelsByCategory[categoryId]) {
            modelsByCategory[categoryId] = [];
          }
          if (!modelsByCategory[categoryId].includes(model)) {
            modelsByCategory[categoryId].push(model);
          }
        }
      }
      
      for (const [categoryId, categoryModels] of Object.entries(modelsByCategory)) {
        const category = this.categories[categoryId];
        if (category) {
          console.log(chalk.bold.yellow(`${category.icon} ${category.name}`));
          this.displayModelList(categoryModels);
          console.log();
        }
      }
    }
  }

  /**
   * Display model list
   */
  displayModelList(models) {
    for (const model of models) {
      const current = model.id === this.currentModel ? '👉 ' : '   ';
      const available = this.isModelAvailable(model.id) ? '🟢' : '🔴';
      const performance = `${model.performance.speed}/${model.performance.quality}/${model.performance.cost}`;
      
      console.log(chalk.cyan(`${current}${available} ${model.name}`));
      console.log(chalk.gray(`     ${model.description}`));
      console.log(chalk.gray(`     Performance: ${performance} | Provider: ${model.provider}`));
    }
  }

  /**
   * Get current profile
   */
  getCurrentProfile() {
    // This could be stored in project settings or user preferences
    return this.profiles.get('development'); // Default for now
  }

  /**
   * Select default model
   */
  selectDefaultModel() {
    const availableModels = this.getAvailableModels();
    
    if (availableModels.length === 0) {
      return null;
    }
    
    // Prefer Claude Sonnet 4 first, then excellent free models optimized for coding
    const preferred = [
      'claude-sonnet-4', 
      'moonshotai/kimi-dev-72b', 
      'deepseek/deepseek-v3.1', 
      'moonshotai/kimi-k2-0711', 
      'qwen/qwen-2.5-coder-32b-instruct', 
      'claude-3-sonnet'
    ];
    
    for (const modelId of preferred) {
      if (availableModels.find(m => m.id === modelId)) {
        return modelId;
      }
    }
    
    // If no preferred models available, select by priority
    const sortedByPriority = availableModels.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return sortedByPriority[0].id;
  }

  /**
   * Load performance history
   */
  async loadPerformanceHistory() {
    try {
      const historyPath = path.join(process.cwd(), '.recoder', 'model-performance.json');
      if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        
        for (const [modelId, metrics] of Object.entries(history)) {
          this.performanceMetrics.set(modelId, metrics);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load performance history: ${error.message}`));
    }
  }

  /**
   * Save performance history
   */
  async savePerformanceHistory() {
    try {
      const recoderDir = path.join(process.cwd(), '.recoder');
      if (!fs.existsSync(recoderDir)) {
        fs.mkdirSync(recoderDir, { recursive: true });
      }
      
      const history = Object.fromEntries(this.performanceMetrics.entries());
      const historyPath = path.join(recoderDir, 'model-performance.json');
      
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not save performance history: ${error.message}`));
    }
  }
}

module.exports = ModelManager;