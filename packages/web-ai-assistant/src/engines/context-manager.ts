/**
 * Context Manager
 * Manages project context and code awareness
 */

export interface ProjectContext {
  projectType: string;
  framework?: string;
  language: string;
  dependencies: string[];
  files: Map<string, any>;
  symbols: Map<string, any>;
}

export class ContextManager {
  private context: ProjectContext;
  private fileWatchers: Map<string, any> = new Map();

  constructor(private config: any) {
    this.context = {
      projectType: 'unknown',
      language: 'javascript',
      dependencies: [],
      files: new Map(),
      symbols: new Map()
    };
  }

  async analyzeProject(rootPath: string): Promise<ProjectContext> {
    // Implementation will be expanded in future phases
    return this.context;
  }

  async updateFileContext(filePath: string, content: string): Promise<void> {
    this.context.files.set(filePath, {
      content,
      lastModified: Date.now(),
      symbols: this.extractSymbols(content)
    });
  }

  async getContextForFile(filePath: string): Promise<any> {
    return this.context.files.get(filePath) || {};
  }

  async getProjectDependencies(): Promise<string[]> {
    return this.context.dependencies;
  }

  private extractSymbols(code: string): any[] {
    // Basic symbol extraction
    const symbols: any[] = [];
    const functionMatches = code.match(/function\s+(\w+)/g);
    const classMatches = code.match(/class\s+(\w+)/g);
    
    if (functionMatches) {
      symbols.push(...functionMatches.map(match => ({
        name: match.split(' ')[1],
        type: 'function'
      })));
    }
    
    if (classMatches) {
      symbols.push(...classMatches.map(match => ({
        name: match.split(' ')[1],
        type: 'class'
      })));
    }
    
    return symbols;
  }

  getContext(): ProjectContext {
    return { ...this.context };
  }
}