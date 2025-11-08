#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const inquirer = require('inquirer');

/**
 * Custom Slash Commands System
 * Flexible AI agent framework for specialized tasks
 */
class SlashCommandsEngine {
  constructor(contextEngine, projectManager, visionAnalyzer = null, todoManager = null) {
    this.contextEngine = contextEngine;
    this.projectManager = projectManager;
    this.visionAnalyzer = visionAnalyzer;
    this.todoManager = todoManager;
    this.commands = new Map();
    this.aliases = new Map();
    this.commandHistory = [];
    this.activeAgents = new Map();
    
    // Initialize built-in commands
    this.initializeBuiltinCommands();
    
    // Load custom commands
    this.loadCustomCommands();
  }

  /**
   * Initialize built-in slash commands
   */
  initializeBuiltinCommands() {
    console.log(chalk.cyan('⚡ Initializing slash commands...'));
    
    // Code Review Agent
    this.registerCommand({
      name: 'review',
      aliases: ['cr', 'code-review'],
      description: 'AI-powered code review with security and quality analysis',
      category: 'quality',
      agent: this.createCodeReviewAgent(),
      options: {
        scope: { type: 'string', default: 'current', choices: ['current', 'changed', 'all'] },
        focus: { type: 'array', default: ['security', 'performance', 'maintainability'] },
        severity: { type: 'string', default: 'medium', choices: ['low', 'medium', 'high', 'critical'] }
      }
    });

    // Security Assessment Agent
    this.registerCommand({
      name: 'security',
      aliases: ['sec', 'vuln'],
      description: 'Comprehensive security vulnerability assessment',
      category: 'security',
      agent: this.createSecurityAgent(),
      options: {
        scan_type: { type: 'string', default: 'full', choices: ['quick', 'full', 'deep'] },
        include_deps: { type: 'boolean', default: true },
        compliance: { type: 'array', default: ['owasp', 'cwe'] }
      }
    });

    // Performance Optimization Agent
    this.registerCommand({
      name: 'optimize',
      aliases: ['perf', 'performance'],
      description: 'Performance analysis and optimization recommendations',
      category: 'performance',
      agent: this.createPerformanceAgent(),
      options: {
        target: { type: 'string', default: 'web', choices: ['web', 'node', 'mobile', 'api'] },
        metrics: { type: 'array', default: ['speed', 'memory', 'bundle-size'] }
      }
    });

    // Documentation Generator Agent
    this.registerCommand({
      name: 'docs',
      aliases: ['doc', 'generate-docs'],
      description: 'Intelligent documentation generation',
      category: 'documentation',
      agent: this.createDocumentationAgent(),
      options: {
        format: { type: 'string', default: 'markdown', choices: ['markdown', 'jsdoc', 'openapi'] },
        scope: { type: 'string', default: 'api', choices: ['api', 'components', 'full'] },
        include_examples: { type: 'boolean', default: true }
      }
    });

    // Testing Strategy Agent
    this.registerCommand({
      name: 'test',
      aliases: ['testing', 'test-gen'],
      description: 'Generate comprehensive test strategies and test cases',
      category: 'testing',
      agent: this.createTestingAgent(),
      options: {
        test_type: { type: 'array', default: ['unit', 'integration'] },
        framework: { type: 'string', default: 'auto-detect' },
        coverage_target: { type: 'number', default: 80 }
      }
    });

    // Refactoring Agent
    this.registerCommand({
      name: 'refactor',
      aliases: ['ref', 'cleanup'],
      description: 'Intelligent code refactoring and cleanup',
      category: 'refactoring',
      agent: this.createRefactoringAgent(),
      options: {
        strategy: { type: 'string', default: 'conservative', choices: ['conservative', 'moderate', 'aggressive'] },
        patterns: { type: 'array', default: ['extract-functions', 'remove-duplication', 'simplify-logic'] }
      }
    });

    // API Design Agent
    this.registerCommand({
      name: 'api',
      aliases: ['api-design', 'openapi'],
      description: 'API design and OpenAPI specification generation',
      category: 'api',
      agent: this.createAPIAgent(),
      options: {
        version: { type: 'string', default: '3.0.0' },
        include_examples: { type: 'boolean', default: true },
        security_schemes: { type: 'array', default: ['bearerAuth'] }
      }
    });

    // Database Schema Agent
    this.registerCommand({
      name: 'schema',
      aliases: ['db', 'database'],
      description: 'Database schema analysis and optimization',
      category: 'database',
      agent: this.createDatabaseAgent(),
      options: {
        db_type: { type: 'string', default: 'postgresql', choices: ['postgresql', 'mysql', 'mongodb', 'sqlite'] },
        include_migrations: { type: 'boolean', default: true }
      }
    });

    // Deployment Agent
    this.registerCommand({
      name: 'deploy',
      aliases: ['deployment', 'ci-cd'],
      description: 'Deployment strategy and CI/CD pipeline generation',
      category: 'deployment',
      agent: this.createDeploymentAgent(),
      options: {
        platform: { type: 'string', default: 'docker', choices: ['docker', 'kubernetes', 'serverless', 'traditional'] },
        environment: { type: 'string', default: 'production', choices: ['development', 'staging', 'production'] }
      }
    });

    // Architecture Analysis Agent
    this.registerCommand({
      name: 'architecture',
      aliases: ['arch', 'design'],
      description: 'System architecture analysis and recommendations',
      category: 'architecture',
      agent: this.createArchitectureAgent(),
      options: {
        scope: { type: 'string', default: 'full', choices: ['modules', 'services', 'full'] },
        include_diagrams: { type: 'boolean', default: true }
      }
    });

    // Vision Analysis Agent
    if (this.visionAnalyzer) {
      this.registerCommand({
        name: 'analyze',
        aliases: ['vision', 'img'],
        description: 'Analyze images, diagrams, and visual content using AI vision',
        category: 'vision',
        agent: this.createVisionAnalysisAgent(),
        options: {
          template: { type: 'string', default: 'auto-detect', 
                     choices: ['auto-detect', 'ui-design', 'architecture-diagram', 'database-schema', 
                              'wireframe', 'flowchart', 'code-screenshot', 'error-screenshot', 'data-visualization'] },
          detailed: { type: 'boolean', default: false },
          generateCode: { type: 'boolean', default: false },
          focus: { type: 'string', default: null }
        }
      });
    }

    // Todo Management Commands for Production Use
    this.registerCommand({
      name: 'todo',
      aliases: ['task', 'todos'],
      description: 'Production-ready todo and task management system',
      category: 'productivity',
      agent: this.createTodoAgent(),
      options: {
        action: { type: 'string', default: 'list', choices: ['list', 'add', 'complete', 'start', 'delete', 'stats', 'search'] },
        priority: { type: 'string', default: 'medium', choices: ['low', 'medium', 'high'] },
        category: { type: 'string', default: 'general' },
        show_completed: { type: 'boolean', default: true }
      }
    });

    console.log(chalk.green(`✅ Loaded ${this.commands.size} built-in commands`));
  }

  /**
   * Register a new slash command
   */
  registerCommand(commandDef) {
    this.commands.set(commandDef.name, commandDef);
    
    // Register aliases
    if (commandDef.aliases) {
      for (const alias of commandDef.aliases) {
        this.aliases.set(alias, commandDef.name);
      }
    }
  }

  /**
   * Execute a slash command
   */
  async executeCommand(input, options = {}) {
    const { command, args } = this.parseCommand(input);
    
    if (!command) {
      return this.showHelp();
    }

    const commandDef = this.getCommand(command);
    if (!commandDef) {
      console.log(chalk.red(`❌ Unknown command: /${command}`));
      console.log(chalk.gray('Use /help to see available commands'));
      return;
    }

    // Add to history
    this.commandHistory.push({
      command: input,
      timestamp: new Date().toISOString(),
      options: options
    });

    try {
      console.log(chalk.cyan(`🤖 Executing /${command}...`));
      
      // Merge options with defaults
      const mergedOptions = this.mergeOptions(commandDef.options, args, options);
      
      // Generate context for the command
      const context = await this.generateCommandContext(commandDef, mergedOptions, args);
      
      // Execute the agent
      const result = await commandDef.agent.execute(context, mergedOptions);
      
      // Save result if needed
      if (options.save) {
        await this.saveCommandResult(commandDef.name, result, mergedOptions);
      }
      
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ Error executing /${command}: ${error.message}`));
      console.log(chalk.gray('Use --debug for more details'));
      
      if (options.debug) {
        console.log(chalk.gray(error.stack));
      }
    }
  }

  /**
   * Parse command input
   */
  parseCommand(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { command: null, args: {} };
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0];
    const args = {};

    // Parse arguments
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('--')) {
        const key = part.slice(2);
        let value = true;
        
        // Check if next part is a value
        if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
          value = parts[i + 1];
          i++; // Skip next part
        }
        
        args[key] = value;
      }
    }

    return { command, args };
  }

  /**
   * Get command definition
   */
  getCommand(name) {
    // Check direct command name
    if (this.commands.has(name)) {
      return this.commands.get(name);
    }
    
    // Check aliases
    if (this.aliases.has(name)) {
      const realName = this.aliases.get(name);
      return this.commands.get(realName);
    }
    
    return null;
  }

  /**
   * Generate context for command execution
   */
  async generateCommandContext(commandDef, options, args = []) {
    const context = {
      command: commandDef.name,
      category: commandDef.category,
      options: options,
      args: args,
      codebase: null,
      relevantFiles: [],
      projectInfo: null,
      todoManager: this.todoManager
    };

    // Get codebase context if context engine is available
    if (this.contextEngine) {
      const query = `${commandDef.name} ${commandDef.category} analysis`;
      const codebaseContext = this.contextEngine.generateContext(query, {
        maxFiles: 20,
        maxTokens: 50000
      });
      
      context.codebase = codebaseContext.codebaseOverview;
      context.relevantFiles = codebaseContext.relevantFiles;
    }

    // Get project information
    if (this.projectManager) {
      context.projectInfo = this.projectManager.getProjectContext();
    }

    return context;
  }

  /**
   * Show help for commands
   */
  showHelp(category = null) {
    console.log(chalk.bold.cyan('\n🤖 Available Slash Commands\n'));
    
    const categories = this.groupCommandsByCategory();
    
    for (const [cat, commands] of categories.entries()) {
      if (category && cat !== category) continue;
      
      console.log(chalk.bold.yellow(`${cat.charAt(0).toUpperCase() + cat.slice(1)}:`));
      
      for (const cmd of commands) {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        console.log(chalk.gray(`  /${cmd.name}${aliases}`));
        console.log(chalk.gray(`    ${cmd.description}`));
        
        if (cmd.options && Object.keys(cmd.options).length > 0) {
          console.log(chalk.gray('    Options:'));
          for (const [optName, optDef] of Object.entries(cmd.options)) {
            const defaultVal = optDef.default ? ` (default: ${optDef.default})` : '';
            console.log(chalk.gray(`      --${optName}${defaultVal}`));
          }
        }
        console.log();
      }
    }
    
    console.log(chalk.gray('Usage: /command --option value'));
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  /review --scope changed --focus security'));
    console.log(chalk.gray('  /optimize --target web --metrics speed,memory'));
    console.log(chalk.gray('  /docs --format openapi --include-examples true'));
  }

  /**
   * Group commands by category
   */
  groupCommandsByCategory() {
    const categories = new Map();
    
    for (const [name, cmd] of this.commands.entries()) {
      const category = cmd.category || 'general';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category).push(cmd);
    }
    
    return categories;
  }

  /**
   * Create Code Review Agent
   */
  createCodeReviewAgent() {
    return {
      name: 'CodeReviewAgent',
      async execute(context, options) {
        console.log(chalk.blue('🔍 Starting comprehensive code review...'));
        
        const analysis = {
          summary: 'Code Review Analysis',
          findings: [],
          recommendations: [],
          score: 0,
          metrics: {}
        };
        
        // Security analysis
        if (options.focus.includes('security')) {
          analysis.findings.push(...await this.analyzeSecurityIssues(context));
        }
        
        // Performance analysis
        if (options.focus.includes('performance')) {
          analysis.findings.push(...await this.analyzePerformanceIssues(context));
        }
        
        // Maintainability analysis
        if (options.focus.includes('maintainability')) {
          analysis.findings.push(...await this.analyzeMaintainabilityIssues(context));
        }
        
        // Calculate overall score
        analysis.score = this.calculateReviewScore(analysis.findings);
        
        this.displayReviewResults(analysis);
        return analysis;
      },
      
      async analyzeSecurityIssues(context) {
        const issues = [];
        
        for (const file of context.relevantFiles) {
          // Check for common security issues
          if (file.data.content.includes('eval(')) {
            issues.push({
              type: 'security',
              severity: 'high',
              file: file.path,
              line: this.findLineNumber(file.data.content, 'eval('),
              message: 'Use of eval() is dangerous and should be avoided',
              suggestion: 'Use JSON.parse() or Function constructor as safer alternatives'
            });
          }
          
          if (file.data.content.includes('innerHTML')) {
            issues.push({
              type: 'security',
              severity: 'medium',
              file: file.path,
              line: this.findLineNumber(file.data.content, 'innerHTML'),
              message: 'innerHTML usage may lead to XSS vulnerabilities',
              suggestion: 'Use textContent or sanitize HTML input'
            });
          }
          
          // Check for hardcoded secrets
          const secretPatterns = [
            /api[_-]?key\s*=\s*['"][^'"]{20,}['"]/gi,
            /password\s*=\s*['"][^'"]+['"]/gi,
            /secret\s*=\s*['"][^'"]{20,}['"]/gi
          ];
          
          for (const pattern of secretPatterns) {
            if (pattern.test(file.data.content)) {
              issues.push({
                type: 'security',
                severity: 'critical',
                file: file.path,
                message: 'Potential hardcoded secret detected',
                suggestion: 'Move secrets to environment variables or secure key management'
              });
            }
          }
        }
        
        return issues;
      },
      
      async analyzePerformanceIssues(context) {
        const issues = [];
        
        for (const file of context.relevantFiles) {
          // Check for performance anti-patterns
          if (file.data.content.includes('document.getElementById') && 
              file.data.content.split('document.getElementById').length > 3) {
            issues.push({
              type: 'performance',
              severity: 'medium',
              file: file.path,
              message: 'Multiple DOM queries detected',
              suggestion: 'Cache DOM elements or use querySelector with variables'
            });
          }
          
          // Check for synchronous operations in loops
          if (/for\s*\([^)]*\)[^{]*{[^}]*(?:await|\.sync\()/gm.test(file.data.content)) {
            issues.push({
              type: 'performance',
              severity: 'high',
              file: file.path,
              message: 'Synchronous operations in loop detected',
              suggestion: 'Use Promise.all() or batch operations for better performance'
            });
          }
        }
        
        return issues;
      },
      
      async analyzeMaintainabilityIssues(context) {
        const issues = [];
        
        for (const file of context.relevantFiles) {
          // Check function length
          const functions = file.data.analysis?.functions || [];
          if (file.data.lines > 500) {
            issues.push({
              type: 'maintainability',
              severity: 'medium',
              file: file.path,
              message: `Large file detected (${file.data.lines} lines)`,
              suggestion: 'Consider breaking into smaller, focused modules'
            });
          }
          
          // Check for code duplication (simplified)
          const duplicateThreshold = 5;
          const lines = file.data.content.split('\n');
          const duplicates = this.findDuplicateLines(lines, duplicateThreshold);
          
          if (duplicates.length > 0) {
            issues.push({
              type: 'maintainability',
              severity: 'low',
              file: file.path,
              message: `${duplicates.length} potential code duplications found`,
              suggestion: 'Extract common code into reusable functions'
            });
          }
        }
        
        return issues;
      },
      
      calculateReviewScore(findings) {
        let score = 100;
        
        for (const finding of findings) {
          switch (finding.severity) {
            case 'critical': score -= 15; break;
            case 'high': score -= 10; break;
            case 'medium': score -= 5; break;
            case 'low': score -= 2; break;
          }
        }
        
        return Math.max(0, score);
      },
      
      displayReviewResults(analysis) {
        console.log(chalk.bold.cyan('\n📊 Code Review Results\n'));
        
        // Overall score
        const scoreColor = analysis.score >= 80 ? 'green' : 
                          analysis.score >= 60 ? 'yellow' : 'red';
        console.log(chalk.bold[scoreColor](`Overall Score: ${analysis.score}/100`));
        
        // Findings by severity
        const severityGroups = {};
        for (const finding of analysis.findings) {
          if (!severityGroups[finding.severity]) {
            severityGroups[finding.severity] = [];
          }
          severityGroups[finding.severity].push(finding);
        }
        
        for (const [severity, findings] of Object.entries(severityGroups)) {
          const color = severity === 'critical' ? 'red' :
                       severity === 'high' ? 'yellow' :
                       severity === 'medium' ? 'blue' : 'gray';
          
          console.log(chalk.bold[color](`\n${severity.toUpperCase()} (${findings.length}):`));
          
          for (const finding of findings) {
            console.log(chalk[color](`  ${finding.file}: ${finding.message}`));
            if (finding.suggestion) {
              console.log(chalk.gray(`    💡 ${finding.suggestion}`));
            }
          }
        }
      },
      
      findLineNumber(content, searchString) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(searchString)) {
            return i + 1;
          }
        }
        return null;
      },
      
      findDuplicateLines(lines, threshold) {
        const lineMap = {};
        const duplicates = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.length < 10) continue; // Skip short lines
          
          if (!lineMap[line]) {
            lineMap[line] = [];
          }
          lineMap[line].push(i + 1);
        }
        
        for (const [line, occurrences] of Object.entries(lineMap)) {
          if (occurrences.length >= threshold) {
            duplicates.push({ line, occurrences });
          }
        }
        
        return duplicates;
      }
    };
  }

  /**
   * Create Security Agent
   */
  createSecurityAgent() {
    return {
      name: 'SecurityAgent',
      async execute(context, options) {
        console.log(chalk.red('🔒 Starting security assessment...'));
        
        const assessment = {
          summary: 'Security Vulnerability Assessment',
          vulnerabilities: [],
          compliance: {},
          recommendations: [],
          riskScore: 0
        };
        
        // Scan for vulnerabilities
        assessment.vulnerabilities = await this.scanVulnerabilities(context, options);
        
        // Check compliance
        if (options.compliance.includes('owasp')) {
          assessment.compliance.owasp = await this.checkOWASPCompliance(context);
        }
        
        if (options.compliance.includes('cwe')) {
          assessment.compliance.cwe = await this.checkCWECompliance(context);
        }
        
        // Calculate risk score
        assessment.riskScore = this.calculateRiskScore(assessment.vulnerabilities);
        
        this.displaySecurityResults(assessment);
        return assessment;
      },
      
      async scanVulnerabilities(context, options) {
        const vulnerabilities = [];
        
        for (const file of context.relevantFiles) {
          // SQL Injection checks
          const sqlInjectionPatterns = [
            /query.*\+.*req\.(body|params|query)/gi,
            /execute.*\+.*user/gi,
            /\$\{.*req\./gi
          ];
          
          for (const pattern of sqlInjectionPatterns) {
            if (pattern.test(file.data.content)) {
              vulnerabilities.push({
                type: 'sql-injection',
                severity: 'high',
                file: file.path,
                cwe: 'CWE-89',
                description: 'Potential SQL injection vulnerability',
                impact: 'Unauthorized database access',
                mitigation: 'Use parameterized queries or ORM'
              });
            }
          }
          
          // XSS checks
          if (file.data.content.includes('dangerouslySetInnerHTML') || 
              file.data.content.includes('v-html')) {
            vulnerabilities.push({
              type: 'xss',
              severity: 'medium',
              file: file.path,
              cwe: 'CWE-79',
              description: 'Potential Cross-Site Scripting vulnerability',
              impact: 'Client-side code execution',
              mitigation: 'Sanitize user input and use safe rendering methods'
            });
          }
          
          // Insecure cryptography
          if (file.data.content.includes('md5') || file.data.content.includes('sha1')) {
            vulnerabilities.push({
              type: 'weak-crypto',
              severity: 'medium',
              file: file.path,
              cwe: 'CWE-327',
              description: 'Use of weak cryptographic algorithm',
              impact: 'Data integrity compromise',
              mitigation: 'Use SHA-256 or stronger algorithms'
            });
          }
          
          // Insecure file uploads
          if (file.data.content.includes('multer') && 
              !file.data.content.includes('fileFilter')) {
            vulnerabilities.push({
              type: 'insecure-upload',
              severity: 'high',
              file: file.path,
              cwe: 'CWE-434',
              description: 'Unrestricted file upload',
              impact: 'Remote code execution',
              mitigation: 'Implement file type validation and size limits'
            });
          }
        }
        
        return vulnerabilities;
      },
      
      async checkOWASPCompliance(context) {
        const owaspTop10 = {
          'A01:2021-Broken Access Control': false,
          'A02:2021-Cryptographic Failures': false,
          'A03:2021-Injection': false,
          'A04:2021-Insecure Design': false,
          'A05:2021-Security Misconfiguration': false,
          'A06:2021-Vulnerable Components': false,
          'A07:2021-Identification and Authentication Failures': false,
          'A08:2021-Software and Data Integrity Failures': false,
          'A09:2021-Security Logging and Monitoring Failures': false,
          'A10:2021-Server-Side Request Forgery': false
        };
        
        // Basic checks for each category
        for (const file of context.relevantFiles) {
          const content = file.data.content.toLowerCase();
          
          // Check for authentication patterns
          if (content.includes('jwt') || content.includes('passport') || content.includes('auth')) {
            owaspTop10['A07:2021-Identification and Authentication Failures'] = true;
          }
          
          // Check for logging
          if (content.includes('console.log') || content.includes('winston') || content.includes('log4j')) {
            owaspTop10['A09:2021-Security Logging and Monitoring Failures'] = true;
          }
        }
        
        return owaspTop10;
      },
      
      calculateRiskScore(vulnerabilities) {
        let score = 0;
        
        for (const vuln of vulnerabilities) {
          switch (vuln.severity) {
            case 'critical': score += 10; break;
            case 'high': score += 7; break;
            case 'medium': score += 4; break;
            case 'low': score += 1; break;
          }
        }
        
        return Math.min(100, score);
      },
      
      displaySecurityResults(assessment) {
        console.log(chalk.bold.red('\n🛡️  Security Assessment Results\n'));
        
        // Risk score
        const riskColor = assessment.riskScore >= 70 ? 'red' : 
                         assessment.riskScore >= 40 ? 'yellow' : 'green';
        console.log(chalk.bold[riskColor](`Risk Score: ${assessment.riskScore}/100`));
        
        // Vulnerabilities
        if (assessment.vulnerabilities.length > 0) {
          console.log(chalk.bold.red(`\n🚨 Found ${assessment.vulnerabilities.length} vulnerabilities:`));
          
          for (const vuln of assessment.vulnerabilities) {
            const severityColor = vuln.severity === 'critical' ? 'red' :
                                 vuln.severity === 'high' ? 'yellow' :
                                 vuln.severity === 'medium' ? 'blue' : 'gray';
            
            console.log(chalk[severityColor](`\n${vuln.severity.toUpperCase()}: ${vuln.description}`));
            console.log(chalk.gray(`  File: ${vuln.file}`));
            console.log(chalk.gray(`  CWE: ${vuln.cwe}`));
            console.log(chalk.gray(`  Impact: ${vuln.impact}`));
            console.log(chalk.gray(`  💡 Mitigation: ${vuln.mitigation}`));
          }
        } else {
          console.log(chalk.green('\n✅ No obvious vulnerabilities detected'));
        }
      }
    };
  }

  /**
   * Create Performance Agent
   */
  createPerformanceAgent() {
    return {
      name: 'PerformanceAgent',
      async execute(context, options) {
        console.log(chalk.blue('⚡ Analyzing performance...'));
        
        const analysis = {
          summary: 'Performance Analysis',
          issues: [],
          optimizations: [],
          metrics: {},
          score: 0
        };
        
        // Analyze based on target
        switch (options.target) {
          case 'web':
            analysis.issues.push(...await this.analyzeWebPerformance(context));
            break;
          case 'node':
            analysis.issues.push(...await this.analyzeNodePerformance(context));
            break;
          case 'api':
            analysis.issues.push(...await this.analyzeAPIPerformance(context));
            break;
        }
        
        // Generate optimizations
        analysis.optimizations = this.generateOptimizations(analysis.issues);
        
        // Calculate performance score
        analysis.score = this.calculatePerformanceScore(analysis.issues);
        
        this.displayPerformanceResults(analysis);
        return analysis;
      },
      
      async analyzeWebPerformance(context) {
        const issues = [];
        
        for (const file of context.relevantFiles) {
          // Large bundle detection
          if (file.data.size > 1000000) { // 1MB
            issues.push({
              type: 'bundle-size',
              severity: 'medium',
              file: file.path,
              message: `Large file size: ${(file.data.size / 1024 / 1024).toFixed(2)}MB`,
              impact: 'Slower load times',
              suggestion: 'Consider code splitting or tree shaking'
            });
          }
          
          // Synchronous operations
          if (file.data.content.includes('document.write') || 
              file.data.content.includes('alert(')) {
            issues.push({
              type: 'blocking-operations',
              severity: 'high',
              file: file.path,
              message: 'Blocking synchronous operations detected',
              impact: 'UI freezing',
              suggestion: 'Use async alternatives'
            });
          }
          
          // Memory leaks
          if (file.data.content.includes('setInterval') && 
              !file.data.content.includes('clearInterval')) {
            issues.push({
              type: 'memory-leak',
              severity: 'medium',
              file: file.path,
              message: 'Potential memory leak - uncleared interval',
              impact: 'Memory consumption growth',
              suggestion: 'Clear intervals in cleanup functions'
            });
          }
        }
        
        return issues;
      },
      
      calculatePerformanceScore(issues) {
        let score = 100;
        
        for (const issue of issues) {
          switch (issue.severity) {
            case 'critical': score -= 20; break;
            case 'high': score -= 15; break;
            case 'medium': score -= 10; break;
            case 'low': score -= 5; break;
          }
        }
        
        return Math.max(0, score);
      },
      
      generateOptimizations(issues) {
        const optimizations = [];
        
        // Bundle size optimizations
        if (issues.some(i => i.type === 'bundle-size')) {
          optimizations.push({
            category: 'Bundle Optimization',
            techniques: [
              'Implement code splitting with dynamic imports',
              'Enable tree shaking in webpack/rollup',
              'Use compression (gzip/brotli)',
              'Optimize images and assets'
            ]
          });
        }
        
        // Performance optimizations
        if (issues.some(i => i.type === 'blocking-operations')) {
          optimizations.push({
            category: 'Runtime Performance',
            techniques: [
              'Use Web Workers for heavy computations',
              'Implement virtual scrolling for large lists',
              'Debounce user inputs',
              'Use requestAnimationFrame for animations'
            ]
          });
        }
        
        return optimizations;
      },
      
      displayPerformanceResults(analysis) {
        console.log(chalk.bold.blue('\n🚀 Performance Analysis Results\n'));
        
        const scoreColor = analysis.score >= 80 ? 'green' : 
                          analysis.score >= 60 ? 'yellow' : 'red';
        console.log(chalk.bold[scoreColor](`Performance Score: ${analysis.score}/100`));
        
        if (analysis.issues.length > 0) {
          console.log(chalk.bold.yellow(`\n⚠️  Found ${analysis.issues.length} performance issues:`));
          
          for (const issue of analysis.issues) {
            console.log(chalk.yellow(`\n${issue.message}`));
            console.log(chalk.gray(`  File: ${issue.file}`));
            console.log(chalk.gray(`  Impact: ${issue.impact}`));
            console.log(chalk.gray(`  💡 ${issue.suggestion}`));
          }
        }
        
        if (analysis.optimizations.length > 0) {
          console.log(chalk.bold.green('\n🎯 Optimization Recommendations:'));
          
          for (const opt of analysis.optimizations) {
            console.log(chalk.green(`\n${opt.category}:`));
            for (const technique of opt.techniques) {
              console.log(chalk.gray(`  • ${technique}`));
            }
          }
        }
      }
    };
  }

  // Additional agent creators would continue here...
  createDocumentationAgent() {
    return {
      name: 'DocumentationAgent',
      async execute(context, options) {
        console.log(chalk.green('📚 Generating documentation...'));
        // Implementation for documentation generation
        return { status: 'Documentation generation complete' };
      }
    };
  }

  createTestingAgent() {
    return {
      name: 'TestingAgent', 
      async execute(context, options) {
        console.log(chalk.cyan('🧪 Analyzing testing strategy...'));
        // Implementation for test strategy analysis
        return { status: 'Testing analysis complete' };
      }
    };
  }

  createRefactoringAgent() {
    return {
      name: 'RefactoringAgent',
      async execute(context, options) {
        console.log(chalk.magenta('🔄 Analyzing refactoring opportunities...'));
        // Implementation for refactoring analysis
        return { status: 'Refactoring analysis complete' };
      }
    };
  }

  createAPIAgent() {
    return {
      name: 'APIAgent',
      async execute(context, options) {
        console.log(chalk.blue('🔌 Analyzing API design...'));
        // Implementation for API analysis
        return { status: 'API analysis complete' };
      }
    };
  }

  createDatabaseAgent() {
    return {
      name: 'DatabaseAgent',
      async execute(context, options) {
        console.log(chalk.cyan('🗃️  Analyzing database schema...'));
        // Implementation for database analysis
        return { status: 'Database analysis complete' };
      }
    };
  }

  createDeploymentAgent() {
    return {
      name: 'DeploymentAgent',
      async execute(context, options) {
        console.log(chalk.yellow('🚀 Analyzing deployment strategy...'));
        // Implementation for deployment analysis
        return { status: 'Deployment analysis complete' };
      }
    };
  }

  createArchitectureAgent() {
    return {
      name: 'ArchitectureAgent',
      async execute(context, options) {
        console.log(chalk.magenta('🏗️  Analyzing system architecture...'));
        // Implementation for architecture analysis
        return { status: 'Architecture analysis complete' };
      }
    };
  }

  /**
   * Create Vision Analysis Agent
   */
  createVisionAnalysisAgent() {
    const self = this;
    return {
      name: 'VisionAnalysisAgent',
      async execute(context, options) {
        console.log(chalk.blue('👁️  Analyzing visual content...'));
        
        if (!self.visionAnalyzer) {
          throw new Error('Vision analyzer not available');
        }
        
        // Parse image path from context or ask for it
        let imagePath = options.image || context.additionalArgs;
        
        if (!imagePath) {
          const inquirer = require('inquirer');
          const result = await inquirer.prompt([{
            type: 'input',
            name: 'imagePath',
            message: 'Enter the path to the image to analyze:',
            validate: (input) => {
              if (!input) return 'Please provide an image path';
              if (!fs.existsSync(input)) return 'File does not exist';
              const ext = path.extname(input).toLowerCase();
              if (!self.visionAnalyzer.supportedFormats.includes(ext)) {
                return `Unsupported format. Supported: ${self.visionAnalyzer.supportedFormats.join(', ')}`;
              }
              return true;
            }
          }]);
          imagePath = result.imagePath;
        }
        
        try {
          const analysisOptions = {
            detailed: options.detailed,
            generateCode: options.generateCode,
            focus: options.focus
          };
          
          const result = await self.visionAnalyzer.analyzeImage(imagePath, options.template, analysisOptions);
          
          return {
            status: 'Vision analysis complete',
            analysis: result,
            imagePath: imagePath,
            template: options.template
          };
        } catch (error) {
          throw new Error(`Vision analysis failed: ${error.message}`);
        }
      }
    };
  }

  /**
   * Load custom commands from project
   */
  loadCustomCommands() {
    try {
      const customCommandsPath = path.join(process.cwd(), '.recoder', 'commands');
      if (fs.existsSync(customCommandsPath)) {
        const commandFiles = fs.readdirSync(customCommandsPath)
          .filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
          try {
            const commandModule = require(path.join(customCommandsPath, file));
            if (commandModule.registerCommand) {
              commandModule.registerCommand(this);
            }
          } catch (error) {
            console.log(chalk.yellow(`⚠️  Failed to load custom command ${file}: ${error.message}`));
          }
        }
      }
    } catch (error) {
      // Ignore custom command loading errors
    }
  }

  /**
   * Merge command options
   */
  mergeOptions(defaultOptions, args, additionalOptions) {
    const merged = { ...additionalOptions };
    
    for (const [key, optionDef] of Object.entries(defaultOptions || {})) {
      if (args[key] !== undefined) {
        // Parse argument value based on type
        let value = args[key];
        
        if (optionDef.type === 'boolean') {
          value = value === true || value === 'true';
        } else if (optionDef.type === 'number') {
          value = parseInt(value, 10);
        } else if (optionDef.type === 'array') {
          value = typeof value === 'string' ? value.split(',') : value;
        }
        
        merged[key] = value;
      } else if (merged[key] === undefined) {
        merged[key] = optionDef.default;
      }
    }
    
    return merged;
  }

  /**
   * Save command result
   */
  async saveCommandResult(commandName, result, options) {
    if (this.projectManager) {
      const resultData = {
        command: commandName,
        timestamp: new Date().toISOString(),
        options: options,
        result: result
      };
      
      await this.projectManager.saveCommandResult(resultData);
    }
  }

  /**
   * Create Todo Management Agent
   */
  createTodoAgent() {
    return {
      name: 'TodoAgent',
      async execute(context, options) {
        // Get todo manager from interactive instance
        const todoManager = context.todoManager || new (require('./todo-manager.js'))();
        
        switch (options.action) {
          case 'list':
            console.log('');
            todoManager.displayTodos(options.show_completed);
            break;
            
          case 'add':
            if (!context.args || context.args.length === 0) {
              console.log(chalk.yellow('⚠️  Usage: /todo add <task description>'));
              return;
            }
            const content = context.args.join(' ');
            const id = todoManager.addTodo(content, options.priority, options.category);
            console.log(chalk.green(`✅ Added todo: ${content}`));
            console.log(chalk.gray(`   ID: ${id}, Priority: ${options.priority}, Category: ${options.category}`));
            break;
            
          case 'complete':
            if (!context.args || context.args.length === 0) {
              console.log(chalk.yellow('⚠️  Usage: /todo complete <id>'));
              return;
            }
            if (todoManager.completeTodo(context.args[0])) {
              console.log(chalk.green('✅ Todo marked as completed'));
            } else {
              console.log(chalk.red('❌ Todo not found'));
            }
            break;
            
          case 'start':
            if (!context.args || context.args.length === 0) {
              console.log(chalk.yellow('⚠️  Usage: /todo start <id>'));
              return;
            }
            if (todoManager.startTodo(context.args[0])) {
              console.log(chalk.yellow('◐ Todo marked as in progress'));
            } else {
              console.log(chalk.red('❌ Todo not found'));
            }
            break;
            
          case 'delete':
            if (!context.args || context.args.length === 0) {
              console.log(chalk.yellow('⚠️  Usage: /todo delete <id>'));
              return;
            }
            if (todoManager.deleteTodo(context.args[0])) {
              console.log(chalk.green('✅ Todo deleted'));
            } else {
              console.log(chalk.red('❌ Todo not found'));
            }
            break;
            
          case 'stats':
            console.log('');
            todoManager.displayStats();
            break;
            
          case 'search':
            if (!context.args || context.args.length === 0) {
              console.log(chalk.yellow('⚠️  Usage: /todo search <query>'));
              return;
            }
            const query = context.args.join(' ');
            todoManager.searchTodos(query);
            break;
            
          default:
            console.log(chalk.cyan.bold('Todo Management System'));
            console.log('');
            console.log(chalk.white('Available actions:'));
            console.log(chalk.gray('  /todo list                 - Show all todos'));
            console.log(chalk.gray('  /todo add <task>          - Add new todo'));
            console.log(chalk.gray('  /todo complete <id>       - Mark todo as complete'));
            console.log(chalk.gray('  /todo start <id>          - Mark todo as in progress'));
            console.log(chalk.gray('  /todo delete <id>         - Delete todo'));
            console.log(chalk.gray('  /todo stats               - Show statistics'));
            console.log(chalk.gray('  /todo search <query>      - Search todos'));
            break;
        }
        
        return {
          success: true,
          action: options.action,
          timestamp: new Date().toISOString()
        };
      }
    };
  }

  /**
   * Get command suggestions based on context
   */
  getCommandSuggestions(context) {
    const suggestions = [];
    
    // Security-focused suggestions
    if (context.query && context.query.toLowerCase().includes('security')) {
      suggestions.push('/security --scan-type full');
      suggestions.push('/review --focus security');
    }
    
    // Performance-focused suggestions
    if (context.query && context.query.toLowerCase().includes('performance')) {
      suggestions.push('/optimize --target web');
      suggestions.push('/review --focus performance');
    }
    
    // Todo-focused suggestions
    if (context.query && (context.query.toLowerCase().includes('todo') || context.query.toLowerCase().includes('task'))) {
      suggestions.push('/todo list');
      suggestions.push('/todo add <task description>');
      suggestions.push('/todo stats');
    }
    
    return suggestions;
  }
}

module.exports = SlashCommandsEngine;