const { BaseValidator } = require('./baseValidator');
const { logger } = require('../utils/logger');

class CodeValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.registerCodeRules();
  }

  registerCodeRules() {
    // Code quality rules
    this.registerRule('valid_syntax', {
      check: (code, context) => this.validateSyntax(code, context.language),
      message: 'Code contains syntax errors',
      severity: 'error'
    });

    this.registerRule('no_security_issues', {
      check: (code) => this.checkSecurityIssues(code),
      message: 'Code contains potential security vulnerabilities',
      severity: 'error'
    });

    this.registerRule('proper_naming', {
      check: (code) => this.validateNamingConventions(code),
      message: 'Code does not follow naming conventions',
      severity: 'warning'
    });

    this.registerRule('complexity_limit', {
      check: (code) => this.checkComplexity(code),
      message: 'Code complexity exceeds recommended limits',
      severity: 'warning'
    });

    this.registerRule('has_comments', {
      check: (code) => this.checkComments(code),
      message: 'Code lacks adequate comments or documentation',
      severity: 'suggestion'
    });

    this.registerRule('no_duplicates', {
      check: (code) => this.checkDuplication(code),
      message: 'Code contains duplicated logic',
      severity: 'warning'
    });

    this.registerRule('proper_imports', {
      check: (code, context) => this.validateImports(code, context.language),
      message: 'Imports are not properly organized',
      severity: 'warning'
    });

    this.registerRule('test_coverage', {
      check: (code, context) => this.checkTestCoverage(code, context),
      message: 'Code lacks adequate test coverage',
      severity: 'suggestion'
    });
  }

  async validate(input, context = {}) {
    try {
      this.validateInput(input, ['code']);

      const result = await this.performAsyncValidation(input, async () => {
        this.reset();

        const codeConfig = this.analyzeCodeStructure(input);
        
        // Validate code syntax and structure
        await this.validateCodeSyntax(codeConfig);
        
        // Check code quality metrics
        this.validateCodeQuality(codeConfig);
        
        // Validate security aspects
        this.validateCodeSecurity(codeConfig);
        
        // Check best practices
        this.validateBestPractices(codeConfig);
        
        // Validate architecture patterns
        this.validateArchitecturePatterns(codeConfig);
        
        return this.createValidationResult(true, {
          language: codeConfig.language,
          linesOfCode: codeConfig.metrics.linesOfCode,
          complexity: codeConfig.metrics.complexity
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeCodeStructure(input) {
    const config = {
      code: input.code,
      language: input.language || this.detectLanguage(input.code),
      fileName: input.fileName || 'unknown',
      projectType: input.projectType || 'general',
      framework: input.framework || null,
      standards: input.standards || [],
      strictMode: input.strictMode || false,
      metrics: this.calculateCodeMetrics(input.code)
    };

    return config;
  }

  detectLanguage(code) {
    // Simple language detection based on common patterns
    if (code.includes('function') && code.includes('const') && code.includes('=>')) {
      return 'javascript';
    }
    if (code.includes('def ') && code.includes('import ')) {
      return 'python';
    }
    if (code.includes('public class') && code.includes('static void main')) {
      return 'java';
    }
    if (code.includes('#include') && code.includes('int main')) {
      return 'c';
    }
    if (code.includes('func ') && code.includes('package ')) {
      return 'go';
    }
    if (code.includes('fn ') && code.includes('let ')) {
      return 'rust';
    }
    if (code.includes('<?php')) {
      return 'php';
    }
    if (code.includes('using System') && code.includes('namespace')) {
      return 'csharp';
    }
    
    return 'unknown';
  }

  calculateCodeMetrics(code) {
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const commentLines = lines.filter(line => this.isCommentLine(line.trim()));
    
    return {
      totalLines: lines.length,
      linesOfCode: nonEmptyLines.length,
      commentLines: commentLines.length,
      complexity: this.calculateCyclomaticComplexity(code),
      functionCount: this.countFunctions(code),
      classCount: this.countClasses(code)
    };
  }

  isCommentLine(line) {
    return line.startsWith('//') || 
           line.startsWith('#') || 
           line.startsWith('/*') || 
           line.startsWith('*') ||
           line.startsWith('"""') ||
           line.startsWith("'''");
  }

  calculateCyclomaticComplexity(code) {
    // Simple complexity calculation based on control flow keywords
    const complexityKeywords = [
      'if', 'else if', 'elif', 'while', 'for', 'foreach',
      'switch', 'case', 'catch', 'except', 'and', 'or', '&&', '||'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const keyword of complexityKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  countFunctions(code) {
    const functionPatterns = [
      /function\s+\w+/g,
      /def\s+\w+/g,
      /\w+\s*=>\s*{/g,
      /const\s+\w+\s*=\s*\(/g,
      /public\s+\w+\s+\w+\s*\(/g
    ];
    
    let count = 0;
    for (const pattern of functionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    
    return count;
  }

  countClasses(code) {
    const classPatterns = [
      /class\s+\w+/g,
      /interface\s+\w+/g,
      /struct\s+\w+/g
    ];
    
    let count = 0;
    for (const pattern of classPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    
    return count;
  }

  async validateCodeSyntax(config) {
    const context = { language: config.language };
    
    // Basic syntax validation
    this.validateField('code', config.code, ['valid_syntax'], context);
    
    // Language-specific validations
    switch (config.language) {
      case 'javascript':
        this.validateJavaScriptSyntax(config);
        break;
      case 'python':
        this.validatePythonSyntax(config);
        break;
      case 'java':
        this.validateJavaSyntax(config);
        break;
      default:
        this.validateGenericSyntax(config);
    }
  }

  validateJavaScriptSyntax(config) {
    const code = config.code;
    
    // Check for common JavaScript syntax issues
    if (!this.hasBalancedBraces(code)) {
      this.addError('Unbalanced braces in JavaScript code');
    }
    
    if (!this.hasBalancedParentheses(code)) {
      this.addError('Unbalanced parentheses in JavaScript code');
    }
    
    // Check for proper semicolon usage
    const statements = code.split('\n').filter(line => 
      line.trim() && 
      !line.trim().startsWith('//') && 
      !line.trim().includes('{') &&
      !line.trim().includes('}')
    );
    
    const missingSemicolons = statements.filter(stmt => 
      !stmt.trim().endsWith(';') && 
      !stmt.trim().endsWith('{') &&
      !stmt.trim().endsWith('}')
    );
    
    if (missingSemicolons.length > 0) {
      this.addWarning(`${missingSemicolons.length} statements missing semicolons`);
    }
  }

  validatePythonSyntax(config) {
    const code = config.code;
    
    // Check indentation consistency
    const lines = code.split('\n');
    const indentedLines = lines.filter(line => line.startsWith(' ') || line.startsWith('\t'));
    
    if (indentedLines.length > 0) {
      const hasSpaces = indentedLines.some(line => line.startsWith(' '));
      const hasTabs = indentedLines.some(line => line.startsWith('\t'));
      
      if (hasSpaces && hasTabs) {
        this.addError('Mixed tabs and spaces in Python code');
      }
    }
  }

  validateJavaSyntax(config) {
    const code = config.code;
    
    // Check for class declaration
    if (!code.includes('class ') && !code.includes('interface ')) {
      this.addWarning('No class or interface declaration found');
    }
    
    // Check for package declaration
    if (!code.includes('package ')) {
      this.addWarning('No package declaration found');
    }
  }

  validateGenericSyntax(config) {
    const code = config.code;
    
    if (!this.hasBalancedBraces(code)) {
      this.addError('Unbalanced braces in code');
    }
    
    if (!this.hasBalancedParentheses(code)) {
      this.addError('Unbalanced parentheses in code');
    }
  }

  hasBalancedBraces(code) {
    let count = 0;
    for (const char of code) {
      if (char === '{') count++;
      if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  hasBalancedParentheses(code) {
    let count = 0;
    for (const char of code) {
      if (char === '(') count++;
      if (char === ')') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  validateCodeQuality(config) {
    this.validateField('code', config.code, ['complexity_limit', 'has_comments'], config);
    
    // Check metrics against thresholds
    if (config.metrics.complexity > 10) {
      this.addWarning(`High cyclomatic complexity: ${config.metrics.complexity}`);
    }
    
    if (config.metrics.linesOfCode > 100 && config.metrics.commentLines === 0) {
      this.addWarning('Large file with no comments');
    }
    
    if (config.metrics.functionCount > 20) {
      this.addWarning(`High number of functions: ${config.metrics.functionCount}`);
    }
    
    // Check function length
    this.validateFunctionLength(config);
  }

  validateFunctionLength(config) {
    const functions = this.extractFunctions(config.code);
    
    functions.forEach((func, index) => {
      const lines = func.split('\n').length;
      if (lines > 50) {
        this.addWarning(`Function ${index + 1} is too long (${lines} lines)`);
      }
    });
  }

  extractFunctions(code) {
    // Simple function extraction (would need more sophisticated parsing for real use)
    const functions = [];
    const lines = code.split('\n');
    let currentFunction = [];
    let inFunction = false;
    let braceCount = 0;
    
    for (const line of lines) {
      if (line.includes('function ') || line.includes('def ')) {
        inFunction = true;
        currentFunction = [line];
        braceCount = 0;
      }
      
      if (inFunction) {
        currentFunction.push(line);
        
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        if (braceCount === 0 && currentFunction.length > 1) {
          functions.push(currentFunction.join('\n'));
          inFunction = false;
          currentFunction = [];
        }
      }
    }
    
    return functions;
  }

  validateCodeSecurity(config) {
    this.validateField('code', config.code, ['no_security_issues'], config);
    
    // Check for specific security patterns
    this.checkSQLInjection(config.code);
    this.checkXSSVulnerabilities(config.code);
    this.checkHardcodedSecrets(config.code);
  }

  checkSQLInjection(code) {
    const sqlInjectionPatterns = [
      /query\s*\+\s*['"`]/g,
      /execute\(.*\+.*\)/g,
      /sql.*\+.*['"`]/g
    ];
    
    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(code)) {
        this.addError('Potential SQL injection vulnerability detected');
        break;
      }
    }
  }

  checkXSSVulnerabilities(code) {
    const xssPatterns = [
      /innerHTML\s*=\s*[^'"`]*\+/g,
      /document\.write\(.*\+/g,
      /eval\(/g
    ];
    
    for (const pattern of xssPatterns) {
      if (pattern.test(code)) {
        this.addError('Potential XSS vulnerability detected');
        break;
      }
    }
  }

  checkHardcodedSecrets(code) {
    const secretPatterns = [
      /password\s*=\s*['"`][^'"`]+['"`]/gi,
      /api[_-]?key\s*=\s*['"`][^'"`]+['"`]/gi,
      /secret\s*=\s*['"`][^'"`]+['"`]/gi,
      /token\s*=\s*['"`][^'"`]+['"`]/gi
    ];
    
    for (const pattern of secretPatterns) {
      if (pattern.test(code)) {
        this.addError('Hardcoded secrets detected in code');
        break;
      }
    }
  }

  validateBestPractices(config) {
    this.validateField('code', config.code, ['proper_naming', 'proper_imports'], config);
    
    // Language-specific best practices
    switch (config.language) {
      case 'javascript':
        this.validateJavaScriptBestPractices(config);
        break;
      case 'python':
        this.validatePythonBestPractices(config);
        break;
    }
  }

  validateJavaScriptBestPractices(config) {
    const code = config.code;
    
    // Check for modern JavaScript features
    if (code.includes('var ') && !code.includes('let ') && !code.includes('const ')) {
      this.addSuggestion('Consider using let/const instead of var');
    }
    
    // Check for arrow functions
    if (code.includes('function(') && !code.includes('=>')) {
      this.addSuggestion('Consider using arrow functions for cleaner syntax');
    }
    
    // Check for async/await
    if (code.includes('.then(') && !code.includes('async ')) {
      this.addSuggestion('Consider using async/await instead of .then()');
    }
  }

  validatePythonBestPractices(config) {
    const code = config.code;
    
    // Check for list comprehensions
    if (code.includes('for ') && code.includes('append(')) {
      this.addSuggestion('Consider using list comprehensions for better readability');
    }
    
    // Check for f-strings
    if (code.includes('.format(') || code.includes('% ')) {
      this.addSuggestion('Consider using f-strings for string formatting');
    }
  }

  validateArchitecturePatterns(config) {
    // Check for common anti-patterns
    this.checkAntiPatterns(config);
    
    // Validate design patterns usage
    this.validateDesignPatterns(config);
  }

  checkAntiPatterns(config) {
    const code = config.code;
    
    // God object pattern
    if (config.metrics.linesOfCode > 500 && config.metrics.classCount === 1) {
      this.addWarning('Potential God Object anti-pattern detected');
    }
    
    // Long parameter list
    const longParameterMatches = code.match(/\([^)]{50,}\)/g);
    if (longParameterMatches && longParameterMatches.length > 0) {
      this.addWarning('Long parameter lists detected');
    }
  }

  validateDesignPatterns(config) {
    // This is a simplified check - in reality, pattern detection would be more sophisticated
    const code = config.code;
    
    if (code.includes('getInstance()')) {
      this.addSuggestion('Singleton pattern detected - ensure thread safety');
    }
    
    if (code.includes('Observable') || code.includes('subscribe')) {
      this.addSuggestion('Observer pattern detected - good for loose coupling');
    }
  }

  // Rule implementation methods
  validateSyntax(code, language) {
    try {
      // This would integrate with actual syntax parsers
      // For now, basic validation
      return this.hasBalancedBraces(code) && this.hasBalancedParentheses(code);
    } catch (error) {
      return false;
    }
  }

  checkSecurityIssues(code) {
    const hasSecurityIssues = 
      /eval\(/g.test(code) ||
      /innerHTML.*\+/g.test(code) ||
      /document\.write.*\+/g.test(code);
    
    return !hasSecurityIssues;
  }

  validateNamingConventions(code) {
    // Check for camelCase in JavaScript, snake_case in Python, etc.
    const hasGoodNaming = !/[a-z][A-Z][a-z].*_/g.test(code); // Mixed conventions
    return hasGoodNaming;
  }

  checkComplexity(code) {
    const complexity = this.calculateCyclomaticComplexity(code);
    return complexity <= 10; // McCabe's recommended limit
  }

  checkComments(code) {
    const lines = code.split('\n');
    const codeLines = lines.filter(line => line.trim() && !this.isCommentLine(line.trim()));
    const commentLines = lines.filter(line => this.isCommentLine(line.trim()));
    
    // Expect at least 10% comment ratio for files over 50 lines
    if (codeLines.length > 50) {
      return commentLines.length / codeLines.length >= 0.1;
    }
    
    return true;
  }

  checkDuplication(code) {
    const lines = code.split('\n').map(line => line.trim()).filter(line => line);
    const uniqueLines = new Set(lines);
    
    // Simple duplication check - if more than 20% of lines are duplicated
    return uniqueLines.size / lines.length >= 0.8;
  }

  validateImports(code, language) {
    const lines = code.split('\n');
    
    switch (language) {
      case 'javascript':
        return this.validateJavaScriptImports(lines);
      case 'python':
        return this.validatePythonImports(lines);
      default:
        return true;
    }
  }

  validateJavaScriptImports(lines) {
    const imports = lines.filter(line => line.trim().startsWith('import '));
    const requires = lines.filter(line => line.trim().startsWith('const ') && line.includes('require('));
    
    // Don't mix import and require
    return imports.length === 0 || requires.length === 0;
  }

  validatePythonImports(lines) {
    const imports = lines.filter(line => 
      line.trim().startsWith('import ') || line.trim().startsWith('from ')
    );
    
    // Check if imports are at the top of the file
    const firstImportIndex = lines.findIndex(line => 
      line.trim().startsWith('import ') || line.trim().startsWith('from ')
    );
    
    const nonEmptyLinesBeforeImports = lines
      .slice(0, firstImportIndex)
      .filter(line => line.trim() && !line.trim().startsWith('#'));
    
    return nonEmptyLinesBeforeImports.length === 0;
  }

  checkTestCoverage(code, context) {
    // Simple heuristic - look for test files or test functions
    const hasTests = 
      context.fileName && context.fileName.includes('test') ||
      code.includes('test(') ||
      code.includes('it(') ||
      code.includes('describe(') ||
      code.includes('def test_');
    
    return hasTests || code.length < 100; // Don't require tests for very small files
  }
}

module.exports = { CodeValidator };