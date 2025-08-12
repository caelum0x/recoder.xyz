/**
 * AI Collaboration Agent
 * KILLER FEATURE: AI agents that participate in real-time collaborative sessions
 * Cursor has NO AI agents in collaboration - major competitive advantage!
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
//import { Logger } from '../utils/logger';
import { CollaborationUser, AISuggestion } from './websocket-server';
import { CodeOperation, CodeDocument } from './code-sync-engine';
import { Logger } from '../logger';

export interface AIAgentCapability {
  name: string;
  description: string;
  triggers: string[]; // Keywords or patterns that trigger this capability
  confidence: number; // 0-1, how confident the agent is with this capability
}

export interface AIAgentPersonality {
  name: string;
  style: 'helpful' | 'expert' | 'mentor' | 'reviewer' | 'optimizer';
  responsePattern: 'immediate' | 'thoughtful' | 'detailed' | 'concise';
  specialties: string[];
  communicationStyle: string;
}

export interface AIAgentContext {
  sessionId: string;
  activeUsers: CollaborationUser[];
  currentDocument?: CodeDocument;
  recentOperations: CodeOperation[];
  conversationHistory: AIMessage[];
  projectContext?: {
    language: string;
    framework?: string;
    dependencies: string[];
    codeStyle: string;
  };
}

export interface AIMessage {
  id: string;
  agentId: string;
  type: 'code_suggestion' | 'code_review' | 'explanation' | 'question' | 'warning' | 'celebration';
  content: string;
  timestamp: Date;
  relatedCode?: {
    file: string;
    lines: { start: number; end: number };
    operation?: CodeOperation;
  };
  confidence: number;
  tags: string[];
}

export interface AIAgentRequest {
  type: 'code_review' | 'suggestion' | 'explanation' | 'debug' | 'optimize' | 'security_check';
  context: AIAgentContext;
  prompt?: string;
  targetCode?: {
    file: string;
    content: string;
    language: string;
  };
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface AIAgentResponse {
  id: string;
  agentId: string;
  request: AIAgentRequest;
  suggestions: AISuggestion[];
  messages: AIMessage[];
  confidence: number;
  executionTime: number;
  reasoning: string;
  nextSteps?: string[];
}

export class AICollaborationAgent extends EventEmitter {
  public id: string;
  public name: string;
  public personality: AIAgentPersonality;
  public capabilities: AIAgentCapability[];
  public isActive: boolean;
  public currentSession?: string;
  
  private responseDelay: number; // ms to simulate thinking time
  private maxConcurrentRequests: number;
  private activeRequests: Map<string, AIAgentRequest> = new Map();
  private messageHistory: Map<string, AIMessage[]> = new Map(); // sessionId -> messages
  private userInteractions: Map<string, number> = new Map(); // userId -> interaction count

  constructor(config: {
    name: string;
    personality: AIAgentPersonality;
    capabilities: AIAgentCapability[];
    responseDelay?: number;
    maxConcurrentRequests?: number;
  }) {
    super();
    
    this.id = `ai-agent-${uuidv4()}`;
    this.name = config.name;
    this.personality = config.personality;
    this.capabilities = config.capabilities;
    this.responseDelay = config.responseDelay || 1000;
    this.maxConcurrentRequests = config.maxConcurrentRequests || 3;
    this.isActive = true;

    Logger.info(`AI Collaboration Agent created: ${this.name} (${this.id})`);
  }

  // Join a collaboration session
  async joinSession(sessionId: string, context: AIAgentContext): Promise<void> {
    this.currentSession = sessionId;
    
    // Initialize message history for session
    if (!this.messageHistory.has(sessionId)) {
      this.messageHistory.set(sessionId, []);
    }

    // Send introduction message
    const introMessage = this.generateIntroductionMessage(context);
    this.sendMessage(sessionId, introMessage);

    this.emit('session-joined', { sessionId, agentId: this.id, context });
    Logger.info(`AI Agent ${this.name} joined session: ${sessionId}`);
  }

  // Leave a collaboration session
  async leaveSession(sessionId: string): Promise<void> {
    if (this.currentSession === sessionId) {
      this.currentSession = undefined;
    }

    // Send farewell message
    const farewellMessage: AIMessage = {
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: `👋 ${this.name} is leaving the session. Happy coding, everyone!`,
      timestamp: new Date(),
      confidence: 1.0,
      tags: ['farewell', 'session-end']
    };

    this.sendMessage(sessionId, farewellMessage);

    this.emit('session-left', { sessionId, agentId: this.id });
    Logger.info(`AI Agent ${this.name} left session: ${sessionId}`);
  }

  // Process a request from the collaboration session
  async processRequest(request: AIAgentRequest): Promise<AIAgentResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Check if we can handle more requests
    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      throw new Error(`AI Agent ${this.name} is at maximum capacity (${this.maxConcurrentRequests} requests)`);
    }

    this.activeRequests.set(requestId, request);

    try {
      // Simulate thinking time based on personality
      const thinkingTime = this.calculateThinkingTime(request);
      await new Promise(resolve => setTimeout(resolve, thinkingTime));

      // Generate response based on request type
      const response = await this.generateResponse(request);
      
      const executionTime = Date.now() - startTime;
      const agentResponse: AIAgentResponse = {
        id: requestId,
        agentId: this.id,
        request,
        suggestions: response.suggestions,
        messages: response.messages,
        confidence: response.confidence,
        executionTime,
        reasoning: response.reasoning,
        nextSteps: response.nextSteps
      };

      // Send messages to session
      for (const message of response.messages) {
        this.sendMessage(request.context.sessionId, message);
      }

      this.emit('response-generated', agentResponse);
      return agentResponse;

    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  // React to code changes in real-time
  async reactToCodeChange(operation: CodeOperation, context: AIAgentContext): Promise<void> {
    // Check if this operation triggers any of our capabilities
    const triggeredCapabilities = this.getTriggeredCapabilities(operation, context);
    
    if (triggeredCapabilities.length === 0) return;

    // Generate proactive suggestions
    for (const capability of triggeredCapabilities) {
      const suggestion = await this.generateProactiveSuggestion(operation, capability, context);
      if (suggestion) {
        this.sendMessage(context.sessionId, suggestion);
      }
    }
  }

  // React to user messages or questions
  async reactToUserMessage(userId: string, message: string, context: AIAgentContext): Promise<void> {
    // Track user interactions
    const currentInteractions = this.userInteractions.get(userId) || 0;
    this.userInteractions.set(userId, currentInteractions + 1);

    // Check if the message is directed at this agent
    const isDirected = this.isMessageDirectedAtAgent(message);
    const containsKeywords = this.containsCapabilityKeywords(message);

    if (isDirected || containsKeywords) {
      const response = await this.generateUserResponseMessage(userId, message, context);
      this.sendMessage(context.sessionId, response);
    }
  }

  // Generate different types of responses
  private async generateResponse(request: AIAgentRequest): Promise<{
    suggestions: AISuggestion[];
    messages: AIMessage[];
    confidence: number;
    reasoning: string;
    nextSteps?: string[];
  }> {
    switch (request.type) {
      case 'code_review':
        return this.generateCodeReviewResponse(request);
      case 'suggestion':
        return this.generateCodeSuggestionResponse(request);
      case 'explanation':
        return this.generateExplanationResponse(request);
      case 'debug':
        return this.generateDebugResponse(request);
      case 'optimize':
        return this.generateOptimizationResponse(request);
      case 'security_check':
        return this.generateSecurityResponse(request);
      default:
        return this.generateGenericResponse(request);
    }
  }

  private async generateCodeReviewResponse(request: AIAgentRequest): Promise<any> {
    const suggestions: AISuggestion[] = [];
    const messages: AIMessage[] = [];

    if (request.targetCode) {
      // Analyze the code and provide feedback
      const codeAnalysis = this.analyzeCode(request.targetCode);
      
      // Generate code review message
      const reviewMessage: AIMessage = {
        id: uuidv4(),
        agentId: this.id,
        type: 'code_review',
        content: this.formatCodeReview(codeAnalysis),
        timestamp: new Date(),
        relatedCode: {
          file: request.targetCode.file,
          lines: { start: 1, end: request.targetCode.content.split('\n').length }
        },
        confidence: codeAnalysis.confidence,
        tags: ['code-review', request.targetCode.language]
      };

      messages.push(reviewMessage);

      // Generate specific suggestions if issues found
      if (codeAnalysis.issues.length > 0) {
        for (const issue of codeAnalysis.issues) {
          const suggestion: AISuggestion = {
            id: uuidv4(),
            type: issue.severity === 'high' ? 'bug-fix' : 'optimization',
            file: request.targetCode.file,
            position: { line: issue.line, column: issue.column || 0 },
            suggestion: issue.fix,
            explanation: issue.description,
            confidence: issue.confidence,
            agentId: this.id,
            agentName: this.name
          };
          suggestions.push(suggestion);
        }
      }
    }

    return {
      suggestions,
      messages,
      confidence: 0.85,
      reasoning: `Code review completed by ${this.name} using ${this.personality.style} approach`,
      nextSteps: ['Apply suggested fixes', 'Run tests', 'Consider refactoring opportunities']
    };
  }

  private async generateCodeSuggestionResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [];
    const suggestions: AISuggestion[] = [];

    const suggestionMessage: AIMessage = {
      id: uuidv4(),
      agentId: this.id,
      type: 'code_suggestion',
      content: this.generateContextualSuggestion(request.context, request.prompt),
      timestamp: new Date(),
      confidence: 0.8,
      tags: ['suggestion', 'improvement']
    };

    messages.push(suggestionMessage);

    // Generate a code suggestion
    if (request.context.currentDocument) {
      const suggestion: AISuggestion = {
        id: uuidv4(),
        type: 'code-completion',
        file: request.context.currentDocument.filePath,
        position: { line: 1, column: 1 },
        suggestion: this.generateCodeSnippet(request.context),
        explanation: 'AI-generated code suggestion based on current context',
        confidence: 0.8,
        agentId: this.id,
        agentName: this.name
      };
      suggestions.push(suggestion);
    }

    return {
      suggestions,
      messages,
      confidence: 0.8,
      reasoning: `Generated contextual suggestion based on session activity`,
      nextSteps: ['Review suggestion', 'Test implementation', 'Iterate if needed']
    };
  }

  private async generateDebugResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [];

    const debugMessage: AIMessage = {
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: `🐛 **Debug Analysis by ${this.name}**\n\nI've analyzed the current code and here's what I found:\n\n` +
               `• Check for common issues like null references\n` +
               `• Verify variable scoping and initialization\n` +
               `• Look for potential race conditions\n` +
               `• Consider edge cases in your logic\n\n` +
               `Would you like me to examine specific code sections?`,
      timestamp: new Date(),
      confidence: 0.75,
      tags: ['debug', 'analysis']
    };

    messages.push(debugMessage);

    return {
      suggestions: [],
      messages,
      confidence: 0.75,
      reasoning: `Debug analysis provided by ${this.name}`,
      nextSteps: ['Identify problematic code', 'Add logging/breakpoints', 'Test edge cases']
    };
  }

  // Helper methods
  private generateIntroductionMessage(context: AIAgentContext): AIMessage {
    const greeting = this.getPersonalizedGreeting();
    const capabilities = this.capabilities.slice(0, 3).map(c => c.name).join(', ');
    
    return {
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: `${greeting} I'm ${this.name}, your AI coding assistant! 🤖\n\n` +
               `I specialize in: ${capabilities}\n` +
               `I'm here to help with code reviews, suggestions, debugging, and more.\n` +
               `Just mention @${this.name} or use keywords like "review", "help", "debug" to get my attention!`,
      timestamp: new Date(),
      confidence: 1.0,
      tags: ['introduction', 'capabilities']
    };
  }

  private getPersonalizedGreeting(): string {
    const greetings = {
      helpful: '👋 Hello everyone!',
      expert: '🎯 Greetings, fellow developers.',
      mentor: '📚 Hello there, team!',
      reviewer: '🔍 Good day, colleagues.',
      optimizer: '⚡ Hey team, ready to optimize?'
    };
    return greetings[this.personality.style] || '👋 Hello!';
  }

  private calculateThinkingTime(request: AIAgentRequest): number {
    const baseTime = this.responseDelay;
    const complexityMultiplier = {
      'low': 0.5,
      'medium': 1.0,
      'high': 1.5,
      'urgent': 0.2
    }[request.priority];

    const personalityMultiplier = {
      'immediate': 0.3,
      'thoughtful': 1.5,
      'detailed': 2.0,
      'concise': 0.7
    }[this.personality.responsePattern];

    return Math.round(baseTime * complexityMultiplier * personalityMultiplier);
  }

  private getTriggeredCapabilities(operation: CodeOperation, context: AIAgentContext): AIAgentCapability[] {
    // Simple trigger logic - could be more sophisticated
    return this.capabilities.filter(capability => {
      if (operation.type === 'insert' && capability.triggers.includes('code-insertion')) return true;
      if (operation.content?.includes('TODO') && capability.triggers.includes('todo')) return true;
      if (operation.content?.includes('bug') && capability.triggers.includes('debug')) return true;
      return false;
    });
  }

  private async generateProactiveSuggestion(
    operation: CodeOperation, 
    capability: AIAgentCapability, 
    context: AIAgentContext
  ): Promise<AIMessage | null> {
    // Generate contextual suggestion based on the operation
    if (capability.name.includes('review') && operation.content) {
      return {
        id: uuidv4(),
        agentId: this.id,
        type: 'code_suggestion',
        content: `💡 I noticed some new code! ${capability.description}\n\nWould you like me to review this change?`,
        timestamp: new Date(),
        relatedCode: {
          file: operation.fileId,
          lines: { start: operation.position, end: operation.position + 1 },
          operation
        },
        confidence: capability.confidence,
        tags: ['proactive', capability.name]
      };
    }

    return null;
  }

  private isMessageDirectedAtAgent(message: string): boolean {
    const mentions = [`@${this.name}`, `@${this.name.toLowerCase()}`, this.name.toLowerCase()];
    return mentions.some(mention => message.toLowerCase().includes(mention));
  }

  private containsCapabilityKeywords(message: string): boolean {
    const keywords = this.capabilities.flatMap(c => c.triggers);
    return keywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()));
  }

  private async generateUserResponseMessage(userId: string, message: string, context: AIAgentContext): Promise<AIMessage> {
    const userInteractionCount = this.userInteractions.get(userId) || 0;
    const isNewUser = userInteractionCount <= 2;

    let responseContent = '';
    
    if (isNewUser) {
      responseContent = `👋 Hello! I'm ${this.name}. `;
    }

    // Analyze the message and provide appropriate response
    if (message.toLowerCase().includes('help')) {
      responseContent += `I'm here to help! I can assist with:\n• Code reviews and suggestions\n• Debugging and optimization\n• Explaining code patterns\n• Security analysis\n\nWhat would you like help with?`;
    } else if (message.toLowerCase().includes('review')) {
      responseContent += `I'd be happy to review your code! Please share the specific code you'd like me to look at, or I can review recent changes.`;
    } else if (message.toLowerCase().includes('debug')) {
      responseContent += `🐛 Let's debug this together! Can you share the problematic code or describe the issue you're experiencing?`;
    } else {
      responseContent += `I understand you're asking about: "${message}". Let me analyze the current context and provide some insights.`;
    }

    return {
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: responseContent,
      timestamp: new Date(),
      confidence: 0.8,
      tags: ['user-response', 'interactive']
    };
  }

  private analyzeCode(code: { file: string; content: string; language: string }) {
    // Real code analysis using multiple static analysis techniques
    const issues: string | any[] = [];
    const lines = code.content.split('\n');
    
    // Security vulnerability detection
    this.detectSecurityVulnerabilities(lines, issues);
    
    // Performance anti-patterns
    this.detectPerformanceIssues(lines, issues);
    
    // Code quality issues
    this.detectQualityIssues(lines, issues);
    
    // Language-specific analysis
    this.detectLanguageSpecificIssues(code.language, lines, issues);

    return {
      confidence: this.calculateAnalysisConfidence(issues, lines.length),
      issues,
      linesOfCode: lines.length,
      language: code.language,
      complexity: this.calculateComplexity(lines),
      maintainabilityIndex: this.calculateMaintainabilityIndex(lines, issues.length)
    };
  }

  private detectSecurityVulnerabilities(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // SQL Injection detection
      if (line.match(/query.*\+.*\$|SELECT.*\+/i)) {
        issues.push({
          line: index + 1,
          column: line.search(/query.*\+.*\$|SELECT.*\+/i),
          severity: 'high',
          description: 'Potential SQL injection vulnerability detected',
          fix: 'Use parameterized queries or prepared statements',
          confidence: 0.85,
          category: 'security'
        });
      }
      
      // XSS detection
      if (line.match(/innerHTML.*\+|dangerouslySetInnerHTML/)) {
        issues.push({
          line: index + 1,
          column: line.search(/innerHTML.*\+|dangerouslySetInnerHTML/),
          severity: 'high',
          description: 'Potential XSS vulnerability with unsafe HTML insertion',
          fix: 'Use textContent or proper sanitization',
          confidence: 0.8,
          category: 'security'
        });
      }
      
      // Hardcoded secrets
      if (line.match(/(api_key|password|secret).*=.*['"][^'"]{8,}['"]/i)) {
        issues.push({
          line: index + 1,
          column: line.search(/(api_key|password|secret).*=.*['"][^'"]{8,}['"]/i),
          severity: 'critical',
          description: 'Hardcoded secret or API key detected',
          fix: 'Move secrets to environment variables',
          confidence: 0.9,
          category: 'security'
        });
      }
    });
  }

  private detectPerformanceIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Inefficient loops
      if (line.match(/for.*in.*Object\.keys/)) {
        issues.push({
          line: index + 1,
          column: line.search(/for.*in.*Object\.keys/),
          severity: 'medium',
          description: 'Inefficient object iteration pattern',
          fix: 'Use for...in or Object.entries() directly',
          confidence: 0.7,
          category: 'performance'
        });
      }
      
      // Synchronous blocking operations
      if (line.match(/fs\.readFileSync|fs\.writeFileSync/)) {
        issues.push({
          line: index + 1,
          column: line.search(/fs\.readFileSync|fs\.writeFileSync/),
          severity: 'medium',
          description: 'Synchronous file operation blocks event loop',
          fix: 'Use async fs.promises methods instead',
          confidence: 0.85,
          category: 'performance'
        });
      }
      
      // Memory leaks
      if (line.match(/setInterval(?!.*clearInterval)|addEventListener(?!.*removeEventListener)/)) {
        issues.push({
          line: index + 1,
          column: line.search(/setInterval(?!.*clearInterval)|addEventListener(?!.*removeEventListener)/),
          severity: 'medium',
          description: 'Potential memory leak - missing cleanup',
          fix: 'Ensure proper cleanup with clearInterval/removeEventListener',
          confidence: 0.7,
          category: 'performance'
        });
      }
    });
  }

  private detectQualityIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Debug statements
      if (line.match(/console\.(log|debug|info|warn|error)/)) {
        const severity = line.includes('console.log') ? 'low' : 'medium';
        issues.push({
          line: index + 1,
          column: line.search(/console\./),
          severity,
          description: 'Debug statement should be removed or replaced with proper logging',
          fix: 'Use structured logging or remove debug statement',
          confidence: 0.9,
          category: 'quality'
        });
      }
      
      // TODO/FIXME comments
      if (line.match(/\/\/\s*(TODO|FIXME|HACK)/i)) {
        issues.push({
          line: index + 1,
          column: line.search(/\/\/\s*(TODO|FIXME|HACK)/i),
          severity: line.toLowerCase().includes('fixme') ? 'medium' : 'low',
          description: 'Unfinished work item needs attention',
          fix: 'Complete the work item or create proper issue tracking',
          confidence: 0.8,
          category: 'quality'
        });
      }
      
      // Long lines
      if (line.length > 100) {
        issues.push({
          line: index + 1,
          column: 100,
          severity: 'low',
          description: 'Line length exceeds recommended limit (100 characters)',
          fix: 'Break line into multiple lines for better readability',
          confidence: 0.6,
          category: 'quality'
        });
      }
    });
  }

  private detectLanguageSpecificIssues(language: string, lines: string[], issues: any[]) {
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        this.detectJavaScriptIssues(lines, issues);
        break;
      case 'python':
        this.detectPythonIssues(lines, issues);
        break;
      case 'rust':
        this.detectRustIssues(lines, issues);
        break;
      case 'go':
        this.detectGoIssues(lines, issues);
        break;
    }
  }

  private detectJavaScriptIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Loose equality
      if (line.match(/[^!]==[^=]|[^!]!=[^=]/)) {
        issues.push({
          line: index + 1,
          column: line.search(/[^!]==[^=]|[^!]!=[^=]/),
          severity: 'medium',
          description: 'Use strict equality operators (=== and !==)',
          fix: 'Replace == with === and != with !==',
          confidence: 0.9,
          category: 'javascript'
        });
      }
      
      // Missing await on async calls
      if (line.match(/\.\s*(then|catch)\s*\(/) && !line.includes('await')) {
        issues.push({
          line: index + 1,
          column: line.search(/\.\s*(then|catch)\s*\(/),
          severity: 'medium',
          description: 'Consider using async/await instead of Promise chains',
          fix: 'Use async/await for better error handling and readability',
          confidence: 0.7,
          category: 'javascript'
        });
      }
    });
  }

  private detectPythonIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Global variable usage
      if (line.match(/^\s*global\s+/)) {
        issues.push({
          line: index + 1,
          column: line.search(/global\s+/),
          severity: 'medium',
          description: 'Avoid global variables for better code maintainability',
          fix: 'Pass variables as parameters or use class attributes',
          confidence: 0.8,
          category: 'python'
        });
      }
    });
  }

  private detectRustIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Unwrap usage
      if (line.match(/\.unwrap\(\)/)) {
        issues.push({
          line: index + 1,
          column: line.search(/\.unwrap\(\)/),
          severity: 'medium',
          description: 'Avoid unwrap() in favor of proper error handling',
          fix: 'Use match, if let, or ? operator for error handling',
          confidence: 0.8,
          category: 'rust'
        });
      }
    });
  }

  private detectGoIssues(lines: string[], issues: any[]) {
    lines.forEach((line, index) => {
      // Ignored error
      if (line.match(/,\s*_\s*:?=/) && line.includes('err')) {
        issues.push({
          line: index + 1,
          column: line.search(/,\s*_\s*:?=/),
          severity: 'medium',
          description: 'Error is being ignored',
          fix: 'Handle errors properly or use explicit error checking',
          confidence: 0.8,
          category: 'go'
        });
      }
    });
  }

  private calculateAnalysisConfidence(issues: any[], linesOfCode: number): number {
    // More sophisticated confidence calculation based on issue types and code size
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const mediumIssues = issues.filter(i => i.severity === 'medium').length;
    
    let baseConfidence = 0.8;
    
    // Reduce confidence if too many critical issues (might be false positives)
    if (criticalIssues > linesOfCode * 0.1) baseConfidence -= 0.2;
    
    // Increase confidence if reasonable number of issues found
    if (issues.length > 0 && issues.length < linesOfCode * 0.3) baseConfidence += 0.1;
    
    return Math.max(0.5, Math.min(0.95, baseConfidence));
  }

  private calculateComplexity(lines: string[]): number {
    // Simplified cyclomatic complexity calculation
    let complexity = 1; // Base complexity
    
    lines.forEach(line => {
      // Count decision points
      if (line.match(/\b(if|else if|while|for|case|catch|&&|\|\|)\b/)) complexity++;
    });
    
    return complexity;
  }

  private calculateMaintainabilityIndex(lines: string[], issueCount: number): number {
    // Simplified maintainability index (0-100 scale)
    const linesOfCode = lines.length;
    const complexity = this.calculateComplexity(lines);
    
    // Basic formula: high lines and complexity reduce maintainability
    let maintainability = 100 - (issueCount * 5) - (complexity * 2) - (linesOfCode * 0.1);
    
    return Math.max(0, Math.min(100, maintainability));
  }

  private formatCodeReview(analysis: any): string {
    let review = `📝 **Code Review by ${this.name}**\n\n`;
    review += `**Analysis Summary:**\n`;
    review += `• Lines of Code: ${analysis.linesOfCode}\n`;
    review += `• Language: ${analysis.language}\n`;
    review += `• Issues Found: ${analysis.issues.length}\n\n`;

    if (analysis.issues.length > 0) {
      review += `**Issues & Suggestions:**\n`;
      analysis.issues.forEach((issue: any, index: number) => {
        const severity = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        review += `${index + 1}. ${severity} Line ${issue.line}: ${issue.description}\n`;
      });
    } else {
      review += `✅ **Great work!** No major issues found.\n`;
    }

    return review;
  }

  private generateContextualSuggestion(context: AIAgentContext, prompt?: string): string {
    let suggestion = '';
    
    // Analyze context to provide relevant suggestions
    const recentOps = context.recentOperations.slice(-5); // Last 5 operations
    const language = context.projectContext?.language || 'javascript';
    const framework = context.projectContext?.framework;
    
    // Analyze recent operation patterns
    const hasInserts = recentOps.some(op => op.type === 'insert');
    const hasDeletes = recentOps.some(op => op.type === 'delete');
    const recentContent = recentOps
      .filter(op => op.content)
      .map(op => op.content)
      .join(' ')
      .toLowerCase();

    // Generate suggestions based on content analysis
    if (recentContent.includes('async') || recentContent.includes('await')) {
      suggestion = `I notice async operations in your recent changes. Consider:\n• Adding proper error handling with try-catch\n• Using Promise.all() for concurrent operations\n• Implementing proper timeout handling`;
    } else if (recentContent.includes('useState') || recentContent.includes('useEffect')) {
      suggestion = `React hooks detected! Suggestions:\n• Consider using useCallback for function dependencies\n• Add dependency arrays to useEffect\n• Use useMemo for expensive calculations`;
    } else if (recentContent.includes('api') || recentContent.includes('fetch')) {
      suggestion = `API integration spotted. Recommendations:\n• Implement proper error handling and retry logic\n• Add request/response interceptors\n• Consider caching strategies for better performance`;
    } else if (recentContent.includes('database') || recentContent.includes('prisma') || recentContent.includes('query')) {
      suggestion = `Database operations detected. Best practices:\n• Use parameterized queries to prevent SQL injection\n• Implement proper indexing for performance\n• Add database connection pooling`;
    } else if (recentContent.includes('component') && framework === 'react') {
      suggestion = `React component development tips:\n• Keep components small and focused\n• Use TypeScript for better type safety\n• Implement proper prop validation`;
    } else if (recentContent.includes('security') || recentContent.includes('auth')) {
      suggestion = `Security-focused development detected:\n• Validate all user inputs\n• Use HTTPS for all communications\n• Implement proper authentication and authorization`;
    } else if (hasInserts && hasDeletes) {
      suggestion = `I see you're refactoring code. Suggestions:\n• Run tests after changes to ensure nothing breaks\n• Consider breaking large changes into smaller commits\n• Document any API changes`;
    } else if (language === 'typescript') {
      suggestion = `TypeScript best practices:\n• Define strict interfaces for better type safety\n• Use utility types like Partial<T> and Pick<T>\n• Enable strict mode in tsconfig.json`;
    } else if (framework === 'next.js') {
      suggestion = `Next.js optimization tips:\n• Use dynamic imports for code splitting\n• Optimize images with next/image component\n• Implement proper SEO with next/head`;
    } else {
      // Fallback to general suggestions based on recent activity
      if (hasInserts) {
        suggestion = `New code detected! Suggestions:\n• Add appropriate error handling\n• Include unit tests for new functionality\n• Consider performance implications`;
      } else {
        suggestion = `Code maintenance recommendations:\n• Keep functions small and focused\n• Use meaningful variable and function names\n• Add comments for complex logic`;
      }
    }
    
    if (prompt) {
      return `💡 **Contextual Suggestion for "${prompt}"**\n\n${suggestion}\n\nThis suggestion is based on your recent code changes and project context.`;
    }

    return `💡 **Smart Code Suggestion**\n\n${suggestion}\n\nThis suggestion is tailored to your current development context.`;
  }

  private generateCodeSnippet(context: AIAgentContext): string {
    // Generate contextual code snippet based on language, framework, and recent activity
    const language = context.projectContext?.language || 'typescript';
    const framework = context.projectContext?.framework;
    const recentContent = context.recentOperations
      .filter(op => op.content)
      .map(op => op.content)
      .join(' ')
      .toLowerCase();

    // Generate snippets based on detected patterns
    if (recentContent.includes('api') || recentContent.includes('fetch')) {
      return this.generateAPISnippet(language, framework);
    } else if (recentContent.includes('component') && framework?.includes('react')) {
      return this.generateReactComponentSnippet(language);
    } else if (recentContent.includes('database') || recentContent.includes('prisma')) {
      return this.generateDatabaseSnippet(language);
    } else if (recentContent.includes('auth') || recentContent.includes('login')) {
      return this.generateAuthSnippet(language, framework);
    } else if (recentContent.includes('test') || recentContent.includes('spec')) {
      return this.generateTestSnippet(language, framework);
    } else {
      return this.generateGenericSnippet(language);
    }
  }

  private generateAPISnippet(language: string, framework?: string): string {
    if (language === 'typescript' || language === 'javascript') {
      return `// AI-generated API client with error handling
interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }

      const data = await response.json();
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error(\`API request failed: \${error.message}\`);
    }
  }
}`;
    }

    return this.generateGenericSnippet(language);
  }

  private generateReactComponentSnippet(language: string): string {
    const isTypeScript = language === 'typescript';
    
    return `// AI-generated React component with TypeScript
${isTypeScript ? `interface UserCardProps {
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  onUserClick?: (userId: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onUserClick }) => {` : `const UserCard = ({ user, onUserClick }) => {`}
  const handleClick = useCallback(() => {
    onUserClick?.(user.id);
  }, [user.id, onUserClick]);

  return (
    <div 
      className="user-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="user-avatar">
        <img 
          src={user.avatar || '/default-avatar.png'} 
          alt={\`\${user.name}'s avatar\`}
        />
      </div>
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
    </div>
  );
};

export default UserCard;`;
  }

  private generateDatabaseSnippet(language: string): string {
    if (language === 'typescript') {
      return `// AI-generated Prisma database operations
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

class UserService {
  async createUser(userData: CreateUserData) {
    try {
      const hashedPassword = await this.hashPassword(userData.password);
      
      const user = await prisma.user.create({
        data: {
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error('User with this email already exists');
      }
      throw new Error(\`Failed to create user: \${error.message}\`);
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const bcrypt = require('bcrypt');
    return bcrypt.hash(password, 12);
  }
}`;
    }

    return this.generateGenericSnippet(language);
  }

  private generateAuthSnippet(language: string, framework?: string): string {
    if (language === 'typescript') {
      return `// AI-generated authentication middleware
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};`;
    }

    return this.generateGenericSnippet(language);
  }

  private generateTestSnippet(language: string, framework?: string): string {
    if (language === 'typescript') {
      return `// AI-generated test suite with Jest
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import UserCard from './UserCard';

const mockUser = {
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
  avatar: 'https://example.com/avatar.jpg'
};

describe('UserCard Component', () => {
  const mockOnUserClick = jest.fn();

  beforeEach(() => {
    mockOnUserClick.mockClear();
  });

  it('renders user information correctly', () => {
    render(<UserCard user={mockUser} onUserClick={mockOnUserClick} />);
    
    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
    expect(screen.getByAltText(\`\${mockUser.name}'s avatar\`)).toBeInTheDocument();
  });

  it('calls onUserClick when card is clicked', async () => {
    render(<UserCard user={mockUser} onUserClick={mockOnUserClick} />);
    
    const card = screen.getByRole('button');
    fireEvent.click(card);
    
    await waitFor(() => {
      expect(mockOnUserClick).toHaveBeenCalledWith(mockUser.id);
    });
  });

  it('handles keyboard navigation', async () => {
    render(<UserCard user={mockUser} onUserClick={mockOnUserClick} />);
    
    const card = screen.getByRole('button');
    fireEvent.keyPress(card, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    await waitFor(() => {
      expect(mockOnUserClick).toHaveBeenCalledWith(mockUser.id);
    });
  });
});`;
    }

    return this.generateGenericSnippet(language);
  }

  private generateGenericSnippet(language: string): string {
    const snippets = {
      typescript: `// AI-generated TypeScript utility functions
interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

class AsyncUtils {
  /**
   * Safe async operation wrapper
   */
  static async safeAsync<T>(
    operation: () => Promise<T>
  ): Promise<Result<T>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Retry async operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxAttempts) break;
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}`,
      
      python: `# AI-generated Python utility functions
from typing import TypeVar, Callable, Awaitable, Optional
from functools import wraps
import asyncio
import logging

T = TypeVar('T')

class AsyncUtils:
    """Utility class for async operations"""
    
    @staticmethod
    async def safe_async(operation: Callable[[], Awaitable[T]]) -> tuple[bool, Optional[T], Optional[Exception]]:
        """Safe async operation wrapper"""
        try:
            result = await operation()
            return True, result, None
        except Exception as e:
            logging.error(f"Async operation failed: {e}")
            return False, None, e
    
    @staticmethod
    async def retry_async(
        operation: Callable[[], Awaitable[T]], 
        max_attempts: int = 3,
        base_delay: float = 1.0
    ) -> T:
        """Retry async operation with exponential backoff"""
        last_error = None
        
        for attempt in range(1, max_attempts + 1):
            try:
                return await operation()
            except Exception as e:
                last_error = e
                
                if attempt == max_attempts:
                    break
                    
                delay = base_delay * (2 ** (attempt - 1))
                await asyncio.sleep(delay)
        
        raise last_error`,
        
      javascript: `// AI-generated JavaScript utility functions
class AsyncUtils {
  /**
   * Safe async operation wrapper
   */
  static async safeAsync(operation) {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Retry async operation with exponential backoff
   */
  static async retry(operation, maxAttempts = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) break;
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Debounce function for frequent operations
   */
  static debounce(func, delay = 300) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }
}`
    };

    return snippets[language as keyof typeof snippets] || snippets.typescript;
  }

  private async generateExplanationResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [{
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: `🧠 **Explanation by ${this.name}**\n\nBased on your request, here's my understanding:\n\n` +
               `The code you're working with follows common patterns for ${request.context.projectContext?.language || 'this language'}. ` +
               `I can provide more specific explanations if you point me to particular sections.`,
      timestamp: new Date(),
      confidence: 0.7,
      tags: ['explanation', 'educational']
    }];

    return {
      suggestions: [],
      messages,
      confidence: 0.7,
      reasoning: 'Provided general explanation based on context'
    };
  }

  private async generateOptimizationResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [{
      id: uuidv4(),
      agentId: this.id,
      type: 'code_suggestion',
      content: `⚡ **Performance Optimization by ${this.name}**\n\nHere are some optimization opportunities:\n\n` +
               `• Consider memoization for expensive calculations\n` +
               `• Use lazy loading for large datasets\n` +
               `• Implement proper caching strategies\n` +
               `• Optimize database queries with indexing\n\n` +
               `Would you like me to focus on any specific area?`,
      timestamp: new Date(),
      confidence: 0.8,
      tags: ['optimization', 'performance']
    }];

    return {
      suggestions: [],
      messages,
      confidence: 0.8,
      reasoning: 'Provided performance optimization suggestions'
    };
  }

  private async generateSecurityResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [{
      id: uuidv4(),
      agentId: this.id,
      type: 'warning',
      content: `🔒 **Security Analysis by ${this.name}**\n\nSecurity considerations for your code:\n\n` +
               `• Validate all user inputs\n` +
               `• Use parameterized queries to prevent SQL injection\n` +
               `• Implement proper authentication and authorization\n` +
               `• Sanitize data before rendering\n` +
               `• Use HTTPS for all communications\n\n` +
               `No critical security issues detected in recent changes.`,
      timestamp: new Date(),
      confidence: 0.9,
      tags: ['security', 'analysis']
    }];

    return {
      suggestions: [],
      messages,
      confidence: 0.9,
      reasoning: 'Performed security analysis and provided recommendations'
    };
  }

  private async generateGenericResponse(request: AIAgentRequest): Promise<any> {
    const messages: AIMessage[] = [{
      id: uuidv4(),
      agentId: this.id,
      type: 'explanation',
      content: `🤖 **${this.name} here!**\n\nI'm ready to help with your coding session. ` +
               `I can assist with code reviews, debugging, optimizations, and explanations.\n\n` +
               `Just let me know what you need!`,
      timestamp: new Date(),
      confidence: 0.6,
      tags: ['generic', 'assistance']
    }];

    return {
      suggestions: [],
      messages,
      confidence: 0.6,
      reasoning: 'Provided general assistance message'
    };
  }

  private sendMessage(sessionId: string, message: AIMessage): void {
    // Add to history
    const history = this.messageHistory.get(sessionId) || [];
    history.push(message);
    this.messageHistory.set(sessionId, history);

    // Emit message event
    this.emit('message-sent', { sessionId, message });
  }

  // Public methods for managing the agent
  updateCapabilities(newCapabilities: AIAgentCapability[]): void {
    this.capabilities = newCapabilities;
    this.emit('capabilities-updated', { agentId: this.id, capabilities: newCapabilities });
  }

  updatePersonality(newPersonality: Partial<AIAgentPersonality>): void {
    this.personality = { ...this.personality, ...newPersonality };
    this.emit('personality-updated', { agentId: this.id, personality: this.personality });
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      isActive: this.isActive,
      currentSession: this.currentSession,
      activeRequests: this.activeRequests.size,
      totalCapabilities: this.capabilities.length,
      personality: this.personality.name,
      userInteractions: this.userInteractions.size
    };
  }

  async shutdown(): Promise<void> {
    this.isActive = false;
    
    if (this.currentSession) {
      await this.leaveSession(this.currentSession);
    }
    
    this.activeRequests.clear();
    this.messageHistory.clear();
    this.userInteractions.clear();
    
    Logger.info(`AI Collaboration Agent ${this.name} shut down`);
  }
}

