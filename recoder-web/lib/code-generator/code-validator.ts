// Code validation and security scanning for the Multi-language Code Generator
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  suggestions?: string[];
}

export interface ValidationIssue {
  type: 'security' | 'syntax' | 'performance' | 'style';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  line?: number;
  column?: number;
  rule: string;
}

// Security patterns that should be blocked or flagged
const SECURITY_PATTERNS = {
  // File system operations
  filesystem: {
    patterns: [
      /\bopen\s*\([^)]*['"][^'"]*\.(txt|csv|json|xml|log)['"]/gi,
      /\bfile\s*\([^)]*['"][^'"]*\//gi,
      /\bfopen\s*\([^)]*['"][^'"]*\//gi,
      /readFile|writeFile|appendFile/gi,
      /\bfs\.(read|write|unlink|mkdir|rmdir)/gi,
      /\b(cat|ls|pwd|mkdir|rm|cp|mv)\s+/gi,
    ],
    severity: 'warning' as const,
    message: 'File system operations detected - limited in sandbox environment'
  },

  // Network operations
  network: {
    patterns: [
      /\b(fetch|axios|http|https|request|urllib|socket|connect)\b/gi,
      /\bimport\s+requests\b/gi,
      /\bfrom\s+requests\s+import/gi,
      /\bnet\/http\b/gi,
      /\bSystem\.Net\b/gi,
      /\bHttpClient\b/gi,
    ],
    severity: 'error' as const,
    message: 'Network operations are blocked for security reasons'
  },

  // Process execution
  process: {
    patterns: [
      /\b(exec|eval|system|shell|spawn|fork|Runtime\.getRuntime)/gi,
      /\bos\.system\b/gi,
      /\bsubprocess\.(run|call|check_output|Popen)/gi,
      /\bProcess\.Start\b/gi,
      /\bRuntime\.exec\b/gi,
    ],
    severity: 'critical' as const,
    message: 'Process execution commands are strictly prohibited'
  },

  // Dynamic code execution
  dynamic_code: {
    patterns: [
      /\beval\s*\(/gi,
      /\bFunction\s*\(/gi,
      /\bnew\s+Function/gi,
      /\b__import__\s*\(/gi,
      /\bgetattr\s*\(/gi,
      /\bsetattr\s*\(/gi,
      /\breflection\b/gi,
    ],
    severity: 'error' as const,
    message: 'Dynamic code execution is not allowed'
  },

  // Resource intensive operations
  resource_intensive: {
    patterns: [
      /\bwhile\s*\(\s*true\s*\)/gi,
      /\bfor\s*\(\s*;\s*;\s*\)/gi,
      /\bwhile\s+True\s*:/gi,
      /\bwhile\s+1\s*:/gi,
      /\bmalloc\s*\([^)]*\*[^)]*\*[^)]*\)/gi, // Large memory allocations
    ],
    severity: 'warning' as const,
    message: 'Potentially resource-intensive code detected'
  },

  // Dangerous imports/includes
  dangerous_imports: {
    patterns: [
      /\bimport\s+os\b/gi,
      /\bfrom\s+os\s+import/gi,
      /\bimport\s+subprocess\b/gi,
      /\bimport\s+ctypes\b/gi,
      /\b#include\s*<(sys\/|unistd|windows)\.h>/gi,
      /\busing\s+System\.Diagnostics/gi,
    ],
    severity: 'error' as const,
    message: 'Dangerous system imports detected'
  },

  // SQL injection patterns
  sql_injection: {
    patterns: [
      /\bSELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\+/gi,
      /\bDROP\s+TABLE\b/gi,
      /\bDELETE\s+FROM\s+.*WHERE\s+.*\+/gi,
      /\bINSERT\s+INTO\s+.*VALUES\s*\([^)]*\+/gi,
    ],
    severity: 'warning' as const,
    message: 'Potential SQL injection pattern detected'
  },
};

// Language-specific validators
const LANGUAGE_VALIDATORS = {
  javascript: {
    dangerous_globals: {
      patterns: [
        /\bglobal\b/gi,
        /\bwindow\b/gi,
        /\bdocument\b/gi,
        /\bprocess\.env\b/gi,
        /\brequire\s*\(\s*['"]child_process['"]\s*\)/gi,
      ],
      severity: 'warning' as const,
      message: 'Access to global objects may be restricted'
    }
  },
  
  python: {
    dangerous_builtins: {
      patterns: [
        /\b__builtins__\b/gi,
        /\bglobals\s*\(\)/gi,
        /\blocals\s*\(\)/gi,
        /\bcompile\s*\(/gi,
        /\bexec\s*\(/gi,
      ],
      severity: 'error' as const,
      message: 'Access to Python builtins is restricted'
    }
  },

  java: {
    dangerous_classes: {
      patterns: [
        /\bRuntime\.getRuntime\b/gi,
        /\bSystem\.exit\b/gi,
        /\bProcessBuilder\b/gi,
        /\bjava\.lang\.reflect\b/gi,
      ],
      severity: 'error' as const,
      message: 'Dangerous Java classes detected'
    }
  },

  cpp: {
    dangerous_functions: {
      patterns: [
        /\bsystem\s*\(/gi,
        /\bgets\s*\(/gi,
        /\bstrcpy\s*\(/gi,
        /\bsprintf\s*\(/gi,
      ],
      severity: 'warning' as const,
      message: 'Potentially unsafe C++ functions detected'
    }
  }
};

export function validateCode(code: string, language: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Check against general security patterns
  for (const [category, config] of Object.entries(SECURITY_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = [...code.matchAll(new RegExp(pattern, 'gi'))];
      
      for (const match of matches) {
        const line = getLineNumber(code, match.index || 0);
        issues.push({
          type: 'security',
          severity: config.severity,
          message: config.message,
          line,
          rule: category
        });

        // Update risk level
        if (config.severity === 'critical') riskLevel = 'critical';
        else if (config.severity === 'error' && riskLevel !== 'critical') riskLevel = 'high';
        else if (config.severity === 'warning' && !['critical', 'high'].includes(riskLevel)) riskLevel = 'medium';
      }
    }
  }

  // Check language-specific patterns
  const langValidator = LANGUAGE_VALIDATORS[language as keyof typeof LANGUAGE_VALIDATORS];
  if (langValidator) {
    for (const [category, config] of Object.entries(langValidator)) {
      for (const pattern of config.patterns) {
        const matches = [...code.matchAll(new RegExp(pattern, 'gi'))];
        
        for (const match of matches) {
          const line = getLineNumber(code, match.index || 0);
          issues.push({
            type: 'security',
            severity: config.severity,
            message: config.message,
            line,
            rule: `${language}_${category}`
          });

          // Update risk level
          if (config.severity === 'critical') riskLevel = 'critical';
          else if (config.severity === 'error' && riskLevel !== 'critical') riskLevel = 'high';
          else if (config.severity === 'warning' && !['critical', 'high'].includes(riskLevel)) riskLevel = 'medium';
        }
      }
    }
  }

  // Basic syntax and style checks
  issues.push(...performBasicChecks(code, language));

  // Performance checks
  issues.push(...performPerformanceChecks(code, language));

  // Determine if code is valid (only block critical and some error issues)
  const blockingIssues = issues.filter(issue => 
    issue.severity === 'critical' || 
    (issue.severity === 'error' && issue.type === 'security')
  );

  return {
    isValid: blockingIssues.length === 0,
    issues,
    riskLevel,
    suggestions: generateSuggestions(issues)
  };
}

function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

function performBasicChecks(code: string, language: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Check code length
  if (code.length > 50000) {
    issues.push({
      type: 'performance',
      severity: 'warning',
      message: 'Code is very long and may exceed execution time limits',
      rule: 'code_length'
    });
  }

  // Check for very deep nesting (potential complexity issue)
  const maxNesting = getMaxNesting(code);
  if (maxNesting > 6) {
    issues.push({
      type: 'style',
      severity: 'warning',
      message: 'Code has deep nesting which may impact readability and performance',
      rule: 'max_nesting'
    });
  }

  // Language-specific basic checks
  if (language === 'python') {
    // Check for tabs vs spaces mixing (Python specific)
    if (code.includes('\t') && code.includes('    ')) {
      issues.push({
        type: 'syntax',
        severity: 'warning',
        message: 'Mixed tabs and spaces detected - may cause indentation errors',
        rule: 'python_indentation'
      });
    }
  }

  return issues;
}

function performPerformanceChecks(code: string, language: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for nested loops (potential O(n²) or worse complexity)
  const nestedLoopPattern = /\b(for|while)\b[^{}]*\{[^{}]*\b(for|while)\b/gi;
  const nestedLoops = [...code.matchAll(nestedLoopPattern)];
  
  if (nestedLoops.length > 2) {
    issues.push({
      type: 'performance',
      severity: 'warning',
      message: 'Multiple nested loops detected - may cause performance issues with large inputs',
      rule: 'nested_loops'
    });
  }

  // Check for potential infinite loops
  const infiniteLoopPatterns = [
    /while\s*\(\s*true\s*\)/gi,
    /while\s*\(\s*1\s*\)/gi,
    /for\s*\(\s*;\s*;\s*\)/gi,
  ];

  for (const pattern of infiniteLoopPatterns) {
    const matches = [...code.matchAll(pattern)];
    if (matches.length > 0) {
      issues.push({
        type: 'performance',
        severity: 'error',
        message: 'Potential infinite loop detected - will cause timeout',
        rule: 'infinite_loop'
      });
    }
  }

  return issues;
}

function getMaxNesting(code: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '{' || char === '(' || char === '[') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}' || char === ')' || char === ']') {
      currentDepth--;
    }
  }

  return maxDepth;
}

function generateSuggestions(issues: ValidationIssue[]): string[] {
  const suggestions: string[] = [];
  
  const hasSecurityIssues = issues.some(i => i.type === 'security');
  const hasPerformanceIssues = issues.some(i => i.type === 'performance');
  const hasStyleIssues = issues.some(i => i.type === 'style');

  if (hasSecurityIssues) {
    suggestions.push('Review security patterns and avoid system calls, file operations, and dynamic code execution');
  }

  if (hasPerformanceIssues) {
    suggestions.push('Consider optimizing algorithms and avoiding nested loops for better performance');
    suggestions.push('Test with small inputs first to avoid timeouts');
  }

  if (hasStyleIssues) {
    suggestions.push('Improve code structure and reduce nesting for better readability');
  }

  // General suggestions
  suggestions.push('Use descriptive variable names and comments for better code clarity');
  suggestions.push('Test your code with different input scenarios');

  return suggestions;
}

// Helper function to check if code contains potentially malicious patterns
export function isCodeSafe(code: string, language: string): boolean {
  const result = validateCode(code, language);
  return result.isValid && result.riskLevel !== 'critical';
}

// Function to sanitize code output for display
export function sanitizeOutput(output: string): string {
  // Remove potentially sensitive information from output
  return output
    .replace(/\/tmp\/[a-zA-Z0-9-]+/g, '/tmp/[hidden]') // Hide temp paths
    .replace(/\/workspace\/[a-zA-Z0-9-]+/g, '/workspace/[hidden]') // Hide workspace paths
    .replace(/user-[0-9]+/g, 'user-[hidden]') // Hide user IDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[uuid-hidden]') // Hide UUIDs
    .substring(0, 10000); // Limit output length
}

export default {
  validateCode,
  isCodeSafe,
  sanitizeOutput
};