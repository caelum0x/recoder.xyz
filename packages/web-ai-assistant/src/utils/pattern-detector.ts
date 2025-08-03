/**
 * Code Pattern Detector
 * Detects code patterns and frameworks
 */

export class CodePatternDetector {
  constructor(private config: any) {}

  detectFramework(code: string): string | null {
    if (code.includes('useState') || code.includes('useEffect')) {
      return 'react';
    }
    if (code.includes('@Component') || code.includes('ngOnInit')) {
      return 'angular';
    }
    if (code.includes('createApp') || code.includes('Vue.')) {
      return 'vue';
    }
    if (code.includes('express()') || code.includes('app.listen')) {
      return 'express';
    }
    if (code.includes('FastAPI') || code.includes('@app.')) {
      return 'fastapi';
    }
    return null;
  }

  detectPatterns(code: string): string[] {
    const patterns: string[] = [];
    
    // Function patterns
    if (code.includes('async function') || code.includes('async ')) {
      patterns.push('async-function');
    }
    if (code.includes('function*')) {
      patterns.push('generator-function');
    }
    if (code.includes('=>')) {
      patterns.push('arrow-function');
    }
    
    // React patterns
    if (code.includes('useState')) {
      patterns.push('react-hooks');
    }
    if (code.includes('useEffect')) {
      patterns.push('react-effects');
    }
    if (code.includes('JSX.Element')) {
      patterns.push('react-component');
    }
    
    // Database patterns
    if (code.includes('SELECT') || code.includes('INSERT')) {
      patterns.push('sql-query');
    }
    if (code.includes('findMany') || code.includes('create({')) {
      patterns.push('prisma-orm');
    }
    
    // API patterns
    if (code.includes('fetch(') || code.includes('axios.')) {
      patterns.push('api-call');
    }
    if (code.includes('app.get') || code.includes('app.post')) {
      patterns.push('api-endpoint');
    }
    
    return patterns;
  }

  detectLanguage(code: string, fileName?: string): string {
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'ts': case 'tsx': return 'typescript';
        case 'js': case 'jsx': return 'javascript';
        case 'py': return 'python';
        case 'rs': return 'rust';
        case 'go': return 'go';
        case 'java': return 'java';
        case 'cpp': case 'cc': case 'cxx': return 'cpp';
        case 'c': return 'c';
        case 'php': return 'php';
        case 'rb': return 'ruby';
        case 'swift': return 'swift';
        case 'kt': return 'kotlin';
        case 'dart': return 'dart';
        case 'sol': return 'solidity';
      }
    }
    
    // Fallback to content analysis
    if (code.includes('interface ') && code.includes(': ')) {
      return 'typescript';
    }
    if (code.includes('def ') && code.includes(':')) {
      return 'python';
    }
    if (code.includes('fn ') && code.includes('->')) {
      return 'rust';
    }
    if (code.includes('func ') && code.includes('{')) {
      return 'go';
    }
    
    return 'javascript'; // Default fallback
  }

  analyzeComplexity(code: string): number {
    let complexity = 1; // Base complexity
    
    // Control structures
    const ifMatches = (code.match(/\bif\b/g) || []).length;
    const forMatches = (code.match(/\bfor\b/g) || []).length;
    const whileMatches = (code.match(/\bwhile\b/g) || []).length;
    const switchMatches = (code.match(/\bswitch\b/g) || []).length;
    const catchMatches = (code.match(/\bcatch\b/g) || []).length;
    
    complexity += ifMatches + forMatches + whileMatches + switchMatches + catchMatches;
    
    // Nested functions
    const functionMatches = (code.match(/\bfunction\b/g) || []).length;
    complexity += Math.floor(functionMatches / 2);
    
    return Math.min(complexity, 10); // Cap at 10
  }
}