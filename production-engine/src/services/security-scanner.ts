/**
 * Security Scanner Service
 * Scans generated code for security vulnerabilities and best practices
 */

interface SecurityRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: RegExp;
  message: string;
}

interface SecurityVulnerability {
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  line?: number;
  column?: number;
  evidence: string;
  file: string;
  suggestion?: string;
}

interface SecurityScanResult {
  score: number; // 0-100
  vulnerabilities: SecurityVulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  passed: boolean;
  scanTime: number;
}

export class SecurityScanner {
  private rules: SecurityRule[] = [
    // XSS Prevention
    {
      id: 'xss-innerHTML',
      name: 'Dangerous innerHTML Usage',
      description: 'innerHTML can lead to XSS vulnerabilities',
      severity: 'high',
      pattern: /\.innerHTML\s*=\s*[^;]+/gi,
      message: 'Avoid using innerHTML with user data. Use textContent or proper sanitization.'
    },
    {
      id: 'xss-eval',
      name: 'Eval Usage',
      description: 'eval() can execute arbitrary code',
      severity: 'critical',
      pattern: /\beval\s*\(/gi,
      message: 'Never use eval(). It can execute arbitrary code and lead to code injection attacks.'
    },
    {
      id: 'xss-document-write',
      name: 'Document Write Usage',
      description: 'document.write can lead to XSS',
      severity: 'medium',
      pattern: /document\.write\s*\(/gi,
      message: 'Avoid document.write as it can lead to XSS vulnerabilities.'
    },

    // SQL Injection Prevention
    {
      id: 'sql-injection-concat',
      name: 'SQL Query Concatenation',
      description: 'String concatenation in SQL queries can lead to injection',
      severity: 'critical',
      pattern: /["'`]\s*\+\s*[^"'`]+\s*\+\s*["'`][^"'`]*SELECT|INSERT|UPDATE|DELETE/gi,
      message: 'Use parameterized queries instead of string concatenation to prevent SQL injection.'
    },

    // Authentication & Authorization
    {
      id: 'weak-jwt-secret',
      name: 'Weak JWT Secret',
      description: 'JWT secret appears to be hardcoded or weak',
      severity: 'high',
      pattern: /(jwt|token).*secret.*["'`](secret|123|password|key|token)["'`]/gi,
      message: 'Use strong, randomly generated JWT secrets from environment variables.'
    },
    {
      id: 'hardcoded-credentials',
      name: 'Hardcoded Credentials',
      description: 'Hardcoded passwords or API keys detected',
      severity: 'critical',
      pattern: /(password|api_key|secret_key|access_key)\s*[:=]\s*["'`][^"'`]{8,}/gi,
      message: 'Never hardcode credentials. Use environment variables or secure vaults.'
    },

    // HTTPS & Security Headers
    {
      id: 'http-urls',
      name: 'HTTP URLs in Production',
      description: 'HTTP URLs should use HTTPS in production',
      severity: 'medium',
      pattern: /["'`]http:\/\/[^"'`]*["'`]/gi,
      message: 'Use HTTPS URLs in production to ensure encrypted communication.'
    },
    {
      id: 'missing-csrf-protection',
      name: 'Potential CSRF Vulnerability',
      description: 'Form submissions without CSRF protection',
      severity: 'high',
      pattern: /<form[^>]*method\s*=\s*["']post["'][^>]*>/gi,
      message: 'Implement CSRF protection for form submissions.'
    },

    // Input Validation
    {
      id: 'no-input-validation',
      name: 'Missing Input Validation',
      description: 'User input used without validation',
      severity: 'high',
      pattern: /(req\.body|req\.query|req\.params)[^;]*without.*validation/gi,
      message: 'Always validate user input before processing.'
    },

    // File Upload Security
    {
      id: 'unsafe-file-upload',
      name: 'Unsafe File Upload',
      description: 'File uploads without proper validation',
      severity: 'high',
      pattern: /multer|upload.*file/gi,
      message: 'Implement proper file type, size, and content validation for uploads.'
    },

    // Node.js Specific
    {
      id: 'path-traversal',
      name: 'Path Traversal Vulnerability',
      description: 'Potential path traversal attack',
      severity: 'high',
      pattern: /\.\.[\/\\]/g,
      message: 'Validate and sanitize file paths to prevent directory traversal attacks.'
    },
    {
      id: 'unsafe-redirect',
      name: 'Unsafe Redirect',
      description: 'Unvalidated redirects can lead to phishing',
      severity: 'medium',
      pattern: /redirect\s*\([^)]*req\./gi,
      message: 'Validate redirect URLs to prevent open redirect attacks.'
    },

    // React/Frontend Specific
    {
      id: 'react-dangerously-set',
      name: 'Dangerous React HTML',
      description: 'dangerouslySetInnerHTML without sanitization',
      severity: 'high',
      pattern: /dangerouslySetInnerHTML/gi,
      message: 'Sanitize HTML content when using dangerouslySetInnerHTML.'
    },

    // General Security
    {
      id: 'console-log-sensitive',
      name: 'Logging Sensitive Data',
      description: 'Console.log might expose sensitive information',
      severity: 'low',
      pattern: /console\.log.*[^)]*(?:password|token|key|secret|credential)/gi,
      message: 'Avoid logging sensitive information like passwords or tokens.'
    },
    {
      id: 'weak-randomness',
      name: 'Weak Random Number Generation',
      description: 'Math.random() is not cryptographically secure',
      severity: 'medium',
      pattern: /Math\.random\(\)/gi,
      message: 'Use crypto.randomBytes() for cryptographically secure random numbers.'
    }
  ];

  async scanCode(files: Array<{ path: string; content: string; type: string }>): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const vulnerabilities: SecurityVulnerability[] = [];

    for (const file of files) {
      if (file.type !== 'code') continue;

      const fileVulnerabilities = this.scanFile(file.content, file.path);
      vulnerabilities.push(...fileVulnerabilities);
    }

    const summary = this.calculateSummary(vulnerabilities);
    const score = this.calculateSecurityScore(summary);
    const scanTime = Date.now() - startTime;

    return {
      score,
      vulnerabilities,
      summary,
      passed: score >= 70 && summary.critical === 0, // Pass if score >= 70 and no critical issues
      scanTime
    };
  }

  private scanFile(content: string, filePath: string): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];
    const lines = content.split('\n');

    for (const rule of this.rules) {
      let match;
      let searchContent = content;
      let lineOffset = 0;

      while ((match = rule.pattern.exec(searchContent)) !== null) {
        const beforeMatch = searchContent.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length + lineOffset;
        const column = match.index - beforeMatch.lastIndexOf('\n');

        vulnerabilities.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          line: lineNumber,
          column: column,
          evidence: match[0].trim(),
          file: filePath,
          suggestion: this.getSuggestion(rule.id)
        });

        // Prevent infinite loops
        if (!rule.pattern.global) break;
      }

      // Reset regex state
      rule.pattern.lastIndex = 0;
    }

    return vulnerabilities;
  }

  private calculateSummary(vulnerabilities: SecurityVulnerability[]) {
    const summary = {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length
    };

    return summary;
  }

  private calculateSecurityScore(summary: { critical: number; high: number; medium: number; low: number }): number {
    // Base score starts at 100
    let score = 100;

    // Deduct points based on severity
    score -= summary.critical * 25;  // Critical: -25 points each
    score -= summary.high * 15;      // High: -15 points each  
    score -= summary.medium * 8;     // Medium: -8 points each
    score -= summary.low * 3;        // Low: -3 points each

    // Ensure score doesn't go below 0
    return Math.max(0, score);
  }

  private getSuggestion(ruleId: string): string | undefined {
    const suggestions: Record<string, string> = {
      'xss-innerHTML': 'Use textContent, or sanitize with DOMPurify before setting innerHTML.',
      'xss-eval': 'Use JSON.parse() for data or Function constructor for dynamic code generation.',
      'sql-injection-concat': 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = ?", [userId])',
      'weak-jwt-secret': 'Generate strong secret: crypto.randomBytes(64).toString("hex")',
      'hardcoded-credentials': 'Use environment variables: process.env.API_KEY',
      'http-urls': 'Replace http:// with https:// for production URLs',
      'missing-csrf-protection': 'Add CSRF middleware: app.use(csrf())',
      'path-traversal': 'Use path.resolve() and validate against allowed directories',
      'react-dangerously-set': 'Sanitize HTML with DOMPurify before setting',
      'weak-randomness': 'Use crypto.randomBytes() for secure random generation'
    };

    return suggestions[ruleId];
  }

  // Additional security checks for specific frameworks/technologies
  async scanReactApp(files: Array<{ path: string; content: string; type: string }>): Promise<SecurityScanResult> {
    const baseResult = await this.scanCode(files);
    
    // Add React-specific security checks
    const reactVulnerabilities = this.scanReactSpecific(files);
    baseResult.vulnerabilities.push(...reactVulnerabilities);
    
    // Recalculate summary and score
    baseResult.summary = this.calculateSummary(baseResult.vulnerabilities);
    baseResult.score = this.calculateSecurityScore(baseResult.summary);
    baseResult.passed = baseResult.score >= 70 && baseResult.summary.critical === 0;

    return baseResult;
  }

  private scanReactSpecific(files: Array<{ path: string; content: string; type: string }>): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];

    for (const file of files) {
      if (file.type !== 'code') continue;

      // Check for missing key props in lists
      const missingKeyPattern = /\.map\s*\([^)]*\)\s*=>\s*<[^>]*(?!key=)/gi;
      let match;
      while ((match = missingKeyPattern.exec(file.content)) !== null) {
        vulnerabilities.push({
          ruleId: 'react-missing-key',
          severity: 'low',
          message: 'Missing key prop in list rendering can cause React reconciliation issues',
          evidence: match[0],
          file: file.path,
          suggestion: 'Add unique key prop: <Component key={item.id} ... />'
        });
      }

      // Check for direct DOM manipulation
      const domManipulationPattern = /document\.(getElementById|querySelector|createElement)/gi;
      domManipulationPattern.lastIndex = 0;
      while ((match = domManipulationPattern.exec(file.content)) !== null) {
        vulnerabilities.push({
          ruleId: 'react-dom-manipulation',
          severity: 'medium',
          message: 'Direct DOM manipulation bypasses React\'s virtual DOM and can cause issues',
          evidence: match[0],
          file: file.path,
          suggestion: 'Use React refs or state management instead of direct DOM manipulation'
        });
      }
    }

    return vulnerabilities;
  }

  // Get security recommendations based on project type
  getSecurityRecommendations(projectType: string): string[] {
    const commonRecommendations = [
      'Always validate and sanitize user input',
      'Use HTTPS in production environments',
      'Implement proper authentication and authorization',
      'Keep dependencies updated to latest secure versions',
      'Use environment variables for sensitive configuration',
      'Implement proper error handling without exposing sensitive information',
      'Add security headers (CORS, CSP, etc.)',
      'Implement rate limiting for API endpoints'
    ];

    const typeSpecificRecommendations: Record<string, string[]> = {
      web: [
        'Implement Content Security Policy (CSP)',
        'Use SameSite cookies for CSRF protection',
        'Sanitize HTML content before rendering',
        'Implement proper session management'
      ],
      backend: [
        'Use parameterized queries for database operations',
        'Implement input validation middleware',
        'Add request size limits',
        'Use secure session storage',
        'Implement API authentication (JWT, API keys)',
        'Add logging and monitoring for security events'
      ],
      mobile: [
        'Implement certificate pinning',
        'Use secure storage for sensitive data',
        'Implement proper deep link validation',
        'Add runtime application self-protection (RASP)'
      ],
      blockchain: [
        'Audit smart contracts for reentrancy attacks',
        'Implement proper access controls',
        'Use secure random number generation',
        'Validate all external calls',
        'Implement emergency pause functionality'
      ]
    };

    return [
      ...commonRecommendations,
      ...(typeSpecificRecommendations[projectType] || [])
    ];
  }
}

export default SecurityScanner;