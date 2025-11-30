#!/usr/bin/env node

const readline = require('readline');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
// Removed direct chokidar import - use FileWatcherManager instead
const config = require('../config.js');
const PluginManager = require('../plugins/enhanced-plugin-manager.js');
const VoiceManager = require('./voice-manager.js');
const CollaborationManager = require('./collaboration-manager.js');
const IDEIntegration = require('./ide-integration.js');
const DebugLogger = require('./debug-logger.js');
const ProjectManager = require('./project-manager.js');
const ContextEngine = require('./context-engine.js');
const SlashCommandsEngine = require('./slash-commands.js');
const MCPClient = require('./mcp-client.js');
const ModelManager = require('./model-manager.js');
const RulesEngine = require('./rules-engine.js');
const TaskManager = require('./task-manager.js');
const DevToolsIntegration = require('./dev-tools-integration.js');
const VisionAnalyzer = require('./vision-analyzer.js');
const NaturalLanguageProcessor = require('./natural-language-processor.js');
const TodoManager = require('./todo-manager.js');
const FileWatcherManager = require('./file-watcher-manager.js');
const ConversationContextManager = require('./conversation-context-manager.js');
const EnhancedOutputFormatter = require('./enhanced-output-formatter.js');
const DragDropHandler = require('./drag-drop-handler.js');

// PHASE 1: Claude Code-like Systems
const SessionManager = require('./session-manager.js');
const FileTreeManager = require('./file-tree-manager.js');
const GitIntegration = require('./git-integration.js');
const FolderHierarchy = require('./folder-hierarchy.js');
const ContextBuilderV2 = require('./context-builder-v2.js');
const MessageParts = require('./message-parts.js');

// PHASE 2: Advanced Features
const ContextCompaction = require('./context-compaction.js');
const UIEnhancements = require('./ui-enhancements.js');
const PerformanceMonitor = require('./performance-monitor.js');

// PHASE 3: Advanced Intelligence
const AgentSystem = require('./agent-system.js');
const AdvancedSearch = require('./advanced-search.js');
const RealtimeFileWatcher = require('./realtime-file-watcher.js');
const ConversationCompactor = require('./conversation-compactor.js');
const ConversationMemory = require('./conversation-memory.js');
const InteractiveUI = require('./interactive-ui.js');

// PHASE 4: Qwen Code Architecture (New V2 - Production Ready)
const WorkspaceContextV2 = require('./workspace-context-v2.js');
const { Turn, TurnManager, ToolCall } = require('./turn-manager-v2.js');
const { ToolRegistry, BaseTool } = require('./tool-registry-v2.js');

// Create logs and sessions directories
const logsDir = path.join(process.cwd(), 'logs');
const sessionsDir = path.join(process.cwd(), 'sessions');
[logsDir, sessionsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize unified error handling for interactive mode
const UnifiedErrorHandler = require('./unified-error-handler.js');
const errorHandler = UnifiedErrorHandler.instance;
errorHandler.initialize();

class InteractiveRecoderChat {
  constructor() {
    // Load user configuration
    this.userConfig = this.loadUserConfig();
    this.apiKey = this.userConfig.apiKey || config.apiKey;
    this.model = this.userConfig.model || config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    
    // Conversation branching and parallel chats
    this.conversations = new Map();
    this.currentConversationId = 'main';
    this.conversationHistory = []; // Legacy support - points to current conversation
    this.conversationCounter = 0;
    
    this.sessionId = Date.now().toString();
    this.totalTokens = 0;
    this.requestCount = 0;
    this.multiLineMode = false;
    this.multiLineBuffer = [];
    this.fileWatcher = null;
    this.commandHistory = [];
    this.historyIndex = -1;
    this.keyboardShortcutsEnabled = true;
    this.watchedFiles = new Set();
    // Disable file watching by default to prevent EMFILE errors in production
    this.fileWatchEnabled = process.env.RECODER_ENABLE_FILE_WATCH === 'true' || false;
    
    // Simple mode disables heavy systems to prevent resource exhaustion
    this.simpleMode = process.env.RECODER_SIMPLE_MODE !== 'false'; // Default to simple mode
    this.projectContext = {
      packageJson: null,
      gitInfo: null,
      fileStructure: null,
      languages: new Set(),
      frameworks: new Set(),
      lastAnalyzed: null
    };
    
    // Initialize main conversation
    this.conversations.set('main', {
      id: 'main',
      name: 'Main Chat',
      history: [],
      model: this.model,
      temperature: this.temperature,
      tokens: 0,
      requests: 0,
      created: new Date(),
      lastActive: new Date()
    });
    
    // Set legacy conversationHistory reference to main conversation
    this.conversationHistory = this.conversations.get('main').history;
    
    // Initialize plugin manager
    this.pluginManager = new PluginManager();
    
    // Initialize voice manager (silently disabled)
    this.voiceManager = new VoiceManager();
    // Silently disable TTS without console output
    this.voiceManager.ttsEnabled = false;
    
    // Initialize collaboration manager
    this.collaborationManager = new CollaborationManager();
    
    // Initialize IDE integration
    this.ideIntegration = new IDEIntegration();
    
    // Initialize debug logger
    this.logger = new DebugLogger();
    this.logger.setupErrorHandlers();
    this.logger.startSession({
      model: this.model,
      sessionId: this.sessionId
    });
    
    // Initialize todo manager for production-ready task tracking
    this.todoManager = new TodoManager({ user: process.env.USER || 'developer' });

    // OLD: Enhanced Context Manager (basic version)
    this.contextManager = new ConversationContextManager();
    this.contextManager.startConversation(this.sessionId);
    
    // NEW: Enhanced Output Formatter (beautiful terminal UI)
    this.outputFormatter = new EnhancedOutputFormatter();

    // PHASE 1: Initialize Claude Code-like Systems
    this.phase1Systems = null; // Will be initialized after API key is set
    this.phase1Enabled = true; // Set to false to disable Phase 1 features

    // PHASE 2: Initialize Advanced Features
    this.phase2Systems = null; // Will be initialized with Phase 1
    this.phase2Enabled = true; // Set to false to disable Phase 2 features

    // PHASE 3: Advanced Intelligence Systems
    this.phase3Systems = null; // Will be initialized with Phase 2
    this.phase3Enabled = true; // Set to false to disable Phase 3 features

    // PHASE 4: Qwen Code Architecture V2 (Production Ready)
    this.phase4Systems = null; // Will be initialized with Phase 3
    this.phase4Enabled = true; // Set to false to disable Phase 4 features

    // Add comprehensive promise rejection handling
    this.setupGlobalErrorHandlers();
    
    // Initialize advanced systems
    this.contextEngine = null;
    this.slashCommands = null;
    this.mcpClient = null;
    this.modelManager = null;
    this.rulesEngine = null;
    this.taskManager = null;
    this.devTools = null;
    this.visionAnalyzer = null;
    this.nlProcessor = null;
    
    // Enhanced conversation tracking
    this.conversationHistory = [];
    this.currentSession = {
      startTime: Date.now(),
      messageCount: 0,
      lastActivity: Date.now()
    };
    
    this.initializeAdvancedSystems().catch(error => {
      console.log(chalk.yellow(`⚠️  Advanced features initialization failed: ${error.message}`));
    });
    
    // Initialize project manager for persistence
    this.projectManager = new ProjectManager();
    
    // Always initialize readline interface first to prevent errors
    this.initializeReadlineInterface();

    // Handle API key prompt and initialization
    if (!this.apiKey) {
      this.promptForApiKey().then(() => {
        this.initializeWithApiKey();
      });
    } else {
      this.initializeWithApiKey();
    }
  }

  /**
   * Initialize advanced systems (Context Engine, MCP, etc.)
   */
  async initializeAdvancedSystems() {
    // Skip advanced systems in simple mode to prevent resource exhaustion
    if (this.simpleMode) {
      console.log(chalk.gray('📱 Simple mode enabled - advanced features disabled for stability'));
      return;
    }
    
    try {
      // Silently initialize advanced features (no console.log for clean startup)
      
      // Initialize context engine for codebase understanding
      this.contextEngine = new ContextEngine();
      try {
        await this.contextEngine.initialize();
      } catch (contextError) {
        console.log(chalk.yellow(`⚠️  Context engine initialization failed: ${contextError.message}`));
      }
      
      // Initialize MCP client for model communication
      this.mcpClient = new MCPClient();
      
      // Initialize model manager with MCP and context engine
      this.modelManager = new ModelManager(this.mcpClient, this.contextEngine);
      
      // Initialize rules engine with project context
      this.rulesEngine = new RulesEngine(this.projectManager);
      try {
        await this.rulesEngine.autoDiscoverProjectRules();
      } catch (rulesError) {
        console.log(chalk.yellow(`⚠️  Rules engine initialization failed: ${rulesError.message}`));
      }
      
      // Initialize task manager with full integration
      this.taskManager = new TaskManager(this.projectManager, this.contextEngine, this.rulesEngine);
      try {
        this.taskManager.setupSmartAutomationTriggers();
      } catch (automationError) {
        console.log(chalk.yellow(`⚠️  Automation setup failed: ${automationError.message}`));
      }
      
      // Initialize development tools integration
      this.devTools = new DevToolsIntegration(this.contextEngine, this.projectManager, this.taskManager);
      try {
        await this.devTools.setupIDEIntegration();
        await this.devTools.setupGitIntegration();
        await this.devTools.setupDatabaseIntegration();
        await this.devTools.setupPerformanceMonitoring();
      } catch (devToolsError) {
        console.log(chalk.yellow(`⚠️  Dev tools setup failed: ${devToolsError.message}`));
      }
      
      // Initialize vision analyzer with model manager and context engine
      this.visionAnalyzer = new VisionAnalyzer(this.modelManager, this.contextEngine);
      
      // Initialize slash commands system with all dependencies including vision analyzer and todo manager
      this.slashCommands = new SlashCommandsEngine(this.contextEngine, this.projectManager, this.visionAnalyzer, this.todoManager);
      
      // Initialize natural language processor with access to all systems
      this.nlProcessor = new NaturalLanguageProcessor(this);
      
      // Set up system integrations
      try {
        await this.setupSystemIntegrations();
      } catch (integrationError) {
        console.log(chalk.yellow(`⚠️  System integrations setup failed: ${integrationError.message}`));
      }
      
      // Enable auto model switching based on context
      this.enableIntelligentModelSwitching();
      
      // Advanced features initialized silently
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Some advanced features may be limited: ${error.message}`));
      this.logger.error('Advanced systems initialization failed', error);
    }
  }

  /**
   * PHASE 1: Initialize Claude Code-like Systems
   * This provides session persistence, file tree tracking, git integration, etc.
   */
  async initializePhase1Systems() {
    if (!this.phase1Enabled) {
      return;
    }

    try {
      console.log(chalk.blue('🚀 Initializing Phase 1 systems...'));
      
      const startTime = Date.now();
      
      // 1. Session Manager
      this.sessionManager = new SessionManager();
      
      // Try to load session from sessionId, or create new one
      let session;
      const sessionIdFromEnv = process.env.RECODER_SESSION_ID;
      if (sessionIdFromEnv) {
        try {
          session = await this.sessionManager.load(sessionIdFromEnv);
          console.log(chalk.green(`✓ Loaded session: ${session.title}`));
        } catch (error) {
          // Session not found, create new one
          session = await this.sessionManager.create({
            directory: process.cwd(),
            title: `Session ${new Date().toLocaleString()}`,
            model: this.model
          });
        }
      } else {
        session = await this.sessionManager.create({
          directory: process.cwd(),
          title: `Session ${new Date().toLocaleString()}`,
          model: this.model
        });
      }
      
      // 2. File Tree Manager
      this.fileTreeManager = new FileTreeManager(process.cwd());
      await this.fileTreeManager.scan();
      const fileStats = this.fileTreeManager.getStats();
      console.log(chalk.green(`✓ Scanned ${fileStats.totalFiles} files, ${fileStats.totalDirectories} directories`));
      
      // 3. Git Integration
      this.gitIntegration = new GitIntegration(process.cwd());
      if (this.gitIntegration.isGitRepo) {
        const gitStatus = await this.gitIntegration.getStatus();
        console.log(chalk.green(`✓ Git: ${gitStatus.branch} (${gitStatus.totalChanges} changes)`));
      }
      
      // 4. Folder Hierarchy
      this.folderHierarchy = new FolderHierarchy(process.cwd());
      this.folderHierarchy.initialize(this.fileTreeManager.getTree());
      const folderStats = this.folderHierarchy.getStats();
      console.log(chalk.green(`✓ Tracking ${folderStats.totalFolders} folders`));
      
      // 5. Context Builder V2 - ⭐ Pass conversation context for file tracking!
      this.contextBuilderV2 = new ContextBuilderV2({
        sessionManager: this.sessionManager,
        fileTreeManager: this.fileTreeManager,
        gitIntegration: this.gitIntegration,
        folderHierarchy: this.folderHierarchy,
        conversationContext: this.contextManager // ⭐ CRITICAL: Tracks files in conversation
      });
      
      // Store Phase 1 systems in object for easy access
      this.phase1Systems = {
        sessionManager: this.sessionManager,
        fileTreeManager: this.fileTreeManager,
        gitIntegration: this.gitIntegration,
        folderHierarchy: this.folderHierarchy,
        contextBuilder: this.contextBuilderV2,
        MessageParts: MessageParts
      };
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ Phase 1 initialized in ${duration}ms`));
      
      // PHASE 2: Initialize advanced features
      await this.initializePhase2Systems();
      
      console.log('');
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Phase 1 initialization failed: ${error.message}`));
      console.log(chalk.gray('   Falling back to basic mode'));
      this.phase1Enabled = false;
      this.phase1Systems = null;
    }
  }

  /**
   * PHASE 2: Initialize Advanced Features
   * Context compaction, UI enhancements, performance monitoring
   */
  async initializePhase2Systems() {
    if (!this.phase2Enabled) {
      return;
    }

    try {
      console.log(chalk.blue('🎨 Initializing Phase 2 systems...'));
      
      const startTime = Date.now();
      
      // 1. Context Compaction
      this.contextCompaction = new ContextCompaction({
        maxContextTokens: 100000,
        pruneThreshold: 80000,
        protectedTokens: 40000,
        minimumPrune: 20000
      });
      console.log(chalk.green('✓ Context compaction ready (max 100k tokens)'));
      
      // 2. UI Enhancements
      this.uiEnhancements = new UIEnhancements();
      console.log(chalk.green('✓ UI enhancements loaded'));
      
      // 3. Performance Monitor
      this.performanceMonitor = new PerformanceMonitor();
      console.log(chalk.green('✓ Performance monitoring active'));
      
      // Store Phase 2 systems
      this.phase2Systems = {
        contextCompaction: this.contextCompaction,
        uiEnhancements: this.uiEnhancements,
        performanceMonitor: this.performanceMonitor
      };
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ Phase 2 initialized in ${duration}ms`));
      
      // PHASE 3: Initialize advanced intelligence
      await this.initializePhase3Systems();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Phase 2 initialization failed: ${error.message}`));
      console.log(chalk.gray('   Some features may be limited'));
      this.phase2Enabled = false;
      this.phase2Systems = null;
    }
  }

  /**
   * PHASE 3: Initialize Advanced Intelligence Systems
   * Agent system, advanced search, real-time watching
   */
  async initializePhase3Systems() {
    if (!this.phase3Enabled) {
      return;
    }

    try {
      console.log(chalk.blue('🤖 Initializing Phase 3 systems...'));
      
      const startTime = Date.now();
      
      // 1. Agent System
      this.agentSystem = new AgentSystem(this.contextEngine, this.modelManager);
      console.log(chalk.green(`✓ Agent system (${this.agentSystem.agents.size} agents)`));
      
      // 2. Advanced Search
      this.advancedSearch = new AdvancedSearch(process.cwd());
      console.log(chalk.green(`✓ Advanced search (${this.advancedSearch.hasRipgrep ? 'ripgrep' : 'native'})`));
      
      // 3. Real-time File Watcher (optional - only if enabled)
      if (this.fileWatchEnabled) {
        this.realtimeWatcher = new RealtimeFileWatcher(process.cwd());
        
        // Setup event handlers
        this.realtimeWatcher.on('onChange', (event) => {
          if (this.phase1Systems?.fileTreeManager) {
            this.phase1Systems.fileTreeManager.refresh().catch(() => {});
          }
        });
        
        // Don't start automatically - let user enable it
        console.log(chalk.green('✓ File watcher ready (use /watch to enable)'));
      }
      
      // 4. Conversation Compactor (automatic context management)
      this.conversationCompactor = new ConversationCompactor({
        maxMessages: 100,
        compactionThreshold: 50
      });
      console.log(chalk.green('✓ Conversation compactor'));
      
      // 5. Conversation Memory (long-term memory)
      this.conversationMemory = new ConversationMemory({
        memoryDir: path.join(process.cwd(), '.recoder', 'memory')
      });
      await this.conversationMemory.initialize();
      console.log(chalk.green('✓ Conversation memory'));
      
      // 6. Interactive UI (enhanced terminal UI)
      this.interactiveUI = new InteractiveUI({
        showStatus: true,
        showProgress: true,
        animations: true
      });
      console.log(chalk.green('✓ Interactive UI system'));
      
      // Store Phase 3 systems
      this.phase3Systems = {
        agentSystem: this.agentSystem,
        advancedSearch: this.advancedSearch,
        realtimeWatcher: this.realtimeWatcher,
        conversationCompactor: this.conversationCompactor,
        conversationMemory: this.conversationMemory,
        interactiveUI: this.interactiveUI
      };
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ Phase 3 initialized in ${duration}ms`));
      
      // PHASE 4: Initialize Qwen Code Architecture
      await this.initializePhase4Systems();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Phase 3 initialization failed: ${error.message}`));
      console.log(chalk.gray('   Advanced features unavailable'));
      this.phase3Enabled = false;
      this.phase3Systems = null;
    }
  }

  /**
   * PHASE 4: Initialize Qwen Code Architecture V2 (Production Ready)
   * WorkspaceContextV2, ToolRegistryV2, TurnManagerV2
   * 
   * This is the production-ready implementation based on Qwen Code architecture.
   * It provides:
   * - Secure multi-workspace management with path validation
   * - Type-safe tool registry with confirmation workflows
   * - Proper turn-based conversation state management
   * - Token tracking and automatic compression
   * - Tool execution logging and statistics
   */
  async initializePhase4Systems() {
    if (this.phase4Enabled === false) {
      return;
    }

    try {
      console.log(chalk.blue('⚡ Initializing Phase 4 V2 systems (Qwen Code Architecture)...'));
      
      const startTime = Date.now();
      
      // 1. WorkspaceContextV2 - Multi-directory workspace management with security
      this.workspaceContextV2 = new WorkspaceContextV2(process.cwd());
      console.log(chalk.green('✓ WorkspaceContext V2 (security-hardened)'));
      
      // 2. ToolRegistryV2 - Type-safe tool registry with built-in tools
      this.toolRegistryV2 = new ToolRegistry(this.workspaceContextV2);
      const toolCount = this.toolRegistryV2.getAllTools().length;
      console.log(chalk.green(`✓ ToolRegistry V2 (${toolCount} tools registered)`));
      
      // 3. TurnManagerV2 - Turn-based conversation management with compression
      this.turnManagerV2 = new TurnManager({
        maxTurns: 100,
        maxTokens: 100000,
        autoCompress: true,
        sessionId: this.sessionId
      });
      console.log(chalk.green('✓ TurnManager V2 (100 turns, 100k tokens, auto-compress)'));
      
      // Store Phase 4 V2 systems
      this.phase4Systems = {
        workspaceContext: this.workspaceContextV2,
        toolRegistry: this.toolRegistryV2,
        turnManager: this.turnManagerV2,
        // Keep references at root level for backward compatibility
        Turn,
        ToolCall,
        BaseTool
      };
      
      // Mark as initialized
      this.phase4Enabled = true;
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ Phase 4 V2 initialized in ${duration}ms`));
      
      // Show workspace info
      const wsInfo = this.workspaceContextV2.getInfo();
      console.log(chalk.gray(`   Workspace: ${wsInfo.primaryDirectory}`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Phase 4 V2 initialization failed: ${error.message}`));
      console.log(chalk.gray('   Using legacy systems'));
      this.phase4Enabled = false;
      this.phase4Systems = null;
    }
  }

  /**
   * Setup integrations between systems
   */
  async setupSystemIntegrations() {
    try {
      // Connect rules engine to context for AI prompts
      if (this.rulesEngine && this.contextEngine && typeof this.contextEngine.addContextProvider === 'function') {
        this.contextEngine.addContextProvider('rules', () => {
          return this.rulesEngine.generateAIPromptContext();
        });
      }
      
      // Connect task manager to model manager for auto-switching
      if (this.taskManager && this.modelManager) {
        this.taskManager.on('taskStarted', async (task) => {
          const taskType = this.categorizeTask(task);
          await this.modelManager.autoSwitchModel(taskType, {
            estimatedTokens: task.estimatedTokens,
            needsTools: task.requiresTools,
            codebaseSize: this.contextEngine?.getCodebaseSize()
          });
        });
      }
      
      // Connect dev tools to task manager for automated workflows
      if (this.devTools && this.taskManager) {
        // File change triggers from dev tools create tasks
        this.devTools.on('fileChanged', async (filePath) => {
          if (this.shouldTriggerAutomation(filePath)) {
            await this.createAutomatedTask('file-change', { filePath });
          }
        });
      }
      
      // Connect model manager to cost tracking
      if (this.modelManager) {
        this.modelManager.on('modelUsage', (usage) => {
          this.trackModelUsage(usage);
        });
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  System integration setup failed: ${error.message}`));
    }
  }

  /**
   * Enable intelligent model switching based on context
   */
  enableIntelligentModelSwitching() {
    if (!this.modelManager) return;
    
    // Set up context-aware model selection
    this.contextAwareModelSelection = true;
    
    // Update current model to the best available
    const defaultModel = this.modelManager.selectDefaultModel();
    if (defaultModel && defaultModel !== this.model) {
      this.model = defaultModel;
      console.log(chalk.blue(`🤖 Switched to optimal model: ${this.modelManager.models.get(defaultModel)?.name}`));
    }
  }

  /**
   * Categorize task for intelligent model selection
   */
  categorizeTask(task) {
    if (!task) return 'general';
    
    const taskName = task.name?.toLowerCase() || '';
    const taskDescription = task.description?.toLowerCase() || '';
    const taskContent = `${taskName} ${taskDescription}`;
    
    if (taskContent.includes('code') || taskContent.includes('debug') || 
        taskContent.includes('refactor') || taskContent.includes('programming')) {
      return 'coding';
    } else if (taskContent.includes('analyze') || taskContent.includes('research') || 
               taskContent.includes('review') || taskContent.includes('investigate')) {
      return 'analysis';
    } else if (taskContent.includes('write') || taskContent.includes('document') || 
               taskContent.includes('explain') || taskContent.includes('describe')) {
      return 'writing';
    } else if (taskContent.includes('creative') || taskContent.includes('design') || 
               taskContent.includes('brainstorm')) {
      return 'creative';
    }
    
    return 'general';
  }

  /**
   * Check if file change should trigger automation
   */
  shouldTriggerAutomation(filePath) {
    if (!this.rulesEngine) return false;
    
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'];
    const hasRelevantExtension = extensions.some(ext => filePath.endsWith(ext));
    
    // Check if automation is enabled in rules
    const automationRules = this.rulesEngine.getActiveRulesByCategory('automation');
    const hasAutomationEnabled = automationRules.length > 0;
    
    return hasRelevantExtension && hasAutomationEnabled;
  }

  /**
   * Create automated task based on trigger
   */
  async createAutomatedTask(triggerType, context) {
    if (!this.taskManager) return;
    
    try {
      let templateId = 'code-review'; // default
      let taskName = 'Automated Task';
      
      switch (triggerType) {
        case 'file-change':
          if (context.filePath?.includes('package.json')) {
            templateId = 'security-audit';
            taskName = `Security Audit: ${context.filePath}`;
          } else {
            templateId = 'code-review';
            taskName = `Code Review: ${context.filePath}`;
          }
          break;
        case 'git-commit':
          templateId = 'pre-commit-checks';
          taskName = 'Pre-commit Quality Checks';
          break;
        case 'dependency-update':
          templateId = 'security-audit';
          taskName = 'Dependency Security Scan';
          break;
      }
      
      const taskId = this.taskManager.createTaskFromTemplate(templateId, {
        name: taskName,
        triggeredBy: 'automation',
        metadata: context
      });
      
      console.log(chalk.cyan(`🤖 Created automated task: ${taskName} (${taskId})`));
      
      // Auto-execute if configured
      const automation = this.taskManager.automations.get('auto-execute');
      if (automation?.enabled) {
        await this.taskManager.executeTask(taskId);
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to create automated task: ${error.message}`));
    }
  }

  /**
   * Track model usage and costs
   */
  trackModelUsage(usage) {
    this.totalTokens += usage.tokens || 0;
    
    if (this.modelManager) {
      const model = this.modelManager.models.get(usage.modelId);
      if (model && model.pricing) {
        const cost = (usage.inputTokens * model.pricing.input / 1000) + 
                    (usage.outputTokens * model.pricing.output / 1000);
        
        // Track cost per model
        const currentCost = this.modelManager.costTracking.get(usage.modelId) || 0;
        this.modelManager.costTracking.set(usage.modelId, currentCost + cost);
      }
    }
  }

  updatePrompt() {
    const currentConv = this.getCurrentConversation();
    const convIndicator = this.currentConversationId === 'main' ? '' : chalk.gray(`[${currentConv.name}] `);
    
    if (this.multiLineMode) {
      this.rl.setPrompt(chalk.gray('... '));
    } else {
      this.rl.setPrompt(convIndicator + chalk.gray('> '));
    }
  }

  // Conversation management methods
  getCurrentConversation() {
    return this.conversations.get(this.currentConversationId) || this.conversations.get('main');
  }

  createConversation(name, model = null, temperature = null) {
    this.conversationCounter++;
    const id = `conv_${this.conversationCounter}`;
    const conversation = {
      id: id,
      name: name || `Chat ${this.conversationCounter}`,
      history: [],
      model: model || this.model,
      temperature: temperature || this.temperature,
      tokens: 0,
      requests: 0,
      created: new Date(),
      lastActive: new Date()
    };
    
    this.conversations.set(id, conversation);
    return id;
  }

  switchConversation(conversationId) {
    if (!this.conversations.has(conversationId)) {
      return false;
    }
    
    this.currentConversationId = conversationId;
    const currentConv = this.getCurrentConversation();
    currentConv.lastActive = new Date();
    
    // Update legacy conversationHistory reference
    this.conversationHistory = currentConv.history;
    
    this.updatePrompt();
    return true;
  }

  deleteConversation(conversationId) {
    if (conversationId === 'main') {
      return false; // Cannot delete main conversation
    }
    
    if (!this.conversations.has(conversationId)) {
      return false;
    }
    
    this.conversations.delete(conversationId);
    
    // If current conversation was deleted, switch to main
    if (this.currentConversationId === conversationId) {
      this.switchConversation('main');
    }
    
    return true;
  }

  listConversations() {
    const conversations = Array.from(this.conversations.values())
      .sort((a, b) => b.lastActive - a.lastActive);
    
    return conversations;
  }

  branchConversation(fromMessageIndex = null) {
    const currentConv = this.getCurrentConversation();
    const branchName = `${currentConv.name} (Branch)`;
    const newId = this.createConversation(branchName, currentConv.model, currentConv.temperature);
    const newConv = this.conversations.get(newId);
    
    // Copy history up to the specified point, or all if not specified
    if (fromMessageIndex !== null && fromMessageIndex < currentConv.history.length) {
      newConv.history = currentConv.history.slice(0, fromMessageIndex + 1);
    } else {
      newConv.history = [...currentConv.history];
    }
    
    // Calculate tokens for the branched conversation
    newConv.requests = Math.floor(newConv.history.length / 2);
    
    return newId;
  }

  initializeFileWatcher() {
    if (!this.fileWatchEnabled || this.fileWatcher) return; // Prevent multiple initializations

    try {
      // Use FileWatcherManager to prevent EMFILE errors
      this.fileWatcher = FileWatcherManager.instance.createWatcher(
        'interactive-chat',
        '.',
        {
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/logs/**',
            '**/sessions/**',
            '**/.env',
            '**/.recoderrc',
            '**/.*'
          ],
          ignoreInitial: true,
          depth: 2 // Reduced depth to prevent too many watchers
        },
        {
          onChange: (filePath) => this.onFileChanged(filePath),
          onAdd: (filePath) => this.onFileAdded(filePath),
          onUnlink: (filePath) => this.onFileDeleted(filePath)
        }
      );

      if (this.fileWatcher) {
        this.fileWatcher
          .on('change', (filePath) => this.onFileChanged(filePath))
          .on('add', (filePath) => this.onFileAdded(filePath))
          .on('unlink', (filePath) => this.onFileDeleted(filePath));
      }
    } catch (error) {
      // Silently fail file watcher initialization to prevent crashes
      this.logger?.warn('File watcher initialization failed, continuing without file watching');
      this.fileWatchEnabled = false;
    }
  }

  onFileChanged(filePath) {
    if (this.watchedFiles.has(filePath)) {
      console.log(chalk.yellow(`\n📝 File changed: ${filePath}`));
      this.rl.prompt();
    }
  }

  onFileAdded(filePath) {
    console.log(chalk.green(`\n➕ File added: ${filePath}`));
    this.rl.prompt();
  }

  onFileDeleted(filePath) {
    if (this.watchedFiles.has(filePath)) {
      console.log(chalk.red(`\n🗑️  File deleted: ${filePath}`));
      this.watchedFiles.delete(filePath);
      this.rl.prompt();
    }
  }

  addFileToWatch(filePath) {
    this.watchedFiles.add(filePath);
    console.log(chalk.blue(`👁️  Now watching: ${filePath}`));
  }

  removeFileFromWatch(filePath) {
    this.watchedFiles.delete(filePath);
    console.log(chalk.gray(`👁️  Stopped watching: ${filePath}`));
  }

  toggleFileWatch() {
    this.fileWatchEnabled = !this.fileWatchEnabled;
    if (this.fileWatchEnabled) {
      this.initializeFileWatcher();
      console.log(chalk.green('✅ File watching enabled'));
    } else {
      if (this.fileWatcher) {
        this.fileWatcher.close();
        this.fileWatcher = null;
      }
      console.log(chalk.yellow('⏸️  File watching disabled'));
    }
  }

  async analyzeProjectContext() {
    try {
      this.projectContext.lastAnalyzed = new Date().toISOString();
      
      // Analyze package.json
      await this.analyzePackageJson();
      
      // Analyze git repository
      await this.analyzeGitInfo();
      
      // Analyze file structure
      await this.analyzeFileStructure();
      
      // Detect languages and frameworks
      await this.detectLanguagesAndFrameworks();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not fully analyze project context: ${error.message}`));
    }
  }

  async analyzePackageJson() {
    const packagePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        this.projectContext.packageJson = {
          name: packageContent.name,
          version: packageContent.version,
          description: packageContent.description,
          dependencies: Object.keys(packageContent.dependencies || {}),
          devDependencies: Object.keys(packageContent.devDependencies || {}),
          scripts: Object.keys(packageContent.scripts || {}),
          main: packageContent.main
        };
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not parse package.json'));
      }
    }
  }

  async analyzeGitInfo() {
    try {
      const { execAsync } = require('child_process');
      const { promisify } = require('util');
      const exec = promisify(execAsync);
      
      const [branch, remoteUrl, lastCommit] = await Promise.allSettled([
        exec('git branch --show-current').then(r => r.stdout.trim()),
        exec('git remote get-url origin').then(r => r.stdout.trim()),
        exec('git log -1 --pretty=format:"%h %s"').then(r => r.stdout.trim())
      ]);

      this.projectContext.gitInfo = {
        branch: branch.status === 'fulfilled' ? branch.value : null,
        remoteUrl: remoteUrl.status === 'fulfilled' ? remoteUrl.value : null,
        lastCommit: lastCommit.status === 'fulfilled' ? lastCommit.value : null,
        isGitRepo: branch.status === 'fulfilled'
      };
    } catch (error) {
      this.projectContext.gitInfo = { isGitRepo: false };
    }
  }

  async analyzeFileStructure() {
    const structure = {};
    const maxDepth = 2;
    
    const scanDirectory = (dirPath, currentDepth = 0) => {
      if (currentDepth > maxDepth) return {};
      
      const items = {};
      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          if (entry.startsWith('.') && !['package.json', 'tsconfig.json'].includes(entry)) continue;
          if (['node_modules', 'logs', 'sessions', '.git'].includes(entry)) continue;
          
          const fullPath = path.join(dirPath, entry);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            items[entry] = { type: 'directory', children: scanDirectory(fullPath, currentDepth + 1) };
          } else {
            items[entry] = { type: 'file', size: stat.size, ext: path.extname(entry) };
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
      return items;
    };

    this.projectContext.fileStructure = scanDirectory(process.cwd());
  }

  async detectLanguagesAndFrameworks() {
    const { packageJson, fileStructure } = this.projectContext;
    
    // Detect languages from file extensions
    const detectLanguagesFromFiles = (structure) => {
      const languages = new Set();
      const traverse = (items) => {
        for (const [name, item] of Object.entries(items)) {
          if (item.type === 'file') {
            const ext = item.ext?.toLowerCase();
            switch (ext) {
              case '.js': languages.add('JavaScript'); break;
              case '.ts': languages.add('TypeScript'); break;
              case '.py': languages.add('Python'); break;
              case '.java': languages.add('Java'); break;
              case '.cpp': case '.cc': case '.cxx': languages.add('C++'); break;
              case '.c': languages.add('C'); break;
              case '.rs': languages.add('Rust'); break;
              case '.go': languages.add('Go'); break;
              case '.php': languages.add('PHP'); break;
              case '.rb': languages.add('Ruby'); break;
              case '.swift': languages.add('Swift'); break;
              case '.kt': languages.add('Kotlin'); break;
              case '.dart': languages.add('Dart'); break;
              case '.html': languages.add('HTML'); break;
              case '.css': languages.add('CSS'); break;
              case '.scss': case '.sass': languages.add('SCSS/Sass'); break;
              case '.vue': languages.add('Vue'); break;
              case '.jsx': case '.tsx': languages.add('React'); break;
            }
          } else if (item.type === 'directory') {
            traverse(item.children);
          }
        }
      };
      traverse(structure);
      return languages;
    };

    // Detect frameworks from dependencies
    const detectFrameworksFromDeps = (deps) => {
      const frameworks = new Set();
      const allDeps = [...(deps.dependencies || []), ...(deps.devDependencies || [])];
      
      for (const dep of allDeps) {
        if (dep.includes('react')) frameworks.add('React');
        if (dep.includes('vue')) frameworks.add('Vue.js');
        if (dep.includes('angular')) frameworks.add('Angular');
        if (dep.includes('svelte')) frameworks.add('Svelte');
        if (dep.includes('express')) frameworks.add('Express.js');
        if (dep.includes('fastify')) frameworks.add('Fastify');
        if (dep.includes('next')) frameworks.add('Next.js');
        if (dep.includes('nuxt')) frameworks.add('Nuxt.js');
        if (dep.includes('nest')) frameworks.add('NestJS');
        if (dep.includes('django')) frameworks.add('Django');
        if (dep.includes('flask')) frameworks.add('Flask');
        if (dep.includes('rails')) frameworks.add('Ruby on Rails');
        if (dep.includes('spring')) frameworks.add('Spring');
        if (dep.includes('laravel')) frameworks.add('Laravel');
      }
      return frameworks;
    };

    this.projectContext.languages = detectLanguagesFromFiles(fileStructure);
    
    if (packageJson) {
      const frameworksFromDeps = detectFrameworksFromDeps(packageJson);
      frameworksFromDeps.forEach(fw => this.projectContext.frameworks.add(fw));
    }
  }

  setupKeyboardShortcuts() {
    // Disable raw mode keyboard shortcuts to prevent double input with readline
    // Readline already handles keyboard input properly
    this.keyboardShortcutsEnabled = false;
    return;
  }

  handleKeyboardInput(key) {
    const keyStr = key.toString();
    
    // Handle Ctrl combinations
    if (key.length === 1) {
      const code = key[0];
      
      switch (code) {
        case 3: // Ctrl+C
          // Already handled by SIGINT
          break;
          
        case 4: // Ctrl+D (EOF)
          console.log(chalk.yellow('\n👋 Goodbye!'));
          this.rl.close();
          break;
          
        case 12: // Ctrl+L (Clear screen)
          console.clear();
          this.displayWelcome();
          break;
          
        case 18: // Ctrl+R (Reload/Refresh)
          this.handleCtrlR();
          break;
          
        case 20: // Ctrl+T (Toggle features)
          this.handleCtrlT();
          break;
          
        case 19: // Ctrl+S (Save session)
          this.handleCtrlS();
          break;
          
        case 15: // Ctrl+O (Open/Load session)
          this.handleCtrlO();
          break;
          
        case 16: // Ctrl+P (Show project info)
          this.handleCtrlP();
          break;
          
        case 14: // Ctrl+N (New/Clear conversation)
          this.handleCtrlN();
          break;
          
        case 27: // ESC (Exit)
          console.log(chalk.yellow('\n👋 Goodbye!'));
          process.exit(0);
          break;
      }
    }
  }

  async handleCtrlR() {
    console.log(chalk.blue('\n🔄 Reloading plugins and analyzing project...'));
    await this.loadPlugins();
    await this.analyzeProjectContext();
    console.log(chalk.green('✅ Reload complete'));
    this.rl.prompt();
  }

  handleCtrlT() {
    this.fileWatchEnabled = !this.fileWatchEnabled;
    if (this.fileWatchEnabled) {
      this.initializeFileWatcher();
      console.log(chalk.green('\n✅ File watching enabled'));
    } else {
      if (this.fileWatcher) {
        this.fileWatcher.close();
        this.fileWatcher = null;
      }
      console.log(chalk.yellow('\n⏸️  File watching disabled'));
    }
    this.rl.prompt();
  }

  async handleCtrlS() {
    console.log(chalk.blue('\n💾 Quick save...'));
    this.saveSession();
    console.log(chalk.green('✅ Session saved'));
    this.rl.prompt();
  }

  async handleCtrlO() {
    console.log(chalk.blue('\n📂 Available sessions:'));
    await this.loadSession();
    this.rl.prompt();
  }

  handleCtrlP() {
    this.showProjectContext();
    this.rl.prompt();
  }

  handleCtrlN() {
    console.log(chalk.blue('\n🗑️  Clearing conversation...'));
    this.clearConversation();
    this.rl.prompt();
  }

  autoComplete(line) {
    // Define available commands for autocomplete
    const commands = [
      '/help', '/clear', '/model', '/stats', '/save', '/load',
      '/watch', '/unwatch', '/files', '/project', '/analyze',
      '/setup', '/plugins', '/enable', '/disable', '/chats',
      '/branch', '/switch', '/voice', '/speak', '/record',
      '/team', '/workspace', '/share', '/collaborate',
      '/ide', '/open', '/goto', '/debug', '/logs', '/exit'
    ];

    // Add plugin commands
    const pluginCommands = Array.from(this.pluginManager.commands.keys()).map(cmd => `/${cmd}`);
    commands.push(...pluginCommands);

    // Add model names for /model command
    const commonModels = [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-3.5-turbo',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct'
    ];

    if (line.startsWith('/model ')) {
      const modelPrefix = line.substring(7);
      const hits = commonModels.filter(model => model.startsWith(modelPrefix));
      return [hits.length ? hits : commonModels, modelPrefix];
    }

    // Show help menu when user just types /
    if (line === '/') {
      console.log(chalk.cyan('\n📋 Available Commands:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.yellow('  /help') + chalk.gray('     - Show all commands'));
      console.log(chalk.yellow('  /clear') + chalk.gray('    - Clear conversation'));
      console.log(chalk.yellow('  /model') + chalk.gray('    - Change AI model'));
      console.log(chalk.yellow('  /stats') + chalk.gray('    - Show session stats'));
      console.log(chalk.yellow('  /save') + chalk.gray('     - Save conversation'));
      console.log(chalk.yellow('  /exit') + chalk.gray('     - Exit interactive mode'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray('Press TAB to autocomplete • Type /help for full list\n'));
      return [commands, line];
    }

    // Regular command completion
    if (line.startsWith('/')) {
      const hits = commands.filter(cmd => cmd.startsWith(line));
      return [hits.length ? hits : commands, line];
    }

    // File completion for /watch and /unwatch
    if (line.startsWith('/watch ') || line.startsWith('/unwatch ')) {
      try {
        const prefix = line.substring(line.indexOf(' ') + 1);
        const files = fs.readdirSync('.')
          .filter(f => f.startsWith(prefix))
          .filter(f => !f.startsWith('.'));
        return [files, prefix];
      } catch {
        return [[], ''];
      }
    }

    return [[], line];
  }

  async loadPlugins() {
    try {
      // Load plugins silently for production mode
      await this.pluginManager.loadPlugins(true); // true = silent mode
    } catch (error) {
      // Silently fail - don't show errors
    }
  }

  setupEventHandlers() {
    // Event handlers already set up in setupReadlineHandlers()
    // Just start the prompt
    this.rl.prompt();
  }

  // Legacy method - kept for compatibility but logic moved to setupReadlineHandlers
  setupEventHandlersOld() {
    this.rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      // Handle multi-line mode
      if (this.multiLineMode) {
        if (trimmedInput === '```') {
          // End multi-line mode
          this.multiLineMode = false;
          const fullInput = this.multiLineBuffer.join('\n');
          this.multiLineBuffer = [];
          this.updatePrompt();

          if (fullInput.trim()) {
            await this.processInput(fullInput);
          }
          this.rl.prompt();
          return;
        } else {
          // Add line to buffer
          this.multiLineBuffer.push(input);
          this.rl.prompt();
          return;
        }
      }

      if (trimmedInput === '') {
        this.rl.prompt();
        return;
      }

      // Check if starting multi-line mode
      if (trimmedInput === '```') {
        this.multiLineMode = true;
        this.multiLineBuffer = [];
        this.updatePrompt();
        console.log(chalk.gray('📝 Multi-line mode enabled. Type ``` to finish.'));
        this.rl.prompt();
        return;
      }

      // Handle special commands
      if (trimmedInput.startsWith('/')) {
        // Add to command history
        this.addToCommandHistory(trimmedInput);
        await this.handleCommand(trimmedInput);
        this.rl.prompt();
        return;
      }

      // Process regular chat input
      await this.processInput(trimmedInput);
      this.rl.prompt();
    });

    this.rl.on('close', async () => {
      await this.cleanup();
      this.saveSession();
      console.log(chalk.green('\n👋 Goodbye! Session saved.'));
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n🔄 Saving session...'));
      await this.cleanup();
      this.saveSession();
      console.log(chalk.green('✅ Session saved. Goodbye!'));
      process.exit(0);
    });
  }

  async promptForApiKey() {
    console.clear();
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  ✨ Welcome to Recoder Code                                ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────────────────────────╯'));
    console.log('');
    console.log(chalk.white('🔑 API key required to continue'));
    console.log(chalk.gray('Get your free API key at: ') + chalk.magenta('https://openrouter.ai'));
    console.log('');

    // Use existing readline interface instead of creating a new one
    return new Promise((resolve) => {
      this.rl.question(chalk.magenta('Enter your OpenRouter API key: '), (apiKey) => {
        if (!apiKey || apiKey.trim() === '') {
          console.log(chalk.red('No API key provided. Exiting...'));
          process.exit(1);
        }

        // Save the API key to environment
        process.env.OPENROUTER_API_KEY = apiKey.trim();
        this.apiKey = apiKey.trim();

        resolve();
      });
    });
  }
  
  initializeReadlineInterface() {
    // Don't re-initialize if already exists
    if (this.rl) {
      return;
    }

    // Check if stdin is a TTY
    if (!process.stdin.isTTY) {
      console.error('Error: stdin is not a TTY. Please run in a proper terminal.');
      process.exit(1);
    }

    // Initialize readline interface with enhanced options
    // Set terminal based on environment variable or default to true
    // If you see double characters, set RECODER_TERMINAL_MODE=false
    const terminalMode = process.env.RECODER_TERMINAL_MODE !== 'false';

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.gray('> '),
      historySize: 100,
      removeHistoryDuplicates: true,
      terminal: terminalMode,
      completer: (line) => this.autoComplete(line)
    });

    // Set up readline event handlers ONCE
    this.setupReadlineHandlers();
  }

  setupReadlineHandlers() {
    if (!this.rl) return;

    // Remove any existing listeners to prevent duplicates
    this.rl.removeAllListeners('line');
    this.rl.removeAllListeners('close');

    this.rl.on('line', async (input) => {
      await this.handleUserInput(input.trim());
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      process.exit(0);
    });
  }

  initializeWithApiKey() {
    // Initialize OpenAI client with OpenRouter configuration
    this.openai = new OpenAI({
      baseURL: config.baseURL,
      apiKey: this.apiKey,
      defaultHeaders: {
        'HTTP-Referer': config.siteUrl,
        'X-Title': config.siteName,
      },
    });

    // If readline interface wasn't already initialized, do it now
    if (!this.rl) {
      this.initializeReadlineInterface();
    }

    // Set up custom prompt and keyboard shortcuts
    this.updatePrompt();
    this.setupKeyboardShortcuts();

    this.setupEventHandlers();
    this.initializeFileWatcher();
    
    // PHASE 1: Initialize Claude Code-like systems
    this.initializePhase1Systems().catch(error => {
      console.log(chalk.yellow(`⚠️  Phase 1 systems initialization failed: ${error.message}`));
    });
    
    this.analyzeProjectContext().catch(error => {
      console.log(chalk.yellow(`⚠️  Project context analysis failed: ${error.message}`));
    });
    
    this.displayWelcome();

    // Load plugins after welcome, then show prompt again
    this.loadPlugins().then(() => {
      // Re-show prompt after plugins finish loading
      if (this.rl) {
        console.log(''); // Add blank line
        this.rl.prompt();
      }
    }).catch(error => {
      console.log(chalk.yellow(`⚠️  Plugin loading failed: ${error.message}`));
      if (this.rl) {
        this.rl.prompt();
      }
    });
  }

  updatePrompt() {
    // Neon purple prompt with white text
    if (this.rl) {
      this.rl.setPrompt(chalk.magenta('> '));
    }
  }

  setupEventHandlers() {
    // Event handlers already set up in setupReadlineHandlers()
    // Just start the prompt
    this.rl.prompt();
  }

  async handleUserInput(input) {
    if (!input) {
      this.rl.prompt();
      return;
    }

    // Process drag-and-drop files/folders
    input = await DragDropHandler.processInput(input);

    // Handle slash commands
    if (input.startsWith('/')) {
      this.handleSlashCommand(input);
      return;
    }

    try {
      const startTime = Date.now();

      // PHASE 4: Start a new turn
      let turn = null;
      if (this.phase4Enabled && this.turnManager) {
        turn = this.turnManager.startTurn(input, { model: this.model });
      }

      // Create RecoderCode instance
      const { RecoderCode } = require('./run.js');
      if (this.apiKey && !process.env.OPENROUTER_API_KEY) {
        process.env.OPENROUTER_API_KEY = this.apiKey;
      }
      const recoder = new RecoderCode();

      // Override tool execution to show indicators AND track in turn
      const originalExecuteToolCall = recoder.executeToolCall.bind(recoder);
      recoder.executeToolCall = async (toolCall) => {
        const toolName = toolCall.function.name;
        process.stdout.write(chalk.dim(`  ${toolName}...\r`));
        const result = await originalExecuteToolCall(toolCall);
        process.stdout.write('             \r');
        
        // PHASE 4: Track tool call in turn
        if (turn) {
          turn.addToolCall(toolCall, result);
        }
        
        return result;
      };

      // Simple thinking indicator
      process.stdout.write(chalk.dim('  thinking...\r'));

      // Get AI response (non-streaming for cleaner output)
      const response = await recoder.processConversation(input, false, false, null);

      // Clear thinking indicator
      process.stdout.write('             \r');

      // Display response and handle tool calls
      if (response) {
        // Check if response contains DeepSeek-style tool calls
        const hasToolCalls = response.includes('<｜tool▁call▁begin｜>');

        if (hasToolCalls) {
          // Parse and execute tool calls
          const result = await this.parseAndExecuteToolCalls(response, recoder);

          if (result.toolResults.length > 0) {
            // Show tool execution results
            console.log('');
            result.toolResults.forEach(tr => {
              console.log(chalk.dim(`  ✓ ${tr.tool}`));
            });

            // Get follow-up response with tool results
            const toolContext = result.toolResults.map(tr =>
              `Tool ${tr.tool} executed: ${tr.result.substring(0, 200)}`
            ).join('\n');

            const followUp = await recoder.processConversation(
              `Based on these tool results:\n${toolContext}\n\nProvide a helpful summary of what was done.`,
              false, false, null
            );

            const cleanFollowUp = followUp.replace(/<｜tool[^｜]*｜>/g, '').trim();
            if (cleanFollowUp) {
              console.log('\n' + cleanFollowUp + '\n');
              
              // PHASE 4: Track assistant response in turn
              if (turn) {
                turn.addAssistantResponse(cleanFollowUp);
              }
            }
          } else {
            // No tools executed, show cleaned response
            const cleanResponse = result.cleanText;
            if (cleanResponse) {
              console.log('\n' + cleanResponse + '\n');
              
              // PHASE 4: Track assistant response in turn
              if (turn) {
                turn.addAssistantResponse(cleanResponse);
              }
            }
          }
        } else {
          // No tool calls, display normally
          console.log('\n' + response + '\n');
          
          // PHASE 4: Track assistant response in turn
          if (turn) {
            turn.addAssistantResponse(response);
          }
        }

        // Track conversation
        this.conversationHistory.push({
          timestamp: new Date(),
          input: input,
          response: response
        });
        this.currentSession.messageCount++;
        this.currentSession.lastActivity = Date.now();
        
        // PHASE 4: Complete the turn
        if (turn) {
          this.turnManager.completeTurn();
        }
      }

    } catch (error) {
      process.stdout.write('             \r');
      console.log(chalk.red('\n  Error: ' + error.message + '\n'));
      
      // PHASE 4: Mark turn as failed
      if (this.phase4Enabled && this.turnManager) {
        this.turnManager.failTurn(error);
      }
    }

    this.rl.prompt();
  }

  async parseAndExecuteToolCalls(response, recoder) {
    const toolResults = [];
    let cleanText = response;

    // Parse DeepSeek-style tool calls: <｜tool▁call▁begin｜>toolname<｜tool▁sep｜>{"args"}<｜tool▁call▁end｜>
    const toolCallRegex = /<｜tool▁call▁begin｜>(\w+)<｜tool▁sep｜>({[^}]+})<｜tool▁call▁end｜>/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      const toolName = match[1];
      const argsJson = match[2];

      try {
        const args = JSON.parse(argsJson);

        // Execute the tool
        let result = '';
        if (toolName === 'bash') {
          result = await recoder.handleBashCommand(args);
        } else if (toolName === 'str_replace_editor') {
          result = await recoder.handleFileOperation(args);
        } else if (toolName === 'codebase_search') {
          result = await recoder.handleCodebaseSearch(args);
        } else if (toolName === 'web_fetch') {
          result = await recoder.handleWebFetch(args);
        }

        toolResults.push({ tool: toolName, args, result });

        // Remove the tool call from clean text
        cleanText = cleanText.replace(match[0], '');
      } catch (error) {
        console.log(chalk.yellow(`  ⚠ Tool ${toolName} failed: ${error.message}`));
      }
    }

    // Clean up tool markers
    cleanText = cleanText.replace(/<｜tool▁calls▁begin｜>/g, '');
    cleanText = cleanText.replace(/<｜tool▁calls▁end｜>/g, '');
    cleanText = cleanText.trim();

    return { toolResults, cleanText };
  }

  displayWelcome() {
    console.clear();

    const projectName = this.getCurrentProjectContext().name;
    const modelName = this.model || 'deepseek/deepseek-chat-v3.1:free';

    // Simple, clean header like Claude Code
    console.log('');
    console.log(chalk.cyan.bold('  Recoder Code') + chalk.dim(` v${require('../package.json').version}`));
    console.log(chalk.dim(`  ${modelName}`));
    console.log(chalk.dim(`  ${process.cwd()}`));
    console.log('');

    this.rl.prompt();
  }

  displayAnimatedBorder() {
    const colors = ['magenta', 'cyan', 'blue', 'magenta'];
    const border = '╭─────────────────────────────────────────────────────────────╮';
    const title = '│  ✨ Welcome to Recoder Code - AI Terminal                   │';
    const bottom = '╰─────────────────────────────────────────────────────────────╯';
    
    console.log(chalk[colors[0]](border));
    console.log(chalk[colors[1]](title));
    console.log(chalk[colors[2]](bottom));
  }

  displayGradientLogo() {
    // Beautiful gradient ASCII art with purple to cyan transition
    const lines = [
      '██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗',
      '██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗',
      '██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝',
      '██╔══██╗██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗',
      '██║  ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║',
      '╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝'
    ];
    
    const gradientColors = ['magenta', 'magenta', 'cyan', 'blue', 'blue', 'gray'];
    
    lines.forEach((line, index) => {
      console.log(chalk[gradientColors[index]].bold(line));
    });
  }

  displayDynamicStatus() {
    const currentTime = new Date().toLocaleTimeString();
    const projectContext = this.getCurrentProjectContext();
    
    console.log(chalk.gray('┌─ Session Info ─────────────────────────────────────────────┐'));
    console.log(chalk.gray('│') + chalk.white(`  🕐 Started: ${currentTime}`) + 
                chalk.gray('                                     │'));
    console.log(chalk.gray('│') + chalk.cyan(`  📁 Project: ${projectContext.name || 'recoder-code'}`) + 
                chalk.gray('                                │'));
    console.log(chalk.gray('│') + chalk.green(`  🤖 Model: ${this.model || 'claude-sonnet-4'}`) + 
                chalk.gray('                      │'));
    console.log(chalk.gray('└────────────────────────────────────────────────────────────┘'));
  }

  getCurrentProjectContext() {
    try {
      const packageJson = require(process.cwd() + '/package.json');
      return {
        name: packageJson.name || 'Unknown Project',
        version: packageJson.version || '1.0.0'
      };
    } catch (error) {
      return { name: 'recoder-code', version: '2.0.0' };
    }
  }

  showEnhancedStatusHints() {
    console.log(chalk.gray('┌─ Quick Commands ───────────────────────────────────────────┐'));
    console.log(chalk.gray('│') + chalk.yellow('  ! ') + chalk.white('bash mode') + 
                chalk.gray(' • ') + chalk.yellow('/ ') + chalk.white('commands') + 
                chalk.gray(' • ') + chalk.yellow('tab ') + chalk.white('autocomplete') + 
                chalk.gray('         ') + chalk.red('ESC ') + chalk.white('exit') + 
                chalk.gray(' │'));
    console.log(chalk.gray('└────────────────────────────────────────────────────────────┘'));
    
    console.log(chalk.gray('┌─ Features ─────────────────────────────────────────────────┐'));
    console.log(chalk.gray('│') + chalk.magenta('  📁 ') + chalk.white(this.getCurrentProjectContext().name) + 
                chalk.gray(' • ') + chalk.green('✨ ') + chalk.white('AI Ready') + 
                chalk.gray(' • ') + chalk.cyan('Ctrl+S ') + chalk.white('save') + 
                chalk.gray(' • ') + chalk.blue('Ctrl+H ') + chalk.white('help') + 
                chalk.gray(' │'));
    console.log(chalk.gray('└────────────────────────────────────────────────────────────┘'));
  }

  showError(error) {
    // Beautiful error display like Claude Code
    console.log(chalk.red('╭─────────────────────────────────────────╮'));
    console.log(chalk.red('│') + chalk.white.bold('  ❌ Error                             ') + chalk.red('│'));
    console.log(chalk.red('╰─────────────────────────────────────────╯'));
    console.log('');
    console.log(chalk.white(error.message));
    console.log('');
    
    // Show helpful suggestions based on error type
    if (error.message.includes('429')) {
      console.log(chalk.gray('💡 Rate limit reached. Try again in a few seconds.'));
    } else if (error.message.includes('API key')) {
      console.log(chalk.gray('💡 Check your API key with /status command.'));
    } else if (error.message.includes('timeout')) {
      console.log(chalk.gray('💡 Request timed out. Try a simpler query.'));
    } else {
      console.log(chalk.gray('💡 Type /help for available commands.'));
    }
  }

  showStatusHints() {
    // Show helpful hints at bottom like Claude Code with project context
    const projectName = path.basename(process.cwd());
    console.log(chalk.gray(`! for bash mode • / for commands • tab to autocomplete         ESC to exit`));
    console.log(chalk.gray(`📁 ${projectName} • ✨ Recoder Code ready • Ctrl+S save • Ctrl+H help`));
  }

  startProcessingAnimation() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    
    this.processingInterval = setInterval(() => {
      const frame = frames[frameIndex % frames.length];
      process.stdout.write(`\r${chalk.magenta(frame)} ${chalk.gray('Processing...')}`);
      frameIndex++;
    }, 80);
  }

  stopProcessingAnimation() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      process.stdout.write('\r'); // Clear the line
    }
  }

  showToolUsage() {
    // Show tool usage indicators like Claude Code
    const tools = ['Read', 'Analyze', 'Generate'];
    tools.forEach(tool => {
      console.log(chalk.gray('● ') + chalk.white(`${tool}(project_structure)...`));
    });
  }

  formatResponse(response) {
    // Format response with rich styling like Claude Code
    if (!response) return '';
    
    // Add bullet points and styling
    const formatted = response
      .split('\n')
      .map(line => {
        if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
          return chalk.gray('● ') + chalk.white(line.replace(/^[\s\-\*]+/, ''));
        }
        return chalk.white(line);
      })
      .join('\n');
    
    return formatted;
  }

  async typeResponse(text) {
    // Type out response character by character like Claude Code
    const lines = text.split('\n');
    for (const line of lines) {
      for (let i = 0; i < line.length; i++) {
        process.stdout.write(line[i]);
        await new Promise(resolve => setTimeout(resolve, 15)); // 15ms per character
      }
      console.log(''); // New line after each line
    }
  }

  handleSlashCommand(input) {
    const command = input.slice(1).toLowerCase();
    
    switch (command) {
      case 'help':
        this.showHelp();
        break;
      case 'clear':
        console.clear();
        this.displayWelcome();
        return; // Don't show prompt again
      case 'exit':
      case 'quit':
        console.log(chalk.magenta('\nGoodbye! ✨'));
        // Save context before exiting
        if (this.contextManager) {
          this.contextManager.saveContext();
        }
        process.exit(0);
        break;
      case 'status':
        this.showStatus();
        break;
      case 'history':
        this.showHistory();
        break;
      case 'session':
        this.showSession();
        break;
      case 'watch':
        this.showWatchedFiles();
        break;
      case 'save':
        this.saveCurrentSession();
        break;
      case 'analyze':
        this.performCodeAnalysis();
        break;
      case 'git':
        this.showGitStatus();
        break;
      case 'review':
        this.performCodeReview();
        break;
      case 'optimize':
        this.performOptimizationAnalysis();
        break;
      case 'security':
        this.performSecurityAnalysis();
        break;
      case 'theme':
        this.cycleTheme();
        break;
      case 'context':
      case 'files':
        // PHASE 1: Show comprehensive context summary
        if (this.phase1Systems && this.phase1Enabled) {
          console.log('');
          console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
          console.log(chalk.bold.cyan('  📊 CONTEXT SUMMARY'));
          console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
          console.log('');
          
          // Session info
          const session = this.phase1Systems.sessionManager.getCurrent();
          if (session) {
            console.log(chalk.blue('📝 Session:'));
            console.log(chalk.gray(`  Title: ${session.title}`));
            console.log(chalk.gray(`  Messages: ${session.messages.length}`));
            console.log(chalk.gray(`  Created: ${new Date(session.time.created).toLocaleString()}`));
            console.log('');
          }
          
          // ⭐ CRITICAL: Show files created/modified in THIS conversation
          if (this.contextManager) {
            const contextSummary = this.contextManager.getContextSummary();
            console.log(chalk.green('✨ Conversation Activity:'));
            console.log(chalk.gray(`  Files Created: ${contextSummary.filesCreated}`));
            console.log(chalk.gray(`  Files Modified: ${contextSummary.filesModified}`));
            console.log(chalk.gray(`  Commands Run: ${contextSummary.commandsExecuted}`));
            
            if (contextSummary.activeFiles.length > 0) {
              console.log('');
              console.log(chalk.magenta('🔥 Active Files in Conversation:'));
              contextSummary.activeFiles.slice(0, 20).forEach(file => {
                const isNew = this.contextManager.createdFiles.has(file);
                const icon = isNew ? '✨' : '📝';
                console.log(chalk.gray(`   ${icon} ${file}`));
              });
              if (contextSummary.activeFiles.length > 20) {
                console.log(chalk.gray(`   ... and ${contextSummary.activeFiles.length - 20} more files`));
              }
            }
            console.log('');
          }
          
          // File tree stats
          const fileStats = this.phase1Systems.fileTreeManager.getStats();
          console.log(chalk.blue('📁 Project Structure:'));
          console.log(chalk.gray(`  Total Files: ${fileStats.totalFiles}`));
          console.log(chalk.gray(`  Total Directories: ${fileStats.totalDirectories}`));
          console.log(chalk.gray(`  Last Scan: ${new Date(fileStats.lastScan).toLocaleTimeString()}`));
          console.log('');
          
          // Git status
          if (this.phase1Systems.gitIntegration.isGitRepo) {
            this.phase1Systems.gitIntegration.getStatus().then(gitStatus => {
              console.log(chalk.blue('🌿 Git Status:'));
              console.log(chalk.gray(`  Branch: ${gitStatus.branch}`));
              console.log(chalk.gray(`  Modified: ${gitStatus.modified.length} files`));
              console.log(chalk.gray(`  Untracked: ${gitStatus.untracked.length} files`));
              console.log('');
              
              // Folder hierarchy
              const folderStats = this.phase1Systems.folderHierarchy.getStats();
              console.log(chalk.blue('🌳 Folder Hierarchy:'));
              console.log(chalk.gray(`  Total Folders: ${folderStats.totalFolders}`));
              console.log(chalk.gray(`  Created in Session: ${folderStats.createdInSession}`));
              console.log('');
              
              console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
              console.log('');
              this.rl.prompt();
            }).catch(() => this.rl.prompt());
          } else {
            const folderStats = this.phase1Systems.folderHierarchy.getStats();
            console.log(chalk.blue('🌳 Folder Hierarchy:'));
            console.log(chalk.gray(`  Total Folders: ${folderStats.totalFolders}`));
            console.log(chalk.gray(`  Created in Session: ${folderStats.createdInSession}`));
            console.log('');
            console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
            console.log('');
            this.rl.prompt();
          }
          return;
        }
        
        // Fallback to OLD context manager
        if (this.contextManager) {
          this.contextManager.displayContextSummary();
        } else {
          console.log(chalk.yellow('⚠️  Context tracking not available'));
        }
        break;
      
      // PHASE 2: New commands
      case 'tree':
        if (this.uiEnhancements && this.phase1Systems) {
          const tree = this.phase1Systems.fileTreeManager.getTree();
          this.uiEnhancements.displayFileTree(tree, { maxDepth: 3, showFiles: true });
        } else {
          console.log(chalk.yellow('⚠️  File tree not available'));
        }
        break;
        
      case 'performance':
      case 'perf':
        if (this.performanceMonitor) {
          this.performanceMonitor.displayReport();
        } else {
          console.log(chalk.yellow('⚠️  Performance monitoring not available'));
        }
        break;
        
      case 'compact':
        if (this.contextCompaction) {
          console.log(chalk.blue('🔄 Forcing context compaction...'));
          const stats = this.contextCompaction.getStats();
          console.log(chalk.gray(`Current stats: ${stats.totalCompactions} compactions, ${stats.tokensSaved} tokens saved`));
        } else {
          console.log(chalk.yellow('⚠️  Context compaction not available'));
        }
        break;
        
      case 'gitstatus':
        if (this.uiEnhancements && this.phase1Systems && this.phase1Systems.gitIntegration.isGitRepo) {
          this.phase1Systems.gitIntegration.getStatus().then(status => {
            this.uiEnhancements.displayGitStatus(status);
            this.rl.prompt();
          }).catch(error => {
            console.log(chalk.red(`Git status error: ${error.message}`));
            this.rl.prompt();
          });
          return; // Don't show prompt yet
        } else {
          console.log(chalk.yellow('⚠️  Git integration not available'));
        }
        break;
      
      // PHASE 3: Advanced Intelligence Commands
      case 'agent':
      case 'agents':
        if (this.phase3Systems?.agentSystem) {
          const agents = this.phase3Systems.agentSystem.listAgents();
          const activeAgent = this.phase3Systems.agentSystem.getActiveAgent();
          
          console.log(chalk.blue('\n🤖 Available Agents:\n'));
          console.log(chalk.cyan('═'.repeat(60)));
          
          agents.forEach(agent => {
            const isActive = activeAgent?.id === agent.id;
            const marker = isActive ? chalk.green('●') : chalk.gray('○');
            console.log(`\n${marker} ${chalk.bold(agent.name)} ${chalk.gray(`(${agent.id})`)}`);
            console.log(chalk.gray(`   ${agent.description}`));
            console.log(chalk.gray(`   Model: ${agent.model}`));
            console.log(chalk.gray(`   Capabilities: ${agent.capabilities.join(', ')}`));
          });
          
          console.log('\n' + chalk.cyan('═'.repeat(60)));
          console.log(chalk.gray('\nUsage: /agent <id> - Switch to specific agent'));
          console.log(chalk.gray('Auto-routing: Agents automatically selected based on your input\n'));
        } else {
          console.log(chalk.yellow('⚠️  Agent system not available'));
        }
        break;
        
      case 'search':
        const searchQuery = input.split(' ').slice(1).join(' ');
        if (!searchQuery) {
          console.log(chalk.yellow('Usage: /search <pattern>'));
          console.log(chalk.gray('Example: /search function, /search TODO'));
          break;
        }
        
        if (this.phase3Systems?.advancedSearch) {
          console.log(chalk.blue(`🔍 Searching for "${searchQuery}"...\n`));
          this.phase3Systems.advancedSearch.search(searchQuery, { maxResults: 10 })
            .then(results => {
              console.log(chalk.green(`Found ${results.totalResults} results (showing ${results.results.length}):`));
              console.log(chalk.gray(`Search completed in ${results.duration}ms\n`));
              
              results.results.forEach((result, index) => {
                console.log(chalk.cyan(`${index + 1}. ${result.file}:${result.line}:${result.column}`));
                console.log(chalk.gray(`   ${result.content}`));
              });
              
              if (results.truncated) {
                console.log(chalk.yellow(`\n... and ${results.totalResults - results.results.length} more results`));
              }
              
              console.log('');
              this.rl.prompt();
            })
            .catch(error => {
              console.log(chalk.red(`Search error: ${error.message}`));
              this.rl.prompt();
            });
          return; // Don't show prompt yet
        } else {
          console.log(chalk.yellow('⚠️  Advanced search not available'));
        }
        break;
        
      case 'watch':
        if (this.phase3Systems?.realtimeWatcher) {
          if (!this.fileWatchEnabled) {
            console.log(chalk.yellow('⚠️  File watching is disabled'));
            console.log(chalk.gray('Set RECODER_ENABLE_FILE_WATCH=true to enable'));
            break;
          }
          
          const watcher = this.phase3Systems.realtimeWatcher;
          if (watcher.watcher) {
            console.log(chalk.yellow('⏸  Stopping file watcher...'));
            watcher.stop().then(() => {
              console.log(chalk.green('✓ File watcher stopped'));
              this.rl.prompt();
            });
            return;
          } else {
            console.log(chalk.blue('👁️  Starting file watcher...'));
            watcher.start();
            
            watcher.on('onBatch', (batch) => {
              const summary = batch.changes.reduce((acc, change) => {
                acc[change.type] = (acc[change.type] || 0) + 1;
                return acc;
              }, {});
              
              console.log(chalk.gray(`\n👁️  File changes detected: ${Object.entries(summary).map(([type, count]) => `${count} ${type}`).join(', ')}`));
              this.rl.prompt();
            });
            
            console.log(chalk.green('✓ File watcher started (use /watch again to stop)'));
          }
        } else {
          console.log(chalk.yellow('⚠️  File watcher not available'));
        }
        break;
      
      case 'memory':
      case 'memories':
        if (this.conversationMemory) {
          const stats = this.conversationMemory.getStats();
          const topMemories = this.conversationMemory.getTopMemories(10);
          
          console.log(chalk.blue('\n🧠 Conversation Memory:\n'));
          console.log(chalk.cyan('═'.repeat(60)));
          console.log(chalk.gray(`Total memories: ${stats.totalMemories}`));
          console.log(chalk.gray(`Average importance: ${stats.averageImportance.toFixed(2)}`));
          console.log(chalk.gray(`Oldest: ${new Date(stats.oldestMemory).toLocaleString()}`));
          console.log(chalk.gray(`Newest: ${new Date(stats.newestMemory).toLocaleString()}`));
          
          if (topMemories.length > 0) {
            console.log(chalk.cyan('\nTop 10 Memories:'));
            topMemories.forEach((mem, i) => {
              console.log(chalk.gray(`\n${i + 1}. ${mem.key}`));
              console.log(chalk.white(`   ${JSON.stringify(mem.value).slice(0, 100)}...`));
              console.log(chalk.gray(`   Importance: ${mem.importance.toFixed(2)} | Accessed: ${mem.metadata.accessCount} times`));
            });
          }
          
          console.log('\n' + chalk.cyan('═'.repeat(60)) + '\n');
        } else {
          console.log(chalk.yellow('⚠️  Conversation memory not available'));
        }
        break;
        
      case 'compact-stats':
        if (this.conversationCompactor) {
          const stats = this.conversationCompactor.getStats();
          console.log(chalk.blue('\n📊 Conversation Compaction Stats:\n'));
          console.log(chalk.cyan('═'.repeat(60)));
          console.log(chalk.gray(`Total compactions: ${stats.totalCompactions}`));
          console.log(chalk.gray(`Messages compacted: ${stats.totalMessagesCompacted}`));
          if (stats.lastCompaction) {
            console.log(chalk.gray(`Last compaction: ${new Date(stats.lastCompaction).toLocaleString()}`));
          }
          console.log(chalk.cyan('═'.repeat(60)) + '\n');
        } else {
          console.log(chalk.yellow('⚠️  Conversation compactor not available'));
        }
        break;
        
      case 'ui-test':
        if (this.interactiveUI) {
          console.log(chalk.blue('\n🎨 Testing Interactive UI Components:\n'));
          
          // Test status indicators
          this.interactiveUI.showStatusIndicator('Testing info message', 'info');
          this.interactiveUI.showStatusIndicator('Testing success message', 'success');
          this.interactiveUI.showStatusIndicator('Testing warning message', 'warning');
          
          // Test progress bar
          const progress = this.interactiveUI.createProgressBar(100, 'Demo Progress');
          let current = 0;
          const interval = setInterval(() => {
            current += 10;
            progress.update(current);
            if (current >= 100) {
              clearInterval(interval);
              progress.complete();
              
              // Test table
              setTimeout(() => {
                this.interactiveUI.displayTable(
                  ['File', 'Status', 'Lines'],
                  [
                    ['app.js', 'Modified', '150'],
                    ['index.js', 'Created', '50'],
                    ['test.js', 'Deleted', '30']
                  ]
                );
                this.rl.prompt();
              }, 100);
            }
          }, 200);
          return; // Don't show prompt yet
        } else {
          console.log(chalk.yellow('⚠️  Interactive UI not available'));
        }
        break;
      
      // PHASE 4: Qwen Code Architecture Commands
      case 'turns':
        if (this.phase4Enabled && this.turnManager) {
          this.turnManager.displayRecentTurns(10);
        } else {
          console.log(chalk.yellow('⚠️  Turn manager not available'));
        }
        break;
        
      case 'turnstats':
        if (this.phase4Enabled && this.turnManager) {
          this.turnManager.displayStats();
        } else {
          console.log(chalk.yellow('⚠️  Turn manager not available'));
        }
        break;
        
      case 'toolstats':
        if (this.phase4Enabled && this.toolExecutor) {
          const stats = this.toolExecutor.getStats();
          console.log(chalk.cyan('\n🔧 Tool Execution Statistics:\n'));
          console.log(chalk.gray('═'.repeat(60)));
          console.log(chalk.white(`  Total executions: ${stats.totalExecutions}`));
          console.log(chalk.green(`  ✓ Successful: ${stats.successCount}`));
          console.log(chalk.red(`  ✗ Failed: ${stats.failureCount}`));
          console.log(chalk.gray(`  ⌀ Average duration: ${(stats.averageDuration / 1000).toFixed(2)}s`));
          console.log(chalk.gray(`  Total time: ${(stats.totalDuration / 1000).toFixed(2)}s`));
          
          if (Object.keys(stats.byTool).length > 0) {
            console.log(chalk.cyan('\n  By Tool:'));
            Object.entries(stats.byTool).forEach(([tool, toolStats]) => {
              console.log(chalk.white(`\n    ${tool}:`));
              console.log(chalk.gray(`      Calls: ${toolStats.count}`));
              console.log(chalk.gray(`      Success: ${toolStats.success}`));
              console.log(chalk.gray(`      Failed: ${toolStats.failure}`));
              console.log(chalk.gray(`      Avg time: ${(toolStats.duration / toolStats.count / 1000).toFixed(2)}s`));
            });
          }
          
          console.log(chalk.gray('\n═'.repeat(60)) + '\n');
        } else {
          console.log(chalk.yellow('⚠️  Tool executor not available'));
        }
        break;
        
      case 'workspace':
        if (this.phase4Enabled && this.workspaceContext) {
          const stats = this.workspaceContext.getStats();
          console.log(chalk.cyan('\n📁 Workspace Information:\n'));
          console.log(chalk.gray('═'.repeat(60)));
          console.log(chalk.white(`  Directories: ${stats.directories}`));
          console.log(chalk.white(`  Files: ${stats.files.toLocaleString()}`));
          console.log(chalk.cyan('\n  Workspace Paths:'));
          stats.paths.forEach(p => {
            console.log(chalk.gray(`    ${p}`));
          });
          console.log(chalk.gray('\n═'.repeat(60)) + '\n');
        } else {
          console.log(chalk.yellow('⚠️  Workspace context not available'));
        }
        break;
      
      default:
        console.log(chalk.red(`Unknown command: ${input}`));
        console.log(chalk.gray('Type /help for available commands'));
    }
    
    this.rl.prompt();
  }

  showHelp() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  🚀 Available Commands                ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    console.log(chalk.cyan('📋 Basic Commands:'));
    console.log(chalk.gray('  /help    ') + chalk.white('Show this help message'));
    console.log(chalk.gray('  /clear   ') + chalk.white('Clear the screen'));
    console.log(chalk.gray('  /status  ') + chalk.white('Show system status'));
    console.log(chalk.gray('  /exit    ') + chalk.white('Exit the terminal'));
    console.log('');
    
    console.log(chalk.green('🔍 Analysis Commands:'));
    console.log(chalk.gray('  /analyze ') + chalk.white('Perform intelligent code analysis'));
    console.log(chalk.gray('  /review  ') + chalk.white('AI-powered code review'));
    console.log(chalk.gray('  /security') + chalk.white('Security vulnerability analysis'));
    console.log(chalk.gray('  /optimize') + chalk.white('Performance optimization suggestions'));
    console.log('');
    
    console.log(chalk.blue('🌿 Git Commands:'));
    console.log(chalk.gray('  /git     ') + chalk.white('Show git repository status'));
    console.log(chalk.gray('  /gitstatus') + chalk.white('Beautiful git status display'));
    console.log('');
    
    console.log(chalk.magenta('🎨 Customization:'));
    console.log(chalk.gray('  /theme   ') + chalk.white('Cycle through visual themes'));
    console.log('');
    
    console.log(chalk.yellow('💾 Session Management:'));
    console.log(chalk.gray('  /history ') + chalk.white('Show conversation history'));
    console.log(chalk.gray('  /session ') + chalk.white('Show current session info'));
    console.log(chalk.gray('  /save    ') + chalk.white('Save current session'));
    console.log(chalk.gray('  /watch   ') + chalk.white('Show watched files'));
    console.log(chalk.gray('  /context ') + chalk.white('Show comprehensive context'));
    console.log('');
    
    console.log(chalk.cyan('🚀 Phase 2 Commands:'));
    console.log(chalk.gray('  /tree    ') + chalk.white('Display beautiful file tree'));
    console.log(chalk.gray('  /performance') + chalk.white('Show performance metrics'));
    console.log(chalk.gray('  /compact ') + chalk.white('Force context compaction'));
    console.log('');
    
    console.log(chalk.magenta('🤖 Phase 3 Commands:'));
    console.log(chalk.gray('  /agents  ') + chalk.white('List available AI agents'));
    console.log(chalk.gray('  /search <query>') + chalk.white('Advanced code search'));
    console.log(chalk.gray('  /watch   ') + chalk.white('Toggle real-time file watching'));
    console.log(chalk.gray('  /memory  ') + chalk.white('View conversation memories'));
    console.log(chalk.gray('  /compact-stats') + chalk.white('Show compaction statistics'));
    console.log(chalk.gray('  /ui-test ') + chalk.white('Test interactive UI components'));
    console.log('');
    
    console.log(chalk.blue('⚡ Phase 4 Commands (Qwen Code Architecture):'));
    console.log(chalk.gray('  /turns   ') + chalk.white('Show recent conversation turns'));
    console.log(chalk.gray('  /turnstats') + chalk.white('Show turn statistics'));
    console.log(chalk.gray('  /toolstats') + chalk.white('Show tool execution statistics'));
    console.log(chalk.gray('  /workspace') + chalk.white('Show workspace information'));
    console.log('');
  }

  showStatus() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  System Status                        ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    console.log(chalk.gray('Model:    ') + chalk.white(this.model || 'Default'));
    console.log(chalk.gray('Session:  ') + chalk.white(this.sessionId.slice(0, 8) + '...'));
    console.log(chalk.gray('Directory:') + chalk.white(process.cwd().replace(process.env.HOME, '~')));
    console.log('');
  }

  showHistory() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  Conversation History                 ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray('No conversation history yet.'));
    } else {
      const recent = this.conversationHistory.slice(-5); // Show last 5 exchanges
      recent.forEach((entry, index) => {
        const time = entry.timestamp.toLocaleTimeString();
        console.log(chalk.gray(`[${time}] `) + chalk.white(entry.input.slice(0, 50) + '...'));
        console.log(chalk.gray(`  → Response in ${entry.duration}s`));
        if (index < recent.length - 1) console.log('');
      });
    }
    console.log('');
  }

  showSession() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  Current Session                      ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    const sessionDuration = Math.round((Date.now() - this.currentSession.startTime) / 1000 / 60);
    const lastActivity = Math.round((Date.now() - this.currentSession.lastActivity) / 1000);
    
    console.log(chalk.gray('Session ID:     ') + chalk.white(this.sessionId.slice(0, 8) + '...'));
    console.log(chalk.gray('Duration:       ') + chalk.white(`${sessionDuration} minutes`));
    console.log(chalk.gray('Messages:       ') + chalk.white(this.currentSession.messageCount));
    console.log(chalk.gray('Last Activity:  ') + chalk.white(`${lastActivity}s ago`));
    console.log(chalk.gray('Model:          ') + chalk.white(this.model || 'Default'));
    console.log('');
  }

  smartAutoComplete(line) {
    // Smart autocomplete for commands and context-aware suggestions
    const completions = [];
    
    if (line.startsWith('/')) {
      // Slash command completions
      const commands = ['help', 'clear', 'status', 'history', 'session', 'exit'];
      const matches = commands.filter(cmd => cmd.startsWith(line.slice(1)));
      completions.push(...matches.map(cmd => '/' + cmd));
    } else if (line.startsWith('!')) {
      // Bash command completions
      const bashCommands = ['ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'git', 'npm', 'node'];
      const matches = bashCommands.filter(cmd => cmd.startsWith(line.slice(1)));
      completions.push(...matches.map(cmd => '!' + cmd));
    } else {
      // Context-aware suggestions based on project
      const suggestions = [
        'explain this project structure',
        'help me debug this code',
        'create a README file',
        'optimize this function',
        'add error handling',
        'write unit tests',
        'refactor this code'
      ];
      const matches = suggestions.filter(s => s.toLowerCase().includes(line.toLowerCase()));
      completions.push(...matches);
    }
    
    return [completions, line];
  }

  showWatchedFiles() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  Watched Files                        ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    if (this.watchedFiles && this.watchedFiles.size > 0) {
      this.watchedFiles.forEach(file => {
        console.log(chalk.gray('📁 ') + chalk.white(file));
      });
    } else {
      console.log(chalk.gray('No files being watched.'));
      console.log(chalk.gray('Files will be automatically watched during conversations.'));
    }
    console.log('');
  }

  saveCurrentSession() {
    console.log('');
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  Session Saved                        ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    const sessionData = {
      id: this.sessionId,
      startTime: this.currentSession.startTime,
      history: this.conversationHistory,
      messageCount: this.currentSession.messageCount,
      lastActivity: this.currentSession.lastActivity,
      savedAt: Date.now()
    };
    
    try {
      const sessionsDir = path.join(process.cwd(), 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }
      
      const filename = `session-${this.sessionId}.json`;
      const filepath = path.join(sessionsDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(sessionData, null, 2));
      
      console.log(chalk.white(`Session saved to: ${filename}`));
      console.log(chalk.gray(`${this.conversationHistory.length} messages preserved`));
    } catch (error) {
      console.log(chalk.red(`Failed to save session: ${error.message}`));
    }
    console.log('');
  }

  handleKeyboardShortcuts(key) {
    // Advanced keyboard shortcuts like in modern IDEs
    if (key.name === 'escape') {
      console.log(chalk.magenta('\n✨ Goodbye!'));
      process.exit(0);
    } else if (key.ctrl && key.name === 'l') {
      // Ctrl+L: Clear and restart
      console.clear();
      this.displayWelcome();
    } else if (key.ctrl && key.name === 's') {
      // Ctrl+S: Quick save session
      this.rl.write('\r/save\r');
    } else if (key.ctrl && key.name === 'h') {
      // Ctrl+H: Show help
      this.rl.write('\r/help\r');
    } else if (key.ctrl && key.name === 'u') {
      // Ctrl+U: Show status
      this.rl.write('\r/status\r');
    }
  }

  showSessionSuggestions() {
    try {
      // Check if project exists
      const projectStatus = this.projectManager.getProjectStatus();
      
      if (projectStatus.exists) {
        console.log(chalk.magenta('📂 ') + chalk.white.bold(`Project: ${projectStatus.context.name}`));
        console.log(chalk.gray(`   • Todos: ${projectStatus.todos.pending} pending, ${projectStatus.todos.completed} completed`));
      }
      
      // Check for intelligent auto-resume candidate
      const resumeCandidate = this.projectManager.shouldOfferAutoResume();
      
      if (resumeCandidate) {
        console.log(chalk.magenta('🔄 ') + chalk.white.bold('Resume Previous Session?'));
        console.log(chalk.gray(`   • Session: ${resumeCandidate.id} (${resumeCandidate.activityDescription})`));
        console.log(chalk.gray(`   • Messages: ${resumeCandidate.messageCount} | Model: ${resumeCandidate.model}`));
        
        if (resumeCandidate.lastUserMessage) {
          console.log(chalk.gray(`   • Last: "${resumeCandidate.lastUserMessage}"`));
        }
        
        console.log(chalk.gray('   💡 Type ') + chalk.cyan('/resume') + chalk.gray(' to continue or start fresh'));
        console.log('');
      } else {
        // Get recent sessions if no auto-resume candidate
        const recentSessions = this.projectManager.listSessions({ limit: 3 });
        
        if (recentSessions.length > 0) {
          console.log(chalk.magenta('🕒 ') + chalk.white.bold('Recent Sessions:'));
          recentSessions.forEach((session, index) => {
            const timeAgo = this.getTimeAgo(new Date(session.modified));
            console.log(chalk.gray(`   • ${session.id} - ${timeAgo} (${session.messageCount} messages)`));
          });
          console.log(chalk.gray('   💡 Use ') + chalk.cyan('/resume <id>') + chalk.gray(' to continue a session'));
          console.log('');
        }
      }
      
    } catch (error) {
      // Silently ignore errors in session suggestions
    }
  }

  getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  async handleCommand(command) {
    const [cmd, ...args] = command.slice(1).split(' ');
    const startTime = Date.now();
    
    // Log command execution
    this.logger.debug(`Executing command: ${cmd}`, { args });
    
    try {
      switch (cmd.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;
        
      case 'clear':
        this.clearConversation();
        break;
        
      case 'model':
        await this.switchModel(args[0]);
        break;
        
      case 'stats':
        this.showStats();
        break;
        
      case 'save':
        this.saveSession(args[0]);
        break;
        
      case 'load':
        await this.loadSession(args[0]);
        break;
        
      case 'resume':
        await this.resumeSession(args[0]);
        break;
        
      case 'watch':
        await this.handleWatchCommand(args);
        break;
        
      case 'unwatch':
        await this.handleUnwatchCommand(args);
        break;
        
      case 'files':
        this.showWatchedFiles();
        break;
        
      case 'project':
      case 'context':
        this.showProjectContext();
        break;
        
      case 'analyze':
        await this.analyzeProjectContext();
        console.log(chalk.green('✅ Project context updated'));
        break;
        
      case 'setup':
        await this.runSetup();
        break;
        
      case 'plugins':
        this.showPlugins();
        break;
        
      case 'enable':
        this.enablePlugin(args[0]);
        break;
        
      case 'disable':
        this.disablePlugin(args[0]);
        break;
        
      case 'shortcuts':
      case 'keys':
        this.showKeyboardShortcuts();
        break;
        
      case 'chats':
      case 'conversations':
        await this.handleChatCommand(args);
        break;
        
      case 'branch':
        await this.handleBranchCommand(args);
        break;
        
      case 'switch':
        await this.handleSwitchCommand(args);
        break;
        
      case 'voice':
        await this.handleVoiceCommand(args);
        break;
        
      case 'speak':
        await this.handleSpeakCommand(args);
        break;
        
      case 'record':
        await this.handleRecordCommand(args);
        break;
        
      case 'team':
        await this.handleTeamCommand(args);
        break;
        
      case 'workspace':
        await this.handleWorkspaceCommand(args);
        break;
        
      case 'share':
        await this.handleShareCommand(args);
        break;
        
      case 'collaborate':
        await this.handleCollaborateCommand(args);
        break;
        
      case 'ide':
        await this.handleIDECommand(args);
        break;
        
      case 'open':
        await this.handleOpenCommand(args);
        break;
        
      case 'goto':
        await this.handleGotoCommand(args);
        break;
        
      case 'debug':
        await this.handleDebugCommand(args);
        break;
        
      case 'logs':
        await this.handleLogsCommand(args);
        break;
        
      case 'exit':
      case 'quit':
        await this.cleanup();
        this.rl.close();
        break;
        
      default:
        // Try plugin commands
        const pluginResult = await this.pluginManager.executeCommand(cmd, args, {
          chat: this,
          sessionId: this.sessionId,
          conversationHistory: this.conversationHistory
        });
        
        if (pluginResult.success) {
          console.log(pluginResult.result);
        } else {
          console.log(chalk.red(`❌ Unknown command: /${cmd}`));
          console.log(chalk.gray('Type /help for available commands or /plugins to see plugin commands'));
        }
      }
      
      // Log successful command completion
      const duration = Date.now() - startTime;
      this.logger.logCommand(cmd, args, true, duration);
        
      } catch (error) {
        // Log command failure
        const duration = Date.now() - startTime;
        this.logger.logCommand(cmd, args, false, duration);
        this.logger.error(`Command failed: ${cmd}`, error, { args });
        console.log(chalk.red(`❌ Command error: ${error.message}`));
      }
    }

  addToCommandHistory(command) {
    // Avoid duplicates
    if (this.commandHistory[this.commandHistory.length - 1] !== command) {
      this.commandHistory.push(command);
      // Keep only last 50 commands
      if (this.commandHistory.length > 50) {
        this.commandHistory.shift();
      }
    }
    this.historyIndex = -1;
  }

  showHelp() {
    console.log(chalk.blue('\n📚 Recoder Interactive Chat - Help'));
    console.log(chalk.gray('════════════════════════════════════'));
    console.log('');
    console.log(chalk.yellow('Commands:'));
    console.log(chalk.cyan('  /help') + chalk.gray('           - Show this help message'));
    console.log(chalk.cyan('  /clear') + chalk.gray('          - Clear conversation history'));
    console.log(chalk.cyan('  /context') + chalk.gray('        - 🆕 Show files created/modified in this conversation'));
    console.log(chalk.cyan('  /files') + chalk.gray('          - Same as /context'));
    console.log(chalk.cyan('  /model <name>') + chalk.gray('   - Switch to different model'));
    console.log(chalk.cyan('  /stats') + chalk.gray('          - Show token usage statistics'));
    console.log(chalk.cyan('  /save [name]') + chalk.gray('    - Save current conversation'));
    console.log(chalk.cyan('  /load [name]') + chalk.gray('    - Load saved conversation'));
    console.log(chalk.cyan('  /watch <file>') + chalk.gray('   - Watch file for changes'));
    console.log(chalk.cyan('  /unwatch <file>') + chalk.gray(' - Stop watching file'));
    console.log(chalk.cyan('  /project') + chalk.gray('         - Show project context'));
    console.log(chalk.cyan('  /analyze') + chalk.gray('         - Re-analyze project'));
    console.log(chalk.cyan('  /setup') + chalk.gray('           - Run configuration wizard'));
    console.log(chalk.cyan('  /plugins') + chalk.gray('         - Show available plugins'));
    console.log(chalk.cyan('  /enable <plugin>') + chalk.gray('  - Enable a plugin'));
    console.log(chalk.cyan('  /disable <plugin>') + chalk.gray(' - Disable a plugin'));
    console.log(chalk.cyan('  /shortcuts') + chalk.gray('       - Show keyboard shortcuts'));
    console.log(chalk.cyan('  /chats') + chalk.gray('          - Manage conversations'));
    console.log(chalk.cyan('  /branch [index]') + chalk.gray('  - Branch current conversation'));
    console.log(chalk.cyan('  /switch <id>') + chalk.gray('     - Switch to conversation'));
    console.log(chalk.cyan('  /voice') + chalk.gray('          - Voice controls and settings'));
    console.log(chalk.cyan('  /speak <text>') + chalk.gray('    - Speak text aloud'));
    console.log(chalk.cyan('  /record') + chalk.gray('         - Start/stop voice recording'));
    console.log(chalk.cyan('  /team') + chalk.gray('           - Team collaboration features'));
    console.log(chalk.cyan('  /workspace') + chalk.gray('      - Manage team workspaces'));
    console.log(chalk.cyan('  /share') + chalk.gray('          - Share sessions and files'));
    console.log(chalk.cyan('  /collaborate') + chalk.gray('    - Real-time collaboration'));
    console.log(chalk.cyan('  /ide') + chalk.gray('            - IDE integration controls'));
    console.log(chalk.cyan('  /open <file>') + chalk.gray('     - Open file in IDE'));
    console.log(chalk.cyan('  /goto <file>:<line>') + chalk.gray(' - Go to line in IDE'));
    console.log(chalk.cyan('  /debug') + chalk.gray('           - Debug and logging controls'));
    console.log(chalk.cyan('  /logs') + chalk.gray('            - View and manage logs'));
    console.log(chalk.cyan('  /exit') + chalk.gray('           - Exit the chat'));
    console.log('');
    
    // Show natural language help if available
    if (this.nlProcessor) {
      this.nlProcessor.showHelp();
    }
    
    console.log(chalk.yellow('Chat Features:'));
    console.log(chalk.gray('• 🆕 Smart file tracking - AI remembers files it creates/modifies'));
    console.log(chalk.gray('• Persistent conversation context'));
    console.log(chalk.gray('• File creation and editing capabilities'));
    console.log(chalk.gray('• Shell command execution'));
    console.log(chalk.gray('• Real-time streaming responses'));
    console.log(chalk.gray('• Automatic session saving'));
    console.log(chalk.gray('• Multi-line input support (use ``` to start/end)'));
    console.log(chalk.gray('• File watching and change notifications'));
    console.log(chalk.gray('• Project context awareness and analysis'));
    console.log(chalk.gray('• Extensible plugin system'));
    console.log(chalk.gray('• Command autocompletion (use Tab)'));
    console.log('');
    console.log(chalk.yellow('Keyboard Shortcuts:'));
    console.log(chalk.cyan('  Ctrl+C') + chalk.gray('           - Exit chat'));
    console.log(chalk.cyan('  Ctrl+D') + chalk.gray('           - Exit chat (EOF)'));
    console.log(chalk.cyan('  Ctrl+L') + chalk.gray('           - Clear screen'));
    console.log(chalk.cyan('  Ctrl+R') + chalk.gray('           - Reload plugins & project'));
    console.log(chalk.cyan('  Ctrl+S') + chalk.gray('           - Quick save session'));
    console.log(chalk.cyan('  Ctrl+O') + chalk.gray('           - Show/load sessions'));
    console.log(chalk.cyan('  Ctrl+P') + chalk.gray('           - Show project context'));
    console.log(chalk.cyan('  Ctrl+N') + chalk.gray('           - Clear conversation'));
    console.log(chalk.cyan('  Ctrl+T') + chalk.gray('           - Toggle file watching'));
    console.log(chalk.cyan('  Tab') + chalk.gray('              - Autocomplete commands'));
    console.log('');
  }

  clearConversation() {
    const currentConv = this.getCurrentConversation();
    currentConv.history = [];
    this.conversationHistory = currentConv.history; // Update legacy reference
    console.log(chalk.green('✅ Conversation history cleared'));
  }

  async handleChatCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action || action === 'list') {
      // List all conversations
      const conversations = this.listConversations();
      console.log(chalk.blue('\n💬 All Conversations:'));
      console.log(chalk.gray('══════════════════════════════════════'));
      
      conversations.forEach(conv => {
        const indicator = conv.id === this.currentConversationId ? chalk.green('●') : chalk.gray('○');
        const name = conv.id === this.currentConversationId ? chalk.green(conv.name) : chalk.cyan(conv.name);
        const messages = conv.history.length;
        const lastActive = conv.lastActive.toLocaleString();
        
        console.log(`${indicator} ${name} ${chalk.gray(`(${conv.id})`)} - ${messages} messages`);
        console.log(`   ${chalk.gray(`Model: ${conv.model} | Last active: ${lastActive}`)}`);
      });
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /chats new <name>     - Create new conversation'));
      console.log(chalk.gray('  /chats switch <id>    - Switch to conversation'));
      console.log(chalk.gray('  /chats delete <id>    - Delete conversation'));
      console.log(chalk.gray('  /chats rename <id> <name> - Rename conversation'));
      console.log(chalk.gray('  /branch [index]       - Branch current conversation'));
      console.log(chalk.gray('  /switch <id>          - Quick switch to conversation'));
      return;
    }
    
    switch (action) {
      case 'new':
      case 'create':
        const name = args.slice(1).join(' ') || `Chat ${this.conversationCounter + 1}`;
        const newId = this.createConversation(name);
        console.log(chalk.green(`✅ Created new conversation: ${name} (${newId})`));
        console.log(chalk.gray('Use /switch ' + newId + ' to switch to it'));
        break;
        
      case 'switch':
        const switchId = args[1];
        if (!switchId) {
          console.log(chalk.red('❌ Usage: /chats switch <conversation-id>'));
          return;
        }
        
        if (this.switchConversation(switchId)) {
          const conv = this.getCurrentConversation();
          console.log(chalk.green(`✅ Switched to: ${conv.name}`));
          this.updatePrompt();
          this.rl.setPrompt(this.rl.getPrompt());
        } else {
          console.log(chalk.red(`❌ Conversation not found: ${switchId}`));
        }
        break;
        
      case 'delete':
      case 'remove':
        const deleteId = args[1];
        if (!deleteId) {
          console.log(chalk.red('❌ Usage: /chats delete <conversation-id>'));
          return;
        }
        
        if (this.deleteConversation(deleteId)) {
          console.log(chalk.green(`✅ Deleted conversation: ${deleteId}`));
          if (deleteId === this.currentConversationId) {
            console.log(chalk.yellow('Switched back to main conversation'));
            this.updatePrompt();
            this.rl.setPrompt(this.rl.getPrompt());
          }
        } else {
          console.log(chalk.red(`❌ Cannot delete conversation: ${deleteId}`));
        }
        break;
        
      case 'rename':
        const renameId = args[1];
        const newName = args.slice(2).join(' ');
        if (!renameId || !newName) {
          console.log(chalk.red('❌ Usage: /chats rename <conversation-id> <new-name>'));
          return;
        }
        
        const conversation = this.conversations.get(renameId);
        if (conversation) {
          conversation.name = newName;
          console.log(chalk.green(`✅ Renamed conversation to: ${newName}`));
          if (renameId === this.currentConversationId) {
            this.updatePrompt();
            this.rl.setPrompt(this.rl.getPrompt());
          }
        } else {
          console.log(chalk.red(`❌ Conversation not found: ${renameId}`));
        }
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown chat command: ${action}`));
        console.log(chalk.gray('Use /chats for help'));
    }
  }

  async handleBranchCommand(args) {
    const messageIndex = args[0] ? parseInt(args[0]) - 1 : null;
    const currentConv = this.getCurrentConversation();
    
    if (messageIndex !== null && (isNaN(messageIndex) || messageIndex < 0 || messageIndex >= currentConv.history.length)) {
      console.log(chalk.red(`❌ Invalid message index. Valid range: 1-${currentConv.history.length}`));
      return;
    }
    
    const branchId = this.branchConversation(messageIndex);
    const branchConv = this.conversations.get(branchId);
    
    console.log(chalk.green(`✅ Created branch: ${branchConv.name} (${branchId})`));
    
    if (messageIndex !== null) {
      console.log(chalk.gray(`Branched from message ${messageIndex + 1} with ${branchConv.history.length} messages`));
    } else {
      console.log(chalk.gray(`Branched with full conversation history (${branchConv.history.length} messages)`));
    }
    
    console.log(chalk.gray('Use /switch ' + branchId + ' to switch to the branch'));
  }

  async handleSwitchCommand(args) {
    const conversationId = args[0];
    if (!conversationId) {
      console.log(chalk.red('❌ Usage: /switch <conversation-id>'));
      console.log(chalk.gray('Use /chats to see available conversations'));
      return;
    }
    
    if (this.switchConversation(conversationId)) {
      const conv = this.getCurrentConversation();
      console.log(chalk.green(`✅ Switched to: ${conv.name}`));
      this.updatePrompt();
      this.rl.setPrompt(this.rl.getPrompt());
    } else {
      console.log(chalk.red(`❌ Conversation not found: ${conversationId}`));
    }
  }

  async handleVoiceCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show voice status
      const status = this.voiceManager.getStatus();
      console.log(chalk.blue('\n🎤 Voice Manager Status'));
      console.log(chalk.gray('══════════════════════════'));
      console.log(`Speech-to-Text: ${status.speechToTextEnabled ? chalk.green('enabled') : chalk.red('disabled')}`);
      console.log(`Text-to-Speech: ${status.textToSpeechEnabled ? chalk.green('enabled') : chalk.red('disabled')}`);
      console.log(`Recording: ${status.isRecording ? chalk.yellow('active') : chalk.gray('inactive')}`);
      console.log(`Current Voice: ${chalk.cyan(status.currentVoice)}`);
      console.log(`Language: ${chalk.cyan(status.language)}`);
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /voice status     - Show this status'));
      console.log(chalk.gray('  /voice stt on/off - Enable/disable speech-to-text'));
      console.log(chalk.gray('  /voice tts on/off - Enable/disable text-to-speech'));
      console.log(chalk.gray('  /voice voices     - List available voices'));
      console.log(chalk.gray('  /voice set <name> - Set TTS voice'));
      console.log(chalk.gray('  /record           - Start/stop recording'));
      console.log(chalk.gray('  /speak <text>     - Speak text aloud'));
      return;
    }
    
    switch (action) {
      case 'status':
        await this.handleVoiceCommand([]); // Show status
        break;
        
      case 'stt':
        const sttMode = args[1]?.toLowerCase();
        if (sttMode === 'on') {
          this.voiceManager.enableSpeechToText();
        } else if (sttMode === 'off') {
          this.voiceManager.disableSpeechToText();
        } else {
          console.log(chalk.red('❌ Usage: /voice stt on|off'));
        }
        break;
        
      case 'tts':
        const ttsMode = args[1]?.toLowerCase();
        if (ttsMode === 'on') {
          this.voiceManager.enableTextToSpeech();
        } else if (ttsMode === 'off') {
          this.voiceManager.disableTextToSpeech();
        } else {
          console.log(chalk.red('❌ Usage: /voice tts on|off'));
        }
        break;
        
      case 'voices':
        const voices = this.voiceManager.getAvailableVoices();
        console.log(chalk.blue('\n🎙️ Available Voices:'));
        voices.forEach(voice => {
          const current = voice === this.voiceManager.ttsVoice ? chalk.green('●') : chalk.gray('○');
          console.log(`  ${current} ${voice}`);
        });
        break;
        
      case 'set':
        const voiceName = args.slice(1).join(' ');
        if (!voiceName) {
          console.log(chalk.red('❌ Usage: /voice set <voice-name>'));
          return;
        }
        this.voiceManager.setVoice(voiceName);
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown voice command: ${action}`));
        console.log(chalk.gray('Use /voice for help'));
    }
  }

  async handleSpeakCommand(args) {
    const text = args.join(' ');
    if (!text) {
      console.log(chalk.red('❌ Usage: /speak <text>'));
      return;
    }
    
    await this.voiceManager.speakText(text);
  }

  async handleRecordCommand(args) {
    if (this.voiceManager.isRecording) {
      // Stop recording
      const audioFile = await this.voiceManager.stopRecording();
      if (audioFile) {
        const transcription = await this.voiceManager.transcribeAudio(audioFile);
        if (transcription && transcription !== '[Speech recorded - manual transcription needed]') {
          console.log(chalk.green('📝 Transcribed text:'));
          console.log(chalk.white(transcription));
          
          // Automatically process the transcribed text as input
          console.log(chalk.blue('🤖 Processing voice input...'));
          await this.processInput(transcription);
        }
      }
    } else {
      // Start recording
      if (!this.voiceManager.speechToTextEnabled) {
        console.log(chalk.red('❌ Speech-to-text not enabled. Use /voice stt on'));
        return;
      }
      
      const started = await this.voiceManager.startRecording();
      if (started) {
        console.log(chalk.blue('🎤 Recording... Press Enter or use /record again to stop'));
        
        // Set up a listener for Enter key to stop recording
        const originalOnLine = this.rl.listeners('line')[0];
        const stopRecordingListener = (input) => {
          if (input.trim() === '') {
            this.handleRecordCommand([]);
            this.rl.removeListener('line', stopRecordingListener);
          } else {
            // Process normal input
            originalOnLine(input);
          }
        };
        
        this.rl.on('line', stopRecordingListener);
      }
    }
  }

  async handleTeamCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show team status
      const status = this.collaborationManager.getCollaborationStatus();
      console.log(chalk.blue('\n👥 Team Collaboration Status'));
      console.log(chalk.gray('═══════════════════════════════════'));
      console.log(`Mode: ${status.mode === 'none' ? chalk.gray('individual') : chalk.green(status.mode)}`);
      console.log(`Team Members: ${chalk.cyan(status.teamMembers.length)}`);
      console.log(`Active Workspaces: ${chalk.cyan(status.activeWorkspaces)}`);
      console.log(`Shared Sessions: ${chalk.cyan(status.sharedSessions)}`);
      
      if (status.collaborationId) {
        console.log(`Current Collaboration: ${chalk.green(status.collaborationId)}`);
      }
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /team status          - Show this status'));
      console.log(chalk.gray('  /team invite <user>   - Invite team member'));
      console.log(chalk.gray('  /team remove <user>   - Remove team member'));
      console.log(chalk.gray('  /team members         - List team members'));
      console.log(chalk.gray('  /workspace            - Manage workspaces'));
      console.log(chalk.gray('  /share                - Share sessions/files'));
      console.log(chalk.gray('  /collaborate          - Start collaboration'));
      return;
    }
    
    switch (action) {
      case 'status':
        await this.handleTeamCommand([]); // Show status
        break;
        
      case 'invite':
        const inviteUser = args[1];
        if (!inviteUser) {
          console.log(chalk.red('❌ Usage: /team invite <username>'));
          return;
        }
        this.collaborationManager.addTeamMember(inviteUser);
        break;
        
      case 'remove':
        const removeUser = args[1];
        if (!removeUser) {
          console.log(chalk.red('❌ Usage: /team remove <username>'));
          return;
        }
        this.collaborationManager.removeTeamMember(removeUser);
        break;
        
      case 'members':
        const status = this.collaborationManager.getCollaborationStatus();
        if (status.teamMembers.length === 0) {
          console.log(chalk.yellow('👥 No team members added yet'));
          console.log(chalk.gray('Use /team invite <username> to add members'));
        } else {
          console.log(chalk.blue('\n👥 Team Members:'));
          status.teamMembers.forEach(member => {
            console.log(`  ${chalk.green('●')} ${member}`);
          });
        }
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown team command: ${action}`));
        console.log(chalk.gray('Use /team for help'));
    }
  }

  async handleWorkspaceCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action || action === 'list') {
      // List workspaces
      const workspaces = this.collaborationManager.listTeamWorkspaces();
      
      if (workspaces.length === 0) {
        console.log(chalk.yellow('📁 No team workspaces found'));
        console.log(chalk.gray('Create one with: /workspace create <name>'));
        return;
      }
      
      console.log(chalk.blue('\n📁 Team Workspaces:'));
      console.log(chalk.gray('══════════════════════════════════'));
      
      workspaces.forEach(workspace => {
        console.log(`${chalk.cyan(workspace.name)} ${chalk.gray(`(${workspace.id})`)}`);
        console.log(`   Owner: ${chalk.yellow(workspace.owner)}`);
        console.log(`   Members: ${workspace.members.length}`);
        console.log(`   Created: ${chalk.gray(workspace.created.toLocaleDateString())}`);
        if (workspace.description) {
          console.log(`   ${chalk.gray(workspace.description)}`);
        }
        console.log('');
      });
      
      console.log(chalk.gray('Commands:'));
      console.log(chalk.gray('  /workspace create <name> [description] - Create workspace'));
      console.log(chalk.gray('  /workspace join <id>                   - Join workspace'));
      console.log(chalk.gray('  /workspace settings <id>               - Manage settings'));
      return;
    }
    
    switch (action) {
      case 'create':
        const name = args[1];
        const description = args.slice(2).join(' ');
        
        if (!name) {
          console.log(chalk.red('❌ Usage: /workspace create <name> [description]'));
          return;
        }
        
        await this.collaborationManager.createTeamWorkspace(name, description);
        break;
        
      case 'join':
        const workspaceId = args[1];
        if (!workspaceId) {
          console.log(chalk.red('❌ Usage: /workspace join <workspace-id>'));
          return;
        }
        
        await this.collaborationManager.joinTeamWorkspace(workspaceId);
        break;
        
      case 'settings':
        const settingsId = args[1];
        if (!settingsId) {
          console.log(chalk.red('❌ Usage: /workspace settings <workspace-id>'));
          return;
        }
        
        console.log(chalk.blue(`⚙️  Workspace settings for: ${settingsId}`));
        console.log(chalk.gray('Settings management would be implemented here'));
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown workspace command: ${action}`));
        console.log(chalk.gray('Use /workspace for help'));
    }
  }

  async handleShareCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show sharing options
      console.log(chalk.blue('\n🔗 Sharing Options'));
      console.log(chalk.gray('══════════════════════════'));
      console.log(chalk.gray('  /share session            - Share current session'));
      console.log(chalk.gray('  /share file <path>        - Share a file'));
      console.log(chalk.gray('  /share join <session-id>  - Join shared session'));
      console.log(chalk.gray('  /share list               - List shared items'));
      return;
    }
    
    switch (action) {
      case 'session':
        const sessionData = {
          sessionId: this.sessionId,
          model: this.model,
          conversations: {},
          currentConversationId: this.currentConversationId,
          conversationCounter: this.conversationCounter,
          totalTokens: this.totalTokens,
          requestCount: this.requestCount,
          timestamp: new Date().toISOString()
        };
        
        // Convert conversations for sharing
        for (const [id, conv] of this.conversations) {
          sessionData.conversations[id] = {
            ...conv,
            created: conv.created.toISOString(),
            lastActive: conv.lastActive.toISOString()
          };
        }
        
        const sharedSessionId = await this.collaborationManager.createSharedSession(sessionData);
        console.log(chalk.green(`✅ Session shared! Share this ID: ${chalk.cyan(sharedSessionId)}`));
        console.log(chalk.gray('Team members can join with: /share join ' + sharedSessionId));
        break;
        
      case 'file':
        const filePath = args[1];
        if (!filePath) {
          console.log(chalk.red('❌ Usage: /share file <file-path>'));
          return;
        }
        
        const fileId = await this.collaborationManager.shareFile(filePath);
        if (fileId) {
          console.log(chalk.green(`✅ File shared! File ID: ${chalk.cyan(fileId)}`));
        }
        break;
        
      case 'join':
        const joinSessionId = args[1];
        if (!joinSessionId) {
          console.log(chalk.red('❌ Usage: /share join <session-id>'));
          return;
        }
        
        const joinedSessionData = await this.collaborationManager.joinSharedSession(joinSessionId);
        if (joinedSessionData) {
          console.log(chalk.green('✅ Successfully joined shared session!'));
          console.log(chalk.yellow('🔄 Loading shared conversation data...'));
          
          // Load the shared session data
          if (joinedSessionData.conversations) {
            this.conversations.clear();
            
            for (const [id, convData] of Object.entries(joinedSessionData.conversations)) {
              const conversation = {
                ...convData,
                created: new Date(convData.created),
                lastActive: new Date(convData.lastActive)
              };
              this.conversations.set(id, conversation);
            }
            
            this.currentConversationId = joinedSessionData.currentConversationId || 'main';
            this.conversationCounter = joinedSessionData.conversationCounter || 0;
            
            // Update legacy reference
            const currentConv = this.getCurrentConversation();
            this.conversationHistory = currentConv.history;
            
            console.log(chalk.green(`✅ Loaded ${Object.keys(joinedSessionData.conversations).length} conversations`));
            this.updatePrompt();
          }
        }
        break;
        
      case 'list':
        const sharedSessions = this.collaborationManager.listSharedSessions();
        
        if (sharedSessions.length === 0) {
          console.log(chalk.yellow('📋 No shared sessions found'));
        } else {
          console.log(chalk.blue('\n📋 Shared Sessions:'));
          sharedSessions.forEach(session => {
            console.log(`${chalk.cyan(session.id)} - Owner: ${session.owner}`);
            console.log(`   Created: ${session.created.toLocaleDateString()}`);
            console.log(`   Collaborators: ${session.collaborators.length}`);
          });
        }
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown share command: ${action}`));
        console.log(chalk.gray('Use /share for help'));
    }
  }

  async handleCollaborateCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show collaboration options
      const status = this.collaborationManager.getCollaborationStatus();
      
      console.log(chalk.blue('\n🤝 Collaboration Mode'));
      console.log(chalk.gray('═══════════════════════════'));
      console.log(`Current Mode: ${status.mode === 'none' ? chalk.gray('individual') : chalk.green(status.mode)}`);
      
      if (status.collaborationId) {
        console.log(`Active Session: ${chalk.cyan(status.collaborationId)}`);
        console.log(`Is Host: ${status.isHost ? chalk.green('yes') : chalk.yellow('no')}`);
      }
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /collaborate start        - Start collaboration session'));
      console.log(chalk.gray('  /collaborate join <id>    - Join collaboration session'));
      console.log(chalk.gray('  /collaborate broadcast <msg> - Send message to team'));
      console.log(chalk.gray('  /collaborate stop         - End collaboration'));
      return;
    }
    
    switch (action) {
      case 'start':
        const collaborationId = crypto.randomBytes(6).toString('hex');
        await this.collaborationManager.startCollaboration(collaborationId, 'shared-session');
        console.log(chalk.green(`🤝 Collaboration started!`));
        console.log(chalk.cyan(`Share this ID with team: ${collaborationId}`));
        break;
        
      case 'join':
        const joinId = args[1];
        if (!joinId) {
          console.log(chalk.red('❌ Usage: /collaborate join <collaboration-id>'));
          return;
        }
        
        // Simulate joining a collaboration
        this.collaborationManager.collaborationId = joinId;
        this.collaborationManager.collaborationMode = 'shared-session';
        this.collaborationManager.isHost = false;
        
        console.log(chalk.green(`✅ Joined collaboration: ${joinId}`));
        break;
        
      case 'broadcast':
        const message = args.slice(1).join(' ');
        if (!message) {
          console.log(chalk.red('❌ Usage: /collaborate broadcast <message>'));
          return;
        }
        
        const success = await this.collaborationManager.broadcastMessage(message);
        if (success) {
          console.log(chalk.green('✅ Message broadcasted to team'));
        } else {
          console.log(chalk.red('❌ Not in collaboration mode'));
        }
        break;
        
      case 'stop':
        this.collaborationManager.collaborationId = null;
        this.collaborationManager.collaborationMode = 'none';
        this.collaborationManager.isHost = false;
        console.log(chalk.yellow('🔄 Collaboration ended'));
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown collaborate command: ${action}`));
        console.log(chalk.gray('Use /collaborate for help'));
    }
  }

  async handleIDECommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show IDE integration status
      const context = this.ideIntegration.getCurrentContext();
      console.log(chalk.blue('\n🔧 IDE Integration Status'));
      console.log(chalk.gray('══════════════════════════════════'));
      console.log(`Detected IDE: ${chalk.cyan(context.ide)}`);
      console.log(`Workspace Root: ${chalk.gray(context.workspaceRoot)}`);
      console.log(`Go-to Support: ${context.supportsGoto ? chalk.green('yes') : chalk.red('no')}`);
      console.log(`Debug Support: ${context.supportsDebug ? chalk.green('yes') : chalk.red('no')}`);
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /ide status           - Show this status'));
      console.log(chalk.gray('  /ide setup            - Setup IDE integration'));
      console.log(chalk.gray('  /open <file>          - Open file in IDE'));
      console.log(chalk.gray('  /goto <file>:<line>   - Go to line in file'));
      console.log(chalk.gray('  /ide context          - Show current context'));
      return;
    }
    
    switch (action) {
      case 'status':
        await this.handleIDECommand([]); // Show status
        break;
        
      case 'setup':
        console.log(chalk.blue('🔧 Setting up IDE integration...'));
        await this.ideIntegration.createIDEProjectFiles();
        console.log(chalk.green('✅ IDE setup complete'));
        console.log(chalk.gray('Restart your IDE to see the new configurations'));
        break;
        
      case 'context':
        const context = this.ideIntegration.getCurrentContext();
        console.log(chalk.blue('\n📍 Current IDE Context:'));
        console.log(chalk.gray('════════════════════════════'));
        console.log(`IDE: ${context.ide}`);
        console.log(`Workspace: ${context.workspaceRoot}`);
        console.log(`Working Directory: ${process.cwd()}`);
        
        if (context.settings.vscodeSettings) {
          console.log(chalk.yellow('\nVS Code Settings:'));
          Object.entries(context.settings.vscodeSettings).slice(0, 5).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown IDE command: ${action}`));
        console.log(chalk.gray('Use /ide for help'));
    }
  }

  async handleOpenCommand(args) {
    const filePath = args.join(' ');
    
    if (!filePath) {
      console.log(chalk.red('❌ Usage: /open <file-path>'));
      console.log(chalk.gray('Example: /open src/app.js'));
      return;
    }
    
    const success = await this.ideIntegration.openFileInIDE(filePath);
    if (!success) {
      console.log(chalk.yellow('⚠️  Could not open in IDE, file opened in default editor'));
    }
  }

  async handleGotoCommand(args) {
    const input = args.join(' ');
    
    if (!input) {
      console.log(chalk.red('❌ Usage: /goto <file>:<line>'));
      console.log(chalk.gray('Example: /goto src/app.js:42'));
      return;
    }
    
    // Parse file:line format
    const parts = input.split(':');
    const filePath = parts[0];
    const lineNumber = parts[1] ? parseInt(parts[1]) : null;
    
    if (!filePath) {
      console.log(chalk.red('❌ Invalid format. Use: /goto <file>:<line>'));
      return;
    }
    
    if (lineNumber && isNaN(lineNumber)) {
      console.log(chalk.red('❌ Invalid line number'));
      return;
    }
    
    const context = this.ideIntegration.getCurrentContext();
    if (!context.supportsGoto) {
      console.log(chalk.yellow(`⚠️  Go-to functionality not supported in ${context.ide}`));
      console.log(chalk.gray('Opening file without line navigation...'));
    }
    
    const success = await this.ideIntegration.openFileInIDE(filePath, lineNumber);
    if (!success) {
      console.log(chalk.yellow('⚠️  Could not open in IDE'));
    }
  }

  async handleDebugCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action) {
      // Show debug status
      const metrics = this.logger.getMetrics();
      console.log(chalk.blue('\n🐛 Debug Status'));
      console.log(chalk.gray('═══════════════════════'));
      console.log(`Debug Mode: ${this.logger.debugEnabled ? chalk.green('enabled') : chalk.red('disabled')}`);
      console.log(`Log Level: ${chalk.cyan(this.logger.logLevel)}`);
      console.log(`Session ID: ${chalk.gray(this.logger.sessionId)}`);
      
      console.log('\n📊 Session Metrics:');
      console.log(`API Calls: ${chalk.cyan(metrics.apiCalls)}`);
      console.log(`Tokens Used: ${chalk.cyan(metrics.tokensUsed.toLocaleString())}`);
      console.log(`Commands: ${chalk.cyan(metrics.commandsExecuted)}`);
      console.log(`Errors: ${metrics.errors > 0 ? chalk.red(metrics.errors) : chalk.green(metrics.errors)}`);
      console.log(`Warnings: ${metrics.warnings > 0 ? chalk.yellow(metrics.warnings) : chalk.green(metrics.warnings)}`);
      console.log(`Session Duration: ${chalk.gray(Math.round(metrics.sessionDuration / 1000))}s`);
      
      console.log(chalk.gray('\nCommands:'));
      console.log(chalk.gray('  /debug status         - Show this status'));
      console.log(chalk.gray('  /debug enable         - Enable debug mode'));
      console.log(chalk.gray('  /debug disable        - Disable debug mode'));
      console.log(chalk.gray('  /debug memory         - Show memory usage'));
      console.log(chalk.gray('  /debug export         - Export debug report'));
      console.log(chalk.gray('  /logs                 - Manage log files'));
      return;
    }
    
    switch (action) {
      case 'status':
        await this.handleDebugCommand([]); // Show status
        break;
        
      case 'enable':
        this.logger.debugEnabled = true;
        process.env.RECODER_DEBUG = 'true';
        this.logger.info('Debug mode enabled');
        console.log(chalk.green('✅ Debug mode enabled'));
        break;
        
      case 'disable':
        this.logger.debugEnabled = false;
        process.env.RECODER_DEBUG = 'false';
        this.logger.info('Debug mode disabled');
        console.log(chalk.yellow('⏸️  Debug mode disabled'));
        break;
        
      case 'memory':
        this.logger.logMemoryUsage();
        const memory = process.memoryUsage();
        console.log(chalk.blue('\n💾 Memory Usage:'));
        console.log(`RSS: ${chalk.cyan(Math.round(memory.rss / 1024 / 1024))}MB`);
        console.log(`Heap Total: ${chalk.cyan(Math.round(memory.heapTotal / 1024 / 1024))}MB`);
        console.log(`Heap Used: ${chalk.cyan(Math.round(memory.heapUsed / 1024 / 1024))}MB`);
        console.log(`External: ${chalk.cyan(Math.round(memory.external / 1024 / 1024))}MB`);
        break;
        
      case 'export':
        const format = args[1] || 'json';
        const filepath = this.logger.exportLogs(format);
        if (filepath) {
          console.log(chalk.green(`✅ Debug report exported: ${filepath}`));
        } else {
          console.log(chalk.red('❌ Failed to export debug report'));
        }
        break;
        
      case 'test':
        // Test various log levels
        this.logger.debug('Debug test message', { test: true });
        this.logger.info('Info test message', { test: true });
        this.logger.warn('Warning test message', { test: true });
        this.logger.error('Error test message', null, { test: true });
        console.log(chalk.green('✅ Test messages logged'));
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown debug command: ${action}`));
        console.log(chalk.gray('Use /debug for help'));
    }
  }

  async handleLogsCommand(args) {
    const action = args[0]?.toLowerCase();
    
    if (!action || action === 'list') {
      // List log files
      try {
        const logFiles = fs.readdirSync(this.logger.logDir)
          .filter(file => file.endsWith('.log'))
          .map(file => {
            const filePath = path.join(this.logger.logDir, file);
            const stats = fs.statSync(filePath);
            return {
              name: file,
              size: Math.round(stats.size / 1024),
              modified: stats.mtime.toLocaleDateString()
            };
          })
          .sort((a, b) => b.modified.localeCompare(a.modified));
        
        if (logFiles.length === 0) {
          console.log(chalk.yellow('📝 No log files found'));
          return;
        }
        
        console.log(chalk.blue('\n📋 Log Files:'));
        console.log(chalk.gray('══════════════════════════════'));
        logFiles.forEach(file => {
          console.log(`${chalk.cyan(file.name)} - ${file.size}KB (${file.modified})`);
        });
        
        console.log(chalk.gray('\nCommands:'));
        console.log(chalk.gray('  /logs list            - Show this list'));
        console.log(chalk.gray('  /logs view <file>     - View log file'));
        console.log(chalk.gray('  /logs tail <file>     - Show recent entries'));
        console.log(chalk.gray('  /logs clean           - Clean old logs'));
        console.log(chalk.gray('  /logs export          - Export logs'));
        return;
      } catch (error) {
        console.log(chalk.red(`❌ Error listing logs: ${error.message}`));
        return;
      }
    }
    
    switch (action) {
      case 'view':
        const viewFile = args[1];
        if (!viewFile) {
          console.log(chalk.red('❌ Usage: /logs view <filename>'));
          return;
        }
        
        await this.viewLogFile(viewFile);
        break;
        
      case 'tail':
        const tailFile = args[1];
        const lines = parseInt(args[2]) || 20;
        if (!tailFile) {
          console.log(chalk.red('❌ Usage: /logs tail <filename> [lines]'));
          return;
        }
        
        await this.tailLogFile(tailFile, lines);
        break;
        
      case 'clean':
        const daysToKeep = parseInt(args[1]) || 7;
        this.logger.cleanupOldLogs(daysToKeep);
        console.log(chalk.green(`✅ Cleaned logs older than ${daysToKeep} days`));
        break;
        
      case 'export':
        const exportFormat = args[1] || 'json';
        const exportPath = this.logger.exportLogs(exportFormat);
        if (exportPath) {
          console.log(chalk.green(`✅ Logs exported: ${exportPath}`));
        }
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown logs command: ${action}`));
        console.log(chalk.gray('Use /logs for help'));
    }
  }

  async viewLogFile(filename) {
    const filePath = path.join(this.logger.logDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`❌ Log file not found: ${filename}`));
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').slice(-50); // Show last 50 lines
      
      console.log(chalk.blue(`\n📖 Log File: ${filename} (last 50 lines)`));
      console.log(chalk.gray('═'.repeat(50)));
      
      lines.forEach(line => {
        try {
          const logEntry = JSON.parse(line);
          const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
          const level = logEntry.level.toUpperCase();
          
          let coloredLine;
          switch (logEntry.level) {
            case 'error':
              coloredLine = chalk.red(`[${timestamp}] ${level}: ${logEntry.message}`);
              break;
            case 'warn':
              coloredLine = chalk.yellow(`[${timestamp}] ${level}: ${logEntry.message}`);
              break;
            case 'info':
              coloredLine = chalk.blue(`[${timestamp}] ${level}: ${logEntry.message}`);
              break;
            case 'debug':
              coloredLine = chalk.gray(`[${timestamp}] ${level}: ${logEntry.message}`);
              break;
            default:
              coloredLine = `[${timestamp}] ${level}: ${logEntry.message}`;
          }
          
          console.log(coloredLine);
        } catch (e) {
          // Handle non-JSON lines
          console.log(chalk.gray(line));
        }
      });
    } catch (error) {
      console.log(chalk.red(`❌ Error reading log file: ${error.message}`));
    }
  }

  async tailLogFile(filename, lines) {
    const filePath = path.join(this.logger.logDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`❌ Log file not found: ${filename}`));
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const logLines = content.trim().split('\n').slice(-lines);
      
      console.log(chalk.blue(`\n📖 Log Tail: ${filename} (last ${lines} lines)`));
      console.log(chalk.gray('═'.repeat(30)));
      
      logLines.forEach(line => {
        try {
          const logEntry = JSON.parse(line);
          const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
          console.log(chalk.gray(`[${timestamp}] ${logEntry.level}: ${logEntry.message}`));
        } catch (e) {
          console.log(chalk.gray(line));
        }
      });
    } catch (error) {
      console.log(chalk.red(`❌ Error reading log file: ${error.message}`));
    }
  }

  async switchModel(modelName) {
    if (!modelName) {
      console.log(chalk.yellow('📋 Current model: ') + chalk.cyan(this.model));
      console.log(chalk.gray('Usage: /model <model-name>'));
      console.log(chalk.gray('Popular models: anthropic/claude-3.5-sonnet, openai/gpt-4o, meta-llama/llama-3.1-70b-instruct'));
      return;
    }

    const oldModel = this.model;
    this.model = modelName;
    
    console.log(chalk.green(`✅ Model switched: ${chalk.cyan(oldModel)} → ${chalk.cyan(modelName)}`));
    
    // Add a system message about the model switch
    this.conversationHistory.push({
      role: 'system',
      content: `Model switched from ${oldModel} to ${modelName}. Previous context is maintained.`
    });
  }

  showStats() {
    const currentConv = this.getCurrentConversation();
    
    console.log(chalk.blue('\n📊 Session Statistics'));
    console.log(chalk.gray('═══════════════════════'));
    
    console.log(chalk.yellow('Current Conversation:'));
    console.log(`  Name: ${chalk.cyan(currentConv.name)} ${chalk.gray(`(${currentConv.id})`)}`);
    console.log(`  Model: ${chalk.cyan(currentConv.model)}`);
    console.log(`  Messages: ${chalk.cyan(currentConv.history.length)}`);
    console.log(`  Requests: ${chalk.cyan(currentConv.requests)}`);
    console.log(`  Tokens: ${chalk.cyan(currentConv.tokens.toLocaleString())}`);
    console.log(`  Created: ${chalk.gray(currentConv.created.toLocaleString())}`);
    console.log(`  Last Active: ${chalk.gray(currentConv.lastActive.toLocaleString())}`);
    
    console.log('');
    console.log(chalk.yellow('Session Totals:'));
    console.log(`  Conversations: ${chalk.cyan(this.conversations.size)}`);
    console.log(`  Total Requests: ${chalk.cyan(this.requestCount)}`);
    console.log(`  Total Tokens: ${chalk.cyan(this.totalTokens.toLocaleString())}`);
    console.log(`  Session ID: ${chalk.gray(this.sessionId)}`);
    
    if (this.conversations.size > 1) {
      console.log('');
      console.log(chalk.yellow('All Conversations:'));
      const conversations = this.listConversations();
      conversations.forEach(conv => {
        const indicator = conv.id === this.currentConversationId ? chalk.green('●') : chalk.gray('○');
        console.log(`  ${indicator} ${conv.name} ${chalk.gray(`(${conv.id})`)} - ${conv.history.length} msgs, ${conv.tokens} tokens`);
      });
    }
    
    console.log('');
  }

  saveSession(filename) {
    // Convert conversations Map to object for JSON serialization
    const conversationsObj = {};
    for (const [id, conv] of this.conversations) {
      conversationsObj[id] = {
        ...conv,
        created: conv.created.toISOString(),
        lastActive: conv.lastActive.toISOString()
      };
    }
    
    const sessionData = {
      sessionId: this.sessionId,
      model: this.model,
      conversationHistory: this.conversationHistory, // Legacy field
      conversations: conversationsObj,
      currentConversationId: this.currentConversationId,
      conversationCounter: this.conversationCounter,
      totalTokens: this.totalTokens,
      requestCount: this.requestCount,
      timestamp: new Date().toISOString(),
      metadata: {
        version: '2.0.0', // Updated version for conversation branching
        cwd: process.cwd()
      }
    };

    const sessionFile = filename ? 
      `${filename}.json` : 
      `session-${this.sessionId}.json`;
    
    const sessionPath = path.join(sessionsDir, sessionFile);
    
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
      console.log(chalk.green(`✅ Session saved: ${sessionFile}`));
    } catch (error) {
      console.log(chalk.red(`❌ Error saving session: ${error.message}`));
    }
  }

  async loadSession(filename) {
    if (!filename) {
      // Show available sessions
      const sessions = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      
      if (sessions.length === 0) {
        console.log(chalk.yellow('📝 No saved sessions found'));
        return;
      }

      console.log(chalk.blue('\n📂 Available Sessions:'));
      sessions.forEach(session => {
        console.log(chalk.cyan(`  ${session}`));
      });
      console.log(chalk.gray('\nUsage: /load <session-name>'));
      return;
    }

    const sessionFile = filename.endsWith('.json') ? filename : `${filename}.json`;
    const sessionPath = path.join(sessionsDir, sessionFile);

    try {
      if (!fs.existsSync(sessionPath)) {
        console.log(chalk.red(`❌ Session not found: ${filename}`));
        return;
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      
      // Check if this is a new format session with conversations
      if (sessionData.conversations) {
        // Load new format with multiple conversations
        this.conversations.clear();
        
        for (const [id, convData] of Object.entries(sessionData.conversations)) {
          const conversation = {
            ...convData,
            created: new Date(convData.created),
            lastActive: new Date(convData.lastActive)
          };
          this.conversations.set(id, conversation);
        }
        
        this.currentConversationId = sessionData.currentConversationId || 'main';
        this.conversationCounter = sessionData.conversationCounter || 0;
        
        // Ensure current conversation exists
        if (!this.conversations.has(this.currentConversationId)) {
          this.currentConversationId = 'main';
        }
        
        // Update legacy reference
        const currentConv = this.getCurrentConversation();
        this.conversationHistory = currentConv.history;
        
        console.log(chalk.green(`✅ Session loaded: ${filename}`));
        console.log(chalk.gray(`  Conversations: ${this.conversations.size}`));
        console.log(chalk.gray(`  Current: ${currentConv.name}`));
        console.log(chalk.gray(`  Messages in current: ${currentConv.history.length}`));
        console.log(chalk.gray(`  Total tokens: ${sessionData.totalTokens?.toLocaleString() || 0}`));
        
      } else {
        // Load legacy format - single conversation
        this.conversations.clear();
        
        // Create main conversation from legacy data
        this.conversations.set('main', {
          id: 'main',
          name: 'Main Chat',
          history: sessionData.conversationHistory || [],
          model: sessionData.model || this.model,
          temperature: this.temperature,
          tokens: sessionData.totalTokens || 0,
          requests: sessionData.requestCount || 0,
          created: new Date(),
          lastActive: new Date()
        });
        
        this.currentConversationId = 'main';
        this.conversationCounter = 0;
        this.conversationHistory = sessionData.conversationHistory || [];
        
        console.log(chalk.green(`✅ Legacy session loaded: ${filename}`));
        console.log(chalk.gray(`  Messages: ${this.conversationHistory.length}`));
        console.log(chalk.gray(`  Tokens: ${sessionData.totalTokens?.toLocaleString() || 0}`));
        console.log(chalk.gray(`  Model: ${sessionData.model || this.model}`));
      }
      
      this.totalTokens = sessionData.totalTokens || 0;
      this.requestCount = sessionData.requestCount || 0;
      this.model = sessionData.model || this.model;
      
      // Update prompt to reflect current conversation
      this.updatePrompt();
      
    } catch (error) {
      console.log(chalk.red(`❌ Error loading session: ${error.message}`));
    }
  }

  async resumeSession(sessionId) {
    if (!sessionId) {
      // Try to auto-select the best resume candidate
      const candidate = this.projectManager.shouldOfferAutoResume();
      
      if (candidate) {
        console.log(chalk.cyan(`🔄 Auto-resuming most recent session: ${candidate.id}`));
        sessionId = candidate.id;
      } else {
        // Show available sessions from project manager
        const sessions = this.projectManager.listSessions({ limit: 10 });
        
        if (sessions.length === 0) {
          console.log(chalk.yellow('📝 No saved sessions found'));
          return;
        }

        console.log(chalk.blue('\n📂 Available Sessions:'));
        sessions.forEach(session => {
          const timeAgo = this.getTimeAgo(new Date(session.modified));
          console.log(chalk.cyan(`  ${session.id} - ${timeAgo} (${session.messageCount} messages, ${session.model})`));
        });
        console.log(chalk.gray('\nUsage: /resume <session-id>'));
        return;
      }
    }

    try {
      const sessionData = this.projectManager.loadSession(sessionId);
      
      if (!sessionData) {
        console.log(chalk.red(`❌ Session not found: ${sessionId}`));
        return;
      }

      // Load the session conversation history
      if (sessionData.conversationHistory && sessionData.conversationHistory.length > 0) {
        // Clear current conversation and load the resumed one
        const currentConv = this.getCurrentConversation();
        currentConv.history = [...sessionData.conversationHistory];
        this.conversationHistory = currentConv.history;
        
        // Update model if different
        if (sessionData.currentModel && sessionData.currentModel !== this.model) {
          this.model = sessionData.currentModel;
          currentConv.model = this.model;
        }
        
        console.log(chalk.green(`✅ Session resumed: ${sessionId}`));
        console.log(chalk.gray(`  Messages: ${sessionData.conversationHistory.length}`));
        console.log(chalk.gray(`  Model: ${sessionData.currentModel || 'unknown'}`));
        console.log(chalk.gray(`  Last activity: ${new Date(sessionData.metadata?.lastActivity || sessionData.timestamp).toLocaleString()}`));
        
        // Show recent context
        if (sessionData.conversationHistory.length > 0) {
          const lastUserMessage = [...sessionData.conversationHistory]
            .reverse()
            .find(msg => msg.role === 'user');
          
          if (lastUserMessage) {
            const preview = lastUserMessage.content.length > 100 ? 
              lastUserMessage.content.substring(0, 100) + '...' : 
              lastUserMessage.content;
            console.log(chalk.gray(`  Last message: "${preview}"`));
          }
        }
        
      } else {
        console.log(chalk.yellow(`⚠️  Session ${sessionId} has no conversation history`));
      }
      
      // Update prompt to reflect current conversation
      this.updatePrompt();
      
    } catch (error) {
      console.log(chalk.red(`❌ Error resuming session: ${error.message}`));
    }
  }

  async handleWatchCommand(args) {
    if (args.length === 0) {
      console.log(chalk.yellow('📋 File watching status: ') + 
        (this.fileWatchEnabled ? chalk.green('enabled') : chalk.red('disabled')));
      console.log(chalk.gray('Usage: /watch <filename> or /watch toggle'));
      return;
    }

    const action = args[0];
    
    if (action === 'toggle') {
      this.toggleFileWatch();
      return;
    }

    if (action === 'all') {
      // Watch all files in current directory
      const files = fs.readdirSync('.')
        .filter(f => fs.statSync(f).isFile())
        .filter(f => !f.startsWith('.'));
      
      files.forEach(f => this.addFileToWatch(f));
      console.log(chalk.green(`✅ Now watching ${files.length} files`));
      return;
    }

    const filename = args.join(' ');
    
    if (!fs.existsSync(filename)) {
      console.log(chalk.red(`❌ File not found: ${filename}`));
      return;
    }

    if (this.watchedFiles.has(filename)) {
      console.log(chalk.yellow(`⚠️  Already watching: ${filename}`));
      return;
    }

    this.addFileToWatch(filename);
  }

  async handleUnwatchCommand(args) {
    if (args.length === 0) {
      console.log(chalk.gray('Usage: /unwatch <filename> or /unwatch all'));
      return;
    }

    const action = args[0];
    
    if (action === 'all') {
      const count = this.watchedFiles.size;
      this.watchedFiles.clear();
      console.log(chalk.green(`✅ Stopped watching ${count} files`));
      return;
    }

    const filename = args.join(' ');
    
    if (!this.watchedFiles.has(filename)) {
      console.log(chalk.yellow(`⚠️  Not watching: ${filename}`));
      return;
    }

    this.removeFileFromWatch(filename);
  }

  showWatchedFiles() {
    console.log(chalk.blue('\n👁️  File Watching Status'));
    console.log(chalk.gray('═══════════════════════════'));
    console.log(`Status: ${this.fileWatchEnabled ? chalk.green('enabled') : chalk.red('disabled')}`);
    
    if (this.watchedFiles.size === 0) {
      console.log(chalk.gray('No files being watched specifically.'));
      console.log(chalk.gray('All new files are automatically detected.'));
    } else {
      console.log(chalk.yellow('\nWatched Files:'));
      this.watchedFiles.forEach(file => {
        const exists = fs.existsSync(file);
        console.log(`  ${exists ? chalk.green('✓') : chalk.red('✗')} ${file}`);
      });
    }
    console.log('');
  }

  showProjectContext() {
    const { packageJson, gitInfo, languages, frameworks, lastAnalyzed } = this.projectContext;
    
    console.log(chalk.blue('\n🏗️  Project Context'));
    console.log(chalk.gray('═══════════════════════'));
    
    // Basic project info
    if (packageJson) {
      console.log(chalk.yellow('Project:'));
      console.log(`  Name: ${chalk.cyan(packageJson.name || 'Unknown')}`);
      console.log(`  Version: ${chalk.cyan(packageJson.version || 'Unknown')}`);
      if (packageJson.description) {
        console.log(`  Description: ${chalk.gray(packageJson.description)}`);
      }
      console.log('');
    }

    // Git info
    if (gitInfo?.isGitRepo) {
      console.log(chalk.yellow('Git Repository:'));
      console.log(`  Branch: ${chalk.cyan(gitInfo.branch || 'Unknown')}`);
      if (gitInfo.remoteUrl) {
        console.log(`  Remote: ${chalk.gray(gitInfo.remoteUrl)}`);
      }
      if (gitInfo.lastCommit) {
        console.log(`  Last Commit: ${chalk.gray(gitInfo.lastCommit)}`);
      }
      console.log('');
    }

    // Languages
    if (languages.size > 0) {
      console.log(chalk.yellow('Languages:'));
      console.log(`  ${Array.from(languages).map(l => chalk.cyan(l)).join(', ')}`);
      console.log('');
    }

    // Frameworks
    if (frameworks.size > 0) {
      console.log(chalk.yellow('Frameworks:'));
      console.log(`  ${Array.from(frameworks).map(f => chalk.cyan(f)).join(', ')}`);
      console.log('');
    }

    // Dependencies
    if (packageJson?.dependencies?.length > 0) {
      console.log(chalk.yellow('Key Dependencies:'));
      const keyDeps = packageJson.dependencies.slice(0, 10);
      console.log(`  ${keyDeps.map(d => chalk.gray(d)).join(', ')}`);
      if (packageJson.dependencies.length > 10) {
        console.log(chalk.gray(`  ... and ${packageJson.dependencies.length - 10} more`));
      }
      console.log('');
    }

    // Scripts
    if (packageJson?.scripts?.length > 0) {
      console.log(chalk.yellow('Available Scripts:'));
      packageJson.scripts.forEach(script => {
        console.log(`  ${chalk.cyan(script)}`);
      });
      console.log('');
    }

    console.log(chalk.gray(`Last analyzed: ${lastAnalyzed ? new Date(lastAnalyzed).toLocaleString() : 'Never'}`));
    console.log('');
  }

  async runSetup() {
    console.log(chalk.blue('\n⚙️  Configuration Setup'));
    console.log(chalk.gray('═══════════════════════════'));
    console.log(chalk.yellow('Starting enhanced setup wizard...'));
    console.log('');
    
    try {
      const SetupWizard = require('./enhanced-setup.js');
      const wizard = new SetupWizard();
      await wizard.run();
      
      // After setup, we might need to restart or reload config
      console.log(chalk.yellow('\n🔄 Configuration updated. Please restart Recoder to apply changes.'));
      
    } catch (error) {
      console.log(chalk.red(`❌ Setup failed: ${error.message}`));
    }
  }

  showPlugins() {
    const plugins = this.pluginManager.getPluginInfo();
    
    console.log(chalk.blue('\n🔌 Available Plugins'));
    console.log(chalk.gray('═════════════════════'));
    
    if (plugins.length === 0) {
      console.log(chalk.yellow('No plugins found.'));
      console.log(chalk.gray('Add plugins to the plugins/ directory.'));
      return;
    }

    plugins.forEach(plugin => {
      const status = plugin.enabled ? chalk.green('✅ enabled') : chalk.red('❌ disabled');
      console.log(`${chalk.cyan(plugin.name)} v${plugin.version} - ${status}`);
      console.log(`  ${chalk.gray(plugin.description)}`);
      if (plugin.author) {
        console.log(`  ${chalk.gray(`by ${plugin.author}`)}`);
      }
      if (plugin.commands.length > 0) {
        console.log(`  Commands: ${plugin.commands.map(c => chalk.yellow(`/${c}`)).join(', ')}`);
      }
      console.log('');
    });
  }

  enablePlugin(pluginName) {
    if (!pluginName) {
      console.log(chalk.yellow('Usage: /enable <plugin-name>'));
      return;
    }

    if (this.pluginManager.enablePlugin(pluginName)) {
      console.log(chalk.green(`✅ Plugin "${pluginName}" enabled`));
    } else {
      console.log(chalk.red(`❌ Plugin "${pluginName}" not found`));
    }
  }

  disablePlugin(pluginName) {
    if (!pluginName) {
      console.log(chalk.yellow('Usage: /disable <plugin-name>'));
      return;
    }

    if (this.pluginManager.disablePlugin(pluginName)) {
      console.log(chalk.green(`✅ Plugin "${pluginName}" disabled`));
    } else {
      console.log(chalk.red(`❌ Plugin "${pluginName}" not found`));
    }
  }

  showKeyboardShortcuts() {
    console.log(chalk.blue('\n⌨️  Keyboard Shortcuts Reference'));
    console.log(chalk.gray('═════════════════════════════════════'));
    console.log('');
    console.log(chalk.yellow('Navigation & Control:'));
    console.log(chalk.cyan('  Ctrl+C') + chalk.gray('           - Exit chat'));
    console.log(chalk.cyan('  Ctrl+D') + chalk.gray('           - Exit chat (EOF)'));
    console.log(chalk.cyan('  Ctrl+L') + chalk.gray('           - Clear screen & show welcome'));
    console.log(chalk.cyan('  Tab') + chalk.gray('              - Autocomplete commands/files/models'));
    console.log(chalk.cyan('  Up/Down') + chalk.gray('          - Navigate command history'));
    console.log('');
    console.log(chalk.yellow('Quick Actions:'));
    console.log(chalk.cyan('  Ctrl+S') + chalk.gray('           - Quick save current session'));
    console.log(chalk.cyan('  Ctrl+O') + chalk.gray('           - Show available sessions'));
    console.log(chalk.cyan('  Ctrl+N') + chalk.gray('           - Clear conversation history'));
    console.log(chalk.cyan('  Ctrl+P') + chalk.gray('           - Show project context'));
    console.log(chalk.cyan('  Ctrl+R') + chalk.gray('           - Reload plugins & analyze project'));
    console.log(chalk.cyan('  Ctrl+T') + chalk.gray('           - Toggle file watching on/off'));
    console.log('');
    console.log(chalk.yellow('Tips:'));
    console.log(chalk.gray('• Use Tab for command completion'));
    console.log(chalk.gray('• Type ``` for multi-line input mode'));
    console.log(chalk.gray('• All shortcuts work in real-time'));
    console.log(chalk.gray('• File watching shows live changes'));
    console.log('');
  }

  async processInput(userInput) {
    // Check if this is a slash command
    if (userInput.trim().startsWith('/') && this.slashCommands) {
      try {
        console.log(chalk.blue('\n🤖 Executing slash command...'));
        const result = await this.slashCommands.executeCommand(userInput.trim());
        if (result) {
          console.log('\n✅ Command completed successfully');
        }
        this.rl.prompt();
        return;
      } catch (error) {
        console.log(chalk.red(`❌ Slash command error: ${error.message}`));
        console.log(chalk.gray('Use /help for available commands'));
        this.rl.prompt();
        return;
      }
    }

    // Check for natural language commands
    if (this.nlProcessor) {
      try {
        const nlResult = await this.nlProcessor.processInput(userInput);
        if (nlResult && nlResult.executed) {
          // Natural language command was executed, don't pass to AI
          console.log(chalk.green('\n✅ Natural language command completed'));
          this.rl.prompt();
          return;
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Natural language processing error: ${error.message}`));
        // Continue to normal AI processing
      }
    }

    // Auto-select best model if model manager is available
    if (this.modelManager && this.contextAwareModelSelection) {
      try {
        const taskType = this.inferTaskType(userInput);
        const context = this.buildEnhancedContext(userInput);
        
        const bestModel = await this.modelManager.autoSwitchModel(taskType, context);
        if (bestModel && bestModel !== this.model) {
          const currentConv = this.getCurrentConversation();
          const modelInfo = this.modelManager.models.get(bestModel);
          
          currentConv.model = bestModel;
          this.model = bestModel; // Update global model too
          
          console.log(chalk.blue(`🎯 Auto-switched to ${modelInfo?.name || bestModel} for ${taskType} task`));
          
          // Track model switch for analytics
          this.trackModelUsage({
            modelId: bestModel,
            switchReason: taskType,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Model auto-selection failed: ${error.message}`));
      }
    }

    // Apply project rules to context if available
    let enhancedUserInput = userInput;
    if (this.rulesEngine) {
      try {
        const rulesContext = this.rulesEngine.generateAIPromptContext();
        if (rulesContext) {
          enhancedUserInput = `${userInput}\n\n${rulesContext}`;
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Rules context generation failed: ${error.message}`));
      }
    }

    // Process message through plugins first
    const pluginSuggestions = await this.pluginManager.processMessage(userInput, {
      chat: this,
      sessionId: this.sessionId
    });

    // Show plugin suggestions
    pluginSuggestions.forEach(({ plugin, result }) => {
      if (result) {
        console.log(chalk.magenta(`${result}`));
      }
    });

    // Add user message to current conversation
    const currentConv = this.getCurrentConversation();
    currentConv.history.push({
      role: 'user',
      content: userInput
    });
    currentConv.lastActive = new Date();
    
    // PHASE 3: Apply conversation compaction if needed
    if (this.conversationCompactor && this.conversationCompactor.shouldCompact(currentConv.history)) {
      try {
        currentConv.history = await this.conversationCompactor.compactMessages(
          currentConv.history,
          this.openai
        );
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Compaction skipped: ${error.message}`));
      }
    }
    
    // Update legacy reference
    this.conversationHistory = currentConv.history;

    console.log(chalk.magenta('\n🤖 ') + chalk.white.bold('Recoder: '), { end: '' });

    try {
      // Start API call timer
      this.logger.startTimer('api_call');
      
      // Call OpenRouter with current conversation, using conversation-specific model
      const response = await this.callOpenRouter(currentConv.history, currentConv.model, currentConv.temperature);
      
      if (response && response.choices && response.choices[0]) {
        const assistantMessage = response.choices[0].message.content;
        
        // Add assistant response to current conversation
        currentConv.history.push({
          role: 'assistant',
          content: assistantMessage
        });

        console.log(chalk.white(assistantMessage));
        
        // Only speak if user specifically requested it
        if (this.shouldSpeak || userInput.toLowerCase().includes('speak') || userInput.toLowerCase().includes('read loud')) {
          if (this.voiceManager.textToSpeechEnabled) {
            console.log(chalk.gray('🔊 Speaking response...'));
            this.voiceManager.speakText(assistantMessage).catch(err => {
              // Ignore TTS errors to not interrupt the conversation
            });
          }
          this.shouldSpeak = false; // Reset flag
        }
        
        // Update conversation-specific stats
        if (response.usage) {
          currentConv.tokens += response.usage.total_tokens || 0;
          this.totalTokens += response.usage.total_tokens || 0;
          console.log(chalk.gray(`\n💎 ${response.usage.prompt_tokens} + ${response.usage.completion_tokens} = `) + chalk.magenta(`${response.usage.total_tokens} tokens`));
          
          // Log API call metrics
          const apiDuration = this.logger.endTimer('api_call');
          this.logger.logAPICall(
            'chat/completions',
            currentConv.model,
            response.usage.total_tokens,
            apiDuration,
            true
          );
        }
        
        currentConv.requests++;
        this.requestCount++;
        
      } else {
        console.log(chalk.red('❌ No response received'));
      }
      
    } catch (error) {
      // Log API error
      const apiDuration = this.logger.endTimer('api_call');
      this.logger.logAPICall(
        'chat/completions',
        currentConv.model,
        0,
        apiDuration,
        false
      );
      
      this.logger.error('API call failed', error, {
        model: currentConv.model,
        conversationId: this.currentConversationId,
        messageCount: currentConv.history.length
      });
      
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    console.log('');
  }

  generateProjectContextString() {
    const { packageJson, gitInfo, languages, frameworks } = this.projectContext;
    let context = '\nPROJECT CONTEXT:\n';
    
    if (packageJson) {
      context += `Project: ${packageJson.name} v${packageJson.version}\n`;
      if (packageJson.description) {
        context += `Description: ${packageJson.description}\n`;
      }
      
      if (packageJson.dependencies.length > 0) {
        context += `Dependencies: ${packageJson.dependencies.slice(0, 8).join(', ')}${packageJson.dependencies.length > 8 ? '...' : ''}\n`;
      }
      
      if (packageJson.scripts.length > 0) {
        context += `Scripts: ${packageJson.scripts.join(', ')}\n`;
      }
    }
    
    if (gitInfo?.isGitRepo) {
      context += `Git branch: ${gitInfo.branch}\n`;
      if (gitInfo.lastCommit) {
        context += `Last commit: ${gitInfo.lastCommit}\n`;
      }
    }
    
    if (languages.size > 0) {
      context += `Languages: ${Array.from(languages).join(', ')}\n`;
    }
    
    if (frameworks.size > 0) {
      context += `Frameworks: ${Array.from(frameworks).join(', ')}\n`;
    }
    
    // Add file structure overview
    const fileStructureOverview = this.generateFileStructureOverview();
    if (fileStructureOverview) {
      context += `\nFile Structure:\n${fileStructureOverview}`;
    }
    
    return context;
  }

  generateFileStructureOverview() {
    if (!this.projectContext.fileStructure) return '';
    
    const structure = this.projectContext.fileStructure;
    let overview = '';
    
    const traverse = (items, prefix = '') => {
      const entries = Object.entries(items).slice(0, 20); // Limit to avoid too much context
      entries.forEach(([name, item], index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        overview += `${prefix}${connector}${name}\n`;
        
        if (item.type === 'directory' && item.children && Object.keys(item.children).length > 0) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          traverse(item.children, newPrefix);
        }
      });
    };
    
    traverse(structure);
    return overview;
  }

  async executeToolCall(toolCall) {
    // PHASE 4: Use new ToolExecutor if available
    if (this.phase4Enabled && this.toolExecutor) {
      return await this.toolExecutor.executeToolCall(toolCall);
    }
    
    // FALLBACK: Legacy tool execution
    const { name, arguments: args } = toolCall.function;
    
    try {
      const parsedArgs = JSON.parse(args);
      
      switch (name) {
        case 'str_replace_editor':
          return await this.handleFileOperation(parsedArgs);
        case 'bash':
          return await this.handleBashCommand(parsedArgs);
        case 'web_fetch':
          return await this.handleWebFetch(parsedArgs);
        case 'codebase_search':
          return await this.handleCodebaseSearch(parsedArgs);
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Error executing ${name}: ${error.message}`;
    }
  }

  async handleFileOperation(args) {
    const { command, path: filePath, old_str, new_str, view_range, file_text } = args;
    
    // PHASE 2: Start performance timer
    const operationId = `file-${command}-${Date.now()}`;
    if (this.performanceMonitor) {
      this.performanceMonitor.startTimer(operationId);
    }
    
    try {
      switch (command) {
        case 'view':
          if (!fs.existsSync(filePath)) {
            return `File not found: ${filePath}`;
          }
          
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          
          // Track file view in context manager
          if (this.contextManager) {
            this.contextManager.trackFileOperation('view', filePath, content);
          }
          
          // PHASE 2: Record performance
          if (this.performanceMonitor) {
            const timing = this.performanceMonitor.endTimer(operationId);
            if (timing) {
              this.performanceMonitor.recordFileOperation('view', filePath, timing.duration);
            }
          }
          
          if (view_range && view_range.length === 2) {
            const [start, end] = view_range;
            const selectedLines = lines.slice(start - 1, end);
            return selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
          }
          
          return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
          
        case 'create':
          if (fs.existsSync(filePath)) {
            return `File already exists: ${filePath}`;
          }
          
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            
            // PHASE 1: Track folder creation
            if (this.phase1Systems && this.phase1Systems.folderHierarchy) {
              this.phase1Systems.folderHierarchy.trackCreation(dir);
            }
          }
          
          const createContent = file_text || new_str || '';
          fs.writeFileSync(filePath, createContent);
          
          // Track file creation in OLD context manager
          if (this.contextManager) {
            this.contextManager.trackFileOperation('create', filePath, createContent);
          }
          
          // PHASE 1: Refresh file tree
          if (this.phase1Systems && this.phase1Systems.fileTreeManager) {
            // Trigger incremental update (async, don't wait)
            this.phase1Systems.fileTreeManager.refresh().catch(() => {});
          }
          
          // PHASE 2: Record performance and display with UI enhancements
          if (this.performanceMonitor) {
            const timing = this.performanceMonitor.endTimer(operationId);
            if (timing) {
              this.performanceMonitor.recordFileOperation('create', filePath, timing.duration);
            }
          }
          
          // Display with PHASE 2 UI or fallback to old formatter
          if (this.uiEnhancements) {
            const fileSize = Buffer.byteLength(createContent, 'utf8');
            this.uiEnhancements.displaySuccess(
              `Created file: ${filePath}`,
              `${createContent.split('\n').length} lines, ${(fileSize / 1024).toFixed(1)} KB`
            );
          } else if (this.outputFormatter) {
            this.outputFormatter.formatFileOperation('create', filePath, {
              lineCount: createContent.split('\n').length,
              preview: createContent
            });
          } else {
            console.log(chalk.green(`✅ Created file: ${filePath}`));
          }
          
          return `Created file: ${filePath}`;
          
        case 'str_replace':
          if (!fs.existsSync(filePath)) {
            return `File not found: ${filePath}`;
          }
          
          let fileContent = fs.readFileSync(filePath, 'utf8');
          const originalContent = fileContent;
          
          if (!fileContent.includes(old_str)) {
            return `String not found in file: ${old_str}`;
          }
          
          fileContent = fileContent.replace(old_str, new_str);
          fs.writeFileSync(filePath, fileContent);
          
          // Track file modification in context manager
          if (this.contextManager) {
            this.contextManager.trackFileOperation('edit', filePath, fileContent, {
              oldContent: originalContent,
              linesChanged: Math.abs(fileContent.split('\n').length - originalContent.split('\n').length)
            });
          }
          
          // Display with enhanced formatter
          if (this.outputFormatter) {
            const added = fileContent.split('\n').length - originalContent.split('\n').length;
            this.outputFormatter.formatFileOperation('edit', filePath, {
              lineCount: fileContent.split('\n').length,
              changes: {
                added: added > 0 ? added : 0,
                removed: added < 0 ? Math.abs(added) : 0
              }
            });
          } else {
            console.log(chalk.green(`✅ Updated file: ${filePath}`));
          }
          
          return `Updated file: ${filePath}`;
          
        default:
          return `Unknown file operation: ${command}`;
      }
    } catch (error) {
      return `File operation error: ${error.message}`;
    }
  }

  async handleBashCommand(args) {
    const { command } = args;
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr, exitCode } = await execAsync(command, { 
        maxBuffer: 1024 * 1024,
        cwd: process.cwd()
      }).catch(err => ({
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1
      }));
      
      const actualExitCode = exitCode || 0;
      let result = '';
      if (stdout) result += `STDOUT:\n${stdout}`;
      if (stderr) result += `${result ? '\n' : ''}STDERR:\n${stderr}`;
      
      // Track command in context manager
      if (this.contextManager) {
        this.contextManager.trackCommand(command, result, actualExitCode);
      }
      
      // Display with enhanced formatter
      if (this.outputFormatter) {
        this.outputFormatter.formatCommandExecution(command, result, actualExitCode);
      } else {
        console.log(chalk.gray(`🔧 Executed: ${command}`));
      }
      
      return result || 'Command executed successfully (no output)';
    } catch (error) {
      // Track failed command
      if (this.contextManager) {
        this.contextManager.trackCommand(command, error.message, 1);
      }
      return `Bash error: ${error.message}`;
    }
  }

  async handleCodebaseSearch(args) {
    const { query, file_pattern = '*', search_type = 'content', context_lines = 3 } = args;
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      console.log(chalk.blue(`🔍 Searching codebase: "${query}"`));
      
      let results = [];
      
      switch (search_type) {
        case 'content':
          // Use ripgrep for fast content search
          try {
            const rgCommand = `rg -n -C ${context_lines} --type-not binary "${query}" ${file_pattern}`;
            const { stdout } = await execAsync(rgCommand, { 
              maxBuffer: 5 * 1024 * 1024, // 5MB buffer
              cwd: process.cwd()
            });
            
            if (stdout) {
              results.push(`Content search results for "${query}":\n${stdout}`);
            } else {
              results.push(`No content matches found for "${query}"`);
            }
          } catch (error) {
            // Fallback to grep if ripgrep not available
            try {
              const grepCommand = `find . -name "${file_pattern}" -type f -exec grep -n -C ${context_lines} "${query}" {} +`;
              const { stdout } = await execAsync(grepCommand, {
                maxBuffer: 5 * 1024 * 1024,
                cwd: process.cwd()
              });
              results.push(stdout || `No content matches found for "${query}"`);
            } catch (grepError) {
              results.push(`Search error: ${grepError.message}`);
            }
          }
          break;
          
        case 'filename':
          try {
            const findCommand = `find . -name "*${query}*" -type f | head -50`;
            const { stdout } = await execAsync(findCommand, { cwd: process.cwd() });
            results.push(stdout || `No files found matching "${query}"`);
          } catch (error) {
            results.push(`Filename search error: ${error.message}`);
          }
          break;
          
        case 'structure':
          try {
            // Analyze project structure
            const treeCommand = `find . -type f -name "${file_pattern}" | head -100 | sort`;
            const { stdout } = await execAsync(treeCommand, { cwd: process.cwd() });
            
            // Get file stats
            const wcCommand = `find . -name "${file_pattern}" -type f -exec wc -l {} + | tail -1`;
            const { stdout: wcOut } = await execAsync(wcCommand, { cwd: process.cwd() }).catch(() => ({stdout: ''}));
            
            results.push(`Project structure analysis:\n${stdout}\n\nFile statistics:\n${wcOut}`);
          } catch (error) {
            results.push(`Structure analysis error: ${error.message}`);
          }
          break;
      }
      
      return results.join('\n').substring(0, 8000) + (results.join('\n').length > 8000 ? '\n...[truncated]' : '');
      
    } catch (error) {
      return `Codebase search error: ${error.message}`;
    }
  }

  async handleWebFetch(args) {
    const { url, extract_text = true } = args;
    
    try {
      const https = require('https');
      const http = require('http');
      
      console.log(chalk.blue(`🌐 Fetching: ${url}`));
      
      return new Promise((resolve, reject) => {
        const client = url.startsWith('https://') ? https : http;
        
        const request = client.get(url, {
          headers: {
            'User-Agent': 'RecorderCode/1.0 (Educational AI Assistant)'
          },
          timeout: 10000
        }, (response) => {
          let data = '';
          
          response.on('data', (chunk) => {
            data += chunk;
          });
          
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              if (extract_text) {
                // Simple text extraction - remove HTML tags and extra whitespace
                const text = data
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                  .replace(/<[^>]+>/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                resolve(text.substring(0, 5000) + (text.length > 5000 ? '...' : ''));
              } else {
                resolve(data.substring(0, 5000) + (data.length > 5000 ? '...' : ''));
              }
            } else {
              resolve(`HTTP Error: ${response.statusCode} ${response.statusMessage}`);
            }
          });
        });
        
        request.on('error', (error) => {
          resolve(`Fetch error: ${error.message}`);
        });
        
        request.on('timeout', () => {
          request.destroy();
          resolve('Fetch error: Request timeout');
        });
      });
      
    } catch (error) {
      return `Web fetch error: ${error.message}`;
    }
  }

  async callOpenRouter(messages, model = null, temperature = null) {
    try {
      // PHASE 2: Start performance timing
      if (this.performanceMonitor) {
        this.performanceMonitor.startTimer('api-call');
        this.performanceMonitor.startTimer('context-build');
      }
      
      const projectInfo = this.generateProjectContextString();
      
      // OLD: Basic conversation context
      const conversationContext = this.contextManager ? this.contextManager.buildContextForAI() : '';
      
      // PHASE 1: Get comprehensive context from Phase 1 systems
      let phase1Context = '';
      if (this.phase1Systems && this.phase1Enabled) {
        try {
          const contextData = await this.phase1Systems.contextBuilder.buildContext();
          phase1Context = this.phase1Systems.contextBuilder.formatForAI(contextData);
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Phase 1 context building failed: ${error.message}`));
        }
      }
      
      // PHASE 2: Record context build time
      if (this.performanceMonitor) {
        const contextTiming = this.performanceMonitor.endTimer('context-build');
        if (contextTiming) {
          const contextTokens = this.contextCompaction ? 
            this.contextCompaction.estimateTokens(phase1Context || conversationContext) : 0;
          this.performanceMonitor.recordContextBuild(contextTokens, contextTiming.duration);
        }
      }
      
      // PHASE 2: Auto-compact context if needed
      let finalContext = phase1Context || (conversationContext ? '\n---\n' + conversationContext + '\n---\n' : '');
      if (this.contextCompaction && this.phase2Enabled) {
        const compactionResult = await this.contextCompaction.autoCompact(
          finalContext,
          messages,
          this.phase1Systems ? this.phase1Systems.MessageParts : null
        );
        
        if (compactionResult.compacted) {
          finalContext = compactionResult.context;
          messages = compactionResult.messages;
          
          // Display compaction info
          if (this.uiEnhancements) {
            this.uiEnhancements.displayWarning(
              'Context auto-compacted',
              `Saved ${compactionResult.stats.saved.toLocaleString()} tokens`
            );
          } else {
            console.log(chalk.yellow(`⚠️  Context compacted: saved ${compactionResult.stats.saved} tokens`));
          }
        }
      }
      
      const systemMessage = {
        role: 'system',
        content: `You are Recoder Code, a powerful AI assistant that can help users with software development tasks. You have access to tools that allow you to:

1. View, create, and edit files using the str_replace_editor tool
2. Execute bash commands using the bash tool
3. Search codebase using codebase_search tool
4. Fetch web content using web_fetch tool

IMPORTANT: When users request complex tasks (like "build an app", "create a project", etc.), you MUST:
1. First say "Let me create a todo list to track this implementation:"
2. Present a clear, numbered todo list breaking down the task into specific steps
3. Say "Now let's start with the first task:"
4. Work through each todo item systematically
5. Mark each task as completed when finished

Example response format:
"I'll help you build a blog app! Let me create a todo list to track this implementation:

📝 Todo List:
1. Set up Next.js project structure
2. Install required dependencies (tailwindcss, etc.)
3. Create basic layout components
4. Implement blog post listing page
5. Add individual blog post pages
6. Set up content management
7. Add styling and responsive design
8. Test the application

Now let's start with the first task: setting up the Next.js project structure."

You are in an interactive chat session. The user can ask you to build projects, write code, debug issues, or any other development tasks. Always be thorough and create complete, working solutions.

For complex tasks, always create a todo list first, then work through each step systematically.

CRITICAL: REMEMBER ALL FILES YOU CREATE OR MODIFY IN THIS CONVERSATION.
When the user asks about files you created, you MUST refer to the comprehensive context below.

Current working directory: ${process.cwd()}

${projectInfo}

${finalContext}`
      };

      const payload = {
        model: model || this.model,
        messages: [systemMessage, ...messages],
        max_tokens: this.maxTokens,
        temperature: temperature || this.temperature,
        tools: config.tools,
        tool_choice: 'auto'
      };

      // Add OpenRouter provider preferences
      if (config.providerPreferences) {
        payload.provider = {
          sort: config.providerPreferences.sort,
          allow_fallbacks: config.providerPreferences.allowFallbacks,
          data_collection: config.providerPreferences.dataCollection
        };

        if (config.providerPreferences.quantizations) {
          payload.provider.quantizations = config.providerPreferences.quantizations;
        }

        if (config.providerPreferences.maxPrice) {
          payload.provider.max_price = config.providerPreferences.maxPrice;
        }
      }

      const response = await this.openai.chat.completions.create(payload);
      
      // PHASE 2: Record API call performance
      if (this.performanceMonitor) {
        const apiTiming = this.performanceMonitor.endTimer('api-call');
        if (apiTiming && response.usage) {
          // Estimate cost (rough: $0.01 per 1k tokens for most models)
          const costPerToken = 0.00001;
          const estimatedCost = response.usage.total_tokens * costPerToken;
          
          this.performanceMonitor.recordAPICall(
            model || this.model,
            response.usage.total_tokens,
            apiTiming.duration,
            estimatedCost
          );
        }
      }
      
      // Handle tool calls if present
      if (response.choices[0].message.tool_calls) {
        console.log(chalk.yellow('🔧 AI is using tools...'));
        
        // Add assistant message with tool calls to history
        const assistantMessage = response.choices[0].message;
        const currentConv = this.getCurrentConversation();
        currentConv.history.push(assistantMessage);
        
        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolResult = await this.executeToolCall(toolCall);
          console.log(chalk.gray(`🔧 ${toolCall.function.name}: ${toolResult.substring(0, 100)}...`));
          
          currentConv.history.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id
          });
        }
        
        // Make another API call to get the final response
        const finalResponse = await this.callOpenRouter(currentConv.history, currentConv.model, currentConv.temperature);
        return finalResponse;
      }

      return response;
      
    } catch (error) {
      if (error.response) {
        console.log(chalk.red(`API Error (${error.response.status}): ${error.response.data?.error?.message || 'Unknown error'}`));
      } else {
        console.log(chalk.red(`Network Error: ${error.message}`));
      }
      throw error;
    }
  }

  // Advanced streaming and progressive loading methods
  startProgressiveLoading() {
    if (this.progressiveLoader) {
      clearInterval(this.progressiveLoader.interval);
    }
    
    const stages = [
      { text: 'Initializing...', color: 'cyan', icon: '⚡' },
      { text: 'Connecting to AI...', color: 'blue', icon: '🔗' },
      { text: 'Processing request...', color: 'magenta', icon: '🧠' },
      { text: 'Generating response...', color: 'yellow', icon: '✨' }
    ];
    
    let currentStage = 0;
    let dots = 0;
    
    this.progressiveLoader = {
      interval: setInterval(() => {
        const stage = stages[currentStage % stages.length];
        const dotString = '.'.repeat((dots % 3) + 1).padEnd(3);
        
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        process.stdout.write(
          chalk[stage.color](stage.icon + ' ' + stage.text + dotString)
        );
        
        dots++;
        if (dots % 6 === 0) {
          currentStage++;
        }
      }, 200),
      stage: 0
    };
  }
  
  stopProgressiveLoading(loader = this.progressiveLoader) {
    if (loader && loader.interval) {
      clearInterval(loader.interval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
    this.progressiveLoader = null;
  }
  
  async processWithAdvancedStreaming({ recoder, input, startTime, streamBuffer, onFirstChunk, onChunk }) {
    try {
      console.log(chalk.gray('[DEBUG] Starting API call...'));
      // Attempt streaming first
      const response = await recoder.processConversation(input, false, true, {
        onChunk: (chunk) => {
          if (!streamBuffer.streamingStarted) {
            this.stopProgressiveLoading();
            this.startStreamingDisplay();
            streamBuffer.streamingStarted = true;
            onFirstChunk(Date.now());
          }

          streamBuffer.content += chunk;
          streamBuffer.chunks.push(chunk);
          streamBuffer.isStreaming = true;
          onChunk(chunk);
        }
      });

      // If streaming was used, return the accumulated content
      // Otherwise return the response (which is the final message content)
      return streamBuffer.streamingStarted ? streamBuffer.content : response;

    } catch (error) {
      // Fallback to non-streaming
      this.stopProgressiveLoading();
      console.log(chalk.red('\n❌ Streaming failed:', error.message));
      console.log(chalk.yellow('Trying non-streaming mode...'));
      return await recoder.processConversation(input, false, false, null);
    }
  }
  
  startStreamingDisplay() {
    if (!this.streamingActive) {
      console.log('\n' + chalk.cyan('🔥 Streaming response...'));
      this.streamingActive = true;
      this.streamCursor = 0;
    }
  }
  
  displayStreamingChunk(chunk, chunkNumber) {
    if (!this.streamingActive) return;
    
    // Add subtle chunk indicators for debugging
    if (process.env.RECODER_DEBUG === 'true') {
      process.stdout.write(chalk.gray(`[${chunkNumber}]`));
    }
    
    // Display chunk with subtle animation
    const chars = chunk.split('');
    chars.forEach((char, index) => {
      setTimeout(() => {
        process.stdout.write(chalk.white(char));
      }, index * 2); // Very fast typing effect
    });
  }
  
  stopStreamingDisplay() {
    this.streamingActive = false;
    this.streamCursor = 0;
  }
  
  finalizeStreamingResponse(response, duration) {
    this.stopStreamingDisplay();
    console.log('\n');
    console.log(chalk.gray(`✅ Stream complete (${duration}s)`));
  }
  
  async displayAdvancedTypingResponse(response, startTime) {
    if (!response) return;
    
    const formattedResponse = this.formatResponse(response);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Enhanced typing animation with word-by-word display
    const words = formattedResponse.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      currentLine += word + ' ';
      
      // Display word
      process.stdout.write(chalk.white(word + ' '));
      
      // Variable delay based on word length and content
      let delay = 30; // Base delay
      if (word.includes('\n')) delay += 100; // Pause at line breaks
      if (word.length > 10) delay += 20; // Slower for long words
      if (word.includes('.') || word.includes('!') || word.includes('?')) delay += 150; // Pause at sentences
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log('\n' + chalk.gray(`(${duration}s • advanced typing)`));
  }
  
  showAdvancedMetrics({ duration, timeToFirstChunk, totalChunks, streamingUsed }) {
    const metrics = [];
    
    if (streamingUsed) {
      metrics.push(chalk.green(`🚀 Streamed ${totalChunks} chunks`));
      if (timeToFirstChunk) {
        metrics.push(chalk.blue(`⚡ First response: ${timeToFirstChunk}s`));
      }
    } else {
      metrics.push(chalk.yellow('📄 Standard response'));
    }
    
    metrics.push(chalk.gray(`⏱️ Total: ${duration}s`));
    
    // Show tool usage indicators
    this.showToolUsage();
    
    console.log(chalk.gray('Performance: ') + metrics.join(' • '));
  }
  
  showEnhancedError(error) {
    // Enhanced error display with better formatting
    console.log(chalk.red('╭─────────────────────────────────────────╮'));
    console.log(chalk.red('│') + chalk.white.bold('  ❌ Error                             ') + chalk.red('│'));
    console.log(chalk.red('╰─────────────────────────────────────────╯'));
    console.log('');
    
    // Error details
    console.log(chalk.white(error.message));
    console.log('');
    
    // Enhanced contextual suggestions
    if (error.message.includes('429')) {
      console.log(chalk.yellow('💡 Rate limit: Wait 10-30 seconds before retrying'));
    } else if (error.message.includes('API key')) {
      console.log(chalk.yellow('💡 Set your API key: export OPENROUTER_API_KEY=your_key'));
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      console.log(chalk.yellow('💡 Network issue: Check connection and try again'));
    } else if (error.message.includes('model')) {
      console.log(chalk.yellow('💡 Model issue: Try switching models with /model command'));
    } else {
      console.log(chalk.yellow('💡 Try: /help for available commands or /reset to start fresh'));
    }
    
    // Debug information if enabled
    if (process.env.RECODER_DEBUG === 'true') {
      console.log('');
      console.log(chalk.gray('Debug details:'));
      console.log(chalk.gray(error.stack?.split('\n').slice(0, 3).join('\n')));
    }
  }

  setupGlobalErrorHandlers() {
    // Register domain-specific handlers with unified error handler
    errorHandler.registerHandler('interactive', (error) => {
      if (this.logger) {
        this.logger.error('Interactive mode error', { 
          error: error?.toString(), 
          stack: error?.stack 
        });
      }
      
      // In debug mode, show detailed error for interactive context
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.blue('\n🔍 Interactive Context Error:'));
        console.log(chalk.gray(error?.toString()));
        if (error?.stack) {
          console.log(chalk.gray(error.stack.split('\n').slice(0, 5).join('\n')));
        }
      }
    });

    // Register MCP error handler for graceful degradation
    errorHandler.registerHandler('mcp', (error) => {
      // MCP errors are non-critical, just log for debugging
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.gray('🔌 MCP connection issue (non-critical):'), error?.message);
      }
    });

    // Handle warnings specifically
    process.on('warning', (warning) => {
      if (warning.name === 'PromiseRejectionHandledWarning' || 
          warning.name === 'UnhandledPromiseRejectionWarning') {
        if (this.logger) {
          this.logger.warn('Promise warning', { name: warning.name, message: warning.message });
        }
      }
    });
  }

  // ========== INTELLIGENT FEATURES ==========

  performCodeAnalysis() {
    console.log(chalk.cyan('🔍 Analyzing Codebase...'));
    console.log('');
    
    const analysis = this.analyzeCurrentProject();
    
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  📊 Code Analysis Results             ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    console.log(chalk.cyan('📁 Project Structure:'));
    console.log(chalk.white(`   • Files: ${analysis.fileCount}`));
    console.log(chalk.white(`   • Languages: ${analysis.languages.join(', ')}`));
    console.log(chalk.white(`   • Main Language: ${analysis.mainLanguage}`));
    console.log('');
    
    console.log(chalk.green('✅ Strengths:'));
    analysis.strengths.forEach(strength => {
      console.log(chalk.white(`   • ${strength}`));
    });
    console.log('');
    
    console.log(chalk.yellow('💡 Suggestions:'));
    analysis.suggestions.forEach(suggestion => {
      console.log(chalk.white(`   • ${suggestion}`));
    });
    console.log('');
  }

  analyzeCurrentProject() {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const analysis = {
        fileCount: 0,
        languages: new Set(),
        fileTypes: {},
        dependencies: [],
        devDependencies: [],
        strengths: [],
        issues: [],
        suggestions: []
      };

      // Scan actual files in project
      const scanDirectory = (dir, depth = 0) => {
        if (depth > 3) return; // Limit depth
        
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            // Skip node_modules, .git, etc.
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            
            if (entry.isFile()) {
              analysis.fileCount++;
              const ext = path.extname(entry.name).toLowerCase();
              
              // Count file types
              analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
              
              // Detect languages
              const languageMap = {
                '.js': 'JavaScript',
                '.ts': 'TypeScript', 
                '.py': 'Python',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C',
                '.cs': 'C#',
                '.go': 'Go',
                '.rs': 'Rust',
                '.php': 'PHP',
                '.rb': 'Ruby',
                '.json': 'JSON',
                '.md': 'Markdown',
                '.html': 'HTML',
                '.css': 'CSS',
                '.scss': 'SCSS',
                '.yaml': 'YAML',
                '.yml': 'YAML'
              };
              
              if (languageMap[ext]) {
                analysis.languages.add(languageMap[ext]);
              }
            } else if (entry.isDirectory()) {
              scanDirectory(fullPath, depth + 1);
            }
          }
        } catch (error) {
          // Skip directories we can't read
        }
      };

      // Scan from current directory
      scanDirectory(process.cwd());

      // Analyze package.json if it exists
      try {
        const packagePath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packagePath)) {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
          analysis.dependencies = Object.keys(packageJson.dependencies || {});
          analysis.devDependencies = Object.keys(packageJson.devDependencies || {});
          
          // Analyze dependencies for insights
          if (analysis.dependencies.includes('express')) analysis.strengths.push('Express.js web framework detected');
          if (analysis.dependencies.includes('react')) analysis.strengths.push('React frontend framework detected');
          if (analysis.dependencies.includes('chalk')) analysis.strengths.push('Terminal styling with chalk');
          if (analysis.devDependencies.includes('jest')) analysis.strengths.push('Jest testing framework configured');
          if (analysis.devDependencies.includes('eslint')) analysis.strengths.push('ESLint code linting configured');
        }
      } catch (error) {
        analysis.issues.push('Could not read package.json');
      }

      // Generate insights based on actual analysis
      const languageArray = Array.from(analysis.languages);
      const mainLanguage = this.determineMainLanguage(analysis.fileTypes);
      
      if (analysis.fileCount === 0) {
        analysis.issues.push('No files found in project');
      } else if (analysis.fileCount > 1000) {
        analysis.issues.push('Large project detected - consider optimization');
      }

      if (!languageArray.includes('TypeScript') && languageArray.includes('JavaScript')) {
        analysis.suggestions.push('Consider migrating to TypeScript for better type safety');
      }

      if (!analysis.fileTypes['.md']) {
        analysis.suggestions.push('Add README.md and documentation');
      }

      if (analysis.dependencies.length === 0) {
        analysis.suggestions.push('Consider using npm/yarn for dependency management');
      }

      if (!analysis.devDependencies.includes('jest') && !analysis.devDependencies.includes('mocha')) {
        analysis.suggestions.push('Add testing framework (Jest/Mocha)');
      }

      return {
        fileCount: analysis.fileCount,
        languages: languageArray,
        mainLanguage: mainLanguage,
        fileTypes: analysis.fileTypes,
        dependencies: analysis.dependencies,
        devDependencies: analysis.devDependencies,
        strengths: analysis.strengths.length > 0 ? analysis.strengths : ['Project structure analyzed'],
        issues: analysis.issues,
        suggestions: analysis.suggestions.length > 0 ? analysis.suggestions : ['Project appears well-structured']
      };
      
    } catch (error) {
      return {
        fileCount: 0,
        languages: ['Unknown'],
        mainLanguage: 'Unknown',
        fileTypes: {},
        dependencies: [],
        devDependencies: [],
        strengths: ['Basic analysis attempted'],
        issues: [`Analysis error: ${error.message}`],
        suggestions: ['Ensure proper file permissions']
      };
    }
  }

  determineMainLanguage(fileTypes) {
    let maxCount = 0;
    let mainExt = '';
    
    for (const [ext, count] of Object.entries(fileTypes)) {
      if (count > maxCount && ext !== '.md' && ext !== '.json') {
        maxCount = count;
        mainExt = ext;
      }
    }
    
    const languageMap = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.go': 'Go',
      '.rs': 'Rust'
    };
    
    return languageMap[mainExt] || 'Mixed';
  }

  showGitStatus() {
    console.log(chalk.cyan('📊 Git Repository Status'));
    console.log('');
    
    const { execSync } = require('child_process');
    
    try {
      // Check if git is available
      execSync('git --version', { stdio: 'ignore' });
      
      // Check if we're in a git repository
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      
      console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
      console.log(chalk.magenta('│') + chalk.white.bold('  🌿 Git Repository Analysis           ') + chalk.magenta('│'));
      console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
      console.log('');
      
      // Get comprehensive git information
      const gitInfo = this.getGitInformation();
      
      // Display branch information
      console.log(chalk.green(`🌿 Current Branch: ${gitInfo.currentBranch}`));
      if (gitInfo.upstreamBranch) {
        console.log(chalk.blue(`🔗 Upstream: ${gitInfo.upstreamBranch}`));
      }
      
      // Show commits ahead/behind
      if (gitInfo.aheadBehind.ahead > 0 || gitInfo.aheadBehind.behind > 0) {
        console.log(chalk.yellow(`📊 Sync Status: ${gitInfo.aheadBehind.ahead} ahead, ${gitInfo.aheadBehind.behind} behind`));
      }
      console.log('');
      
      // Show working directory status
      if (gitInfo.statusFiles.length > 0) {
        console.log(chalk.yellow('📝 Working Directory Changes:'));
        
        const statusCounts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
        
        gitInfo.statusFiles.forEach(file => {
          let statusIcon = '❓';
          let statusColor = 'white';
          
          if (file.status.includes('M')) {
            statusIcon = '📝';
            statusColor = 'yellow';
            statusCounts.modified++;
          } else if (file.status.includes('A')) {
            statusIcon = '➕';
            statusColor = 'green';
            statusCounts.added++;
          } else if (file.status.includes('D')) {
            statusIcon = '🗑️';
            statusColor = 'red';
            statusCounts.deleted++;
          } else if (file.status.includes('??')) {
            statusIcon = '❔';
            statusColor = 'gray';
            statusCounts.untracked++;
          }
          
          console.log(chalk[statusColor](`   ${statusIcon} ${file.file}`));
        });
        
        console.log('');
        console.log(chalk.cyan('📊 Summary:'));
        if (statusCounts.modified > 0) console.log(chalk.yellow(`   📝 ${statusCounts.modified} modified`));
        if (statusCounts.added > 0) console.log(chalk.green(`   ➕ ${statusCounts.added} added`));
        if (statusCounts.deleted > 0) console.log(chalk.red(`   🗑️ ${statusCounts.deleted} deleted`));
        if (statusCounts.untracked > 0) console.log(chalk.gray(`   ❔ ${statusCounts.untracked} untracked`));
        
      } else {
        console.log(chalk.green('✅ Working directory clean'));
      }
      
      console.log('');
      
      // Show recent commits with more detail
      console.log(chalk.blue('📚 Recent Commits:'));
      gitInfo.recentCommits.forEach((commit, index) => {
        const timeAgo = this.getTimeAgo(commit.date);
        console.log(chalk.gray(`   ${index + 1}. ${commit.hash} ${commit.message}`));
        console.log(chalk.gray(`      by ${commit.author} ${timeAgo}`));
      });
      
      console.log('');
      
      // Show repository statistics
      console.log(chalk.cyan('📈 Repository Stats:'));
      console.log(chalk.white(`   🏷️ Total Tags: ${gitInfo.stats.totalTags}`));
      console.log(chalk.white(`   🌿 Total Branches: ${gitInfo.stats.totalBranches}`));
      console.log(chalk.white(`   📝 Total Commits: ${gitInfo.stats.totalCommits}`));
      console.log(chalk.white(`   👥 Contributors: ${gitInfo.stats.contributors}`));
      
    } catch (error) {
      if (error.message.includes('not a git repository')) {
        console.log(chalk.red('❌ Not a git repository'));
        console.log(chalk.gray('Initialize with: git init'));
      } else if (error.message.includes('git --version')) {
        console.log(chalk.red('❌ Git not installed or not in PATH'));
      } else {
        console.log(chalk.red(`❌ Git error: ${error.message}`));
      }
    }
    console.log('');
  }

  getGitInformation() {
    const { execSync } = require('child_process');
    
    try {
      // Get current branch
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      
      // Get upstream branch
      let upstreamBranch = null;
      try {
        upstreamBranch = execSync('git rev-parse --abbrev-ref @{upstream}', { encoding: 'utf8' }).trim();
      } catch (e) {
        // No upstream branch
      }
      
      // Get ahead/behind count
      let aheadBehind = { ahead: 0, behind: 0 };
      if (upstreamBranch) {
        try {
          const aheadBehindOutput = execSync(`git rev-list --count --left-right ${upstreamBranch}...HEAD`, { encoding: 'utf8' }).trim();
          const [behind, ahead] = aheadBehindOutput.split('\t').map(Number);
          aheadBehind = { ahead, behind };
        } catch (e) {
          // Can't determine ahead/behind
        }
      }
      
      // Get status files
      const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
      const statusFiles = statusOutput.split('\n')
        .filter(line => line.trim())
        .map(line => ({
          status: line.substring(0, 2),
          file: line.substring(3)
        }));
      
      // Get recent commits with detailed info
      const commitOutput = execSync('git log --oneline --format="%H|%s|%an|%ad" --date=iso -10', { encoding: 'utf8' });
      const recentCommits = commitOutput.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, message, author, date] = line.split('|');
          return {
            hash: hash.substring(0, 8),
            message,
            author,
            date: new Date(date)
          };
        });
      
      // Get repository statistics
      const totalTags = execSync('git tag --list | wc -l', { encoding: 'utf8' }).trim();
      const totalBranches = execSync('git branch -a | wc -l', { encoding: 'utf8' }).trim();
      const totalCommits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
      const contributors = execSync('git shortlog -sn | wc -l', { encoding: 'utf8' }).trim();
      
      return {
        currentBranch,
        upstreamBranch,
        aheadBehind,
        statusFiles,
        recentCommits,
        stats: {
          totalTags: parseInt(totalTags) || 0,
          totalBranches: parseInt(totalBranches) || 0,
          totalCommits: parseInt(totalCommits) || 0,
          contributors: parseInt(contributors) || 0
        }
      };
      
    } catch (error) {
      throw error;
    }
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  performCodeReview() {
    console.log(chalk.cyan('🔍 Performing AI Code Review...'));
    console.log('');
    
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  🤖 AI Code Review                    ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    const review = this.generateRealCodeReview();
    
    // Display scores with color coding
    const getScoreColor = (score) => {
      if (score >= 90) return 'green';
      if (score >= 75) return 'yellow';
      return 'red';
    };
    
    console.log(chalk[getScoreColor(review.scores.quality)](`✅ Code Quality: ${review.scores.quality}/100`));
    console.log(chalk[getScoreColor(review.scores.maintainability)](`📊 Maintainability: ${review.scores.maintainability}/100`));
    console.log(chalk[getScoreColor(review.scores.security)](`🛡️ Security: ${review.scores.security}/100`));
    console.log(chalk[getScoreColor(review.scores.testCoverage)](`🧪 Test Coverage: ${review.scores.testCoverage}/100`));
    console.log('');
    
    // Display architecture analysis
    if (review.architecture.length > 0) {
      console.log(chalk.blue('🏗️ Architecture Analysis:'));
      review.architecture.forEach(item => {
        console.log(chalk.white(`   • ${item.type}: ${item.description}`));
        if (item.file) {
          console.log(chalk.gray(`     File: ${item.file}`));
        }
      });
      console.log('');
    }
    
    // Display code quality issues
    if (review.qualityIssues.length > 0) {
      console.log(chalk.yellow('⚠️ Code Quality Issues:'));
      review.qualityIssues.forEach(issue => {
        console.log(chalk.white(`   • ${issue.type}: ${issue.description}`));
        console.log(chalk.gray(`     File: ${issue.file}:${issue.line}`));
      });
      console.log('');
    }
    
    // Display maintainability metrics
    if (review.maintainabilityMetrics.length > 0) {
      console.log(chalk.cyan('📈 Maintainability Metrics:'));
      review.maintainabilityMetrics.forEach(metric => {
        console.log(chalk.white(`   • ${metric.metric}: ${metric.value} (${metric.assessment})`));
        if (metric.suggestion) {
          console.log(chalk.gray(`     Suggestion: ${metric.suggestion}`));
        }
      });
      console.log('');
    }
    
    // Display AI recommendations
    if (review.recommendations.length > 0) {
      console.log(chalk.cyan('💡 AI-Powered Recommendations:'));
      review.recommendations.forEach(rec => {
        console.log(chalk.white(`   • ${rec.category}: ${rec.suggestion}`));
        if (rec.priority) {
          console.log(chalk.gray(`     Priority: ${rec.priority}`));
        }
      });
      console.log('');
    }
    
    // Display overall assessment
    const overallScore = Math.round((review.scores.quality + review.scores.maintainability + review.scores.security + review.scores.testCoverage) / 4);
    console.log(chalk[getScoreColor(overallScore)](`🎯 Overall Code Health: ${overallScore}/100`));
  }

  generateRealCodeReview() {
    const fs = require('fs');
    const path = require('path');
    
    const review = {
      scores: {
        quality: 100,
        maintainability: 100,
        security: 100,
        testCoverage: 50
      },
      architecture: [],
      qualityIssues: [],
      maintainabilityMetrics: [],
      recommendations: []
    };

    // Code quality patterns to analyze
    const qualityPatterns = [
      { pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}?\}/, type: 'Long Function', description: 'Function exceeds recommended length' },
      { pattern: /if\s*\([^)]+\)\s*\{[\s\S]*?if\s*\([^)]+\)\s*\{[\s\S]*?if\s*\([^)]+\)/, type: 'Deep Nesting', description: 'Excessive nesting depth detected' },
      { pattern: /var\s+\w+/, type: 'Var Usage', description: 'Use const/let instead of var' },
      { pattern: /==\s*(?!null)/, type: 'Loose Equality', description: 'Use strict equality (===) instead' },
      { pattern: /console\.log/, type: 'Debug Code', description: 'Remove console.log from production code' },
      { pattern: /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/, type: 'Empty Catch', description: 'Empty catch block - handle errors properly' }
    ];

    // Maintainability patterns
    const maintainabilityPatterns = [
      { pattern: /\/\*[\s\S]*?\*\/|\/\/.*$/gm, type: 'Comments', description: 'Code documentation' },
      { pattern: /class\s+\w+/, type: 'Classes', description: 'Object-oriented structure' },
      { pattern: /export\s+/, type: 'Modules', description: 'Modular architecture' },
      { pattern: /import\s+.*from/, type: 'Dependencies', description: 'Dependency management' }
    ];

    // Architecture patterns
    const architecturePatterns = [
      { pattern: /class\s+\w+Manager/, type: 'Manager Pattern', description: 'Centralized management logic' },
      { pattern: /\.on\(|\.emit\(/, type: 'Event-Driven', description: 'Event-driven architecture' },
      { pattern: /async\s+function|await\s+/, type: 'Async Pattern', description: 'Asynchronous programming patterns' },
      { pattern: /module\.exports\s*=/, type: 'Module System', description: 'CommonJS module pattern' }
    ];

    let totalLines = 0;
    let totalFunctions = 0;
    let totalClasses = 0;
    let commentLines = 0;
    let testFiles = 0;

    // Analyze codebase
    const analyzeDirectory = (dir, depth = 0) => {
      if (depth > 3) return;
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          
          if (entry.isFile() && this.isCodeFile(entry.name)) {
            this.analyzeCodeFile(fullPath, qualityPatterns, maintainabilityPatterns, architecturePatterns, review);
            
            // Count metrics
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            totalLines += lines.length;
            
            // Count functions and classes
            totalFunctions += (content.match(/function\s+\w+|=>\s*\{|\w+\s*:\s*function/g) || []).length;
            totalClasses += (content.match(/class\s+\w+/g) || []).length;
            
            // Count comments
            commentLines += (content.match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) || []).length;
            
            // Check if it's a test file
            if (entry.name.includes('test') || entry.name.includes('spec')) {
              testFiles++;
            }
            
          } else if (entry.isDirectory()) {
            analyzeDirectory(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    analyzeDirectory(process.cwd());

    // Calculate scores based on findings
    const qualityIssueCount = review.qualityIssues.length;
    review.scores.quality = Math.max(0, 100 - (qualityIssueCount * 5));

    // Maintainability score based on structure and documentation
    const commentRatio = totalLines > 0 ? (commentLines / totalLines) * 100 : 0;
    const avgFunctionsPerFile = totalFunctions > 0 ? totalFunctions / (totalLines / 50) : 0;
    
    review.scores.maintainability = Math.max(0, 100 - 
      (avgFunctionsPerFile > 10 ? 20 : 0) - 
      (commentRatio < 10 ? 15 : 0) - 
      (totalClasses === 0 ? 10 : 0));

    // Test coverage estimation
    review.scores.testCoverage = Math.min(100, testFiles * 20);

    // Add maintainability metrics
    review.maintainabilityMetrics.push({
      metric: 'Comment Ratio',
      value: `${commentRatio.toFixed(1)}%`,
      assessment: commentRatio > 15 ? 'Good' : commentRatio > 5 ? 'Fair' : 'Poor',
      suggestion: commentRatio < 10 ? 'Add more documentation' : null
    });

    review.maintainabilityMetrics.push({
      metric: 'Total Lines of Code',
      value: totalLines.toString(),
      assessment: totalLines < 5000 ? 'Manageable' : totalLines < 15000 ? 'Large' : 'Very Large'
    });

    review.maintainabilityMetrics.push({
      metric: 'Functions Count',
      value: totalFunctions.toString(),
      assessment: 'Active'
    });

    review.maintainabilityMetrics.push({
      metric: 'Classes Count',
      value: totalClasses.toString(),
      assessment: totalClasses > 0 ? 'Object-oriented' : 'Functional'
    });

    // Generate AI-powered recommendations
    if (qualityIssueCount > 0) {
      review.recommendations.push({
        category: 'Code Quality',
        suggestion: 'Address code quality issues to improve maintainability',
        priority: 'High'
      });
    }

    if (review.scores.testCoverage < 70) {
      review.recommendations.push({
        category: 'Testing',
        suggestion: 'Increase test coverage with unit and integration tests',
        priority: 'High'
      });
    }

    if (commentRatio < 10) {
      review.recommendations.push({
        category: 'Documentation',
        suggestion: 'Add more inline documentation and comments',
        priority: 'Medium'
      });
    }

    review.recommendations.push({
      category: 'Architecture',
      suggestion: 'Consider implementing design patterns for better code organization',
      priority: 'Medium'
    });

    review.recommendations.push({
      category: 'Performance',
      suggestion: 'Profile critical code paths and optimize bottlenecks',
      priority: 'Low'
    });

    review.recommendations.push({
      category: 'Security',
      suggestion: 'Implement input validation and security best practices',
      priority: 'High'
    });

    return review;
  }

  analyzeCodeFile(filePath, qualityPatterns, maintainabilityPatterns, architecturePatterns, review) {
    const fs = require('fs');
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Check for quality issues
      for (const patternInfo of qualityPatterns) {
        if (patternInfo.pattern.test(content)) {
          review.qualityIssues.push({
            type: patternInfo.type,
            description: patternInfo.description,
            file: filePath.replace(process.cwd(), '.'),
            line: this.findPatternLine(lines, patternInfo.pattern)
          });
        }
      }
      
      // Check architecture patterns
      for (const patternInfo of architecturePatterns) {
        if (patternInfo.pattern.test(content)) {
          review.architecture.push({
            type: patternInfo.type,
            description: patternInfo.description,
            file: filePath.replace(process.cwd(), '.')
          });
        }
      }
      
    } catch (error) {
      // Skip files we can't read
    }
  }

  findPatternLine(lines, pattern) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  performSecurityAnalysis() {
    console.log(chalk.cyan('🛡️ Performing Security Analysis...'));
    console.log('');
    
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  🛡️ Security Vulnerability Scan       ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    const securityReport = this.performRealSecurityScan();
    
    // Display security score
    let scoreColor = 'green';
    if (securityReport.score < 70) scoreColor = 'red';
    else if (securityReport.score < 85) scoreColor = 'yellow';
    
    console.log(chalk[scoreColor](`🛡️ Security Score: ${securityReport.score}/100`));
    console.log('');
    
    // Display vulnerabilities by severity
    if (securityReport.vulnerabilities.critical.length > 0) {
      console.log(chalk.red('🚨 Critical Vulnerabilities:'));
      securityReport.vulnerabilities.critical.forEach(vuln => {
        console.log(chalk.red(`   • ${vuln.type}: ${vuln.description}`));
        console.log(chalk.gray(`     File: ${vuln.file}:${vuln.line}`));
      });
      console.log('');
    }
    
    if (securityReport.vulnerabilities.high.length > 0) {
      console.log(chalk.red('⚠️ High Risk Issues:'));
      securityReport.vulnerabilities.high.forEach(vuln => {
        console.log(chalk.yellow(`   • ${vuln.type}: ${vuln.description}`));
        console.log(chalk.gray(`     File: ${vuln.file}:${vuln.line}`));
      });
      console.log('');
    }
    
    if (securityReport.vulnerabilities.medium.length > 0) {
      console.log(chalk.yellow('⚠️ Medium Risk Issues:'));
      securityReport.vulnerabilities.medium.forEach(vuln => {
        console.log(chalk.yellow(`   • ${vuln.type}: ${vuln.description}`));
        console.log(chalk.gray(`     File: ${vuln.file}:${vuln.line}`));
      });
      console.log('');
    }
    
    if (securityReport.vulnerabilities.low.length > 0) {
      console.log(chalk.cyan('ℹ️ Low Risk Issues:'));
      securityReport.vulnerabilities.low.forEach(vuln => {
        console.log(chalk.cyan(`   • ${vuln.type}: ${vuln.description}`));
        console.log(chalk.gray(`     File: ${vuln.file}:${vuln.line}`));
      });
      console.log('');
    }
    
    // Show dependency vulnerabilities
    if (securityReport.dependencyIssues.length > 0) {
      console.log(chalk.yellow('📦 Dependency Vulnerabilities:'));
      securityReport.dependencyIssues.forEach(dep => {
        console.log(chalk.yellow(`   • ${dep.name}@${dep.version}: ${dep.issue}`));
        console.log(chalk.gray(`     Severity: ${dep.severity}, Fix: ${dep.fix}`));
      });
      console.log('');
    }
    
    // Show recommendations
    if (securityReport.recommendations.length > 0) {
      console.log(chalk.cyan('💡 Security Recommendations:'));
      securityReport.recommendations.forEach(rec => {
        console.log(chalk.white(`   • ${rec}`));
      });
      console.log('');
    }
    
    // Summary
    const totalIssues = securityReport.vulnerabilities.critical.length + 
                       securityReport.vulnerabilities.high.length + 
                       securityReport.vulnerabilities.medium.length + 
                       securityReport.vulnerabilities.low.length;
    
    if (totalIssues === 0) {
      console.log(chalk.green('✅ No security vulnerabilities detected in code scan'));
    } else {
      console.log(chalk.yellow(`📊 Total Issues Found: ${totalIssues}`));
    }
  }

  performRealSecurityScan() {
    const fs = require('fs');
    const path = require('path');
    
    const securityReport = {
      score: 100,
      vulnerabilities: {
        critical: [],
        high: [],
        medium: [],
        low: []
      },
      dependencyIssues: [],
      recommendations: []
    };

    // Security patterns to detect
    const securityPatterns = {
      critical: [
        { pattern: /password\s*=\s*['"][^'"]+['"]/, type: 'Hardcoded Password', description: 'Hardcoded password detected' },
        { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/, type: 'Hardcoded API Key', description: 'Hardcoded API key detected' },
        { pattern: /secret\s*=\s*['"][^'"]+['"]/, type: 'Hardcoded Secret', description: 'Hardcoded secret detected' },
        { pattern: /eval\s*\(/, type: 'Code Injection', description: 'Use of eval() detected - potential code injection risk' }
      ],
      high: [
        { pattern: /exec\s*\(.*\$/, type: 'Command Injection', description: 'Potential command injection vulnerability' },
        { pattern: /innerHTML\s*=/, type: 'XSS Risk', description: 'Use of innerHTML - potential XSS vulnerability' },
        { pattern: /document\.write\s*\(/, type: 'XSS Risk', description: 'Use of document.write - potential XSS vulnerability' },
        { pattern: /sql\s*=.*\+/, type: 'SQL Injection', description: 'Potential SQL injection vulnerability' }
      ],
      medium: [
        { pattern: /console\.log\s*\(.*password/, type: 'Information Disclosure', description: 'Password logged to console' },
        { pattern: /console\.log\s*\(.*token/, type: 'Information Disclosure', description: 'Token logged to console' },
        { pattern: /http:\/\//, type: 'Insecure Protocol', description: 'Use of insecure HTTP protocol' },
        { pattern: /Math\.random\s*\(\)/, type: 'Weak Cryptography', description: 'Use of Math.random() for security purposes' }
      ],
      low: [
        { pattern: /TODO.*security/, type: 'Security TODO', description: 'Security-related TODO comment' },
        { pattern: /FIXME.*security/, type: 'Security FIXME', description: 'Security-related FIXME comment' },
        { pattern: /\.trim\s*\(\)\.length/, type: 'Input Validation', description: 'Consider more robust input validation' }
      ]
    };

    // Scan files for security issues
    const scanDirectory = (dir, depth = 0) => {
      if (depth > 3) return;
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          
          if (entry.isFile() && this.isCodeFile(entry.name)) {
            this.scanFileForSecurity(fullPath, securityPatterns, securityReport);
          } else if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    scanDirectory(process.cwd());

    // Check dependencies for known vulnerabilities
    this.checkDependencyVulnerabilities(securityReport);

    // Calculate final score
    const criticalCount = securityReport.vulnerabilities.critical.length;
    const highCount = securityReport.vulnerabilities.high.length;
    const mediumCount = securityReport.vulnerabilities.medium.length;
    const lowCount = securityReport.vulnerabilities.low.length;
    
    securityReport.score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 15) - (mediumCount * 10) - (lowCount * 5));

    // Generate recommendations based on findings
    if (criticalCount > 0) {
      securityReport.recommendations.push('🚨 Address critical vulnerabilities immediately');
    }
    if (highCount > 0) {
      securityReport.recommendations.push('⚠️ Review and fix high-risk security issues');
    }
    
    securityReport.recommendations.push('🔒 Use environment variables for sensitive data');
    securityReport.recommendations.push('🛡️ Implement input validation and sanitization');
    securityReport.recommendations.push('📦 Keep dependencies updated regularly');
    securityReport.recommendations.push('🔍 Consider using a security linter (ESLint security plugin)');

    return securityReport;
  }

  isCodeFile(filename) {
    const codeExtensions = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb'];
    return codeExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  scanFileForSecurity(filePath, patterns, report) {
    const fs = require('fs');
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      for (const [severity, patternList] of Object.entries(patterns)) {
        for (const patternInfo of patternList) {
          for (let i = 0; i < lines.length; i++) {
            if (patternInfo.pattern.test(lines[i])) {
              report.vulnerabilities[severity].push({
                type: patternInfo.type,
                description: patternInfo.description,
                file: filePath.replace(process.cwd(), '.'),
                line: i + 1,
                code: lines[i].trim()
              });
            }
          }
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  checkDependencyVulnerabilities(report) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      if (!fs.existsSync(packagePath)) return;
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Check for known vulnerable packages (simplified check)
      const knownVulnerablePackages = {
        'lodash': { versions: ['< 4.17.21'], issue: 'Prototype pollution vulnerability', severity: 'High', fix: 'Update to latest version' },
        'node-forge': { versions: ['< 1.0.0'], issue: 'RSA PKCS#1 signature verification issue', severity: 'High', fix: 'Update to 1.0.0+' },
        'axios': { versions: ['< 0.21.2'], issue: 'Server-side request forgery', severity: 'Medium', fix: 'Update to 0.21.2+' }
      };
      
      for (const [depName, version] of Object.entries(dependencies)) {
        if (knownVulnerablePackages[depName]) {
          const vuln = knownVulnerablePackages[depName];
          report.dependencyIssues.push({
            name: depName,
            version: version,
            issue: vuln.issue,
            severity: vuln.severity,
            fix: vuln.fix
          });
        }
      }
    } catch (error) {
      // Could not check dependencies
    }
  }

  performOptimizationAnalysis() {
    console.log(chalk.cyan('⚡ Analyzing Performance...'));
    console.log('');
    
    console.log(chalk.magenta('╭─────────────────────────────────────────╮'));
    console.log(chalk.magenta('│') + chalk.white.bold('  ⚡ Performance Analysis               ') + chalk.magenta('│'));
    console.log(chalk.magenta('╰─────────────────────────────────────────╯'));
    console.log('');
    
    const perfReport = this.performRealPerformanceAnalysis();
    
    // Display performance score
    let scoreColor = 'green';
    if (perfReport.score < 60) scoreColor = 'red';
    else if (perfReport.score < 80) scoreColor = 'yellow';
    
    console.log(chalk[scoreColor](`⚡ Performance Score: ${perfReport.score}/100`));
    console.log('');
    
    // Display bottlenecks
    if (perfReport.bottlenecks.length > 0) {
      console.log(chalk.yellow('🐌 Performance Bottlenecks Detected:'));
      perfReport.bottlenecks.forEach(bottleneck => {
        console.log(chalk.white(`   • ${bottleneck.type}: ${bottleneck.description}`));
        console.log(chalk.gray(`     File: ${bottleneck.file}:${bottleneck.line}`));
      });
      console.log('');
    }
    
    // Display file size issues
    if (perfReport.fileSizeIssues.length > 0) {
      console.log(chalk.yellow('📁 Large File Issues:'));
      perfReport.fileSizeIssues.forEach(issue => {
        console.log(chalk.white(`   • ${issue.file}: ${issue.sizeKB}KB (${issue.description})`));
      });
      console.log('');
    }
    
    // Display dependency analysis
    if (perfReport.dependencyImpact.heavyDependencies.length > 0) {
      console.log(chalk.yellow('📦 Heavy Dependencies:'));
      perfReport.dependencyImpact.heavyDependencies.forEach(dep => {
        console.log(chalk.white(`   • ${dep}: Large bundle size impact`));
      });
      console.log('');
    }
    
    // Display optimization suggestions
    if (perfReport.optimizations.length > 0) {
      console.log(chalk.cyan('🚀 Optimization Suggestions:'));
      perfReport.optimizations.forEach(opt => {
        console.log(chalk.white(`   • ${opt}`));
      });
      console.log('');
    }
    
    // Show memory usage patterns
    if (perfReport.memoryPatterns.length > 0) {
      console.log(chalk.blue('🧠 Memory Usage Patterns:'));
      perfReport.memoryPatterns.forEach(pattern => {
        console.log(chalk.white(`   • ${pattern.type}: ${pattern.description}`));
        if (pattern.file) {
          console.log(chalk.gray(`     File: ${pattern.file}:${pattern.line}`));
        }
      });
      console.log('');
    }
    
    // Summary
    const totalIssues = perfReport.bottlenecks.length + perfReport.fileSizeIssues.length;
    if (totalIssues === 0) {
      console.log(chalk.green('✅ No major performance issues detected'));
    } else {
      console.log(chalk.yellow(`📊 Total Performance Issues: ${totalIssues}`));
    }
  }

  performRealPerformanceAnalysis() {
    const fs = require('fs');
    const path = require('path');
    
    const perfReport = {
      score: 100,
      bottlenecks: [],
      fileSizeIssues: [],
      dependencyImpact: {
        heavyDependencies: [],
        totalDependencies: 0
      },
      memoryPatterns: [],
      optimizations: []
    };

    // Performance anti-patterns to detect
    const performancePatterns = [
      { pattern: /for\s*\(.*\.length.*\)/, type: 'Loop Optimization', description: 'Loop with .length in condition - cache length outside loop' },
      { pattern: /document\.getElementById.*\(/, type: 'DOM Query', description: 'Repeated DOM queries - consider caching elements' },
      { pattern: /\$\(.*\)\..*\$\(.*\)/, type: 'jQuery Chaining', description: 'Multiple jQuery selectors - consider chaining or caching' },
      { pattern: /setInterval\s*\(.*1\)/, type: 'High Frequency Timer', description: 'Very high frequency interval detected' },
      { pattern: /JSON\.parse\s*\(.*JSON\.stringify/, type: 'Deep Clone', description: 'Inefficient deep cloning - consider structured clone or lodash' },
      { pattern: /new\s+Array\s*\(/, type: 'Array Constructor', description: 'Use array literal [] instead of new Array()' },
      { pattern: /\.innerHTML\s*\+=/, type: 'DOM Manipulation', description: 'Inefficient DOM updates - consider batch operations' },
      { pattern: /require\s*\(.*\).*require\s*\(.*\)/, type: 'Module Loading', description: 'Multiple requires in same scope - consider combining imports' }
    ];

    // Memory leak patterns
    const memoryPatterns = [
      { pattern: /addEventListener.*(?!removeEventListener)/, type: 'Event Listener Leak', description: 'Event listener without cleanup' },
      { pattern: /setInterval.*(?!clearInterval)/, type: 'Timer Leak', description: 'setInterval without clearInterval' },
      { pattern: /setTimeout.*(?!clearTimeout)/, type: 'Timer Leak', description: 'setTimeout pattern that might not clear' },
      { pattern: /closure.*function.*closure/, type: 'Closure Chain', description: 'Potential closure memory retention' }
    ];

    // Scan files for performance issues
    const scanDirectory = (dir, depth = 0) => {
      if (depth > 3) return;
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          
          if (entry.isFile()) {
            // Check file size
            const stats = fs.statSync(fullPath);
            const sizeKB = Math.round(stats.size / 1024);
            
            if (sizeKB > 500 && this.isCodeFile(entry.name)) {
              perfReport.fileSizeIssues.push({
                file: fullPath.replace(process.cwd(), '.'),
                sizeKB: sizeKB,
                description: sizeKB > 1000 ? 'Very large file - consider splitting' : 'Large file - review for optimization'
              });
            }
            
            // Scan code files for performance patterns
            if (this.isCodeFile(entry.name)) {
              this.scanFileForPerformance(fullPath, performancePatterns, memoryPatterns, perfReport);
            }
          } else if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    scanDirectory(process.cwd());

    // Analyze dependencies
    this.analyzeDependencyPerformance(perfReport);

    // Calculate score based on findings
    const bottleneckCount = perfReport.bottlenecks.length;
    const fileSizeIssueCount = perfReport.fileSizeIssues.length;
    const memoryIssueCount = perfReport.memoryPatterns.length;
    
    perfReport.score = Math.max(0, 100 - (bottleneckCount * 10) - (fileSizeIssueCount * 5) - (memoryIssueCount * 8));

    // Generate optimization recommendations
    if (bottleneckCount > 0) {
      perfReport.optimizations.push('🔧 Address performance bottlenecks in critical code paths');
    }
    if (fileSizeIssueCount > 0) {
      perfReport.optimizations.push('📦 Consider code splitting for large files');
    }
    if (memoryIssueCount > 0) {
      perfReport.optimizations.push('🧠 Implement proper memory management and cleanup');
    }
    
    perfReport.optimizations.push('⚡ Use Web Workers for CPU-intensive tasks');
    perfReport.optimizations.push('🗂️ Implement lazy loading for non-critical resources');
    perfReport.optimizations.push('📊 Add performance monitoring and profiling');
    perfReport.optimizations.push('🔄 Consider using virtual scrolling for large lists');

    return perfReport;
  }

  scanFileForPerformance(filePath, performancePatterns, memoryPatterns, report) {
    const fs = require('fs');
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Check for performance bottlenecks
      for (const patternInfo of performancePatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (patternInfo.pattern.test(lines[i])) {
            report.bottlenecks.push({
              type: patternInfo.type,
              description: patternInfo.description,
              file: filePath.replace(process.cwd(), '.'),
              line: i + 1,
              code: lines[i].trim()
            });
          }
        }
      }
      
      // Check for memory patterns
      for (const patternInfo of memoryPatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (patternInfo.pattern.test(lines[i])) {
            report.memoryPatterns.push({
              type: patternInfo.type,
              description: patternInfo.description,
              file: filePath.replace(process.cwd(), '.'),
              line: i + 1,
              code: lines[i].trim()
            });
          }
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  analyzeDependencyPerformance(report) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      if (!fs.existsSync(packagePath)) return;
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      report.dependencyImpact.totalDependencies = Object.keys(dependencies).length;
      
      // Known heavy dependencies that impact performance
      const heavyDependencies = ['lodash', 'moment', 'jquery', 'axios', 'react', 'vue', 'angular'];
      
      for (const depName of Object.keys(dependencies)) {
        if (heavyDependencies.includes(depName)) {
          report.dependencyImpact.heavyDependencies.push(depName);
        }
      }
      
      // Add recommendations based on dependency analysis
      if (dependencies['lodash']) {
        report.optimizations.push('Consider using native ES6 methods instead of lodash where possible');
      }
      if (dependencies['moment']) {
        report.optimizations.push('Consider using date-fns or dayjs instead of moment.js for smaller bundle size');
      }
      
    } catch (error) {
      // Skip dependency analysis if package.json is not readable
    }
  }

  cycleTheme() {
    if (!this.currentTheme) this.currentTheme = 'neon-purple';
    
    const themes = ['neon-purple', 'matrix-green', 'ocean-blue', 'sunset-orange'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.currentTheme = themes[nextIndex];
    
    console.log(chalk.cyan(`🎨 Theme switched to: ${this.currentTheme}`));
    console.log(chalk.gray('New color scheme will apply to future messages'));
    console.log('');
  }

  async cleanup() {
    this.logger.info('Starting cleanup process');
    
    // Clean up streaming and loading animations
    this.stopProgressiveLoading();
    this.stopStreamingDisplay();
    
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      this.logger.debug('File watcher closed');
    }
    
    // Cleanup voice manager
    if (this.voiceManager) {
      this.voiceManager.cleanup();
      this.logger.debug('Voice manager cleaned up');
    }
    
    // Cleanup collaboration manager
    if (this.collaborationManager) {
      this.collaborationManager.cleanup();
      this.logger.debug('Collaboration manager cleaned up');
    }
    
    // Cleanup plugins
    if (this.pluginManager) {
      await this.pluginManager.cleanup();
      this.logger.debug('Plugins cleaned up');
    }
    
    // End session logging
    if (this.logger) {
      this.logger.endSession();
      this.logger.info('Session cleanup completed');
    }
  }

  /**
   * Load user configuration from onboarding
   */
  loadUserConfig() {
    const path = require('path');
    const fs = require('fs');
    const configFile = path.join(require('os').homedir(), '.recoder-code', 'config.json');
    
    try {
      if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
      }
    } catch (error) {
      // Return empty config if can't load
    }
    
    return {};
  }

  start() {
    this.rl.prompt();
  }

  /**
   * Infer task type from user message
   */
  inferTaskType(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('review') || messageLower.includes('analyze') || messageLower.includes('check')) {
      return 'analysis';
    } else if (messageLower.includes('code') || messageLower.includes('function') || messageLower.includes('class')) {
      return 'coding';
    } else if (messageLower.includes('document') || messageLower.includes('write') || messageLower.includes('explain')) {
      return 'writing';
    } else if (messageLower.includes('test') || messageLower.includes('debug') || messageLower.includes('fix')) {
      return 'coding';
    } else {
      return 'general';
    }
  }

  /**
   * Build enhanced context using available systems
   */
  buildEnhancedContext(message) {
    const context = {
      estimatedTokens: message.length * 1.5, // Rough estimation
      hasImages: false,
      needsTools: message.includes('create') || message.includes('build') || message.includes('generate')
    };

    // Add context from context engine if available
    if (this.contextEngine) {
      try {
        const codebaseContext = this.contextEngine.generateContext(message, {
          maxFiles: 5,
          maxTokens: 10000
        });
        context.codebaseSize = codebaseContext.codebaseOverview?.totalFiles || 0;
        context.relevantFiles = codebaseContext.relevantFiles?.length || 0;
      } catch (error) {
        // Ignore context generation errors
      }
    }

    return context;
  }
}

// Start the interactive chat if this file is run directly
if (require.main === module) {
  const chat = new InteractiveRecoderChat();
  chat.start();
}

module.exports = InteractiveRecoderChat;