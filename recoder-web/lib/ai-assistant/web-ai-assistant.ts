/**
 * Advanced Web AI Assistant
 * Intelligent code completion, refactoring, and generation for recoder-web
 */

import { unifiedWebAI, type WebGenerationOptions } from '../unified-web-ai';
import { CrossPlatformHub } from '@recoder/cross-platform-sync';
import { EventEmitter } from 'events';

export interface AIAssistantConfig {
  // Cross-platform Integration
  crossPlatform?: {
    enabled: boolean;
    hub?: CrossPlatformHub;
    syncContext: boolean;
    syncPreferences: boolean;
  };
  
  // AI Configuration
  ai: {
    defaultModel: string;
    fallbackModels: string[];
    maxContextTokens: number;
    temperature: number;
    enableStreaming: boolean;
  };
  
  // Feature Configuration
  features: {
    codeCompletion: boolean;
    inlineRefactoring: boolean;
    smartSuggestions: boolean;
    contextAwareness: boolean;
    realTimeAnalysis: boolean;
    collaborativeEditing: boolean;
  };
  
  // Performance Configuration
  performance: {
    completionDebounceMs: number;
    analysisThrottleMs: number;
    cacheTimeout: number;
    maxConcurrentRequests: number;
  };
}

export interface CodeCompletionRequest {
  code: string;
  position: { line: number; column: number };
  language: string;
  context?: {
    fileName?: string;
    projectType?: string;
    framework?: string;
    dependencies?: string[];
  };
  trigger?: 'typing' | 'manual' | 'tab';
}

export interface CodeCompletionResponse {
  completions: Array<{
    text: string;
    displayText: string;
    insertText: string;
    kind: 'function' | 'variable' | 'class' | 'snippet' | 'keyword';
    detail?: string;
    documentation?: string;
    sortText?: string;
    confidence: number;
  }>;
  metadata: {
    model: string;
    responseTime: number;
    cached: boolean;
  };
}

export interface RefactoringRequest {
  code: string;
  selection: { start: number; end: number };
  language: string;
  refactoringType?: 'extract-function' | 'rename' | 'optimize' | 'modernize' | 'auto';
}

export interface RefactoringResponse {
  options: Array<{
    id: string;
    title: string;
    description: string;
    preview: string;
    confidence: number;
    impact: 'low' | 'medium' | 'high';
  }>;
  metadata: {
    analysisTime: number;
    suggestionsCount: number;
  };
}

export interface CodeAnalysisResult {
  issues: Array<{
    line: number;
    column: number;
    type: 'error' | 'warning' | 'info' | 'suggestion';
    category: 'syntax' | 'logic' | 'performance' | 'security' | 'style';
    message: string;
    fix?: string;
    severity: number;
  }>;
  metrics: {
    complexity: number;
    maintainability: number;
    testability: number;
    performance: number;
  };
  suggestions: Array<{
    type: 'optimization' | 'security' | 'accessibility' | 'modernization';
    description: string;
    code: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}

export interface AssistantState {
  isActive: boolean;
  currentModel: string;
  activeFeatures: string[];
  contextSize: number;
  sessionStats: {
    completionsGenerated: number;
    refactoringsApplied: number;
    issuesDetected: number;
    timeActive: number;
  };
}

export class WebAIAssistant extends EventEmitter {
  private config: AIAssistantConfig;
  private state: AssistantState;
  private completionCache: Map<string, CodeCompletionResponse> = new Map();
  private analysisCache: Map<string, CodeAnalysisResult> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private contextMemory: Map<string, any> = new Map();
  private initialized = false;

  constructor(config: AIAssistantConfig) {
    super();
    this.config = this.validateConfig(config);
    this.state = this.initializeState();
    this.setupCacheCleanup();
  }

  private validateConfig(config: AIAssistantConfig): AIAssistantConfig {
    return {
      crossPlatform: {
        enabled: true,
        syncContext: true,
        syncPreferences: true,
        ...config.crossPlatform
      },
      ai: {
        defaultModel: 'claude-3-sonnet',
        fallbackModels: ['gemini-2.0-flash', 'groq-llama'],
        maxContextTokens: 8000,
        temperature: 0.1,
        enableStreaming: true,
        ...config.ai
      },
      features: {
        codeCompletion: true,
        inlineRefactoring: true,
        smartSuggestions: true,
        contextAwareness: true,
        realTimeAnalysis: true,
        collaborativeEditing: false,
        ...config.features
      },
      performance: {
        completionDebounceMs: 150,
        analysisThrottleMs: 500,
        cacheTimeout: 300000, // 5 minutes
        maxConcurrentRequests: 3,
        ...config.performance
      }
    };
  }

  private initializeState(): AssistantState {
    return {
      isActive: false,
      currentModel: this.config.ai.defaultModel,
      activeFeatures: [],
      contextSize: 0,
      sessionStats: {
        completionsGenerated: 0,
        refactoringsApplied: 0,
        issuesDetected: 0,
        timeActive: 0
      }
    };
  }

  private setupCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = this.config.performance.cacheTimeout;
      
      // Clean completion cache
      for (const [key, response] of this.completionCache.entries()) {
        if (now - (response.metadata as any).timestamp > timeout) {
          this.completionCache.delete(key);
        }
      }
      
      // Clean analysis cache
      for (const [key, result] of this.analysisCache.entries()) {
        if (now - (result as any).timestamp > timeout) {
          this.analysisCache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  /**
   * Initialize the AI assistant
   */
  public async initialize(): Promise<void> {
    console.log('🧠 Initializing Web AI Assistant...');

    try {
      // Initialize unified web AI
      await unifiedWebAI.generateCode('test', { language: 'typescript' });
      
      // Enable features
      this.state.activeFeatures = Object.entries(this.config.features)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => feature);

      // Setup cross-platform sync if enabled
      if (this.config.crossPlatform?.enabled && this.config.crossPlatform.hub) {
        this.setupCrossPlatformSync();
      }

      this.state.isActive = true;
      this.initialized = true;

      console.log('✅ Web AI Assistant initialized successfully');
      this.emit('initialized', this.state);

    } catch (error) {
      console.error('❌ Failed to initialize Web AI Assistant:', error);
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  private setupCrossPlatformSync(): void {
    const hub = this.config.crossPlatform!.hub!;

    // Listen for context updates from other platforms
    hub.on('aiContextUpdated', (context) => {
      if (this.config.crossPlatform!.syncContext) {
        this.updateContextFromRemote(context);
      }
    });

    // Listen for preference updates
    hub.on('settingsUpdated', (settings) => {
      if (this.config.crossPlatform!.syncPreferences && settings.aiPreferences) {
        this.updatePreferencesFromRemote(settings.aiPreferences);
      }
    });
  }

  /**
   * Get intelligent code completions
   */
  public async getCodeCompletion(request: CodeCompletionRequest): Promise<CodeCompletionResponse> {
    if (!this.config.features.codeCompletion || !this.initialized) {
      throw new Error('Code completion is disabled or assistant not initialized');
    }

    const cacheKey = this.generateCacheKey('completion', request);
    const cached = this.completionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Debounce rapid requests
      if (request.trigger === 'typing') {
        await this.debounceRequest('completion', request);
      }

      // Analyze context for intelligent completions
      const context = await this.analyzeCodeContext(request);
      
      // Generate completion prompt
      const prompt = this.buildCompletionPrompt(request, context);
      
      // Get AI response
      const result = await unifiedWebAI.generateCode(prompt, {
        language: request.language,
        maxTokens: 500,
        temperature: 0.1
      });

      // Parse completions from AI response
      const completions = this.parseCompletions(result.code, request);
      
      const response: CodeCompletionResponse = {
        completions,
        metadata: {
          model: result.model,
          responseTime: Date.now() - startTime,
          cached: false
        }
      };

      // Cache the response
      (response.metadata as any).timestamp = Date.now();
      this.completionCache.set(cacheKey, response);

      this.state.sessionStats.completionsGenerated++;
      this.emit('completionGenerated', response);

      return response;

    } catch (error) {
      console.error('Code completion failed:', error);
      throw error;
    }
  }

  /**
   * Get refactoring suggestions
   */
  public async getRefactoringSuggestions(request: RefactoringRequest): Promise<RefactoringResponse> {
    if (!this.config.features.inlineRefactoring || !this.initialized) {
      throw new Error('Refactoring is disabled or assistant not initialized');
    }

    const startTime = Date.now();

    try {
      const selectedCode = request.code.substring(request.selection.start, request.selection.end);
      
      // Build refactoring prompt
      const prompt = this.buildRefactoringPrompt(selectedCode, request);
      
      // Get AI suggestions
      const result = await unifiedWebAI.generateCode(prompt, {
        language: request.language,
        maxTokens: 1000,
        temperature: 0.2
      });

      // Parse refactoring options
      const options = this.parseRefactoringOptions(result.code, selectedCode);

      const response: RefactoringResponse = {
        options,
        metadata: {
          analysisTime: Date.now() - startTime,
          suggestionsCount: options.length
        }
      };

      this.emit('refactoringSuggestions', response);
      return response;

    } catch (error) {
      console.error('Refactoring analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze code for issues and suggestions
   */
  public async analyzeCode(code: string, language: string): Promise<CodeAnalysisResult> {
    if (!this.config.features.realTimeAnalysis || !this.initialized) {
      return { issues: [], metrics: { complexity: 0, maintainability: 0, testability: 0, performance: 0 }, suggestions: [] };
    }

    const cacheKey = this.generateCacheKey('analysis', { code, language });
    const cached = this.analysisCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Throttle analysis requests
      await this.throttleRequest('analysis');

      // Build analysis prompt
      const prompt = this.buildAnalysisPrompt(code, language);
      
      // Get AI analysis
      const result = await unifiedWebAI.generateCode(prompt, {
        language,
        maxTokens: 1500,
        temperature: 0.1
      });

      // Parse analysis results
      const analysis = this.parseAnalysisResult(result.code, code);
      
      // Cache the result
      (analysis as any).timestamp = Date.now();
      this.analysisCache.set(cacheKey, analysis);

      this.state.sessionStats.issuesDetected += analysis.issues.length;
      this.emit('codeAnalyzed', analysis);

      return analysis;

    } catch (error) {
      console.error('Code analysis failed:', error);
      return { issues: [], metrics: { complexity: 0, maintainability: 0, testability: 0, performance: 0 }, suggestions: [] };
    }
  }

  /**
   * Update code context for awareness
   */
  public updateContext(key: string, value: any): void {
    if (!this.config.features.contextAwareness) return;

    this.contextMemory.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: (this.contextMemory.get(key)?.accessCount || 0) + 1
    });

    this.state.contextSize = this.contextMemory.size;

    // Sync context cross-platform if enabled
    if (this.config.crossPlatform?.enabled && this.config.crossPlatform.syncContext) {
      this.syncContextCrossPlatform(key, value);
    }

    this.emit('contextUpdated', { key, value });
  }

  // Private Helper Methods

  private async analyzeCodeContext(request: CodeCompletionRequest): Promise<any> {
    const context = {
      beforeCursor: request.code.substring(0, request.position.line * 80 + request.position.column),
      afterCursor: request.code.substring(request.position.line * 80 + request.position.column),
      language: request.language,
      fileName: request.context?.fileName,
      projectType: request.context?.projectType,
      framework: request.context?.framework
    };

    // Analyze patterns and context
    const patterns = this.detectCodePatterns(context.beforeCursor);
    const scope = this.detectScope(context.beforeCursor);
    
    return { ...context, patterns, scope };
  }

  private buildCompletionPrompt(request: CodeCompletionRequest, context: any): string {
    return `You are an expert ${request.language} developer. Provide intelligent code completions for the cursor position.

CONTEXT:
- Language: ${request.language}
- Framework: ${request.context?.framework || 'Unknown'}
- File: ${request.context?.fileName || 'Unknown'}

CODE BEFORE CURSOR:
\`\`\`${request.language}
${context.beforeCursor.slice(-500)}
\`\`\`

CODE AFTER CURSOR:
\`\`\`${request.language}
${context.afterCursor.slice(0, 200)}
\`\`\`

Provide 3-5 intelligent completions that would make sense at the cursor position. Consider:
1. Variable/function names in scope
2. Common patterns for this context
3. Framework-specific completions
4. Type-aware suggestions

Format as JSON:
{
  "completions": [
    {
      "text": "completion text",
      "displayText": "what user sees",
      "insertText": "what gets inserted",
      "kind": "function|variable|class|snippet|keyword",
      "detail": "brief description",
      "confidence": 0.95
    }
  ]
}`;
  }

  private buildRefactoringPrompt(selectedCode: string, request: RefactoringRequest): string {
    return `You are an expert ${request.language} refactoring assistant. Analyze this code and suggest improvements.

SELECTED CODE:
\`\`\`${request.language}
${selectedCode}
\`\`\`

REFACTORING TYPE: ${request.refactoringType || 'auto'}

Provide specific refactoring suggestions focusing on:
1. Code clarity and readability
2. Performance optimization
3. Modern language features
4. Best practices
5. Maintainability

Format as JSON:
{
  "options": [
    {
      "id": "unique-id",
      "title": "Extract Function",
      "description": "Extract this logic into a reusable function",
      "preview": "function extractedFunction() { ... }",
      "confidence": 0.9,
      "impact": "medium"
    }
  ]
}`;
  }

  private buildAnalysisPrompt(code: string, language: string): string {
    return `You are an expert ${language} code analyzer. Analyze this code for issues, metrics, and suggestions.

CODE:
\`\`\`${language}
${code}
\`\`\`

Analyze for:
1. Syntax errors and warnings
2. Logic issues and potential bugs
3. Performance bottlenecks
4. Security vulnerabilities
5. Style and maintainability
6. Accessibility issues (for UI code)

Provide metrics:
- Complexity score (1-10)
- Maintainability score (1-10)
- Testability score (1-10)
- Performance score (1-10)

Format as JSON:
{
  "issues": [
    {
      "line": 5,
      "column": 10,
      "type": "warning",
      "category": "performance",
      "message": "Consider using const instead of let",
      "fix": "const variableName",
      "severity": 3
    }
  ],
  "metrics": {
    "complexity": 6,
    "maintainability": 8,
    "testability": 7,
    "performance": 9
  },
  "suggestions": [
    {
      "type": "optimization",
      "description": "Use memoization for expensive calculations",
      "code": "const memoized = useMemo(() => expensiveFunc(), [deps])",
      "impact": "high"
    }
  ]
}`;
  }

  private parseCompletions(aiResponse: string, request: CodeCompletionRequest): CodeCompletionResponse['completions'] {
    try {
      const parsed = JSON.parse(aiResponse);
      return parsed.completions || [];
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return this.fallbackParseCompletions(aiResponse, request);
    }
  }

  private parseRefactoringOptions(aiResponse: string, selectedCode: string): RefactoringResponse['options'] {
    try {
      const parsed = JSON.parse(aiResponse);
      return parsed.options || [];
    } catch (error) {
      // Fallback parsing
      return [{
        id: 'fallback',
        title: 'Improve Code',
        description: 'General code improvements suggested',
        preview: selectedCode,
        confidence: 0.5,
        impact: 'medium' as const
      }];
    }
  }

  private parseAnalysisResult(aiResponse: string, code: string): CodeAnalysisResult {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        issues: parsed.issues || [],
        metrics: parsed.metrics || { complexity: 5, maintainability: 5, testability: 5, performance: 5 },
        suggestions: parsed.suggestions || []
      };
    } catch (error) {
      // Fallback analysis
      return {
        issues: [],
        metrics: { complexity: 5, maintainability: 5, testability: 5, performance: 5 },
        suggestions: []
      };
    }
  }

  private fallbackParseCompletions(response: string, request: CodeCompletionRequest): CodeCompletionResponse['completions'] {
    // Simple fallback - extract code blocks and create basic completions
    const lines = response.split('\n');
    const completions: CodeCompletionResponse['completions'] = [];
    
    for (const line of lines) {
      if (line.trim() && !line.startsWith('//') && !line.startsWith('*')) {
        completions.push({
          text: line.trim(),
          displayText: line.trim(),
          insertText: line.trim(),
          kind: 'snippet',
          confidence: 0.3
        });
      }
    }
    
    return completions.slice(0, 5);
  }

  private detectCodePatterns(code: string): string[] {
    const patterns: string[] = [];
    
    if (code.includes('function')) patterns.push('function-definition');
    if (code.includes('class')) patterns.push('class-definition');
    if (code.includes('import')) patterns.push('imports');
    if (code.includes('useState')) patterns.push('react-hooks');
    if (code.includes('useEffect')) patterns.push('react-effects');
    if (code.includes('async')) patterns.push('async-code');
    if (code.includes('await')) patterns.push('await-pattern');
    
    return patterns;
  }

  private detectScope(code: string): string {
    if (code.includes('export default')) return 'module-export';
    if (code.includes('export')) return 'module';
    if (code.includes('function')) return 'function';
    if (code.includes('class')) return 'class';
    if (code.includes('{')) return 'block';
    return 'global';
  }

  private generateCacheKey(type: string, data: any): string {
    return `${type}:${JSON.stringify(data).slice(0, 100)}`;
  }

  private async debounceRequest(type: string, data: any): Promise<void> {
    const key = `${type}:${JSON.stringify(data).slice(0, 50)}`;
    
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }
    
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.config.performance.completionDebounceMs);
      this.debounceTimers.set(key, timer);
    });
  }

  private async throttleRequest(type: string): Promise<void> {
    const key = `throttle:${type}`;
    const lastRequest = this.contextMemory.get(key)?.timestamp || 0;
    const minInterval = this.config.performance.analysisThrottleMs;
    const timeSinceLastRequest = Date.now() - lastRequest;
    
    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }
    
    this.contextMemory.set(key, { timestamp: Date.now() });
  }

  private async syncContextCrossPlatform(key: string, value: any): Promise<void> {
    if (!this.config.crossPlatform?.hub) return;

    try {
      await this.config.crossPlatform.hub.syncAIContext({
        webAssistant: {
          [key]: value
        },
        timestamp: new Date(),
        source: 'web-ai-assistant'
      });
    } catch (error) {
      console.error('Failed to sync context cross-platform:', error);
    }
  }

  private updateContextFromRemote(context: any): void {
    if (context.webAssistant) {
      for (const [key, value] of Object.entries(context.webAssistant)) {
        this.contextMemory.set(key, {
          value,
          timestamp: Date.now(),
          accessCount: 0,
          source: 'remote'
        });
      }
      this.emit('contextSynced', context);
    }
  }

  private updatePreferencesFromRemote(preferences: any): void {
    // Update assistant configuration based on remote preferences
    if (preferences.defaultModel) {
      this.state.currentModel = preferences.defaultModel;
    }
    this.emit('preferencesUpdated', preferences);
  }

  /**
   * Get current assistant state
   */
  public getState(): AssistantState {
    return { ...this.state };
  }

  /**
   * Get assistant capabilities
   */
  public getCapabilities(): string[] {
    return this.state.activeFeatures;
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'critical';
    initialized: boolean;
    cacheSize: number;
    sessionStats: AssistantState['sessionStats'];
  } {
    const cacheSize = this.completionCache.size + this.analysisCache.size;
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (!this.initialized || !this.state.isActive) {
      status = 'critical';
    } else if (cacheSize > 1000) {
      status = 'degraded';
    }

    return {
      status,
      initialized: this.initialized,
      cacheSize,
      sessionStats: this.state.sessionStats
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('🧠 Shutting down Web AI Assistant...');

    try {
      // Clear timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      // Clear caches
      this.completionCache.clear();
      this.analysisCache.clear();
      this.contextMemory.clear();

      this.removeAllListeners();
      this.initialized = false;
      this.state.isActive = false;

      console.log('✅ Web AI Assistant shutdown complete');

    } catch (error) {
      console.error('❌ Error during Web AI Assistant shutdown:', error);
      throw error;
    }
  }
}

export default WebAIAssistant;