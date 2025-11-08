#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const chokidar = require('chokidar');

/**
 * Advanced Context Engine for Deep Codebase Understanding
 * Industry-leading context awareness with semantic understanding
 */
class ContextEngine {
  constructor() {
    this.codebaseIndex = new Map();
    this.dependencyGraph = new Map();
    this.semanticCache = new Map();
    this.fileWatcher = null;
    this.contextHistory = [];
    this.maxContextSize = 100000; // tokens
    this.analysisDepth = 'deep'; // shallow, medium, deep
    
    // File type handlers (will be bound in initializeAnalyzers)
    this.fileAnalyzers = {};
    
    // Programming language patterns
    this.patterns = {
      functions: {
        js: /(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g,
        py: /def\s+(\w+)\s*\(/g,
        go: /func\s+(\w+)\s*\(/g,
        java: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)*(\w+)\s*\(/g,
        rs: /fn\s+(\w+)\s*\(/g,
        cpp: /(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*{/g
      },
      classes: {
        js: /class\s+(\w+)/g,
        py: /class\s+(\w+)/g,
        java: /(?:public|private|protected)?\s*class\s+(\w+)/g,
        rs: /(?:pub\s+)?struct\s+(\w+)/g,
        cpp: /class\s+(\w+)/g
      },
      imports: {
        js: /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|const\s+.*?\s+=\s+require\s*\(\s*['"]([^'"]+)['"]\s*\))/g,
        py: /(?:import\s+(\w+)|from\s+(\w+)\s+import)/g,
        go: /import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/g,
        java: /import\s+([\w.]+)/g,
        rs: /use\s+([\w:]+)/g
      }
    };
    
    // Initialize analyzers after constructor
    this.initializeAnalyzers();
    
    this.initializeContextEngine();
  }

  /**
   * Initialize file analyzers with proper binding
   */
  initializeAnalyzers() {
    this.fileAnalyzers = {
      '.js': this.analyzeJavaScript ? this.analyzeJavaScript.bind(this) : this.genericAnalyzer.bind(this),
      '.ts': this.analyzeTypeScript ? this.analyzeTypeScript.bind(this) : this.genericAnalyzer.bind(this),
      '.jsx': this.analyzeReact ? this.analyzeReact.bind(this) : this.genericAnalyzer.bind(this),
      '.tsx': this.analyzeReact ? this.analyzeReact.bind(this) : this.genericAnalyzer.bind(this),
      '.py': this.analyzePython ? this.analyzePython.bind(this) : this.genericAnalyzer.bind(this),
      '.go': this.analyzeGo ? this.analyzeGo.bind(this) : this.genericAnalyzer.bind(this),
      '.java': this.analyzeJava ? this.analyzeJava.bind(this) : this.genericAnalyzer.bind(this),
      '.rs': this.analyzeRust ? this.analyzeRust.bind(this) : this.genericAnalyzer.bind(this),
      '.cpp': this.analyzeCpp ? this.analyzeCpp.bind(this) : this.genericAnalyzer.bind(this),
      '.c': this.analyzeC ? this.analyzeC.bind(this) : this.genericAnalyzer.bind(this),
      '.rb': this.analyzeRuby ? this.analyzeRuby.bind(this) : this.genericAnalyzer.bind(this),
      '.php': this.analyzePhp ? this.analyzePhp.bind(this) : this.genericAnalyzer.bind(this),
      '.json': this.analyzeJson ? this.analyzeJson.bind(this) : this.genericAnalyzer.bind(this),
      '.yaml': this.analyzeYaml ? this.analyzeYaml.bind(this) : this.genericAnalyzer.bind(this),
      '.yml': this.analyzeYaml ? this.analyzeYaml.bind(this) : this.genericAnalyzer.bind(this),
      '.md': this.analyzeMarkdown ? this.analyzeMarkdown.bind(this) : this.genericAnalyzer.bind(this),
      '.sql': this.analyzeSql ? this.analyzeSql.bind(this) : this.genericAnalyzer.bind(this),
      '.sh': this.analyzeShell ? this.analyzeShell.bind(this) : this.genericAnalyzer.bind(this),
      '.dockerfile': this.analyzeDockerfile ? this.analyzeDockerfile.bind(this) : this.genericAnalyzer.bind(this)
    };
  }

  /**
   * Initialize context engine
   */
  async initializeContextEngine() {
    console.log(chalk.cyan('🧠 Initializing Context Engine...'));
    
    try {
      // Start watching for file changes
      this.startFileWatcher();
      
      // Build initial codebase index
      await this.buildCodebaseIndex();
      
      console.log(chalk.green('✅ Context Engine ready'));
      console.log(chalk.gray(`   Indexed files: ${this.codebaseIndex.size}`));
      console.log(chalk.gray(`   Dependency nodes: ${this.dependencyGraph.size}`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Context Engine initialization limited: ${error.message}`));
    }
  }

  /**
   * Generic file analyzer fallback
   */
  genericAnalyzer(content, filePath) {
    return {
      type: 'generic',
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
      complexity: 1,
      loc: content.split('\n').length
    };
  }

  /**
   * Initialize the context engine
   */
  async initializeEngine() {
    console.log(chalk.cyan('🧠 Initializing Context Engine...'));
    
    try {
      await this.buildCodebaseIndex();
      await this.analyzeDependencyGraph();
      this.startFileWatcher();
      
      console.log(chalk.green('✅ Context Engine ready'));
      console.log(chalk.gray(`   Indexed: ${this.codebaseIndex.size} files`));
      console.log(chalk.gray(`   Dependencies: ${this.dependencyGraph.size} modules`));
    } catch (error) {
      console.log(chalk.red(`❌ Context Engine initialization failed: ${error.message}`));
    }
  }

  /**
   * Alias for initializeEngine for compatibility
   */
  async initialize() {
    return await this.initializeEngine();
  }

  /**
   * Build comprehensive codebase index
   */
  async buildCodebaseIndex() {
    const startTime = Date.now();
    const gitIgnore = this.loadGitIgnore();
    const workingDir = process.cwd();
    
    console.log(chalk.gray('📂 Scanning codebase...'));
    
    const files = await this.scanDirectory(workingDir, gitIgnore);
    
    for (const filePath of files) {
      await this.indexFile(filePath);
    }
    
    const duration = Date.now() - startTime;
    console.log(chalk.gray(`⚡ Indexing completed in ${duration}ms`));
  }

  /**
   * Scan directory for relevant files
   */
  async scanDirectory(dir, gitIgnore, files = [], depth = 0) {
    // Limit scanning depth to prevent massive traversal
    if (depth > 3) return files;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Skip ignored files/directories early
        if (this.shouldIgnore(relativePath, gitIgnore)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Only scan relevant directories
          const relevantDirs = ['src', 'lib', 'app', 'components', 'utils', 'services', 'config'];
          if (depth === 0 || relevantDirs.some(d => entry.name.includes(d))) {
            await this.scanDirectory(fullPath, gitIgnore, files, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.fileAnalyzers[ext] || this.isRelevantFile(entry.name)) {
            // Limit total files to prevent overload
            if (files.length < 100) {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.log(`⚠️  Skipping directory ${dir}: ${error.message}`);
    }
    
    return files;
  }

  /**
   * Index a single file for context
   */
  async indexFile(filePath) {
    try {
      const relativePath = path.relative(process.cwd(), filePath);
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);
      
      const analysis = {
        path: relativePath,
        fullPath: filePath,
        extension: ext,
        size: stats.size,
        modified: stats.mtime,
        lines: content.split('\n').length,
        hash: crypto.createHash('md5').update(content).digest('hex'),
        content: content,
        analysis: null,
        dependencies: [],
        exports: [],
        functions: [],
        classes: [],
        imports: [],
        semantics: null
      };
      
      // Perform language-specific analysis
      if (this.fileAnalyzers[ext]) {
        analysis.analysis = await this.fileAnalyzers[ext](content, filePath);
      }
      
      // Extract semantic information
      analysis.semantics = this.extractSemantics(content, ext);
      
      this.codebaseIndex.set(relativePath, analysis);
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not index ${filePath}: ${error.message}`));
    }
  }

  /**
   * JavaScript/Node.js analysis
   */
  async analyzeJavaScript(content, filePath) {
    const analysis = {
      type: 'javascript',
      framework: this.detectFramework(content, filePath),
      functions: this.extractFunctions(content, 'js'),
      classes: this.extractClasses(content, 'js'),
      imports: this.extractImports(content, 'js'),
      exports: this.extractExports(content, 'js'),
      asyncPatterns: this.extractAsyncPatterns(content),
      complexity: this.calculateComplexity(content),
      testFile: this.isTestFile(filePath),
      configFile: this.isConfigFile(filePath)
    };
    
    return analysis;
  }

  /**
   * TypeScript analysis
   */
  async analyzeTypeScript(content, filePath) {
    const jsAnalysis = await this.analyzeJavaScript(content, filePath);
    
    return {
      ...jsAnalysis,
      type: 'typescript',
      interfaces: this.extractTypeScriptInterfaces(content),
      types: this.extractTypeScriptTypes(content),
      generics: this.extractGenerics(content),
      decorators: this.extractDecorators(content)
    };
  }

  /**
   * React component analysis
   */
  async analyzeReact(content, filePath) {
    const baseAnalysis = await this.analyzeJavaScript(content, filePath);
    
    return {
      ...baseAnalysis,
      type: 'react',
      components: this.extractReactComponents(content),
      hooks: this.extractReactHooks(content),
      props: this.extractReactProps(content),
      state: this.extractReactState(content),
      lifecycle: this.extractReactLifecycle(content)
    };
  }

  /**
   * Python analysis
   */
  async analyzePython(content, filePath) {
    return {
      type: 'python',
      functions: this.extractFunctions(content, 'py'),
      classes: this.extractClasses(content, 'py'),
      imports: this.extractImports(content, 'py'),
      decorators: this.extractPythonDecorators(content),
      docstrings: this.extractDocstrings(content),
      complexity: this.calculateComplexity(content),
      testFile: this.isTestFile(filePath),
      framework: this.detectPythonFramework(content)
    };
  }

  /**
   * Extract semantic information from code
   */
  extractSemantics(content, ext) {
    const semantics = {
      purpose: this.inferPurpose(content, ext),
      domain: this.inferDomain(content),
      patterns: this.detectPatterns(content, ext),
      quality: this.assessQuality(content),
      maintainability: this.assessMaintainability(content),
      keywords: this.extractKeywords(content),
      concepts: this.extractConcepts(content)
    };
    
    return semantics;
  }

  /**
   * Infer the purpose of a file
   */
  inferPurpose(content, ext) {
    const purposeIndicators = {
      api: ['router', 'endpoint', 'controller', 'api', 'route'],
      database: ['model', 'schema', 'migration', 'query', 'database'],
      ui: ['component', 'view', 'template', 'render', 'jsx'],
      test: ['test', 'spec', 'mock', 'fixture', 'expect'],
      config: ['config', 'settings', 'env', 'constant'],
      util: ['util', 'helper', 'tool', 'common', 'shared'],
      service: ['service', 'client', 'adapter', 'provider'],
      auth: ['auth', 'login', 'permission', 'token', 'security']
    };
    
    const contentLower = content.toLowerCase();
    const scores = {};
    
    for (const [purpose, indicators] of Object.entries(purposeIndicators)) {
      scores[purpose] = indicators.reduce((score, indicator) => {
        const matches = (contentLower.match(new RegExp(indicator, 'g')) || []).length;
        return score + matches;
      }, 0);
    }
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'general';
    
    return Object.keys(scores).find(key => scores[key] === maxScore);
  }

  /**
   * Build dependency graph
   */
  async analyzeDependencyGraph() {
    console.log(chalk.gray('🔗 Building dependency graph...'));
    
    for (const [filePath, fileData] of this.codebaseIndex.entries()) {
      const dependencies = this.resolveDependencies(fileData);
      this.dependencyGraph.set(filePath, dependencies);
    }
  }

  /**
   * Resolve dependencies for a file
   */
  resolveDependencies(fileData) {
    const dependencies = {
      internal: [], // Local project files
      external: [], // npm packages
      builtin: []   // Node.js built-ins
    };
    
    if (fileData.analysis && fileData.analysis.imports) {
      for (const importPath of fileData.analysis.imports) {
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          // Internal dependency
          const resolvedPath = this.resolveInternalPath(importPath, fileData.path);
          if (resolvedPath) {
            dependencies.internal.push(resolvedPath);
          }
        } else if (this.isBuiltinModule(importPath)) {
          dependencies.builtin.push(importPath);
        } else {
          dependencies.external.push(importPath);
        }
      }
    }
    
    return dependencies;
  }

  /**
   * Generate context for AI interaction
   */
  generateContext(query, options = {}) {
    const context = {
      query: query,
      timestamp: new Date().toISOString(),
      relevantFiles: [],
      codebaseOverview: this.getCodebaseOverview(),
      dependencies: this.getDependencyInsights(),
      patterns: this.getArchitecturalPatterns(),
      suggestions: []
    };
    
    // Find relevant files based on query
    context.relevantFiles = this.findRelevantFiles(query, options);
    
    // Generate smart suggestions
    context.suggestions = this.generateSuggestions(query, context.relevantFiles);
    
    // Optimize context size
    context.optimizedContext = this.optimizeContextSize(context, options.maxTokens);
    
    return context;
  }

  /**
   * Find files relevant to a query
   */
  findRelevantFiles(query, options = {}) {
    const queryLower = query.toLowerCase();
    const relevantFiles = [];
    
    for (const [filePath, fileData] of this.codebaseIndex.entries()) {
      let relevanceScore = 0;
      
      // Check file path relevance
      if (filePath.toLowerCase().includes(queryLower)) {
        relevanceScore += 10;
      }
      
      // Check content relevance
      if (fileData.content.toLowerCase().includes(queryLower)) {
        const matches = (fileData.content.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
        relevanceScore += matches;
      }
      
      // Check semantic relevance
      if (fileData.semantics) {
        if (fileData.semantics.keywords.some(keyword => 
          keyword.toLowerCase().includes(queryLower))) {
          relevanceScore += 5;
        }
        
        if (fileData.semantics.concepts.some(concept => 
          concept.toLowerCase().includes(queryLower))) {
          relevanceScore += 3;
        }
      }
      
      // Check function/class names
      if (fileData.analysis) {
        if (fileData.analysis.functions.some(func => 
          func.toLowerCase().includes(queryLower))) {
          relevanceScore += 8;
        }
        
        if (fileData.analysis.classes.some(cls => 
          cls.toLowerCase().includes(queryLower))) {
          relevanceScore += 8;
        }
      }
      
      if (relevanceScore > 0) {
        relevantFiles.push({
          path: filePath,
          score: relevanceScore,
          data: fileData,
          preview: this.generateFilePreview(fileData, queryLower)
        });
      }
    }
    
    // Sort by relevance and return top results
    return relevantFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, options.maxFiles || 10);
  }

  /**
   * Get codebase overview
   */
  getCodebaseOverview() {
    const overview = {
      totalFiles: this.codebaseIndex.size,
      languages: new Map(),
      frameworks: new Map(),
      patterns: new Map(),
      structure: this.analyzeProjectStructure()
    };
    
    for (const [filePath, fileData] of this.codebaseIndex.entries()) {
      // Count languages
      const lang = this.getLanguageFromExtension(fileData.extension);
      overview.languages.set(lang, (overview.languages.get(lang) || 0) + 1);
      
      // Count frameworks
      if (fileData.analysis && fileData.analysis.framework) {
        const fw = fileData.analysis.framework;
        overview.frameworks.set(fw, (overview.frameworks.get(fw) || 0) + 1);
      }
      
      // Count patterns
      if (fileData.semantics && fileData.semantics.patterns) {
        for (const pattern of fileData.semantics.patterns) {
          overview.patterns.set(pattern, (overview.patterns.get(pattern) || 0) + 1);
        }
      }
    }
    
    return overview;
  }

  /**
   * Start file watcher for real-time updates
   */
  startFileWatcher() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
    
    // Only watch specific directories to prevent EMFILE errors
    const watchPaths = [
      'config.js',
      'package.json',
      'CLAUDE.md',
      'README.md'
    ];
    
    this.fileWatcher = chokidar.watch(watchPaths, {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.git/**',
        '**/logs/**',
        '**/sessions/**',
        '**/.recoder/**',
        '**/book-api/**',
        '**/collaboration-service/**',
        '**/ml-training-service/**',
        '**/plugin-registry-service/**'
      ],
      persistent: true,
      ignoreInitial: true
    });
    
    this.fileWatcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'add'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'change'))
      .on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'));
  }

  /**
   * Handle file changes
   */
  async handleFileChange(filePath, eventType) {
    const relativePath = path.relative(process.cwd(), filePath);
    
    switch (eventType) {
      case 'add':
      case 'change':
        await this.indexFile(filePath);
        break;
      case 'unlink':
        this.codebaseIndex.delete(relativePath);
        this.dependencyGraph.delete(relativePath);
        break;
    }
    
    // Update dependency graph if needed
    if (eventType !== 'unlink') {
      const fileData = this.codebaseIndex.get(relativePath);
      if (fileData) {
        const dependencies = this.resolveDependencies(fileData);
        this.dependencyGraph.set(relativePath, dependencies);
      }
    }
  }

  /**
   * Extract functions from code
   */
  extractFunctions(content, language) {
    const pattern = this.patterns.functions[language];
    if (!pattern) return [];
    
    const matches = content.matchAll(pattern);
    const functions = [];
    
    for (const match of matches) {
      // Extract function name from match groups
      const funcName = match[1] || match[2];
      if (funcName) {
        functions.push(funcName);
      }
    }
    
    return functions;
  }

  /**
   * Extract classes from code
   */
  extractClasses(content, language) {
    const pattern = this.patterns.classes[language];
    if (!pattern) return [];
    
    const matches = content.matchAll(pattern);
    const classes = [];
    
    for (const match of matches) {
      if (match[1]) {
        classes.push(match[1]);
      }
    }
    
    return classes;
  }

  /**
   * Extract imports from code
   */
  extractImports(content, language) {
    const pattern = this.patterns.imports[language];
    if (!pattern) return [];
    
    const matches = content.matchAll(pattern);
    const imports = [];
    
    for (const match of matches) {
      const importPath = match[1] || match[2];
      if (importPath) {
        imports.push(importPath.trim());
      }
    }
    
    return imports;
  }

  /**
   * Utility methods
   */
  
  loadGitIgnore() {
    try {
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        return fs.readFileSync(gitignorePath, 'utf8')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
      }
    } catch (error) {
      // Ignore gitignore errors
    }
    return [];
  }
  
  shouldIgnore(filePath, gitIgnore) {
    const defaultIgnore = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      'tmp',
      'temp',
      'logs',
      'sessions',
      '.recoder',
      'book-api',
      'collaboration-service',
      'ml-training-service',
      'plugin-registry-service',
      'api',
      'bin',
      'cli',
      'tests'
    ];
    
    const allIgnore = [...defaultIgnore, ...gitIgnore];
    
    // More aggressive pattern matching to prevent file watcher overload
    return allIgnore.some(pattern => {
      // Check if any part of the path contains the ignore pattern
      const pathParts = filePath.split(path.sep);
      return pathParts.some(part => part === pattern || part.startsWith(pattern + '.'));
    }) || filePath.includes('node_modules') || filePath.includes('.git');
  }
  
  isRelevantFile(fileName) {
    const relevantFiles = [
      'package.json',
      'tsconfig.json',
      'webpack.config.js',
      'babel.config.js',
      '.env',
      'docker-compose.yml',
      'Dockerfile',
      'README.md',
      'CHANGELOG.md'
    ];
    
    return relevantFiles.includes(fileName);
  }
  
  getLanguageFromExtension(ext) {
    const languageMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.rb': 'ruby',
      '.php': 'php'
    };
    
    return languageMap[ext] || 'unknown';
  }
  
  calculateComplexity(content) {
    // Simple cyclomatic complexity estimation
    const complexityIndicators = [
      'if', 'else', 'elif', 'while', 'for', 'switch', 
      'case', 'catch', 'try', '&&', '||'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const indicator of complexityIndicators) {
      try {
        // Escape special regex characters
        const escapedIndicator = indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = (content.match(new RegExp(`\\b${escapedIndicator}\\b`, 'g')) || []).length;
        complexity += matches;
      } catch (error) {
        // Skip invalid regex patterns
        console.log(`⚠️  Skipping complexity indicator ${indicator}: ${error.message}`);
      }
    }
    
    // Add ternary operator complexity separately
    const ternaryMatches = (content.match(/\?/g) || []).length;
    complexity += ternaryMatches;
    
    return complexity;
  }
  
  detectFramework(content, filePath) {
    const frameworks = {
      'react': ['react', 'jsx', 'useState', 'useEffect'],
      'vue': ['vue', 'v-if', 'v-for', 'computed'],
      'angular': ['angular', '@Component', 'ngOnInit'],
      'express': ['express', 'app.get', 'app.post', 'middleware'],
      'fastify': ['fastify', 'reply.send'],
      'nest': ['@Controller', '@Injectable', 'NestFactory'],
      'next': ['next', 'getServerSideProps', 'getStaticProps']
    };
    
    const contentLower = content.toLowerCase();
    
    for (const [framework, indicators] of Object.entries(frameworks)) {
      if (indicators.some(indicator => contentLower.includes(indicator.toLowerCase()))) {
        return framework;
      }
    }
    
    return null;
  }

  // Additional helper methods would continue here...
  
  extractKeywords(content) {
    // Extract significant keywords from content
    const words = content
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isCommonWord(word));
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
  
  isCommonWord(word) {
    const commonWords = [
      'const', 'function', 'return', 'this', 'that', 'with', 'from', 'import',
      'export', 'default', 'class', 'extends', 'implements', 'interface',
      'public', 'private', 'protected', 'static', 'async', 'await'
    ];
    return commonWords.includes(word);
  }
  
  extractConcepts(content) {
    // Extract higher-level concepts from the code
    const concepts = [];
    
    // Look for design patterns
    if (content.includes('Observer') || content.includes('subscribe')) {
      concepts.push('observer-pattern');
    }
    if (content.includes('Factory') || content.includes('create')) {
      concepts.push('factory-pattern');
    }
    if (content.includes('Singleton')) {
      concepts.push('singleton-pattern');
    }
    
    // Look for architectural concepts
    if (content.includes('middleware') || content.includes('pipeline')) {
      concepts.push('middleware-architecture');
    }
    if (content.includes('service') && content.includes('inject')) {
      concepts.push('dependency-injection');
    }
    if (content.includes('route') || content.includes('endpoint')) {
      concepts.push('api-design');
    }
    
    return concepts;
  }

  /**
   * Infer domain from content
   */
  inferDomain(content) {
    const domainIndicators = {
      'web-development': ['react', 'vue', 'angular', 'html', 'css', 'javascript'],
      'backend': ['server', 'database', 'api', 'express', 'fastify'],
      'mobile': ['react-native', 'flutter', 'ios', 'android'],
      'data-science': ['pandas', 'numpy', 'tensorflow', 'pytorch'],
      'devops': ['docker', 'kubernetes', 'aws', 'azure', 'terraform'],
      'testing': ['jest', 'mocha', 'pytest', 'testing', 'spec'],
      'security': ['auth', 'crypto', 'security', 'vulnerability']
    };
    
    const contentLower = content.toLowerCase();
    const scores = {};
    
    for (const [domain, indicators] of Object.entries(domainIndicators)) {
      scores[domain] = indicators.reduce((score, indicator) => {
        const matches = (contentLower.match(new RegExp(indicator, 'g')) || []).length;
        return score + matches;
      }, 0);
    }
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'general';
    
    return Object.keys(scores).find(key => scores[key] === maxScore);
  }

  /**
   * Extract exports from JavaScript/TypeScript
   */
  extractExports(content, language) {
    const exports = [];
    
    if (language === 'js' || language === 'ts') {
      // Named exports
      const namedExports = content.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g);
      for (const match of namedExports) {
        exports.push(match[1]);
      }
      
      // Default exports
      const defaultExports = content.matchAll(/export\s+default\s+(\w+)/g);
      for (const match of defaultExports) {
        exports.push(`default:${match[1]}`);
      }
      
      // Module.exports
      const moduleExports = content.matchAll(/module\.exports\s*=\s*(\w+)/g);
      for (const match of moduleExports) {
        exports.push(`module:${match[1]}`);
      }
    }
    
    return exports;
  }

  /**
   * Extract async patterns
   */
  extractAsyncPatterns(content) {
    const patterns = [];
    
    if (content.includes('async') || content.includes('await')) {
      patterns.push('async-await');
    }
    if (content.includes('Promise')) {
      patterns.push('promises');
    }
    if (content.includes('callback')) {
      patterns.push('callbacks');
    }
    if (content.includes('Observable') || content.includes('subscribe')) {
      patterns.push('observables');
    }
    
    return patterns;
  }

  /**
   * Extract TypeScript interfaces
   */
  extractTypeScriptInterfaces(content) {
    const interfaces = [];
    const matches = content.matchAll(/interface\s+(\w+)/g);
    
    for (const match of matches) {
      interfaces.push(match[1]);
    }
    
    return interfaces;
  }

  /**
   * Extract TypeScript types
   */
  extractTypeScriptTypes(content) {
    const types = [];
    const matches = content.matchAll(/type\s+(\w+)/g);
    
    for (const match of matches) {
      types.push(match[1]);
    }
    
    return types;
  }

  /**
   * Extract generics
   */
  extractGenerics(content) {
    const generics = [];
    const matches = content.matchAll(/<([A-Z]\w*)>/g);
    
    for (const match of matches) {
      if (!generics.includes(match[1])) {
        generics.push(match[1]);
      }
    }
    
    return generics;
  }

  /**
   * Extract decorators
   */
  extractDecorators(content) {
    const decorators = [];
    const matches = content.matchAll(/@(\w+)/g);
    
    for (const match of matches) {
      decorators.push(match[1]);
    }
    
    return decorators;
  }

  /**
   * Extract React components
   */
  extractReactComponents(content) {
    const components = [];
    
    // Function components
    const funcComponents = content.matchAll(/(?:const|function)\s+(\w+)\s*=?\s*\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*{?/g);
    for (const match of funcComponents) {
      if (match[1] && /^[A-Z]/.test(match[1])) {
        components.push(match[1]);
      }
    }
    
    // Class components
    const classComponents = content.matchAll(/class\s+(\w+)\s+extends\s+(?:React\.)?Component/g);
    for (const match of classComponents) {
      components.push(match[1]);
    }
    
    return components;
  }

  /**
   * Extract React hooks
   */
  extractReactHooks(content) {
    const hooks = [];
    const hookPatterns = [
      'useState', 'useEffect', 'useContext', 'useReducer',
      'useCallback', 'useMemo', 'useRef', 'useImperativeHandle',
      'useLayoutEffect', 'useDebugValue'
    ];
    
    for (const hook of hookPatterns) {
      if (content.includes(hook)) {
        hooks.push(hook);
      }
    }
    
    // Custom hooks
    const customHooks = content.matchAll(/(?:const|let)\s+(use\w+)\s*=/g);
    for (const match of customHooks) {
      hooks.push(match[1]);
    }
    
    return hooks;
  }

  /**
   * Extract React props
   */
  extractReactProps(content) {
    const props = [];
    
    // Props destructuring
    const propsMatch = content.matchAll(/\{\s*([^}]+)\s*\}\s*:\s*\w+/g);
    for (const match of propsMatch) {
      const propsList = match[1].split(',').map(p => p.trim());
      props.push(...propsList);
    }
    
    return props;
  }

  /**
   * Extract React state
   */
  extractReactState(content) {
    const state = [];
    
    // useState hooks
    const stateMatches = content.matchAll(/const\s*\[\s*(\w+),\s*set\w+\s*\]\s*=\s*useState/g);
    for (const match of stateMatches) {
      state.push(match[1]);
    }
    
    return state;
  }

  /**
   * Extract React lifecycle methods
   */
  extractReactLifecycle(content) {
    const lifecycle = [];
    const methods = [
      'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
      'componentDidCatch', 'getDerivedStateFromError', 'getSnapshotBeforeUpdate'
    ];
    
    for (const method of methods) {
      if (content.includes(method)) {
        lifecycle.push(method);
      }
    }
    
    return lifecycle;
  }

  /**
   * Extract Python decorators
   */
  extractPythonDecorators(content) {
    const decorators = [];
    const matches = content.matchAll(/@(\w+)/g);
    
    for (const match of matches) {
      decorators.push(match[1]);
    }
    
    return decorators;
  }

  /**
   * Extract docstrings
   */
  extractDocstrings(content) {
    const docstrings = [];
    const matches = content.matchAll(/"""([^"]+)"""/g);
    
    for (const match of matches) {
      docstrings.push(match[1].trim());
    }
    
    return docstrings;
  }

  /**
   * Detect Python framework
   */
  detectPythonFramework(content) {
    const frameworks = {
      'django': ['django', 'models.Model', 'HttpResponse'],
      'flask': ['flask', 'Flask', 'app.route'],
      'fastapi': ['fastapi', 'FastAPI', 'async def'],
      'pytest': ['pytest', 'test_', 'assert'],
      'pandas': ['pandas', 'DataFrame', 'pd.'],
      'numpy': ['numpy', 'np.', 'array']
    };
    
    const contentLower = content.toLowerCase();
    
    for (const [framework, indicators] of Object.entries(frameworks)) {
      if (indicators.some(indicator => contentLower.includes(indicator.toLowerCase()))) {
        return framework;
      }
    }
    
    return null;
  }

  /**
   * Assess code quality
   */
  assessQuality(content) {
    let score = 0;
    
    // Positive indicators
    if (content.includes('const ')) score += 1;
    if (content.includes('// ') || content.includes('/* ')) score += 1;
    if (content.includes('try') && content.includes('catch')) score += 1;
    if (content.includes('async') || content.includes('await')) score += 1;
    
    // Negative indicators
    if (content.includes('var ')) score -= 1;
    if (content.includes('console.log')) score -= 0.5;
    if (content.includes('TODO') || content.includes('FIXME')) score -= 0.5;
    
    return Math.max(0, Math.min(5, score));
  }

  /**
   * Assess maintainability
   */
  assessMaintainability(content) {
    const lines = content.split('\n');
    let score = 5;
    
    // Function length
    const avgFunctionLength = this.calculateAverageFunctionLength(content);
    if (avgFunctionLength > 50) score -= 1;
    if (avgFunctionLength > 100) score -= 1;
    
    // Complexity
    const complexity = this.calculateComplexity(content);
    if (complexity > 10) score -= 1;
    if (complexity > 20) score -= 1;
    
    // Documentation
    const commentRatio = this.calculateCommentRatio(content);
    if (commentRatio < 0.1) score -= 1;
    
    return Math.max(1, score);
  }

  /**
   * Calculate average function length
   */
  calculateAverageFunctionLength(content) {
    const functions = content.match(/function[^{]*{[^}]*}/g) || [];
    if (functions.length === 0) return 0;
    
    const totalLines = functions.reduce((sum, func) => {
      return sum + func.split('\n').length;
    }, 0);
    
    return totalLines / functions.length;
  }

  /**
   * Calculate comment ratio
   */
  calculateCommentRatio(content) {
    const lines = content.split('\n');
    const commentLines = lines.filter(line => 
      line.trim().startsWith('//') || 
      line.trim().startsWith('/*') || 
      line.trim().startsWith('*')
    ).length;
    
    return commentLines / lines.length;
  }

  /**
   * Detect patterns in code
   */
  detectPatterns(content, ext) {
    const patterns = [];
    
    // Design patterns
    if (content.includes('Observer') || content.includes('subscribe')) {
      patterns.push('observer');
    }
    if (content.includes('Factory')) {
      patterns.push('factory');
    }
    if (content.includes('Singleton')) {
      patterns.push('singleton');
    }
    
    // Architectural patterns
    if (content.includes('Controller') || content.includes('controller')) {
      patterns.push('mvc');
    }
    if (content.includes('middleware')) {
      patterns.push('middleware');
    }
    if (content.includes('service') && content.includes('inject')) {
      patterns.push('dependency-injection');
    }
    
    return patterns;
  }
  
  generateFilePreview(fileData, query) {
    const lines = fileData.content.split('\n');
    const queryLower = query.toLowerCase();
    
    // Find lines containing the query
    const relevantLines = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(queryLower))
      .slice(0, 3); // Show up to 3 relevant lines
    
    if (relevantLines.length === 0) {
      return fileData.content.substring(0, 200) + '...';
    }
    
    return relevantLines
      .map(({ line, number }) => `${number}: ${line.trim()}`)
      .join('\n');
  }
  
  analyzeProjectStructure() {
    const structure = {
      directories: new Map(),
      patterns: [],
      conventions: []
    };
    
    for (const [filePath] of this.codebaseIndex.entries()) {
      const dir = path.dirname(filePath);
      structure.directories.set(dir, (structure.directories.get(dir) || 0) + 1);
    }
    
    // Detect common patterns
    if (structure.directories.has('src')) {
      structure.patterns.push('src-directory');
    }
    if (structure.directories.has('components')) {
      structure.patterns.push('component-architecture');
    }
    if (structure.directories.has('services')) {
      structure.patterns.push('service-layer');
    }
    if (structure.directories.has('utils') || structure.directories.has('helpers')) {
      structure.patterns.push('utility-organization');
    }
    
    return structure;
  }

  /**
   * Check if module is a Node.js builtin
   */
  isBuiltinModule(importPath) {
    const builtins = [
      'fs', 'path', 'os', 'crypto', 'util', 'events', 'stream',
      'http', 'https', 'url', 'querystring', 'zlib', 'buffer'
    ];
    return builtins.includes(importPath);
  }

  /**
   * Resolve internal import path
   */
  resolveInternalPath(importPath, fromPath) {
    try {
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const basePath = path.dirname(fromPath);
        const resolved = path.resolve(basePath, importPath);
        const relativePath = path.relative(process.cwd(), resolved);
        
        // Try different extensions
        const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json'];
        for (const ext of extensions) {
          const fullPath = relativePath + ext;
          if (this.codebaseIndex.has(fullPath)) {
            return fullPath;
          }
        }
        
        // Try index files
        for (const ext of extensions) {
          const indexPath = path.join(relativePath, 'index' + ext);
          if (this.codebaseIndex.has(indexPath)) {
            return indexPath;
          }
        }
        
        return relativePath;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file is a test file
   */
  isTestFile(filePath) {
    const testIndicators = [
      '.test.', '.spec.', '__tests__', 'test/', 'tests/',
      'spec/', 'specs/', '.test', '.spec'
    ];
    
    return testIndicators.some(indicator => 
      filePath.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if file is a config file
   */
  isConfigFile(filePath) {
    const configIndicators = [
      'config', 'configuration', '.config', 'settings',
      'webpack.config', 'babel.config', 'jest.config',
      'tsconfig', 'package.json', '.env'
    ];
    
    return configIndicators.some(indicator => 
      filePath.toLowerCase().includes(indicator)
    );
  }

  /**
   * Get dependency insights
   */
  getDependencyInsights() {
    const insights = {
      totalDependencies: 0,
      internalDependencies: 0,
      externalDependencies: 0,
      builtinDependencies: 0,
      mostUsedExternal: new Map(),
      circularDependencies: []
    };
    
    for (const [filePath, dependencies] of this.dependencyGraph.entries()) {
      insights.totalDependencies += 
        dependencies.internal.length + 
        dependencies.external.length + 
        dependencies.builtin.length;
      
      insights.internalDependencies += dependencies.internal.length;
      insights.externalDependencies += dependencies.external.length;
      insights.builtinDependencies += dependencies.builtin.length;
      
      // Count external dependency usage
      for (const external of dependencies.external) {
        insights.mostUsedExternal.set(
          external, 
          (insights.mostUsedExternal.get(external) || 0) + 1
        );
      }
    }
    
    return insights;
  }

  /**
   * Get architectural patterns
   */
  getArchitecturalPatterns() {
    const patterns = {
      mvc: 0,
      microservices: 0,
      layered: 0,
      eventDriven: 0,
      restful: 0,
      graphql: 0
    };
    
    for (const [filePath, fileData] of this.codebaseIndex.entries()) {
      if (fileData.semantics && fileData.semantics.patterns) {
        for (const pattern of fileData.semantics.patterns) {
          if (patterns.hasOwnProperty(pattern)) {
            patterns[pattern]++;
          }
        }
      }
    }
    
    return patterns;
  }

  /**
   * Generate suggestions based on context
   */
  generateSuggestions(query, relevantFiles) {
    const suggestions = [];
    
    // File-based suggestions
    if (relevantFiles.length > 0) {
      const topFile = relevantFiles[0];
      if (topFile.data.analysis) {
        if (topFile.data.analysis.testFile) {
          suggestions.push('Consider running tests for this file');
        }
        if (topFile.data.analysis.complexity > 10) {
          suggestions.push('This file has high complexity - consider refactoring');
        }
      }
    }
    
    // Query-based suggestions
    if (query.toLowerCase().includes('test')) {
      suggestions.push('Use /test command to run project tests');
    }
    if (query.toLowerCase().includes('deploy')) {
      suggestions.push('Use /deploy command for deployment assistance');
    }
    if (query.toLowerCase().includes('security')) {
      suggestions.push('Use /security-audit for security analysis');
    }
    
    return suggestions;
  }

  /**
   * Optimize context size for token limits
   */
  optimizeContextSize(context, maxTokens = 4000) {
    // Rough token estimation (1 token ≈ 4 characters)
    const estimateTokens = (text) => Math.ceil(text.length / 4);
    
    let optimized = {
      ...context,
      relevantFiles: context.relevantFiles.slice(0, 5), // Limit files
      codebaseOverview: {
        totalFiles: context.codebaseOverview.totalFiles,
        languages: Array.from(context.codebaseOverview.languages.entries()).slice(0, 5),
        frameworks: Array.from(context.codebaseOverview.frameworks.entries()).slice(0, 3)
      }
    };
    
    // Truncate file previews if needed
    let currentTokens = estimateTokens(JSON.stringify(optimized));
    
    if (currentTokens > maxTokens) {
      optimized.relevantFiles = optimized.relevantFiles.map(file => ({
        ...file,
        preview: file.preview.substring(0, 200) + '...'
      }));
    }
    
    return optimized;
  }
  
  shutdown() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
    console.log(chalk.gray('🧠 Context Engine shutdown'));
  }
}

module.exports = ContextEngine;