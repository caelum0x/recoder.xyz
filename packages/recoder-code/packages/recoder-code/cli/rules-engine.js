#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * User & Repository Rules Engine
 * Intelligent rule management for consistent AI behavior and project preferences
 */
class RulesEngine {
  constructor(projectManager) {
    this.projectManager = projectManager;
    this.userRules = new Map();
    this.repositoryRules = new Map();
    this.globalRules = new Map();
    this.ruleCategories = new Map();
    this.ruleHistory = [];
    this.activeRules = new Set();
    this.ruleConflicts = [];
    
    // Define rule categories
    this.initializeRuleCategories();
    
    // Load existing rules
    this.loadAllRules();
  }

  /**
   * Initialize rule categories and their priorities
   */
  initializeRuleCategories() {
    console.log(chalk.cyan('📋 Initializing Rules Engine...'));
    
    this.ruleCategories.set('coding-standards', {
      name: 'Coding Standards',
      description: 'Code formatting, naming conventions, and best practices',
      priority: 1,
      icon: '📝',
      examples: ['Use camelCase for variables', 'Maximum line length 100 characters', 'Always use semicolons']
    });
    
    this.ruleCategories.set('security', {
      name: 'Security Guidelines',
      description: 'Security requirements and vulnerability prevention',
      priority: 2,
      icon: '🔒',
      examples: ['Never hardcode API keys', 'Always sanitize user input', 'Use HTTPS for all API calls']
    });
    
    this.ruleCategories.set('architecture', {
      name: 'Architecture Patterns',
      description: 'System design principles and architectural decisions',
      priority: 3,
      icon: '🏗️',
      examples: ['Use dependency injection', 'Follow MVC pattern', 'Implement repository pattern']
    });
    
    this.ruleCategories.set('testing', {
      name: 'Testing Requirements',
      description: 'Test coverage, types, and quality standards',
      priority: 4,
      icon: '🧪',
      examples: ['Minimum 80% test coverage', 'Unit tests for all public methods', 'Integration tests for APIs']
    });
    
    this.ruleCategories.set('documentation', {
      name: 'Documentation Standards',
      description: 'Code comments, API docs, and README requirements',
      priority: 5,
      icon: '📚',
      examples: ['JSDoc for all public functions', 'README for each module', 'API documentation with examples']
    });
    
    this.ruleCategories.set('deployment', {
      name: 'Deployment & DevOps',
      description: 'CI/CD, environment, and deployment guidelines',
      priority: 6,
      icon: '🚀',
      examples: ['Docker for all services', 'Automated testing in CI', 'Blue-green deployments']
    });
    
    this.ruleCategories.set('performance', {
      name: 'Performance Standards',
      description: 'Speed, memory, and optimization requirements',
      priority: 7,
      icon: '⚡',
      examples: ['Page load time under 2 seconds', 'Optimize database queries', 'Use caching for static data']
    });
    
    this.ruleCategories.set('accessibility', {
      name: 'Accessibility Requirements',
      description: 'WCAG compliance and inclusive design standards',
      priority: 8,
      icon: '♿',
      examples: ['WCAG 2.1 AA compliance', 'Keyboard navigation support', 'Screen reader compatibility']
    });
    
    this.ruleCategories.set('dependencies', {
      name: 'Dependency Management',
      description: 'Package selection, versioning, and security policies',
      priority: 9,
      icon: '📦',
      examples: ['Lock dependency versions', 'Security audit before adding packages', 'Minimize dependency count']
    });
    
    this.ruleCategories.set('workflow', {
      name: 'Development Workflow',
      description: 'Git workflow, branching, and collaboration rules',
      priority: 10,
      icon: '🔄',
      examples: ['Feature branch workflow', 'Squash commits before merge', 'Peer review required']
    });
  }

  /**
   * Load all rule types
   */
  async loadAllRules() {
    try {
      await this.loadGlobalRules();
      await this.loadUserRules();
      await this.loadRepositoryRules();
      
      this.resolveRuleConflicts();
      this.activateApplicableRules();
      
      console.log(chalk.green('✅ Rules Engine ready'));
      console.log(chalk.gray(`   Global rules: ${this.globalRules.size}`));
      console.log(chalk.gray(`   User rules: ${this.userRules.size}`));
      console.log(chalk.gray(`   Repository rules: ${this.repositoryRules.size}`));
      console.log(chalk.gray(`   Active rules: ${this.activeRules.size}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Rules Engine initialization failed: ${error.message}`));
    }
  }

  /**
   * Load global default rules
   */
  async loadGlobalRules() {
    const globalRulesPath = path.join(__dirname, '..', 'rules', 'global-rules.json');
    
    if (fs.existsSync(globalRulesPath)) {
      try {
        const globalRulesData = JSON.parse(fs.readFileSync(globalRulesPath, 'utf8'));
        for (const [id, rule] of Object.entries(globalRulesData)) {
          this.globalRules.set(id, this.normalizeRule(rule, 'global'));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not load global rules: ${error.message}`));
      }
    } else {
      // Create default global rules
      this.createDefaultGlobalRules();
    }
  }

  /**
   * Create default global rules
   */
  createDefaultGlobalRules() {
    const defaultRules = {
      'security-no-hardcoded-secrets': {
        category: 'security',
        title: 'No Hardcoded Secrets',
        description: 'Never include API keys, passwords, or tokens directly in code',
        severity: 'critical',
        enabled: true,
        patterns: ['api[_-]?key', 'password\\s*=', 'secret\\s*=', 'token\\s*='],
        suggestion: 'Use environment variables or secure key management systems'
      },
      'coding-standards-consistent-naming': {
        category: 'coding-standards',
        title: 'Consistent Naming Conventions',
        description: 'Use consistent naming conventions throughout the codebase',
        severity: 'medium',
        enabled: true,
        languages: ['javascript', 'typescript', 'python'],
        conventions: {
          variables: 'camelCase',
          functions: 'camelCase',
          classes: 'PascalCase',
          constants: 'UPPER_SNAKE_CASE'
        }
      },
      'testing-require-tests': {
        category: 'testing',
        title: 'Require Tests for New Code',
        description: 'All new functions and classes must have corresponding tests',
        severity: 'high',
        enabled: true,
        coverage: {
          minimum: 80,
          newCode: 100
        }
      },
      'documentation-function-comments': {
        category: 'documentation',
        title: 'Function Documentation',
        description: 'All public functions must have JSDoc or equivalent documentation',
        severity: 'medium',
        enabled: true,
        required: ['description', 'parameters', 'returns']
      },
      'architecture-single-responsibility': {
        category: 'architecture',
        title: 'Single Responsibility Principle',
        description: 'Each class and function should have a single, well-defined responsibility',
        severity: 'medium',
        enabled: true,
        maxFunctionLength: 50,
        maxClassMethods: 20
      }
    };
    
    for (const [id, rule] of Object.entries(defaultRules)) {
      this.globalRules.set(id, this.normalizeRule(rule, 'global'));
    }
    
    // Save default rules
    this.saveGlobalRules();
  }

  /**
   * Load user-specific rules
   */
  async loadUserRules() {
    const userConfigDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder');
    const userRulesPath = path.join(userConfigDir, 'user-rules.json');
    
    if (fs.existsSync(userRulesPath)) {
      try {
        const userRulesData = JSON.parse(fs.readFileSync(userRulesPath, 'utf8'));
        for (const [id, rule] of Object.entries(userRulesData)) {
          this.userRules.set(id, this.normalizeRule(rule, 'user'));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not load user rules: ${error.message}`));
      }
    }
  }

  /**
   * Load repository-specific rules
   */
  async loadRepositoryRules() {
    const repoRulesPath = path.join(process.cwd(), '.recoder', 'repo-rules.json');
    
    if (fs.existsSync(repoRulesPath)) {
      try {
        const repoRulesData = JSON.parse(fs.readFileSync(repoRulesPath, 'utf8'));
        for (const [id, rule] of Object.entries(repoRulesData)) {
          this.repositoryRules.set(id, this.normalizeRule(rule, 'repository'));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not load repository rules: ${error.message}`));
      }
    }
  }

  /**
   * Normalize rule format
   */
  normalizeRule(rule, source) {
    return {
      id: rule.id || this.generateRuleId(),
      source: source,
      category: rule.category || 'general',
      title: rule.title || 'Unnamed Rule',
      description: rule.description || '',
      severity: rule.severity || 'medium',
      enabled: rule.enabled !== false,
      created: rule.created || new Date().toISOString(),
      lastModified: rule.lastModified || new Date().toISOString(),
      author: rule.author || 'system',
      tags: rule.tags || [],
      conditions: rule.conditions || {},
      actions: rule.actions || {},
      metadata: rule.metadata || {},
      ...rule // Include all other rule-specific properties
    };
  }

  /**
   * Generate unique rule ID
   */
  generateRuleId() {
    return 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Resolve conflicts between rules
   */
  resolveRuleConflicts() {
    this.ruleConflicts = [];
    
    // Priority order: repository > user > global
    const allRules = [
      ...Array.from(this.globalRules.entries()).map(([id, rule]) => ({ id, rule, priority: 1 })),
      ...Array.from(this.userRules.entries()).map(([id, rule]) => ({ id, rule, priority: 2 })),
      ...Array.from(this.repositoryRules.entries()).map(([id, rule]) => ({ id, rule, priority: 3 }))
    ];
    
    // Group by category and title to find conflicts
    const ruleGroups = {};
    
    for (const { id, rule, priority } of allRules) {
      const key = `${rule.category}:${rule.title}`;
      if (!ruleGroups[key]) {
        ruleGroups[key] = [];
      }
      ruleGroups[key].push({ id, rule, priority });
    }
    
    // Check for conflicts and apply resolution
    for (const [key, rules] of Object.entries(ruleGroups)) {
      if (rules.length > 1) {
        // Sort by priority (higher number = higher priority)
        rules.sort((a, b) => b.priority - a.priority);
        
        const winningRule = rules[0];
        const conflictingRules = rules.slice(1);
        
        this.ruleConflicts.push({
          category: winningRule.rule.category,
          title: winningRule.rule.title,
          winner: winningRule,
          conflicts: conflictingRules,
          resolved: true
        });
      }
    }
  }

  /**
   * Activate applicable rules
   */
  activateApplicableRules() {
    this.activeRules.clear();
    
    // Add all enabled rules in priority order
    const allRules = [
      ...this.repositoryRules.entries(),
      ...this.userRules.entries(),
      ...this.globalRules.entries()
    ];
    
    for (const [id, rule] of allRules) {
      if (rule.enabled && this.isRuleApplicable(rule)) {
        // Check if this rule conflicts with a higher priority rule
        const hasHigherPriorityConflict = this.ruleConflicts.some(conflict => 
          conflict.conflicts.some(c => c.id === id)
        );
        
        if (!hasHigherPriorityConflict) {
          this.activeRules.add(id);
        }
      }
    }
  }

  /**
   * Check if rule is applicable to current context
   */
  isRuleApplicable(rule) {
    // Check language conditions
    if (rule.languages && rule.languages.length > 0) {
      // Get project languages from context engine or project manager
      const projectLanguages = this.getProjectLanguages();
      const hasMatchingLanguage = rule.languages.some(lang => 
        projectLanguages.includes(lang)
      );
      if (!hasMatchingLanguage) {
        return false;
      }
    }
    
    // Check framework conditions
    if (rule.frameworks && rule.frameworks.length > 0) {
      const projectFrameworks = this.getProjectFrameworks();
      const hasMatchingFramework = rule.frameworks.some(fw => 
        projectFrameworks.includes(fw)
      );
      if (!hasMatchingFramework) {
        return false;
      }
    }
    
    // Check file pattern conditions
    if (rule.filePatterns && rule.filePatterns.length > 0) {
      // Rule applies to specific file patterns
      return true; // Will be checked during file analysis
    }
    
    // Check environment conditions
    if (rule.environments && rule.environments.length > 0) {
      const currentEnv = process.env.NODE_ENV || 'development';
      if (!rule.environments.includes(currentEnv)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get project languages
   */
  getProjectLanguages() {
    // Try to get from project context
    if (this.projectManager) {
      // Fallback for missing getProjectContext method
      if (this.projectManager && typeof this.projectManager.getProjectContext === 'function') {
        const context = this.projectManager.getProjectContext();
        if (context && context.language) {
          return [context.language];
        }
      }
    }
    
    // Detect from package.json or other files
    const languages = [];
    
    if (fs.existsSync('package.json')) {
      languages.push('javascript');
    }
    if (fs.existsSync('tsconfig.json')) {
      languages.push('typescript');
    }
    if (fs.existsSync('requirements.txt') || fs.existsSync('setup.py')) {
      languages.push('python');
    }
    if (fs.existsSync('go.mod')) {
      languages.push('go');
    }
    if (fs.existsSync('Cargo.toml')) {
      languages.push('rust');
    }
    
    return languages;
  }

  /**
   * Get project frameworks
   */
  getProjectFrameworks() {
    const frameworks = [];
    
    try {
      if (fs.existsSync('package.json')) {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
        
        if (deps.react) frameworks.push('react');
        if (deps.vue) frameworks.push('vue');
        if (deps.angular || deps['@angular/core']) frameworks.push('angular');
        if (deps.express) frameworks.push('express');
        if (deps.fastify) frameworks.push('fastify');
        if (deps.next) frameworks.push('next');
        if (deps.nuxt) frameworks.push('nuxt');
      }
    } catch (error) {
      // Ignore errors
    }
    
    return frameworks;
  }

  /**
   * Apply rules to content analysis
   */
  applyRulesToContent(content, filePath = '', context = {}) {
    const results = {
      violations: [],
      suggestions: [],
      warnings: [],
      appliedRules: []
    };
    
    for (const ruleId of this.activeRules) {
      const rule = this.getRule(ruleId);
      if (!rule) continue;
      
      // Check if rule applies to this file
      if (!this.doesRuleApplyToFile(rule, filePath)) {
        continue;
      }
      
      const ruleResult = this.evaluateRule(rule, content, filePath, context);
      if (ruleResult) {
        results.appliedRules.push(ruleId);
        
        if (ruleResult.violations) {
          results.violations.push(...ruleResult.violations);
        }
        if (ruleResult.suggestions) {
          results.suggestions.push(...ruleResult.suggestions);
        }
        if (ruleResult.warnings) {
          results.warnings.push(...ruleResult.warnings);
        }
      }
    }
    
    return results;
  }

  /**
   * Check if rule applies to specific file
   */
  doesRuleApplyToFile(rule, filePath) {
    if (!rule.filePatterns || rule.filePatterns.length === 0) {
      return true; // Rule applies to all files
    }
    
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    
    return rule.filePatterns.some(pattern => {
      if (pattern.startsWith('*.')) {
        return fileExt === pattern.substring(1);
      } else if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(fileName);
      } else {
        return fileName === pattern || filePath.includes(pattern);
      }
    });
  }

  /**
   * Evaluate a rule against content
   */
  evaluateRule(rule, content, filePath, context) {
    const result = {
      violations: [],
      suggestions: [],
      warnings: []
    };
    
    try {
      switch (rule.category) {
        case 'security':
          return this.evaluateSecurityRule(rule, content, filePath, context);
        case 'coding-standards':
          return this.evaluateCodingStandardsRule(rule, content, filePath, context);
        case 'testing':
          return this.evaluateTestingRule(rule, content, filePath, context);
        case 'documentation':
          return this.evaluateDocumentationRule(rule, content, filePath, context);
        case 'architecture':
          return this.evaluateArchitectureRule(rule, content, filePath, context);
        case 'performance':
          return this.evaluatePerformanceRule(rule, content, filePath, context);
        default:
          return this.evaluateGenericRule(rule, content, filePath, context);
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Error evaluating rule ${rule.id}: ${error.message}`));
      return null;
    }
  }

  /**
   * Evaluate security rules
   */
  evaluateSecurityRule(rule, content, filePath, context) {
    const result = { violations: [], suggestions: [], warnings: [] };
    
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        const regex = new RegExp(pattern, 'gi');
        const matches = content.match(regex);
        
        if (matches) {
          result.violations.push({
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.description,
            suggestion: rule.suggestion || 'Follow security best practices',
            matches: matches.length,
            file: filePath
          });
        }
      }
    }
    
    return result.violations.length > 0 ? result : null;
  }

  /**
   * Evaluate coding standards rules
   */
  evaluateCodingStandardsRule(rule, content, filePath, context) {
    const result = { violations: [], suggestions: [], warnings: [] };
    
    if (rule.conventions) {
      // Check naming conventions
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check variable naming
        if (rule.conventions.variables === 'camelCase') {
          const varMatches = line.match(/(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
          if (varMatches) {
            for (const match of varMatches) {
              const varName = match.split(/\s+/)[1];
              if (varName && !this.isCamelCase(varName) && !this.isConstantCase(varName)) {
                result.violations.push({
                  ruleId: rule.id,
                  severity: rule.severity,
                  message: `Variable '${varName}' should use camelCase naming`,
                  line: i + 1,
                  file: filePath
                });
              }
            }
          }
        }
        
        // Check function naming
        if (rule.conventions.functions === 'camelCase') {
          const funcMatches = line.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
          if (funcMatches) {
            for (const match of funcMatches) {
              const funcName = match.split(/\s+/)[1];
              if (funcName && !this.isCamelCase(funcName)) {
                result.violations.push({
                  ruleId: rule.id,
                  severity: rule.severity,
                  message: `Function '${funcName}' should use camelCase naming`,
                  line: i + 1,
                  file: filePath
                });
              }
            }
          }
        }
      }
    }
    
    return result.violations.length > 0 ? result : null;
  }

  /**
   * Evaluate generic rules with patterns
   */
  evaluateGenericRule(rule, content, filePath, context) {
    const result = { violations: [], suggestions: [], warnings: [] };
    
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(content)) {
          result.violations.push({
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.description,
            suggestion: rule.suggestion,
            file: filePath
          });
        }
      }
    }
    
    return result.violations.length > 0 ? result : null;
  }

  /**
   * Generate AI prompt context from active rules
   */
  generateAIPromptContext() {
    const activeRulesList = Array.from(this.activeRules)
      .map(id => this.getRule(id))
      .filter(rule => rule)
      .sort((a, b) => {
        const categoryA = this.ruleCategories.get(a.category);
        const categoryB = this.ruleCategories.get(b.category);
        return (categoryA?.priority || 999) - (categoryB?.priority || 999);
      });
    
    if (activeRulesList.length === 0) {
      return '';
    }
    
    let context = '\n\n🔧 ACTIVE PROJECT RULES:\n';
    context += 'Please follow these project-specific rules and guidelines:\n\n';
    
    const rulesByCategory = {};
    for (const rule of activeRulesList) {
      if (!rulesByCategory[rule.category]) {
        rulesByCategory[rule.category] = [];
      }
      rulesByCategory[rule.category].push(rule);
    }
    
    for (const [categoryId, rules] of Object.entries(rulesByCategory)) {
      const category = this.ruleCategories.get(categoryId);
      if (category) {
        context += `${category.icon} ${category.name}:\n`;
        for (const rule of rules) {
          context += `• ${rule.title}: ${rule.description}\n`;
          if (rule.suggestion) {
            context += `  → ${rule.suggestion}\n`;
          }
        }
        context += '\n';
      }
    }
    
    context += 'Ensure all generated code and suggestions comply with these rules.\n';
    
    return context;
  }

  /**
   * Get rule by ID from any source
   */
  getRule(ruleId) {
    return this.repositoryRules.get(ruleId) || 
           this.userRules.get(ruleId) || 
           this.globalRules.get(ruleId);
  }

  /**
   * Add new rule
   */
  addRule(rule, source = 'repository') {
    const normalizedRule = this.normalizeRule(rule, source);
    
    switch (source) {
      case 'global':
        this.globalRules.set(normalizedRule.id, normalizedRule);
        this.saveGlobalRules();
        break;
      case 'user':
        this.userRules.set(normalizedRule.id, normalizedRule);
        this.saveUserRules();
        break;
      case 'repository':
        this.repositoryRules.set(normalizedRule.id, normalizedRule);
        this.saveRepositoryRules();
        break;
    }
    
    this.resolveRuleConflicts();
    this.activateApplicableRules();
    
    return normalizedRule.id;
  }

  /**
   * Save rules to files
   */
  saveGlobalRules() {
    const rulesDir = path.join(__dirname, '..', 'rules');
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
    
    const globalRulesPath = path.join(rulesDir, 'global-rules.json');
    const rulesData = Object.fromEntries(this.globalRules.entries());
    fs.writeFileSync(globalRulesPath, JSON.stringify(rulesData, null, 2));
  }

  saveUserRules() {
    const userConfigDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder');
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true });
    }
    
    const userRulesPath = path.join(userConfigDir, 'user-rules.json');
    const rulesData = Object.fromEntries(this.userRules.entries());
    fs.writeFileSync(userRulesPath, JSON.stringify(rulesData, null, 2));
  }

  saveRepositoryRules() {
    const recoderDir = path.join(process.cwd(), '.recoder');
    if (!fs.existsSync(recoderDir)) {
      fs.mkdirSync(recoderDir, { recursive: true });
    }
    
    const repoRulesPath = path.join(recoderDir, 'repo-rules.json');
    const rulesData = Object.fromEntries(this.repositoryRules.entries());
    fs.writeFileSync(repoRulesPath, JSON.stringify(rulesData, null, 2));
  }

  /**
   * Display rules status
   */
  displayRulesStatus() {
    console.log(chalk.bold.cyan('\n📋 Rules Engine Status\n'));
    
    console.log(chalk.bold('Rule Categories:'));
    for (const [id, category] of this.ruleCategories.entries()) {
      const count = this.getActiveRulesByCategory(id).length;
      console.log(chalk.cyan(`  ${category.icon} ${category.name}: ${count} active rules`));
    }
    console.log();
    
    console.log(chalk.bold('Rule Sources:'));
    console.log(chalk.white(`  Global: ${this.globalRules.size} rules`));
    console.log(chalk.white(`  User: ${this.userRules.size} rules`));
    console.log(chalk.white(`  Repository: ${this.repositoryRules.size} rules`));
    console.log(chalk.green(`  Active: ${this.activeRules.size} rules`));
    console.log();
    
    if (this.ruleConflicts.length > 0) {
      console.log(chalk.bold.yellow('Rule Conflicts Resolved:'));
      for (const conflict of this.ruleConflicts) {
        console.log(chalk.yellow(`  • ${conflict.category}: ${conflict.title}`));
        console.log(chalk.gray(`    Winner: ${conflict.winner.rule.source} (priority ${conflict.winner.priority})`));
      }
      console.log();
    }
    
    const projectLanguages = this.getProjectLanguages();
    const projectFrameworks = this.getProjectFrameworks();
    
    console.log(chalk.bold('Project Context:'));
    console.log(chalk.gray(`  Languages: ${projectLanguages.join(', ') || 'None detected'}`));
    console.log(chalk.gray(`  Frameworks: ${projectFrameworks.join(', ') || 'None detected'}`));
  }

  /**
   * Get active rules by category
   */
  getActiveRulesByCategory(categoryId) {
    return Array.from(this.activeRules)
      .map(id => this.getRule(id))
      .filter(rule => rule && rule.category === categoryId);
  }

  /**
   * Helper methods for naming convention checks
   */
  isCamelCase(str) {
    return /^[a-z][a-zA-Z0-9]*$/.test(str);
  }

  isPascalCase(str) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(str);
  }

  isConstantCase(str) {
    return /^[A-Z][A-Z0-9_]*$/.test(str);
  }

  isSnakeCase(str) {
    return /^[a-z][a-z0-9_]*$/.test(str);
  }

  /**
   * ENHANCED FUNCTIONALITY - Advanced Rules Management
   */

  /**
   * Auto-discover rules from project configuration files
   */
  async autoDiscoverProjectRules() {
    const discoveredRules = new Map();
    const projectPath = process.cwd();
    
    try {
      // Discover from package.json
      const packageJsonRules = await this.discoverFromPackageJson(projectPath);
      packageJsonRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      // Discover from .eslintrc files
      const eslintRules = await this.discoverFromEslint(projectPath);
      eslintRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      // Discover from prettier config
      const prettierRules = await this.discoverFromPrettier(projectPath);
      prettierRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      // Discover from tsconfig.json
      const tsRules = await this.discoverFromTypeScript(projectPath);
      tsRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      // Discover from CI/CD configs
      const ciRules = await this.discoverFromCI(projectPath);
      ciRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      // Discover from .gitignore and .gitattributes
      const gitRules = await this.discoverFromGit(projectPath);
      gitRules.forEach((rule, id) => discoveredRules.set(id, rule));
      
      console.log(chalk.green(`🔍 Auto-discovered ${discoveredRules.size} project rules`));
      
      // Merge with repository rules
      discoveredRules.forEach((rule, id) => {
        this.repositoryRules.set(id, rule);
      });
      
      return discoveredRules;
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Rule auto-discovery failed: ${error.message}`));
      return new Map();
    }
  }

  /**
   * Discover rules from package.json
   */
  async discoverFromPackageJson(projectPath) {
    const rules = new Map();
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) return rules;
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Discover from scripts
      if (packageJson.scripts) {
        if (packageJson.scripts.test) {
          rules.set('auto-testing-required', {
            category: 'testing',
            title: 'Testing Infrastructure Present',
            description: 'Project has test scripts configured',
            severity: 'medium',
            enabled: true,
            source: 'auto-discovered',
            discoveredFrom: 'package.json',
            suggestion: 'Maintain and expand test coverage'
          });
        }
        
        if (packageJson.scripts.lint) {
          rules.set('auto-linting-configured', {
            category: 'coding-standards',
            title: 'Linting Configured',
            description: 'Project has linting scripts configured',
            severity: 'medium',
            enabled: true,
            source: 'auto-discovered',
            discoveredFrom: 'package.json',
            suggestion: 'Follow linting rules consistently'
          });
        }
      }
      
      // Discover from dependencies
      if (packageJson.dependencies || packageJson.devDependencies) {
        const allDeps = {...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {})};
        
        // Security-related dependencies
        if (allDeps['helmet'] || allDeps['express-rate-limit']) {
          rules.set('auto-security-dependencies', {
            category: 'security',
            title: 'Security Dependencies Detected',
            description: 'Project uses security-focused dependencies',
            severity: 'high',
            enabled: true,
            source: 'auto-discovered',
            discoveredFrom: 'package.json',
            suggestion: 'Keep security dependencies updated'
          });
        }
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not parse package.json: ${error.message}`));
    }
    
    return rules;
  }

  /**
   * Discover rules from ESLint configuration
   */
  async discoverFromEslint(projectPath) {
    const rules = new Map();
    const eslintFiles = ['.eslintrc', '.eslintrc.json', '.eslintrc.yml'];
    
    for (const fileName of eslintFiles) {
      const filePath = path.join(projectPath, fileName);
      if (fs.existsSync(filePath)) {
        rules.set('auto-eslint-configured', {
          category: 'coding-standards',
          title: 'ESLint Configuration Present',
          description: 'Project has ESLint configuration for code quality',
          severity: 'medium',
          enabled: true,
          source: 'auto-discovered',
          discoveredFrom: fileName,
          suggestion: 'Follow ESLint rules consistently and keep config updated'
        });
        break;
      }
    }
    
    return rules;
  }

  /**
   * Discover rules from Prettier configuration
   */
  async discoverFromPrettier(projectPath) {
    const rules = new Map();
    const prettierFiles = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];
    
    for (const fileName of prettierFiles) {
      const filePath = path.join(projectPath, fileName);
      if (fs.existsSync(filePath)) {
        rules.set('auto-prettier-configured', {
          category: 'coding-standards',
          title: 'Prettier Code Formatting',
          description: 'Project uses Prettier for consistent code formatting',
          severity: 'medium',
          enabled: true,
          source: 'auto-discovered',
          discoveredFrom: fileName,
          suggestion: 'Let Prettier handle all code formatting automatically'
        });
        break;
      }
    }
    
    return rules;
  }

  /**
   * Discover rules from TypeScript configuration
   */
  async discoverFromTypeScript(projectPath) {
    const rules = new Map();
    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    
    if (fs.existsSync(tsconfigPath)) {
      rules.set('auto-typescript-project', {
        category: 'coding-standards',
        title: 'TypeScript Project',
        description: 'Project uses TypeScript for type safety',
        severity: 'high',
        enabled: true,
        source: 'auto-discovered',
        discoveredFrom: 'tsconfig.json',
        suggestion: 'Maintain strict TypeScript configuration and type all code'
      });
    }
    
    return rules;
  }

  /**
   * Discover rules from CI/CD configurations
   */
  async discoverFromCI(projectPath) {
    const rules = new Map();
    
    // GitHub Actions
    const githubWorkflowsPath = path.join(projectPath, '.github', 'workflows');
    if (fs.existsSync(githubWorkflowsPath)) {
      rules.set('auto-github-actions', {
        category: 'deployment',
        title: 'GitHub Actions CI/CD',
        description: 'Project uses GitHub Actions for automation',
        severity: 'medium',
        enabled: true,
        source: 'auto-discovered',
        discoveredFrom: '.github/workflows',
        suggestion: 'Maintain CI/CD pipelines and ensure they pass before merging'
      });
    }
    
    // Docker
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      rules.set('auto-docker-containerized', {
        category: 'deployment',
        title: 'Docker Containerization',
        description: 'Project uses Docker for containerization',
        severity: 'medium',
        enabled: true,
        source: 'auto-discovered',
        discoveredFrom: 'Dockerfile',
        suggestion: 'Keep Docker images lightweight and secure'
      });
    }
    
    return rules;
  }

  /**
   * Discover rules from Git configuration
   */
  async discoverFromGit(projectPath) {
    const rules = new Map();
    
    // .gitignore
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      
      if (gitignoreContent.includes('node_modules') || gitignoreContent.includes('.env')) {
        rules.set('auto-gitignore-configured', {
          category: 'security',
          title: 'Git Ignore Configured',
          description: 'Project properly ignores sensitive and generated files',
          severity: 'high',
          enabled: true,
          source: 'auto-discovered',
          discoveredFrom: '.gitignore',
          suggestion: 'Keep .gitignore updated to exclude sensitive files'
        });
      }
    }
    
    return rules;
  }

  /**
   * Create rule template for easy rule creation
   */
  createRuleTemplate(templateType = 'custom') {
    const templates = {
      'custom': {
        id: 'custom-rule-' + Date.now(),
        category: 'coding-standards',
        title: 'Custom Rule Title',
        description: 'Description of what this rule enforces',
        severity: 'medium',
        enabled: true,
        source: 'user',
        patterns: [],
        suggestion: 'How to comply with this rule'
      },
      'security': {
        id: 'security-rule-' + Date.now(),
        category: 'security',
        title: 'Security Rule Title',
        description: 'Security requirement description',
        severity: 'high',
        enabled: true,
        source: 'user',
        patterns: [],
        suggestion: 'Security best practice guidance'
      }
    };
    
    return templates[templateType] || templates['custom'];
  }

  /**
   * Export rules configuration
   */
  exportRules(options = {}) {
    const { includeGlobal = false, includeUser = true, includeRepository = true } = options;
    
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      rules: {}
    };
    
    if (includeGlobal) {
      exportData.rules.global = Array.from(this.globalRules.entries()).map(([id, rule]) => ({
        id,
        ...rule
      }));
    }
    
    if (includeUser) {
      exportData.rules.user = Array.from(this.userRules.entries()).map(([id, rule]) => ({
        id,
        ...rule
      }));
    }
    
    if (includeRepository) {
      exportData.rules.repository = Array.from(this.repositoryRules.entries()).map(([id, rule]) => ({
        id,
        ...rule
      }));
    }
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import rules configuration
   */
  importRules(configData, options = {}) {
    const { overwrite = false } = options;
    
    try {
      const data = typeof configData === 'string' ? JSON.parse(configData) : configData;
      
      if (!data.rules) {
        throw new Error('Invalid rules configuration format');
      }
      
      let importedCount = 0;
      
      // Import rules
      for (const [source, rules] of Object.entries(data.rules)) {
        if (!Array.isArray(rules)) continue;
        
        const targetMap = source === 'global' ? this.globalRules :
                         source === 'user' ? this.userRules :
                         source === 'repository' ? this.repositoryRules :
                         null;
        
        if (!targetMap) continue;
        
        for (const rule of rules) {
          if (!rule.id) continue;
          
          if (!targetMap.has(rule.id) || overwrite) {
            const normalizedRule = this.normalizeRule(rule, source);
            targetMap.set(rule.id, normalizedRule);
            importedCount++;
          }
        }
      }
      
      // Refresh active rules
      this.resolveRuleConflicts();
      this.activateApplicableRules();
      
      console.log(chalk.green(`✅ Imported ${importedCount} rules successfully`));
      return { success: true, imported: importedCount };
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to import rules: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Enhanced rule validation
   */
  async validateProjectAgainstRules() {
    const violations = [];
    const activeRules = Array.from(this.activeRules)
      .map(id => this.getRule(id))
      .filter(rule => rule);
    
    console.log(chalk.cyan(`🔍 Validating project against ${activeRules.length} active rules...`));
    
    for (const rule of activeRules) {
      const result = await this.validateRuleAgainstCodebase(rule.id);
      if (!result.valid && result.violations) {
        violations.push(...result.violations);
      }
    }
    
    if (violations.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${violations.length} rule violations:`));
      
      // Group by severity
      const violationsBySeverity = violations.reduce((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, {});
      
      console.log(chalk.red(`   Critical: ${violationsBySeverity.critical || 0}`));
      console.log(chalk.yellow(`   High: ${violationsBySeverity.high || 0}`));
      console.log(chalk.blue(`   Medium: ${violationsBySeverity.medium || 0}`));
      console.log(chalk.gray(`   Low: ${violationsBySeverity.low || 0}`));
      
      // Show first few violations
      const topViolations = violations.slice(0, 5);
      console.log(chalk.cyan('\nTop violations:'));
      
      for (const violation of topViolations) {
        console.log(chalk.white(`  📁 ${violation.file}:${violation.line}`));
        console.log(chalk.gray(`     ${violation.content}`));
        console.log(chalk.yellow(`     💡 ${violation.suggestion}`));
        console.log();
      }
      
      if (violations.length > 5) {
        console.log(chalk.gray(`   ... and ${violations.length - 5} more violations`));
      }
    } else {
      console.log(chalk.green('✅ No rule violations found'));
    }
    
    return violations;
  }

  /**
   * Validate rule against project codebase
   */
  async validateRuleAgainstCodebase(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) return { valid: false, reason: 'Rule not found' };
    
    const violations = [];
    const projectPath = process.cwd();
    
    try {
      // Get all relevant files for this rule
      const files = await this.getFilesForRule(rule, projectPath);
      
      for (const filePath of files.slice(0, 100)) { // Limit to 100 files for performance
        const fileViolations = await this.validateFileAgainstRule(filePath, rule);
        violations.push(...fileViolations);
      }
      
      return {
        valid: violations.length === 0,
        violations: violations,
        filesChecked: files.length,
        rule: rule
      };
      
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Get files that should be checked for a specific rule
   */
  async getFilesForRule(rule, projectPath) {
    const files = [];
    
    // Simple file discovery for now
    const walkDir = (dir, depth = 0) => {
      if (depth > 3) return; // Limit depth
      
      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules') continue;
          
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs'].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    walkDir(projectPath);
    return files;
  }

  /**
   * Validate a single file against a rule
   */
  async validateFileAgainstRule(filePath, rule) {
    const violations = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Check pattern-based rules
      if (rule.patterns && rule.patterns.length > 0) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          for (const pattern of rule.patterns) {
            const regex = new RegExp(pattern, 'gi');
            const matches = line.match(regex);
            
            if (matches) {
              violations.push({
                file: path.relative(process.cwd(), filePath),
                line: i + 1,
                content: line.trim(),
                pattern: pattern,
                rule: rule.id,
                severity: rule.severity,
                suggestion: rule.suggestion
              });
            }
          }
        }
      }
      
    } catch (error) {
      // Skip files that can't be read
    }
    
    return violations;
  }

}

module.exports = RulesEngine;