/**
 * Vibe Code Mode - Real Implementation
 * Real-time AI-powered code generation with streaming and auto-suggestions
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import * as chokidar from 'chokidar';
import { Logger } from '../utils/logger';
import { getMasterOrchestrator } from './master-orchestrator';
import { AIHub } from './ai-hub';

export interface VibeCodeConfig {
  enabled: boolean;
  autoSuggest: boolean;
  continuousRefactor: boolean;
  realTimeCollab: boolean;
  suggestionsDelay: number; // ms
  contextWindow: number; // lines of code to consider
  aggressiveness: 'conservative' | 'balanced' | 'aggressive';
  languages: string[];
  excludePaths: string[];
}

export interface CodeSuggestion {
  id: string;
  type: 'completion' | 'refactor' | 'fix' | 'optimization' | 'documentation';
  file: string;
  line: number;
  column: number;
  originalCode: string;
  suggestedCode: string;
  explanation: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  category: string;
  timestamp: Date;
}

export interface VibeSession {
  id: string;
  startTime: Date;
  activeFiles: Set<string>;
  suggestions: Map<string, CodeSuggestion>;
  appliedSuggestions: CodeSuggestion[];
  rejectedSuggestions: CodeSuggestion[];
  metrics: {
    suggestionsGenerated: number;
    suggestionsApplied: number;
    linesGenerated: number;
    timesSaved: number; // estimated minutes
  };
}

export class VibeCodeMode extends EventEmitter {
  private config: VibeCodeConfig;
  private orchestrator = getMasterOrchestrator();
  private aiHub = AIHub.getInstance();
  private currentSession: VibeSession | null = null;
  private fileWatcher: chokidar.FSWatcher | null = null;
  private suggestionTimers: Map<string, NodeJS.Timeout> = new Map();
  private isActive: boolean = false;

  constructor(config?: Partial<VibeCodeConfig>) {
    super();
    
    this.config = {
      enabled: true,
      autoSuggest: true,
      continuousRefactor: false,
      realTimeCollab: false,
      suggestionsDelay: 2000,
      contextWindow: 50,
      aggressiveness: 'balanced',
      languages: ['typescript', 'javascript', 'python', 'rust', 'go', 'java'],
      excludePaths: ['node_modules', '.git', 'dist', 'build'],
      ...config
    };
  }

  /**
   * Start Vibe Code Mode session
   */
  async startSession(workspaceRoot: string): Promise<string> {
    if (this.isActive) {
      throw new Error('Vibe Code Mode is already active');
    }

    const sessionId = `vibe_${Date.now()}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      activeFiles: new Set(),
      suggestions: new Map(),
      appliedSuggestions: [],
      rejectedSuggestions: [],
      metrics: {
        suggestionsGenerated: 0,
        suggestionsApplied: 0,
        linesGenerated: 0,
        timesSaved: 0
      }
    };

    this.isActive = true;

    // Setup file watching
    await this.setupFileWatcher(workspaceRoot);

    // Emit session started event
    this.emit('session-started', {
      sessionId,
      config: this.config,
      timestamp: new Date()
    });

    Logger.info(`Vibe Code Mode session started: ${sessionId}`);

    return sessionId;
  }

  /**
   * Stop current session
   */
  async stopSession(): Promise<void> {
    if (!this.isActive || !this.currentSession) {
      return;
    }

    // Stop file watching
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Clear pending timers
    for (const timer of this.suggestionTimers.values()) {
      clearTimeout(timer);
    }
    this.suggestionTimers.clear();

    // Emit session ended event
    this.emit('session-ended', {
      sessionId: this.currentSession.id,
      duration: Date.now() - this.currentSession.startTime.getTime(),
      metrics: this.currentSession.metrics,
      timestamp: new Date()
    });

    Logger.info(`Vibe Code Mode session ended: ${this.currentSession.id}`);
    Logger.info(`Session metrics: ${JSON.stringify(this.currentSession.metrics)}`);

    this.currentSession = null;
    this.isActive = false;
  }

  /**
   * Setup file watcher for real-time code monitoring
   */
  private async setupFileWatcher(workspaceRoot: string): Promise<void> {
    const watchPatterns = this.config.languages.map(lang => {
      const extensions = this.getFileExtensions(lang);
      return extensions.map(ext => `**/*.${ext}`);
    }).flat();

    this.fileWatcher = chokidar.watch(watchPatterns, {
      cwd: workspaceRoot,
      ignored: this.config.excludePaths.map(p => `**/${p}/**`),
      ignoreInitial: true,
      persistent: true
    });

    this.fileWatcher.on('change', async (filePath) => {
      await this.handleFileChange(path.join(workspaceRoot, filePath));
    });

    this.fileWatcher.on('add', async (filePath) => {
      await this.handleFileAdd(path.join(workspaceRoot, filePath));
    });
  }

  /**
   * Handle file changes
   */
  private async handleFileChange(filePath: string): Promise<void> {
    if (!this.currentSession || !this.config.autoSuggest) {
      return;
    }

    this.currentSession.activeFiles.add(filePath);

    // Clear existing timer for this file
    const existingTimer = this.suggestionTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer for suggestions
    const timer = setTimeout(async () => {
      await this.generateSuggestions(filePath);
    }, this.config.suggestionsDelay);

    this.suggestionTimers.set(filePath, timer);

    this.emit('file-changed', {
      file: filePath,
      timestamp: new Date()
    });
  }

  /**
   * Handle new file additions
   */
  private async handleFileAdd(filePath: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.emit('file-added', {
      file: filePath,
      timestamp: new Date()
    });

    // Generate template suggestions for new files
    await this.generateTemplateSuggestions(filePath);
  }

  /**
   * Generate AI-powered code suggestions
   */
  private async generateSuggestions(filePath: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      const language = this.detectLanguage(filePath);

      // Get context around current editing position
      const context = this.getFileContext(lines, lines.length, this.config.contextWindow);

      const suggestions = await this.generateAISuggestions(filePath, context, language);

      for (const suggestion of suggestions) {
        this.currentSession.suggestions.set(suggestion.id, suggestion);
        this.currentSession.metrics.suggestionsGenerated++;

        this.emit('suggestion-generated', suggestion);
      }

    } catch (error) {
      Logger.error(`Failed to generate suggestions for ${filePath}:`, error);
    }
  }

  /**
   * Generate AI suggestions using our provider system
   */
  private async generateAISuggestions(filePath: string, context: string, language: string): Promise<CodeSuggestion[]> {
    const aggressivenessMap = {
      conservative: 'Only suggest clear improvements with high confidence',
      balanced: 'Suggest helpful improvements with reasonable confidence',
      aggressive: 'Suggest all potential improvements and optimizations'
    };

    const prompt = `You are a senior software engineer providing code suggestions in real-time.

File: ${path.basename(filePath)}
Language: ${language}
Context (last ${this.config.contextWindow} lines):
\`\`\`${language}
${context}
\`\`\`

Instructions: ${aggressivenessMap[this.config.aggressiveness]}

Provide 1-3 actionable suggestions for:
1. Code completion (if the last line looks incomplete)
2. Refactoring opportunities
3. Performance optimizations
4. Bug fixes or potential issues
5. Documentation improvements

For each suggestion, provide:
- Type of suggestion
- Specific line/area to modify
- Original code (if any)
- Suggested code
- Brief explanation
- Confidence level (0-1)

Format as JSON array:
[
  {
    "type": "completion|refactor|fix|optimization|documentation",
    "line": line_number,
    "originalCode": "existing code or null",
    "suggestedCode": "new/modified code",
    "explanation": "why this suggestion helps",
    "confidence": 0.85,
    "impact": "low|medium|high",
    "category": "performance|readability|bugs|style"
  }
]`;

    try {
      const response = await this.orchestrator.executeTask({
        description: prompt,
        type: 'code_generation',
        complexity: 'medium',
        priority: this.config.aggressiveness === 'aggressive' ? 'speed' : 'balanced'
      });

      // Try to parse as JSON, fallback to simple text parsing
      let suggestionsData;
      try {
        suggestionsData = JSON.parse(response);
      } catch {
        // Fallback: create a simple suggestion from the response
        suggestionsData = [{
          type: 'optimization',
          line: 1,
          originalCode: null,
          suggestedCode: response,
          explanation: 'AI-generated code improvement',
          confidence: 0.75,
          impact: 'medium',
          category: 'improvement'
        }];
      }
      
      return suggestionsData.map((data: any, index: number) => ({
        id: `${Date.now()}_${index}`,
        type: data.type,
        file: filePath,
        line: data.line || 0,
        column: 0,
        originalCode: data.originalCode || '',
        suggestedCode: data.suggestedCode,
        explanation: data.explanation,
        confidence: data.confidence,
        impact: data.impact,
        category: data.category,
        timestamp: new Date()
      }));

    } catch (error) {
      Logger.error('Failed to generate AI suggestions:', error);
      return [];
    }
  }

  /**
   * Generate template suggestions for new files
   */
  private async generateTemplateSuggestions(filePath: string): Promise<void> {
    const language = this.detectLanguage(filePath);
    const fileName = path.basename(filePath);

    const prompt = `Generate a professional code template for a new ${language} file named "${fileName}".

Consider:
- File naming conventions
- Common patterns for this file type
- Proper imports/dependencies
- Documentation comments
- Error handling
- Type safety (if applicable)

Provide a complete, production-ready template that follows best practices.`;

    try {
      const response = await this.orchestrator.executeTask({
        description: prompt,
        type: 'code_generation',
        complexity: 'simple',
        priority: 'speed'
      });

      const suggestion: CodeSuggestion = {
        id: `template_${Date.now()}`,
        type: 'completion',
        file: filePath,
        line: 1,
        column: 0,
        originalCode: '',
        suggestedCode: response,
        explanation: `Generated ${language} template for new file`,
        confidence: 0.9,
        impact: 'high',
        category: 'template',
        timestamp: new Date()
      };

      if (this.currentSession) {
        this.currentSession.suggestions.set(suggestion.id, suggestion);
        this.currentSession.metrics.suggestionsGenerated++;
      }

      this.emit('template-suggestion', suggestion);

    } catch (error) {
      Logger.error('Failed to generate template suggestion:', error);
    }
  }

  /**
   * Apply a suggestion
   */
  async applySuggestion(suggestionId: string): Promise<boolean> {
    if (!this.currentSession) {
      return false;
    }

    const suggestion = this.currentSession.suggestions.get(suggestionId);
    if (!suggestion) {
      return false;
    }

    try {
      const fileContent = await fs.readFile(suggestion.file, 'utf-8');
      const lines = fileContent.split('\n');

      // Apply the suggestion
      if (suggestion.type === 'completion' && suggestion.line === 1 && !suggestion.originalCode) {
        // Template suggestion - replace entire file
        await fs.writeFile(suggestion.file, suggestion.suggestedCode);
      } else if (suggestion.originalCode) {
        // Replace specific code
        const lineIndex = suggestion.line - 1;
        if (lineIndex >= 0 && lineIndex < lines.length) {
          lines[lineIndex] = lines[lineIndex].replace(suggestion.originalCode, suggestion.suggestedCode);
          await fs.writeFile(suggestion.file, lines.join('\n'));
        }
      } else {
        // Insert new code
        lines.splice(suggestion.line - 1, 0, suggestion.suggestedCode);
        await fs.writeFile(suggestion.file, lines.join('\n'));
      }

      // Move to applied suggestions
      this.currentSession.suggestions.delete(suggestionId);
      this.currentSession.appliedSuggestions.push(suggestion);
      this.currentSession.metrics.suggestionsApplied++;
      this.currentSession.metrics.linesGenerated += suggestion.suggestedCode.split('\n').length;

      // Estimate time saved (rough heuristic)
      const linesSaved = suggestion.suggestedCode.split('\n').length;
      this.currentSession.metrics.timesSaved += Math.max(1, linesSaved * 0.5); // 30 seconds per line

      this.emit('suggestion-applied', suggestion);

      Logger.info(`Applied suggestion ${suggestionId} to ${suggestion.file}`);
      return true;

    } catch (error) {
      Logger.error(`Failed to apply suggestion ${suggestionId}:`, error);
      return false;
    }
  }

  /**
   * Reject a suggestion
   */
  rejectSuggestion(suggestionId: string): boolean {
    if (!this.currentSession) {
      return false;
    }

    const suggestion = this.currentSession.suggestions.get(suggestionId);
    if (!suggestion) {
      return false;
    }

    this.currentSession.suggestions.delete(suggestionId);
    this.currentSession.rejectedSuggestions.push(suggestion);

    this.emit('suggestion-rejected', suggestion);

    return true;
  }

  /**
   * Get current suggestions
   */
  getCurrentSuggestions(): CodeSuggestion[] {
    if (!this.currentSession) {
      return [];
    }

    return Array.from(this.currentSession.suggestions.values());
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(): any {
    return this.currentSession?.metrics || null;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VibeCodeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    this.emit('config-updated', this.config);
  }

  /**
   * Utility methods
   */
  private getFileExtensions(language: string): string[] {
    const extensionMap: Record<string, string[]> = {
      typescript: ['ts', 'tsx'],
      javascript: ['js', 'jsx', 'mjs'],
      python: ['py', 'pyi'],
      rust: ['rs'],
      go: ['go'],
      java: ['java'],
      cpp: ['cpp', 'cc', 'cxx'],
      c: ['c', 'h'],
      csharp: ['cs'],
      php: ['php'],
      ruby: ['rb'],
      swift: ['swift'],
      kotlin: ['kt']
    };

    return extensionMap[language] || [];
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin'
    };

    return languageMap[ext] || 'plaintext';
  }

  private getFileContext(lines: string[], currentLine: number, contextWindow: number): string {
    const start = Math.max(0, currentLine - contextWindow);
    const end = Math.min(lines.length, currentLine);
    
    return lines.slice(start, end).join('\n');
  }
}

export const vibeCodeMode = new VibeCodeMode();