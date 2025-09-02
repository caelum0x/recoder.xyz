import { NextRequest, NextResponse } from 'next/server';
import { UnifiedAIProvider } from '@/lib/unified-ai-provider';

export async function POST(request: NextRequest) {
  try {
    const { code, filePath, language, projectContext } = await request.json();

    if (!code || !code.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Code is required'
      }, { status: 400 });
    }

    // Analyze code complexity (simple heuristic)
    const codeComplexity = analyzeComplexity(code);
    
    // Check for security issues
    const securityIssues = detectSecurityIssues(code, language);
    
    // Check for performance issues
    const performanceIssues = detectPerformanceIssues(code, language);
    
    // Generate refactoring opportunities
    const refactoringOpportunities = findRefactoringOpportunities(code, language);
    
    // Calculate test coverage (mock for now)
    const testCoverage = calculateTestCoverage(code, projectContext);
    
    // Calculate maintainability score
    const maintainabilityScore = calculateMaintainabilityScore(code, codeComplexity);

    // Generate AI-powered suggestions
    const suggestions = await generateAISuggestions(code, language, projectContext);

    const analysis = {
      codeComplexity,
      securityIssues,
      performanceIssues,
      refactoringOpportunities,
      testCoverage,
      maintainabilityScore,
      suggestions
    };

    return NextResponse.json({
      success: true,
      analysis,
      suggestions
    });

  } catch (error) {
    console.error('Intelligent analysis error:', error);
    return NextResponse.json({
      success: false,
      error: 'Analysis failed'
    }, { status: 500 });
  }
}

function analyzeComplexity(code: string): number {
  // Simple cyclomatic complexity calculation
  const complexityIndicators = [
    /if\s*\(/g,
    /else\s*if\s*\(/g,
    /else\s*{/g,
    /while\s*\(/g,
    /for\s*\(/g,
    /switch\s*\(/g,
    /case\s+.*:/g,
    /catch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?.*:/g // ternary operator
  ];

  let complexity = 1; // Base complexity
  
  complexityIndicators.forEach(pattern => {
    const matches = code.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  });

  return Math.min(complexity, 10); // Cap at 10
}

function detectSecurityIssues(code: string, language: string): string[] {
  const issues: string[] = [];

  // Common security patterns to check
  const securityPatterns = [
    {
      pattern: /eval\s*\(/g,
      message: 'Use of eval() function can lead to code injection vulnerabilities'
    },
    {
      pattern: /innerHTML\s*=/g,
      message: 'Direct innerHTML assignment can lead to XSS vulnerabilities'
    },
    {
      pattern: /document\.write\s*\(/g,
      message: 'document.write() can be dangerous and lead to XSS attacks'
    },
    {
      pattern: /localStorage\.setItem\s*\([^,]*,\s*[^)]*password[^)]*\)/gi,
      message: 'Storing passwords in localStorage is insecure'
    },
    {
      pattern: /(password|secret|key)\s*=\s*['"][^'"]*['"]/gi,
      message: 'Hardcoded credentials detected - use environment variables'
    },
    {
      pattern: /\$\{.*\}/g,
      message: 'Template literals with user input may lead to injection attacks'
    }
  ];

  if (language === 'javascript' || language === 'typescript') {
    securityPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(code)) {
        issues.push(message);
      }
    });
  }

  return issues;
}

function detectPerformanceIssues(code: string, language: string): string[] {
  const issues: string[] = [];

  const performancePatterns = [
    {
      pattern: /for\s*\([^)]*\.length[^)]*\)/g,
      message: 'Accessing array.length in loop condition causes repeated property lookup'
    },
    {
      pattern: /document\.getElementById\s*\([^)]*\)/g,
      message: 'Multiple DOM queries can be optimized by caching elements'
    },
    {
      pattern: /new\s+RegExp\s*\(/g,
      message: 'Creating RegExp in loops can be expensive - consider pre-compiling'
    },
    {
      pattern: /console\.log\s*\(/g,
      message: 'Console.log statements should be removed in production'
    },
    {
      pattern: /setTimeout\s*\([^,]*,\s*0\s*\)/g,
      message: 'setTimeout with 0 delay - consider using requestAnimationFrame for DOM updates'
    }
  ];

  if (language === 'javascript' || language === 'typescript') {
    performancePatterns.forEach(({ pattern, message }) => {
      if (pattern.test(code)) {
        issues.push(message);
      }
    });
  }

  return issues;
}

function findRefactoringOpportunities(code: string, language: string): string[] {
  const opportunities: string[] = [];

  // Check for long functions
  const functions = code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g);
  if (functions) {
    functions.forEach(func => {
      const lines = func.split('\n').length;
      if (lines > 20) {
        opportunities.push('Function is too long - consider breaking into smaller functions');
      }
    });
  }

  // Check for repeated code
  const codeLines = code.split('\n').filter(line => line.trim().length > 10);
  const duplicates = findDuplicateLines(codeLines);
  if (duplicates.length > 0) {
    opportunities.push('Duplicate code detected - consider extracting to a shared function');
  }

  // Check for magic numbers
  const magicNumbers = code.match(/\b\d{2,}\b/g);
  if (magicNumbers && magicNumbers.length > 3) {
    opportunities.push('Magic numbers detected - consider using named constants');
  }

  // Check for deep nesting
  const nestingDepth = calculateNestingDepth(code);
  if (nestingDepth > 4) {
    opportunities.push('Deep nesting detected - consider early returns or guard clauses');
  }

  return opportunities;
}

function findDuplicateLines(lines: string[]): string[] {
  const lineCount: { [key: string]: number } = {};
  const duplicates: string[] = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      lineCount[trimmed] = (lineCount[trimmed] || 0) + 1;
    }
  });

  Object.entries(lineCount).forEach(([line, count]) => {
    if (count > 1 && line.length > 20) {
      duplicates.push(line);
    }
  });

  return duplicates;
}

function calculateNestingDepth(code: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of code) {
    if (char === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}') {
      currentDepth--;
    }
  }

  return maxDepth;
}

function calculateTestCoverage(code: string, projectContext: any): number {
  // Mock test coverage calculation
  // In a real implementation, this would analyze test files
  const hasTests = /test\s*\(|it\s*\(|describe\s*\(/g.test(code);
  const isTestFile = /\.test\.|\.spec\./g.test(projectContext.filePath || '');
  
  if (isTestFile) return 95;
  if (hasTests) return 75;
  
  // Estimate based on code complexity
  const lines = code.split('\n').filter(line => line.trim().length > 0).length;
  if (lines < 50) return 60;
  if (lines < 100) return 45;
  return 30;
}

function calculateMaintainabilityScore(code: string, complexity: number): number {
  const lines = code.split('\n').filter(line => line.trim().length > 0).length;
  const comments = (code.match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) || []).length;
  const commentRatio = comments / Math.max(lines, 1);
  
  let score = 100;
  
  // Penalize for complexity
  score -= complexity * 5;
  
  // Reward for comments
  score += commentRatio * 20;
  
  // Penalize for long files
  if (lines > 200) score -= 10;
  if (lines > 500) score -= 20;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function generateAISuggestions(code: string, language: string, projectContext: any): Promise<string[]> {
  // For now, return fallback suggestions until we ensure AI integration is working
  // This prevents TypeScript errors and provides immediate functionality
  try {
    const unifiedAI = new UnifiedAIProvider();
    
    const prompt = `Analyze this ${language} code and provide 3-5 specific improvement suggestions:

\`\`\`${language}
${code}
\`\`\`

Project context: ${projectContext?.framework || 'Unknown'} project with ${projectContext?.fileCount || 0} files.

Focus on:
- Code quality improvements
- Performance optimizations  
- Best practices
- Security enhancements
- Maintainability

Provide brief, actionable suggestions (1-2 sentences each).`;

    const response = await unifiedAI.smartGenerate([
      { role: 'user', content: prompt }
    ], {
      quality: 'fast',
      maxTokens: 500,
      temperature: 0.3
    });

    // Type-safe content extraction
    const content = response?.content;
    if (content && typeof content === 'string' && content.trim().length > 0) {
      // Parse suggestions from AI response
      const suggestions = content
        .split('\n')
        .filter(line => line.trim().length > 10)
        .map(line => line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim())
        .filter(suggestion => suggestion.length > 0)
        .slice(0, 5);
      
      if (suggestions.length > 0) {
        return suggestions;
      }
    }
  } catch (error) {
    console.error('AI suggestions error:', error);
  }

  // Enhanced fallback suggestions based on code analysis
  const fallbackSuggestions = [
    'Add error handling for better reliability',
    'Consider adding TypeScript types for better code safety',
    'Add unit tests to improve code coverage',
    'Extract magic numbers into named constants',
    'Consider breaking down large functions into smaller ones'
  ];

  // Add language-specific suggestions
  if (language === 'javascript' || language === 'typescript') {
    if (code.includes('any')) {
      fallbackSuggestions.unshift('Replace "any" types with specific TypeScript types');
    }
    if (code.includes('console.log')) {
      fallbackSuggestions.push('Remove console.log statements for production');
    }
    if (code.includes('document.')) {
      fallbackSuggestions.push('Consider caching DOM queries for better performance');
    }
  }

  return fallbackSuggestions.slice(0, 5);
}
