interface ProjectContext {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'api' | 'library' | 'cli' | 'desktop';
  technologies: string[];
  architecture: string[];
  dependencies: Record<string, string>;
  codebaseSize: {
    files: number;
    lines: number;
    languages: Record<string, number>;
  };
  lastAnalyzed: Date;
}

interface ConversationContext {
  sessionId: string;
  startTime: Date;
  messages: Array<{
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
    codeBlocks?: string[];
    files?: string[];
  }>;
  topics: string[];
  activeFiles: string[];
  completedTasks: string[];
  pendingTasks: string[];
}

interface SemanticContext {
  concepts: Map<string, {
    definition: string;
    relatedFiles: string[];
    usageFrequency: number;
    lastMentioned: Date;
  }>;
  relationships: Map<string, string[]>;
  patterns: Map<string, {
    description: string;
    examples: string[];
    confidence: number;
  }>;
}

export class ContextMemory {
  private projectContext: ProjectContext | null = null;
  private conversationHistory: ConversationContext[] = [];
  private currentConversation: ConversationContext | null = null;
  private semanticContext: SemanticContext;
  private fileAnalysisCache: Map<string, {
    content: string;
    analysis: any;
    lastModified: Date;
  }> = new Map();

  constructor() {
    this.semanticContext = {
      concepts: new Map(),
      relationships: new Map(),
      patterns: new Map()
    };
    this.initializeSession();
  }

  async analyzeProject(rootPath: string): Promise<ProjectContext> {
    const context: ProjectContext = {
      id: this.generateProjectId(rootPath),
      name: this.extractProjectName(rootPath),
      type: await this.detectProjectType(rootPath),
      technologies: await this.detectTechnologies(rootPath),
      architecture: await this.analyzeArchitecture(rootPath),
      dependencies: await this.extractDependencies(rootPath),
      codebaseSize: await this.analyzeCodebaseSize(rootPath),
      lastAnalyzed: new Date()
    };

    this.projectContext = context;
    await this.buildSemanticMap(rootPath);
    return context;
  }

  addMessage(role: 'user' | 'assistant', content: string, metadata?: {
    codeBlocks?: string[];
    files?: string[];
  }): void {
    if (!this.currentConversation) {
      this.initializeSession();
    }

    const message = {
      timestamp: new Date(),
      role,
      content,
      codeBlocks: metadata?.codeBlocks || [],
      files: metadata?.files || []
    };

    this.currentConversation!.messages.push(message);
    this.updateTopics(content);
    this.updateActiveFiles(metadata?.files || []);
    this.extractSemanticInfo(content);
  }

  getRelevantContext(query: string, maxResults: number = 10): {
    relevantFiles: string[];
    relatedConcepts: string[];
    similarQueries: string[];
    projectInsights: string[];
  } {
    const queryTokens = this.tokenize(query.toLowerCase());
    const relevantFiles = this.findRelevantFiles(queryTokens);
    const relatedConcepts = this.findRelatedConcepts(queryTokens);
    const similarQueries = this.findSimilarQueries(query);
    const projectInsights = this.generateProjectInsights(queryTokens);

    return {
      relevantFiles: relevantFiles.slice(0, maxResults),
      relatedConcepts: relatedConcepts.slice(0, maxResults),
      similarQueries: similarQueries.slice(0, 5),
      projectInsights: projectInsights.slice(0, 5)
    };
  }

  rememberFileAnalysis(filePath: string, content: string, analysis: any): void {
    this.fileAnalysisCache.set(filePath, {
      content,
      analysis,
      lastModified: new Date()
    });

    // Extract concepts from the file
    this.extractConceptsFromFile(filePath, content, analysis);
  }

  getFileContext(filePath: string): {
    lastAnalysis: any;
    relatedFiles: string[];
    concepts: string[];
    patterns: string[];
  } | null {
    const cached = this.fileAnalysisCache.get(filePath);
    if (!cached) return null;

    const relatedFiles = this.findRelatedFiles(filePath);
    const concepts = this.getFileConceptsю(filePath);
    const patterns = this.getFilePatterns(filePath);

    return {
      lastAnalysis: cached.analysis,
      relatedFiles,
      concepts,
      patterns
    };
  }

  private async detectProjectType(rootPath: string): Promise<ProjectContext['type']> {
    // Analyze package.json, requirements.txt, etc. to determine project type
    if (await this.fileExists(`${rootPath}/package.json`)) {
      const packageJson = await this.readFile(`${rootPath}/package.json`);
      const parsed = JSON.parse(packageJson);
      
      if (parsed.dependencies?.react || parsed.dependencies?.vue || parsed.dependencies?.angular) {
        return 'web';
      }
      if (parsed.dependencies?.['react-native'] || parsed.dependencies?.expo) {
        return 'mobile';
      }
      if (parsed.dependencies?.express || parsed.dependencies?.fastify) {
        return 'api';
      }
    }

    return 'library';
  }

  private async detectTechnologies(rootPath: string): Promise<string[]> {
    const technologies: string[] = [];
    
    // Check for various technology indicators
    const indicators = [
      { files: ['package.json'], tech: 'Node.js' },
      { files: ['requirements.txt', 'setup.py'], tech: 'Python' },
      { files: ['Cargo.toml'], tech: 'Rust' },
      { files: ['go.mod'], tech: 'Go' },
      { files: ['pom.xml', 'build.gradle'], tech: 'Java' },
      { files: ['Dockerfile'], tech: 'Docker' },
      { files: ['.github/workflows'], tech: 'GitHub Actions' }
    ];

    for (const indicator of indicators) {
      for (const file of indicator.files) {
        if (await this.fileExists(`${rootPath}/${file}`)) {
          technologies.push(indicator.tech);
          break;
        }
      }
    }

    return technologies;
  }

  private async analyzeArchitecture(rootPath: string): Promise<string[]> {
    const patterns: string[] = [];
    
    // Analyze directory structure for architectural patterns
    const dirs = await this.listDirectories(rootPath);
    
    if (dirs.includes('src') && dirs.includes('tests')) {
      patterns.push('Standard Source Structure');
    }
    if (dirs.includes('components') || dirs.includes('pages')) {
      patterns.push('Component-Based Architecture');
    }
    if (dirs.includes('api') || dirs.includes('routes')) {
      patterns.push('API-First Architecture');
    }
    if (dirs.includes('services') && dirs.includes('models')) {
      patterns.push('Service Layer Pattern');
    }

    return patterns;
  }

  private extractSemanticInfo(content: string): void {
    const concepts = this.extractConcepts(content);
    const relationships = this.extractRelationships(content);
    
    concepts.forEach(concept => {
      const existing = this.semanticContext.concepts.get(concept.name);
      if (existing) {
        existing.usageFrequency++;
        existing.lastMentioned = new Date();
      } else {
        this.semanticContext.concepts.set(concept.name, {
          definition: concept.definition,
          relatedFiles: [],
          usageFrequency: 1,
          lastMentioned: new Date()
        });
      }
    });

    relationships.forEach(rel => {
      const existing = this.semanticContext.relationships.get(rel.from);
      if (existing) {
        if (!existing.includes(rel.to)) {
          existing.push(rel.to);
        }
      } else {
        this.semanticContext.relationships.set(rel.from, [rel.to]);
      }
    });
  }

  private findRelevantFiles(queryTokens: string[]): string[] {
    const scores = new Map<string, number>();
    
    for (const [filePath, cached] of this.fileAnalysisCache.entries()) {
      let score = 0;
      const content = cached.content.toLowerCase();
      
      queryTokens.forEach(token => {
        const matches = (content.match(new RegExp(token, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        scores.set(filePath, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([path]) => path);
  }

  private findRelatedConcepts(queryTokens: string[]): string[] {
    const relatedConcepts: string[] = [];
    
    queryTokens.forEach(token => {
      const concept = this.semanticContext.concepts.get(token);
      if (concept) {
        relatedConcepts.push(token);
        
        // Add related concepts through relationships
        const related = this.semanticContext.relationships.get(token) || [];
        relatedConcepts.push(...related);
      }
    });

    return [...new Set(relatedConcepts)];
  }

  private initializeSession(): void {
    this.currentConversation = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      messages: [],
      topics: [],
      activeFiles: [],
      completedTasks: [],
      pendingTasks: []
    };
  }

  private updateTopics(content: string): void {
    // Simple topic extraction - in production, use NLP
    const topics = content.toLowerCase()
      .match(/\b(implement|create|fix|update|refactor|test|debug|optimize)\b/g) || [];
    
    topics.forEach(topic => {
      if (!this.currentConversation!.topics.includes(topic)) {
        this.currentConversation!.topics.push(topic);
      }
    });
  }

  private generateProjectId(rootPath: string): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractProjectName(rootPath: string): string {
    return rootPath.split('/').pop() || 'Unknown Project';
  }

  private tokenize(text: string): string[] {
    return text.split(/\W+/).filter(token => token.length > 2);
  }

  private extractConcepts(content: string): Array<{name: string, definition: string}> {
    // Simple concept extraction - in production, use NLP
    const concepts: Array<{name: string, definition: string}> = [];
    const patterns = [
      /class\s+(\w+)/g,
      /function\s+(\w+)/g,
      /interface\s+(\w+)/g,
      /type\s+(\w+)/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        concepts.push({
          name: match[1],
          definition: `Code entity: ${match[0]}`
        });
      }
    });

    return concepts;
  }

  private extractRelationships(content: string): Array<{from: string, to: string}> {
    // Simple relationship extraction
    return [];
  }

  // Utility methods
  private async fileExists(path: string): Promise<boolean> {
    // Implementation depends on environment
    return false;
  }

  private async readFile(path: string): Promise<string> {
    // Implementation depends on environment
    return '';
  }

  private async listDirectories(path: string): Promise<string[]> {
    // Implementation depends on environment
    return [];
  }

  getProjectSummary(): string {
    if (!this.projectContext) return 'No project analyzed yet';
    
    const { name, type, technologies, codebaseSize } = this.projectContext;
    return `Project: ${name} (${type})\nTechnologies: ${technologies.join(', ')}\nSize: ${codebaseSize.files} files, ${codebaseSize.lines} lines`;
  }

  getConversationSummary(): string {
    if (!this.currentConversation) return 'No active conversation';
    
    const { messages, topics, activeFiles } = this.currentConversation;
    return `Session: ${messages.length} messages\nTopics: ${topics.join(', ')}\nActive files: ${activeFiles.length}`;
  }
}