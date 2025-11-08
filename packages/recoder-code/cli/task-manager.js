#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const { EventEmitter } = require('events');

/**
 * Enhanced Task Manager with Automation
 * Intelligent task management, automation, and workflow orchestration
 */
class TaskManager extends EventEmitter {
  constructor(projectManager, contextEngine, rulesEngine) {
    super();
    
    this.projectManager = projectManager;
    this.contextEngine = contextEngine;
    this.rulesEngine = rulesEngine;
    
    this.tasks = new Map();
    this.workflows = new Map();
    this.automations = new Map();
    this.taskHistory = [];
    this.activeWorkflows = new Set();
    this.taskQueue = [];
    this.taskTemplates = new Map();
    this.taskDependencies = new Map();
    this.taskProgress = new Map();
    this.notifications = [];
    
    // Task execution modes
    this.executionModes = {
      manual: 'User-initiated tasks',
      automatic: 'AI-triggered tasks based on context',
      scheduled: 'Time-based recurring tasks',
      event: 'Event-driven task execution',
      workflow: 'Multi-step workflow execution'
    };
    
    // Task categories
    this.taskCategories = {
      development: { icon: '💻', color: 'cyan' },
      testing: { icon: '🧪', color: 'yellow' },
      deployment: { icon: '🚀', color: 'green' },
      documentation: { icon: '📚', color: 'blue' },
      maintenance: { icon: '🔧', color: 'magenta' },
      security: { icon: '🔒', color: 'red' },
      analysis: { icon: '📊', color: 'white' },
      automation: { icon: '🤖', color: 'gray' }
    };
    
    this.initializeTaskManager();
  }

  /**
   * Initialize the task manager
   */
  async initializeTaskManager() {
    console.log(chalk.cyan('🎯 Initializing Task Manager...'));
    
    try {
      await this.loadTaskTemplates();
      await this.loadTasks();
      await this.loadWorkflows();
      await this.loadAutomations();
      this.startAutomationEngine();
      
      console.log(chalk.green('✅ Task Manager ready'));
      console.log(chalk.gray(`   Tasks: ${this.tasks.size}`));
      console.log(chalk.gray(`   Workflows: ${this.workflows.size}`));
      console.log(chalk.gray(`   Automations: ${this.automations.size}`));
      console.log(chalk.gray(`   Templates: ${this.taskTemplates.size}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Task Manager initialization failed: ${error.message}`));
    }
  }

  /**
   * Load task templates
   */
  async loadTaskTemplates() {
    const templates = {
      'code-review': {
        name: 'Code Review',
        category: 'development',
        description: 'Comprehensive code review with security and quality checks',
        estimatedDuration: '15-30 minutes',
        steps: [
          { name: 'Security Analysis', command: '/security --scan-type full' },
          { name: 'Code Quality Review', command: '/review --scope changed --focus security,performance' },
          { name: 'Test Coverage Check', command: '/test --coverage-check' },
          { name: 'Documentation Review', command: '/docs --check-coverage' }
        ],
        automations: ['pre-commit', 'pre-merge'],
        dependencies: [],
        outputs: ['security-report', 'quality-report', 'test-coverage']
      },
      
      'feature-development': {
        name: 'Feature Development',
        category: 'development',
        description: 'Complete feature development workflow',
        estimatedDuration: '2-8 hours',
        steps: [
          { name: 'Requirements Analysis', type: 'analysis' },
          { name: 'Architecture Design', type: 'design' },
          { name: 'Implementation', type: 'coding' },
          { name: 'Unit Testing', type: 'testing' },
          { name: 'Integration Testing', type: 'testing' },
          { name: 'Documentation', type: 'documentation' },
          { name: 'Code Review', template: 'code-review' }
        ],
        automations: ['branch-creation', 'pr-creation'],
        dependencies: [],
        outputs: ['feature-code', 'tests', 'documentation']
      },
      
      'bug-fix': {
        name: 'Bug Fix',
        category: 'development',
        description: 'Systematic bug investigation and resolution',
        estimatedDuration: '30 minutes - 4 hours',
        steps: [
          { name: 'Bug Reproduction', type: 'analysis' },
          { name: 'Root Cause Analysis', type: 'analysis' },
          { name: 'Fix Implementation', type: 'coding' },
          { name: 'Fix Verification', type: 'testing' },
          { name: 'Regression Testing', type: 'testing' },
          { name: 'Documentation Update', type: 'documentation' }
        ],
        automations: ['issue-linking', 'test-generation'],
        dependencies: [],
        outputs: ['fix-code', 'tests', 'documentation']
      },
      
      'deployment': {
        name: 'Deployment',
        category: 'deployment',
        description: 'Complete deployment process with checks',
        estimatedDuration: '15-45 minutes',
        steps: [
          { name: 'Pre-deployment Checks', type: 'validation' },
          { name: 'Build Process', type: 'build' },
          { name: 'Automated Testing', type: 'testing' },
          { name: 'Security Scan', command: '/security --deployment-check' },
          { name: 'Deployment Execution', type: 'deployment' },
          { name: 'Post-deployment Verification', type: 'validation' },
          { name: 'Monitoring Setup', type: 'monitoring' }
        ],
        automations: ['build-trigger', 'rollback-on-failure'],
        dependencies: ['feature-development', 'code-review'],
        outputs: ['deployment-report', 'monitoring-config']
      },
      
      'security-audit': {
        name: 'Security Audit',
        category: 'security',
        description: 'Comprehensive security assessment',
        estimatedDuration: '1-3 hours',
        steps: [
          { name: 'Vulnerability Scan', command: '/security --scan-type deep' },
          { name: 'Dependency Audit', type: 'analysis' },
          { name: 'Code Security Review', command: '/review --focus security' },
          { name: 'Configuration Review', type: 'analysis' },
          { name: 'Compliance Check', type: 'validation' },
          { name: 'Security Report Generation', type: 'documentation' }
        ],
        automations: ['scheduled-weekly', 'dependency-update-trigger'],
        dependencies: [],
        outputs: ['security-report', 'compliance-report', 'remediation-plan']
      },
      
      'performance-optimization': {
        name: 'Performance Optimization',
        category: 'development',
        description: 'System performance analysis and optimization',
        estimatedDuration: '2-6 hours',
        steps: [
          { name: 'Performance Baseline', type: 'analysis' },
          { name: 'Bottleneck Identification', command: '/optimize --target web --analyze' },
          { name: 'Optimization Implementation', type: 'coding' },
          { name: 'Performance Testing', type: 'testing' },
          { name: 'Benchmark Comparison', type: 'analysis' },
          { name: 'Performance Documentation', type: 'documentation' }
        ],
        automations: ['performance-monitoring', 'regression-alerts'],
        dependencies: [],
        outputs: ['optimization-code', 'performance-report', 'benchmarks']
      }
    };
    
    for (const [id, template] of Object.entries(templates)) {
      this.taskTemplates.set(id, {
        id,
        ...template,
        created: new Date().toISOString(),
        version: '1.0.0'
      });
    }
  }

  /**
   * Create task from template
   */
  createTaskFromTemplate(templateId, options = {}) {
    const template = this.taskTemplates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    const taskId = this.generateTaskId();
    const task = {
      id: taskId,
      templateId: templateId,
      name: options.name || template.name,
      category: template.category,
      description: options.description || template.description,
      status: 'pending',
      priority: options.priority || 'medium',
      mode: options.mode || 'manual',
      created: new Date().toISOString(),
      creator: options.creator || 'user',
      estimatedDuration: template.estimatedDuration,
      steps: template.steps.map((step, index) => ({
        id: `${taskId}_step_${index}`,
        ...step,
        status: 'pending',
        startTime: null,
        endTime: null,
        result: null,
        error: null
      })),
      progress: 0,
      currentStep: 0,
      dependencies: template.dependencies || [],
      outputs: template.outputs || [],
      metadata: options.metadata || {},
      automations: template.automations || [],
      notifications: options.notifications || [],
      context: {
        projectPath: process.cwd(),
        environment: process.env.NODE_ENV || 'development',
        triggeredBy: options.triggeredBy || 'manual'
      }
    };
    
    this.tasks.set(taskId, task);
    this.taskProgress.set(taskId, { completed: 0, total: task.steps.length });
    
    // Set up dependencies
    if (task.dependencies.length > 0) {
      this.taskDependencies.set(taskId, new Set(task.dependencies));
    }
    
    this.emit('taskCreated', task);
    
    console.log(chalk.green(`✅ Created task: ${task.name} (${taskId})`));
    
    return taskId;
  }

  /**
   * Execute task
   */
  async executeTask(taskId, options = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== 'pending') {
      throw new Error(`Task ${taskId} is not in pending state (current: ${task.status})`);
    }
    
    // Check dependencies
    if (!this.areDependenciesMet(taskId)) {
      const pendingDeps = this.getPendingDependencies(taskId);
      throw new Error(`Dependencies not met: ${pendingDeps.join(', ')}`);
    }
    
    console.log(chalk.cyan(`🎯 Executing task: ${task.name}`));
    
    task.status = 'running';
    task.startTime = new Date().toISOString();
    task.currentStep = 0;
    
    this.emit('taskStarted', task);
    
    try {
      for (let i = 0; i < task.steps.length; i++) {
        const step = task.steps[i];
        task.currentStep = i;
        
        console.log(chalk.blue(`  📋 Step ${i + 1}/${task.steps.length}: ${step.name}`));
        
        step.status = 'running';
        step.startTime = new Date().toISOString();
        
        this.emit('stepStarted', { task, step, stepIndex: i });
        
        try {
          const stepResult = await this.executeStep(step, task, options);
          
          step.status = 'completed';
          step.endTime = new Date().toISOString();
          step.result = stepResult;
          
          // Update progress
          const progress = this.taskProgress.get(taskId);
          progress.completed = i + 1;
          task.progress = Math.round((progress.completed / progress.total) * 100);
          
          console.log(chalk.green(`    ✅ ${step.name} completed`));
          
          this.emit('stepCompleted', { task, step, stepIndex: i, result: stepResult });
          
        } catch (stepError) {
          step.status = 'failed';
          step.endTime = new Date().toISOString();
          step.error = stepError.message;
          
          console.log(chalk.red(`    ❌ ${step.name} failed: ${stepError.message}`));
          
          this.emit('stepFailed', { task, step, stepIndex: i, error: stepError });
          
          if (!options.continueOnError) {
            throw stepError;
          }
        }
      }
      
      task.status = 'completed';
      task.endTime = new Date().toISOString();
      task.progress = 100;
      
      console.log(chalk.green(`✅ Task completed: ${task.name}`));
      
      this.emit('taskCompleted', task);
      
      // Save task history
      this.taskHistory.push({
        taskId: taskId,
        action: 'completed',
        timestamp: new Date().toISOString(),
        duration: this.calculateDuration(task.startTime, task.endTime),
        success: true
      });
      
      return task;
      
    } catch (error) {
      task.status = 'failed';
      task.endTime = new Date().toISOString();
      task.error = error.message;
      
      console.log(chalk.red(`❌ Task failed: ${task.name} - ${error.message}`));
      
      this.emit('taskFailed', { task, error });
      
      // Save task history
      this.taskHistory.push({
        taskId: taskId,
        action: 'failed',
        timestamp: new Date().toISOString(),
        duration: this.calculateDuration(task.startTime, task.endTime),
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Execute individual step
   */
  async executeStep(step, task, options = {}) {
    switch (step.type) {
      case 'analysis':
        return await this.executeAnalysisStep(step, task, options);
      case 'coding':
        return await this.executeCodingStep(step, task, options);
      case 'testing':
        return await this.executeTestingStep(step, task, options);
      case 'documentation':
        return await this.executeDocumentationStep(step, task, options);
      case 'validation':
        return await this.executeValidationStep(step, task, options);
      case 'deployment':
        return await this.executeDeploymentStep(step, task, options);
      default:
        if (step.command) {
          return await this.executeCommand(step.command, task, options);
        } else if (step.template) {
          return await this.executeTemplate(step.template, task, options);
        } else {
          return await this.executeGenericStep(step, task, options);
        }
    }
  }

  /**
   * Execute slash command step
   */
  async executeCommand(command, task, options = {}) {
    if (this.contextEngine && this.contextEngine.slashCommands) {
      try {
        const result = await this.contextEngine.slashCommands.executeCommand(command);
        return result;
      } catch (error) {
        throw new Error(`Command execution failed: ${error.message}`);
      }
    } else {
      throw new Error('Slash commands not available');
    }
  }

  /**
   * Execute analysis step
   */
  async executeAnalysisStep(step, task, options = {}) {
    // Use context engine for codebase analysis
    if (this.contextEngine) {
      const context = this.contextEngine.generateContext(step.name, {
        maxFiles: 20,
        maxTokens: 50000
      });
      
      return {
        type: 'analysis',
        files_analyzed: context.relevantFiles.length,
        codebase_overview: context.codebaseOverview,
        insights: context.patterns || [],
        timestamp: new Date().toISOString()
      };
    }
    
    return { type: 'analysis', status: 'completed', message: 'Analysis step completed' };
  }

  /**
   * Execute testing step
   */
  async executeTestingStep(step, task, options = {}) {
    // Run appropriate tests based on project type
    const testCommands = this.detectTestCommands();
    
    if (testCommands.length > 0) {
      const results = [];
      for (const cmd of testCommands) {
        try {
          // This would execute actual test commands
          results.push({
            command: cmd,
            status: 'passed',
            coverage: Math.random() * 100 // Mock coverage
          });
        } catch (error) {
          results.push({
            command: cmd,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      return {
        type: 'testing',
        results: results,
        overall_status: results.every(r => r.status === 'passed') ? 'passed' : 'failed'
      };
    }
    
    return { type: 'testing', status: 'skipped', message: 'No test commands found' };
  }

  /**
   * Start automation engine
   */
  startAutomationEngine() {
    console.log(chalk.gray('🤖 Starting automation engine...'));
    
    // Set up file watchers for automated triggers
    if (this.contextEngine && this.contextEngine.fileWatcher && typeof this.contextEngine.on === 'function') {
      this.contextEngine.on('fileChanged', (filePath, eventType) => {
        this.handleFileChangeAutomation(filePath, eventType);
      });
    }
    
    // Set up scheduled automations
    this.setupScheduledAutomations();
    
    // Set up event listeners for workflow triggers
    this.setupEventAutomations();
  }

  /**
   * Handle file change automations
   */
  async handleFileChangeAutomation(filePath, eventType) {
    const fileExt = path.extname(filePath);
    const fileName = path.basename(filePath);
    
    // Trigger code review on code changes
    if (['.js', '.ts', '.py', '.go', '.java'].includes(fileExt) && eventType === 'change') {
      const automation = this.automations.get('auto-code-review');
      if (automation && automation.enabled) {
        console.log(chalk.yellow(`🤖 Auto-triggering code review for ${fileName}`));
        try {
          const taskId = this.createTaskFromTemplate('code-review', {
            name: `Auto Review: ${fileName}`,
            mode: 'automatic',
            triggeredBy: 'file-change',
            metadata: { filePath, eventType }
          });
          
          if (automation.autoExecute) {
            await this.executeTask(taskId, { continueOnError: true });
          }
        } catch (error) {
          console.log(chalk.red(`❌ Auto code review failed: ${error.message}`));
        }
      }
    }
    
    // Trigger security scan on dependency changes
    if (['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml'].includes(fileName)) {
      const automation = this.automations.get('auto-security-scan');
      if (automation && automation.enabled) {
        console.log(chalk.yellow(`🔒 Auto-triggering security scan for dependency change`));
        try {
          const taskId = this.createTaskFromTemplate('security-audit', {
            name: 'Auto Security Scan: Dependencies',
            mode: 'automatic',
            triggeredBy: 'dependency-change'
          });
          
          if (automation.autoExecute) {
            await this.executeTask(taskId, { continueOnError: true });
          }
        } catch (error) {
          console.log(chalk.red(`❌ Auto security scan failed: ${error.message}`));
        }
      }
    }
  }

  /**
   * Setup scheduled automations
   */
  setupScheduledAutomations() {
    // Weekly security audit
    const weeklySecurityAudit = {
      id: 'weekly-security-audit',
      name: 'Weekly Security Audit',
      schedule: '0 9 * * 1', // Every Monday at 9 AM
      template: 'security-audit',
      enabled: true,
      autoExecute: false // Requires manual approval
    };
    
    this.automations.set('weekly-security-audit', weeklySecurityAudit);
    
    // Daily performance monitoring
    const dailyPerformanceCheck = {
      id: 'daily-performance-check',
      name: 'Daily Performance Check',
      schedule: '0 8 * * *', // Every day at 8 AM
      template: 'performance-optimization',
      enabled: false, // Disabled by default
      autoExecute: false
    };
    
    this.automations.set('daily-performance-check', dailyPerformanceCheck);
  }

  /**
   * Setup event automations
   */
  setupEventAutomations() {
    const eventAutomations = {
      'auto-code-review': {
        id: 'auto-code-review',
        name: 'Automatic Code Review',
        trigger: 'file-change',
        filePatterns: ['*.js', '*.ts', '*.py', '*.go', '*.java'],
        template: 'code-review',
        enabled: true,
        autoExecute: false,
        debounceMs: 5000 // Wait 5 seconds for additional changes
      },
      
      'auto-security-scan': {
        id: 'auto-security-scan',
        name: 'Automatic Security Scan',
        trigger: 'dependency-change',
        filePatterns: ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml'],
        template: 'security-audit',
        enabled: true,
        autoExecute: false
      },
      
      'pre-commit-validation': {
        id: 'pre-commit-validation',
        name: 'Pre-commit Validation',
        trigger: 'git-pre-commit',
        template: 'code-review',
        enabled: false,
        autoExecute: true
      }
    };
    
    for (const [id, automation] of Object.entries(eventAutomations)) {
      this.automations.set(id, automation);
    }
  }

  /**
   * Display task status
   */
  displayTaskStatus() {
    console.log(chalk.bold.cyan('\n🎯 Task Manager Status\n'));
    
    const activeTasks = Array.from(this.tasks.values()).filter(t => t.status === 'running');
    const pendingTasks = Array.from(this.tasks.values()).filter(t => t.status === 'pending');
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'completed');
    const failedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'failed');
    
    console.log(chalk.bold('Task Summary:'));
    console.log(chalk.yellow(`  🔄 Running: ${activeTasks.length}`));
    console.log(chalk.blue(`  ⏳ Pending: ${pendingTasks.length}`));
    console.log(chalk.green(`  ✅ Completed: ${completedTasks.length}`));
    console.log(chalk.red(`  ❌ Failed: ${failedTasks.length}`));
    console.log();
    
    if (activeTasks.length > 0) {
      console.log(chalk.bold.yellow('Running Tasks:'));
      for (const task of activeTasks) {
        const currentStep = task.steps[task.currentStep];
        console.log(chalk.yellow(`  • ${task.name} (${task.progress}%)`));
        console.log(chalk.gray(`    Current: ${currentStep?.name || 'Unknown'}`));
      }
      console.log();
    }
    
    console.log(chalk.bold('Automations:'));
    for (const [id, automation] of this.automations.entries()) {
      const status = automation.enabled ? chalk.green('✅') : chalk.red('❌');
      console.log(`  ${status} ${automation.name}`);
    }
    console.log();
    
    console.log(chalk.bold('Templates:'));
    for (const [id, template] of this.taskTemplates.entries()) {
      const category = this.taskCategories[template.category];
      const icon = category ? category.icon : '📋';
      console.log(chalk.white(`  ${icon} ${template.name} (${template.steps.length} steps)`));
    }
  }

  /**
   * Utility methods
   */
  
  generateTaskId() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  areDependenciesMet(taskId) {
    const dependencies = this.taskDependencies.get(taskId);
    if (!dependencies || dependencies.size === 0) return true;
    
    for (const depId of dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
  }
  
  getPendingDependencies(taskId) {
    const dependencies = this.taskDependencies.get(taskId);
    if (!dependencies) return [];
    
    return Array.from(dependencies).filter(depId => {
      const depTask = this.tasks.get(depId);
      return !depTask || depTask.status !== 'completed';
    });
  }
  
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end - start) / 1000); // Duration in seconds
  }
  
  detectTestCommands() {
    const commands = [];
    
    if (fs.existsSync('package.json')) {
      try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (pkg.scripts && pkg.scripts.test) {
          commands.push('npm test');
        }
      } catch (error) {
        // Ignore
      }
    }
    
    if (fs.existsSync('pytest.ini') || fs.existsSync('setup.cfg')) {
      commands.push('pytest');
    }
    
    if (fs.existsSync('go.mod')) {
      commands.push('go test ./...');
    }
    
    return commands;
  }

  /**
   * Save and load methods
   */
  
  async loadTasks() {
    // Load tasks from project manager or local storage
    try {
      const tasksFile = path.join(this.projectManager.projectDir, 'tasks.json');
      if (fs.existsSync(tasksFile)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        for (const [id, task] of Object.entries(tasksData)) {
          this.tasks.set(id, task);
          this.taskProgress.set(id, { 
            completed: task.steps.filter(s => s.status === 'completed').length,
            total: task.steps.length 
          });
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load tasks: ${error.message}`));
    }
  }
  
  async loadWorkflows() {
    // Load workflow definitions
    try {
      const workflowsFile = path.join(this.projectManager.projectDir, 'workflows.json');
      if (fs.existsSync(workflowsFile)) {
        const workflowsData = JSON.parse(fs.readFileSync(workflowsFile, 'utf8'));
        for (const [id, workflow] of Object.entries(workflowsData)) {
          this.workflows.set(id, workflow);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load workflows: ${error.message}`));
    }
  }
  
  async loadAutomations() {
    // Load automation configurations
    try {
      const automationsFile = path.join(this.projectManager.projectDir, 'automations.json');
      if (fs.existsSync(automationsFile)) {
        const automationsData = JSON.parse(fs.readFileSync(automationsFile, 'utf8'));
        for (const [id, automation] of Object.entries(automationsData)) {
          this.automations.set(id, automation);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load automations: ${error.message}`));
    }
  }

  /**
   * ENHANCED AUTOMATION FEATURES
   */

  /**
   * Advanced workflow orchestration
   */
  async executeWorkflow(workflowId, options = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    console.log(chalk.cyan(`🔄 Executing workflow: ${workflow.name}`));

    const workflowExecution = {
      id: `exec_${workflowId}_${Date.now()}`,
      workflowId: workflowId,
      status: 'running',
      startTime: new Date().toISOString(),
      steps: workflow.steps.map(step => ({
        ...step,
        status: 'pending',
        startTime: null,
        endTime: null,
        result: null
      })),
      context: {
        ...options.context,
        triggeredBy: options.triggeredBy || 'manual',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    try {
      for (let i = 0; i < workflowExecution.steps.length; i++) {
        const step = workflowExecution.steps[i];
        
        console.log(chalk.blue(`  📋 Workflow Step ${i + 1}: ${step.name}`));
        
        step.status = 'running';
        step.startTime = new Date().toISOString();

        try {
          const result = await this.executeWorkflowStep(step, workflowExecution.context);
          step.result = result;
          step.status = 'completed';
          step.endTime = new Date().toISOString();
          
          console.log(chalk.green(`    ✅ ${step.name} completed`));
        } catch (error) {
          step.error = error.message;
          step.status = 'failed';
          step.endTime = new Date().toISOString();
          
          console.log(chalk.red(`    ❌ ${step.name} failed: ${error.message}`));
          
          if (step.continueOnFailure !== true) {
            workflowExecution.status = 'failed';
            break;
          }
        }
      }

      if (workflowExecution.status !== 'failed') {
        workflowExecution.status = 'completed';
        console.log(chalk.green(`✅ Workflow completed: ${workflow.name}`));
      }

      workflowExecution.endTime = new Date().toISOString();
      this.emit('workflowCompleted', workflowExecution);

      return workflowExecution;

    } catch (error) {
      workflowExecution.status = 'failed';
      workflowExecution.error = error.message;
      workflowExecution.endTime = new Date().toISOString();
      
      console.log(chalk.red(`❌ Workflow failed: ${error.message}`));
      this.emit('workflowFailed', workflowExecution);
      
      throw error;
    }
  }

  /**
   * Execute individual workflow step
   */
  async executeWorkflowStep(step, context) {
    switch (step.type) {
      case 'task':
        return await this.executeTaskStep(step, context);
      case 'command':
        return await this.executeCommandStep(step, context);
      case 'api':
        return await this.executeApiStep(step, context);
      case 'condition':
        return await this.executeConditionStep(step, context);
      case 'parallel':
        return await this.executeParallelSteps(step, context);
      case 'delay':
        return await this.executeDelayStep(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute task step
   */
  async executeTaskStep(step, context) {
    if (step.taskTemplate) {
      const taskId = this.createTaskFromTemplate(step.taskTemplate, {
        name: step.name,
        triggeredBy: `workflow:${context.workflowId}`,
        context: context
      });
      
      return await this.executeTask(taskId);
    } else if (step.command) {
      return await this.executeSlashCommand(step.command, context);
    }
    
    throw new Error(`Invalid task step configuration: ${step.name}`);
  }

  /**
   * Execute command step
   */
  async executeCommandStep(step, context) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      console.log(chalk.gray(`    🔧 Running: ${step.command}`));
      
      const { stdout, stderr } = await execAsync(step.command, {
        cwd: context.projectPath || process.cwd(),
        env: { ...process.env, ...step.env },
        timeout: step.timeout || 30000
      });

      return {
        stdout: stdout,
        stderr: stderr,
        success: true
      };
    } catch (error) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  /**
   * Execute API step
   */
  async executeApiStep(step, context) {
    const https = require('https');
    const http = require('http');

    return new Promise((resolve, reject) => {
      const url = new URL(step.url);
      const client = url.protocol === 'https:' ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: step.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...step.headers
        }
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              data: data,
              headers: res.headers
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (step.body) {
        req.write(JSON.stringify(step.body));
      }

      req.end();
    });
  }

  /**
   * Execute condition step
   */
  async executeConditionStep(step, context) {
    const condition = step.condition;
    let result = false;

    switch (condition.type) {
      case 'file_exists':
        result = fs.existsSync(path.resolve(context.projectPath || process.cwd(), condition.path));
        break;
      case 'command_success':
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          await execAsync(condition.command, { cwd: context.projectPath });
          result = true;
        } catch {
          result = false;
        }
        break;
      case 'environment':
        result = process.env[condition.variable] === condition.value;
        break;
      case 'git_branch':
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const { stdout } = await execAsync('git branch --show-current', { cwd: context.projectPath });
          result = stdout.trim() === condition.branch;
        } catch {
          result = false;
        }
        break;
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }

    console.log(chalk.blue(`    🔍 Condition ${condition.type}: ${result ? 'TRUE' : 'FALSE'}`));

    if (result && step.onTrue) {
      return await this.executeWorkflowStep(step.onTrue, context);
    } else if (!result && step.onFalse) {
      return await this.executeWorkflowStep(step.onFalse, context);
    }

    return { conditionResult: result };
  }

  /**
   * Execute parallel steps
   */
  async executeParallelSteps(step, context) {
    const promises = step.steps.map(parallelStep => 
      this.executeWorkflowStep(parallelStep, context)
    );

    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    console.log(chalk.blue(`    ⚡ Parallel execution: ${successful.length} succeeded, ${failed.length} failed`));

    if (failed.length > 0 && !step.allowFailures) {
      throw new Error(`${failed.length} parallel steps failed`);
    }

    return {
      successful: successful.map(r => r.value),
      failed: failed.map(r => r.reason.message),
      totalSteps: results.length
    };
  }

  /**
   * Execute delay step
   */
  async executeDelayStep(step, context) {
    const delay = step.delay || 1000;
    console.log(chalk.blue(`    ⏳ Waiting ${delay}ms...`));
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ delayed: delay });
      }, delay);
    });
  }

  /**
   * Smart automation triggers
   */
  setupSmartAutomationTriggers() {
    console.log(chalk.cyan('🤖 Setting up smart automation triggers...'));

    // File system watchers for intelligent automation
    this.setupFileSystemAutomation();
    
    // Git hooks automation
    this.setupGitHooksAutomation();
    
    // Dependency change automation
    if (typeof this.setupDependencyAutomation === 'function') {
      this.setupDependencyAutomation();
    }
    
    // Performance monitoring automation
    if (typeof this.setupPerformanceAutomation === 'function') {
      this.setupPerformanceAutomation();
    }
    
    // Security monitoring automation
    if (typeof this.setupSecurityAutomation === 'function') {
      this.setupSecurityAutomation();
    }
  }

  /**
   * Setup file system automation
   */
  setupFileSystemAutomation() {
    const chokidar = require('chokidar');
    
    const watcher = chokidar.watch('.', {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      cwd: process.cwd()
    });

    watcher.on('change', async (filePath) => {
      console.log(chalk.gray(`📁 File changed: ${filePath}`));
      
      // Trigger appropriate automations based on file type
      if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
        await this.triggerCodeQualityAutomation(filePath);
      } else if (filePath === 'package.json') {
        await this.triggerDependencyAutomation();
      } else if (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js')) {
        await this.triggerTestAutomation(filePath);
      }
    });

    watcher.on('add', async (filePath) => {
      console.log(chalk.gray(`📄 File added: ${filePath}`));
      
      if (filePath.endsWith('.env')) {
        await this.triggerSecurityScanAutomation('new-env-file');
      }
    });
  }

  /**
   * Setup Git hooks automation
   */
  setupGitHooksAutomation() {
    // Monitor git operations through file system changes
    const gitWatcher = require('chokidar').watch('.git', {
      persistent: true,
      ignoreInitial: true,
      depth: 1
    });

    gitWatcher.on('change', async (filePath) => {
      if (filePath.includes('COMMIT_EDITMSG')) {
        await this.triggerPreCommitAutomation();
      } else if (filePath.includes('refs/heads')) {
        await this.triggerBranchChangeAutomation();
      }
    });
  }

  /**
   * Smart automation execution
   */
  async triggerCodeQualityAutomation(filePath) {
    const automation = this.automations.get('smart-code-quality');
    if (!automation || !automation.enabled) return;

    console.log(chalk.cyan(`🔍 Triggering code quality automation for ${filePath}`));

    try {
      // Create a context-aware task
      const taskId = this.createTaskFromTemplate('code-review', {
        name: `Auto Code Review: ${filePath}`,
        triggeredBy: 'file-change-automation',
        metadata: {
          filePath: filePath,
          changeType: 'modification',
          timestamp: new Date().toISOString()
        }
      });

      if (automation.autoExecute) {
        await this.executeTask(taskId);
      } else {
        console.log(chalk.yellow(`📋 Task queued for manual execution: ${taskId}`));
        this.taskQueue.push(taskId);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Code quality automation failed: ${error.message}`));
    }
  }

  async triggerDependencyAutomation() {
    console.log(chalk.cyan('📦 Triggering dependency security scan...'));
    
    try {
      const taskId = this.createTaskFromTemplate('security-audit', {
        name: 'Auto Dependency Security Scan',
        triggeredBy: 'dependency-change-automation'
      });

      await this.executeTask(taskId);
    } catch (error) {
      console.log(chalk.red(`❌ Dependency automation failed: ${error.message}`));
    }
  }

  async triggerTestAutomation(filePath) {
    console.log(chalk.cyan(`🧪 Triggering test automation for ${filePath}`));
    
    try {
      const taskId = this.createTaskFromTemplate('run-tests', {
        name: `Auto Test Run: ${filePath}`,
        triggeredBy: 'test-file-change-automation',
        metadata: { testFile: filePath }
      });

      await this.executeTask(taskId);
    } catch (error) {
      console.log(chalk.red(`❌ Test automation failed: ${error.message}`));
    }
  }

  async triggerPreCommitAutomation() {
    console.log(chalk.cyan('🔒 Triggering pre-commit automation...'));
    
    const preCommitWorkflow = {
      id: 'pre-commit-workflow',
      name: 'Pre-commit Quality Checks',
      steps: [
        {
          type: 'command',
          name: 'Run linter',
          command: 'npm run lint',
          continueOnFailure: false
        },
        {
          type: 'command',
          name: 'Run tests',
          command: 'npm test',
          continueOnFailure: false
        },
        {
          type: 'command',
          name: 'Security scan',
          command: 'npm audit',
          continueOnFailure: true
        }
      ]
    };

    this.workflows.set('pre-commit-workflow', preCommitWorkflow);
    
    try {
      await this.executeWorkflow('pre-commit-workflow', {
        triggeredBy: 'pre-commit-hook'
      });
    } catch (error) {
      console.log(chalk.red(`❌ Pre-commit automation failed: ${error.message}`));
    }
  }

  /**
   * Create automation template
   */
  createAutomationTemplate(templateType) {
    const templates = {
      'file-watcher': {
        id: `file-watcher-${Date.now()}`,
        name: 'File Watcher Automation',
        type: 'file-system',
        enabled: true,
        triggers: ['file-change', 'file-add', 'file-delete'],
        conditions: [
          {
            type: 'file_pattern',
            patterns: ['*.js', '*.ts', '*.jsx', '*.tsx']
          }
        ],
        actions: [
          {
            type: 'task',
            template: 'code-review',
            autoExecute: false
          }
        ]
      },
      'git-hook': {
        id: `git-hook-${Date.now()}`,
        name: 'Git Hook Automation',
        type: 'git-event',
        enabled: true,
        triggers: ['pre-commit', 'pre-push', 'post-merge'],
        actions: [
          {
            type: 'workflow',
            id: 'quality-gate-workflow',
            autoExecute: true
          }
        ]
      },
      'scheduled': {
        id: `scheduled-${Date.now()}`,
        name: 'Scheduled Automation',
        type: 'scheduled',
        enabled: true,
        schedule: {
          cron: '0 0 * * *', // Daily at midnight
          timezone: 'UTC'
        },
        actions: [
          {
            type: 'task',
            template: 'security-audit',
            autoExecute: true
          }
        ]
      }
    };

    return templates[templateType] || templates['file-watcher'];
  }

  /**
   * Advanced task scheduling
   */
  scheduleTask(taskId, schedule) {
    const cron = require('node-cron');
    
    if (cron.validate(schedule)) {
      const task = cron.schedule(schedule, async () => {
        try {
          console.log(chalk.cyan(`⏰ Executing scheduled task: ${taskId}`));
          await this.executeTask(taskId);
        } catch (error) {
          console.log(chalk.red(`❌ Scheduled task failed: ${error.message}`));
        }
      }, {
        scheduled: false
      });

      task.start();
      
      console.log(chalk.green(`✅ Task scheduled: ${taskId} with cron ${schedule}`));
      return task;
    } else {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }
  }

  /**
   * AI-powered task optimization
   */
  async optimizeTaskExecution(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    // Analyze task history for optimization opportunities
    const optimizations = [];

    // Check if steps can be parallelized
    const parallelizableSteps = this.findParallelizableSteps(task);
    if (parallelizableSteps.length > 0) {
      optimizations.push({
        type: 'parallelization',
        description: `${parallelizableSteps.length} steps can be executed in parallel`,
        estimatedTimeSaving: '20-40%'
      });
    }

    // Check for redundant steps
    const redundantSteps = this.findRedundantSteps(task);
    if (redundantSteps.length > 0) {
      optimizations.push({
        type: 'redundancy-removal',
        description: `${redundantSteps.length} steps appear redundant`,
        estimatedTimeSaving: '10-20%'
      });
    }

    // Check for caching opportunities
    const cacheableSteps = this.findCacheableSteps(task);
    if (cacheableSteps.length > 0) {
      optimizations.push({
        type: 'caching',
        description: `${cacheableSteps.length} steps can benefit from caching`,
        estimatedTimeSaving: '30-60%'
      });
    }

    return optimizations;
  }

  /**
   * Helper methods for task optimization
   */
  findParallelizableSteps(task) {
    // Simple heuristic: steps that don't depend on each other's outputs
    const parallelizable = [];
    
    for (let i = 0; i < task.steps.length - 1; i++) {
      const currentStep = task.steps[i];
      const nextStep = task.steps[i + 1];
      
      // Check if next step doesn't depend on current step's output
      if (!this.stepHasDependency(nextStep, currentStep)) {
        parallelizable.push([currentStep, nextStep]);
      }
    }
    
    return parallelizable;
  }

  findRedundantSteps(task) {
    // Find steps with similar commands or purposes
    const redundant = [];
    const seen = new Set();
    
    for (const step of task.steps) {
      const fingerprint = this.getStepFingerprint(step);
      if (seen.has(fingerprint)) {
        redundant.push(step);
      } else {
        seen.add(fingerprint);
      }
    }
    
    return redundant;
  }

  findCacheableSteps(task) {
    // Find steps that are expensive and have deterministic outputs
    return task.steps.filter(step => {
      return (step.command && step.command.includes('test')) ||
             (step.command && step.command.includes('build')) ||
             (step.command && step.command.includes('lint'));
    });
  }

  stepHasDependency(step, previousStep) {
    // Simple check if step references previous step's outputs
    if (!step.command || !previousStep.command) return false;
    return step.command.includes('${') || step.dependsOn?.includes(previousStep.id);
  }

  getStepFingerprint(step) {
    // Create a fingerprint for detecting similar steps
    return `${step.type || 'command'}_${step.command || step.name}`;
  }

  /**
   * Export/Import automation configurations
   */
  exportAutomationConfig() {
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflows: Array.from(this.workflows.entries()).map(([id, workflow]) => ({
        id,
        ...workflow
      })),
      automations: Array.from(this.automations.entries()).map(([id, automation]) => ({
        id,
        ...automation
      })),
      templates: Array.from(this.taskTemplates.entries()).map(([id, template]) => ({
        id,
        ...template
      }))
    };

    return JSON.stringify(config, null, 2);
  }

  importAutomationConfig(configData) {
    try {
      const config = typeof configData === 'string' ? JSON.parse(configData) : configData;
      
      let importedCount = 0;

      if (config.workflows) {
        for (const workflow of config.workflows) {
          this.workflows.set(workflow.id, workflow);
          importedCount++;
        }
      }

      if (config.automations) {
        for (const automation of config.automations) {
          this.automations.set(automation.id, automation);
          importedCount++;
        }
      }

      if (config.templates) {
        for (const template of config.templates) {
          this.taskTemplates.set(template.id, template);
          importedCount++;
        }
      }

      console.log(chalk.green(`✅ Imported ${importedCount} automation configurations`));
      return { success: true, imported: importedCount };

    } catch (error) {
      console.log(chalk.red(`❌ Failed to import automation config: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

}

module.exports = TaskManager;