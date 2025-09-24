/**
 * Project Analyzer for AI App Generator
 * Analyzes project structure, dependencies, and context for better AI responses
 */

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface AnalyzeOptions {
  files: FileNode[];
  framework: string;
  activeFile?: string;
}

interface ProjectAnalysis {
  structure: string;
  activeFileContent: string;
  dependencies: string[];
  framework: string;
  patterns: string[];
  suggestions: string[];
  complexity: 'simple' | 'medium' | 'complex';
  codeQuality: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

class ProjectAnalyzer {
  /**
   * Analyze project structure and context
   */
  async analyzeProject(options: AnalyzeOptions): Promise<ProjectAnalysis> {
    const { files, framework, activeFile } = options;

    const structure = this.generateStructureTree(files);
    const activeFileContent = this.getActiveFileContent(files, activeFile);
    const dependencies = this.extractDependencies(files);
    const patterns = this.detectPatterns(files);
    const suggestions = this.generateSuggestions(files, framework);
    const complexity = this.assessComplexity(files);
    const codeQuality = this.analyzeCodeQuality(files);

    return {
      structure,
      activeFileContent,
      dependencies,
      framework,
      patterns,
      suggestions,
      complexity,
      codeQuality
    };
  }

  /**
   * Generate a text representation of project structure
   */
  private generateStructureTree(files: FileNode[], indent = ''): string {
    let tree = '';
    
    files.forEach((file, index) => {
      const isLast = index === files.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      tree += `${indent}${prefix}${file.name}\n`;
      
      if (file.type === 'folder' && file.children) {
        const childIndent = indent + (isLast ? '    ' : '│   ');
        tree += this.generateStructureTree(file.children, childIndent);
      }
    });

    return tree;
  }

  /**
   * Get content of the currently active file
   */
  private getActiveFileContent(files: FileNode[], activeFileId?: string): string {
    if (!activeFileId) return '';

    const findFile = (fileList: FileNode[]): FileNode | null => {
      for (const file of fileList) {
        if (file.id === activeFileId && file.type === 'file') {
          return file;
        }
        if (file.type === 'folder' && file.children) {
          const found = findFile(file.children);
          if (found) return found;
        }
      }
      return null;
    };

    const activeFile = findFile(files);
    return activeFile?.content || '';
  }

  /**
   * Extract dependencies from package.json
   */
  private extractDependencies(files: FileNode[]): string[] {
    const packageJson = this.findFile(files, 'package.json');
    if (!packageJson?.content) return [];

    try {
      const pkg = JSON.parse(packageJson.content);
      const deps = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
        ...Object.keys(pkg.peerDependencies || {})
      ];
      return deps;
    } catch (error) {
      return [];
    }
  }

  /**
   * Detect common patterns and technologies in the project
   */
  private detectPatterns(files: FileNode[]): string[] {
    const patterns: string[] = [];
    const allContent = this.getAllFileContents(files).join('\n').toLowerCase();

    // Framework patterns
    if (allContent.includes('import react') || allContent.includes('from \'react\'')) {
      patterns.push('React');
    }
    if (allContent.includes('next/') || allContent.includes('next.config')) {
      patterns.push('Next.js');
    }
    if (allContent.includes('vue') || allContent.includes('.vue')) {
      patterns.push('Vue.js');
    }
    if (allContent.includes('@angular/') || allContent.includes('angular.json')) {
      patterns.push('Angular');
    }
    if (allContent.includes('svelte') || allContent.includes('.svelte')) {
      patterns.push('Svelte');
    }

    // State management
    if (allContent.includes('redux') || allContent.includes('usestate')) {
      patterns.push('State Management');
    }
    if (allContent.includes('zustand') || allContent.includes('jotai')) {
      patterns.push('Modern State Management');
    }

    // Styling
    if (allContent.includes('tailwind') || allContent.includes('tw-')) {
      patterns.push('Tailwind CSS');
    }
    if (allContent.includes('styled-components') || allContent.includes('emotion')) {
      patterns.push('CSS-in-JS');
    }
    if (allContent.includes('@mui/') || allContent.includes('material-ui')) {
      patterns.push('Material-UI');
    }

    // API patterns
    if (allContent.includes('fetch(') || allContent.includes('axios')) {
      patterns.push('API Integration');
    }
    if (allContent.includes('graphql') || allContent.includes('apollo')) {
      patterns.push('GraphQL');
    }

    // Testing
    if (allContent.includes('jest') || allContent.includes('test(')) {
      patterns.push('Testing');
    }
    if (allContent.includes('cypress') || allContent.includes('playwright')) {
      patterns.push('E2E Testing');
    }

    // Database
    if (allContent.includes('prisma') || allContent.includes('mongoose')) {
      patterns.push('Database ORM');
    }

    // Authentication
    if (allContent.includes('auth') || allContent.includes('jwt')) {
      patterns.push('Authentication');
    }

    return patterns;
  }

  /**
   * Generate suggestions based on project analysis
   */
  private generateSuggestions(files: FileNode[], framework: string): string[] {
    const suggestions: string[] = [];
    const allContent = this.getAllFileContents(files).join('\n').toLowerCase();

    // Framework-specific suggestions
    if (framework === 'react') {
      if (!allContent.includes('usestate') && !allContent.includes('useeffect')) {
        suggestions.push('Consider using React hooks for state management');
      }
      if (!allContent.includes('typescript') && !allContent.includes('.tsx')) {
        suggestions.push('Consider migrating to TypeScript for better type safety');
      }
    }

    // Code organization
    const componentFiles = this.countFilesByPattern(files, /\.(tsx?|jsx?)$/);
    if (componentFiles > 5 && !this.hasFolder(files, 'components')) {
      suggestions.push('Consider organizing components in a dedicated folder');
    }

    // Testing
    const testFiles = this.countFilesByPattern(files, /\.(test|spec)\./);
    if (testFiles === 0) {
      suggestions.push('Add unit tests to improve code reliability');
    }

    // Documentation
    if (!this.findFile(files, 'README.md')) {
      suggestions.push('Add a README.md file to document your project');
    }

    // Performance
    if (allContent.includes('import *') || allContent.includes('import {')) {
      suggestions.push('Consider implementing code splitting for better performance');
    }

    // Security
    if (allContent.includes('process.env') && !allContent.includes('.env')) {
      suggestions.push('Use environment variables for sensitive configuration');
    }

    return suggestions;
  }

  /**
   * Assess project complexity
   */
  private assessComplexity(files: FileNode[]): 'simple' | 'medium' | 'complex' {
    const fileCount = this.countAllFiles(files);
    const folderCount = this.countAllFolders(files);
    const totalLines = this.countTotalLines(files);

    if (fileCount <= 5 && folderCount <= 2 && totalLines <= 500) {
      return 'simple';
    } else if (fileCount <= 20 && folderCount <= 8 && totalLines <= 2000) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  /**
   * Analyze code quality
   */
  private analyzeCodeQuality(files: FileNode[]): {
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const allContent = this.getAllFileContents(files);

    // Check for common code quality issues
    allContent.forEach((content, index) => {
      // Long lines
      const longLines = content.split('\n').filter(line => line.length > 120);
      if (longLines.length > 0) {
        issues.push(`File has ${longLines.length} lines exceeding 120 characters`);
        score -= Math.min(longLines.length * 2, 10);
      }

      // TODO comments
      const todoCount = (content.match(/TODO|FIXME|XXX/gi) || []).length;
      if (todoCount > 0) {
        issues.push(`${todoCount} TODO/FIXME comments found`);
        score -= todoCount * 2;
      }

      // Console.log statements
      const consoleCount = (content.match(/console\.(log|warn|error)/g) || []).length;
      if (consoleCount > 3) {
        issues.push(`${consoleCount} console statements found`);
        score -= Math.min(consoleCount, 10);
      }

      // Unused imports (basic detection)
      const importRegex = /import\s+{([^}]+)}\s+from/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const imports = match[1].split(',').map(imp => imp.trim());
        imports.forEach(imp => {
          if (!content.includes(imp) || content.indexOf(imp) === content.lastIndexOf(imp)) {
            issues.push(`Potentially unused import: ${imp}`);
            score -= 1;
          }
        });
      }
    });

    // Generate recommendations
    if (score < 90) {
      recommendations.push('Consider refactoring to improve code quality');
    }
    if (issues.some(issue => issue.includes('TODO'))) {
      recommendations.push('Address TODO comments before production');
    }
    if (issues.some(issue => issue.includes('console'))) {
      recommendations.push('Remove console statements from production code');
    }

    return {
      score: Math.max(score, 0),
      issues,
      recommendations
    };
  }

  /**
   * Helper methods
   */
  private findFile(files: FileNode[], fileName: string): FileNode | null {
    for (const file of files) {
      if (file.type === 'file' && file.name === fileName) {
        return file;
      }
      if (file.type === 'folder' && file.children) {
        const found = this.findFile(file.children, fileName);
        if (found) return found;
      }
    }
    return null;
  }

  private hasFolder(files: FileNode[], folderName: string): boolean {
    return files.some(file => 
      file.type === 'folder' && file.name === folderName
    );
  }

  private countFilesByPattern(files: FileNode[], pattern: RegExp): number {
    let count = 0;
    files.forEach(file => {
      if (file.type === 'file' && pattern.test(file.name)) {
        count++;
      }
      if (file.type === 'folder' && file.children) {
        count += this.countFilesByPattern(file.children, pattern);
      }
    });
    return count;
  }

  private countAllFiles(files: FileNode[]): number {
    let count = 0;
    files.forEach(file => {
      if (file.type === 'file') {
        count++;
      }
      if (file.type === 'folder' && file.children) {
        count += this.countAllFiles(file.children);
      }
    });
    return count;
  }

  private countAllFolders(files: FileNode[]): number {
    let count = 0;
    files.forEach(file => {
      if (file.type === 'folder') {
        count++;
        if (file.children) {
          count += this.countAllFolders(file.children);
        }
      }
    });
    return count;
  }

  private countTotalLines(files: FileNode[]): number {
    let total = 0;
    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        total += file.content.split('\n').length;
      }
      if (file.type === 'folder' && file.children) {
        total += this.countTotalLines(file.children);
      }
    });
    return total;
  }

  private getAllFileContents(files: FileNode[]): string[] {
    const contents: string[] = [];
    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        contents.push(file.content);
      }
      if (file.type === 'folder' && file.children) {
        contents.push(...this.getAllFileContents(file.children));
      }
    });
    return contents;
  }
}

export const projectAnalyzer = new ProjectAnalyzer();