/**
 * Security Analyzer
 *
 * Performs static analysis to detect common security issues without AI.
 * This provides immediate feedback while AI analysis runs in background.
 */

import type { SecurityFinding, SecurityLevel, FileContent } from './types';

// Pattern definitions for security issues
interface SecurityPattern {
  name: string;
  level: SecurityLevel;
  pattern: RegExp;
  description: string;
  fileTypes?: string[];
  risk: string;
  solution: string;
}

// Common security patterns to detect
const SECURITY_PATTERNS: SecurityPattern[] = [
  // Hardcoded secrets
  {
    name: 'Hardcoded API Key',
    level: 'critical',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{20,})['"`]/gi,
    description: 'Hardcoded API key detected in source code',
    risk: 'API keys in source code can be extracted and used by attackers',
    solution: 'Move API keys to environment variables and use .env files',
  },
  {
    name: 'Hardcoded Password',
    level: 'critical',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^'"`]+)['"`]/gi,
    description: 'Hardcoded password detected in source code',
    risk: 'Passwords in source code can be compromised if code is exposed',
    solution: 'Use environment variables or secure credential management',
  },
  {
    name: 'Hardcoded Secret',
    level: 'critical',
    pattern: /(?:secret|private[_-]?key)\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{16,})['"`]/gi,
    description: 'Hardcoded secret or private key detected',
    risk: 'Secrets in source code can lead to unauthorized access',
    solution: 'Store secrets in environment variables or a secrets manager',
  },
  {
    name: 'AWS Access Key',
    level: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS Access Key ID pattern detected',
    risk: 'Exposed AWS keys can lead to full cloud infrastructure compromise',
    solution: 'Use IAM roles or environment variables instead of hardcoded keys',
  },
  {
    name: 'Private Key Block',
    level: 'critical',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    description: 'Private key block detected in source code',
    risk: 'Exposed private keys allow impersonation and decryption',
    solution: 'Remove private keys from source code and use secure key management',
  },

  // SQL Injection
  {
    name: 'Potential SQL Injection',
    level: 'high',
    pattern: /(?:execute|query|raw)\s*\(\s*['"`].*\$\{.*\}.*['"`]/gi,
    description: 'SQL query with string interpolation detected',
    risk: 'SQL injection can lead to data theft or database destruction',
    solution: 'Use parameterized queries or prepared statements',
    fileTypes: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    name: 'SQL Query Concatenation',
    level: 'high',
    pattern: /['"`]SELECT\s+.*\+\s*(?:req\.|request\.|params\.|query\.)/gi,
    description: 'SQL query built with string concatenation from request data',
    risk: 'Direct concatenation of user input enables SQL injection',
    solution: 'Use ORM methods or parameterized queries',
    fileTypes: ['.ts', '.js', '.tsx', '.jsx'],
  },

  // XSS
  {
    name: 'Dangerous innerHTML',
    level: 'high',
    pattern: /innerHTML\s*=\s*(?!['"`]<)/g,
    description: 'Setting innerHTML with dynamic content',
    risk: 'XSS vulnerability allowing execution of malicious scripts',
    solution: 'Use textContent or sanitize HTML with DOMPurify',
    fileTypes: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    name: 'dangerouslySetInnerHTML',
    level: 'medium',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/g,
    description: 'React dangerouslySetInnerHTML usage detected',
    risk: 'Can lead to XSS if content is not properly sanitized',
    solution: 'Sanitize content with DOMPurify before using',
    fileTypes: ['.tsx', '.jsx'],
  },

  // Command Injection
  {
    name: 'Command Injection Risk',
    level: 'high',
    pattern: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*\$\{/g,
    description: 'Shell command with string interpolation',
    risk: 'Command injection can allow arbitrary code execution',
    solution: 'Use argument arrays instead of shell strings, validate input',
    fileTypes: ['.ts', '.js'],
  },
  {
    name: 'eval Usage',
    level: 'high',
    pattern: /\beval\s*\([^)]+\)/g,
    description: 'Use of eval() function',
    risk: 'eval() can execute arbitrary code if input is user-controlled',
    solution: 'Replace eval with safer alternatives like JSON.parse',
    fileTypes: ['.ts', '.js', '.tsx', '.jsx'],
  },

  // Authentication Issues
  {
    name: 'JWT Without Verification',
    level: 'high',
    pattern: /jwt\.decode\s*\(/g,
    description: 'JWT decoded without verification',
    risk: 'Unverified JWTs can be forged by attackers',
    solution: 'Use jwt.verify() with proper secret/key validation',
    fileTypes: ['.ts', '.js'],
  },
  {
    name: 'Weak JWT Algorithm',
    level: 'medium',
    pattern: /algorithm\s*:\s*['"`](?:HS256|none)['"`]/gi,
    description: 'Weak or disabled JWT algorithm detected',
    risk: 'Weak algorithms can be cracked or bypassed',
    solution: 'Use RS256 or ES256 algorithms for better security',
    fileTypes: ['.ts', '.js'],
  },

  // Insecure Configurations
  {
    name: 'CORS Allow All',
    level: 'medium',
    pattern: /(?:cors|Access-Control-Allow-Origin)\s*[:=]\s*['"`]\*['"`]/gi,
    description: 'CORS configured to allow all origins',
    risk: 'Any website can make authenticated requests to your API',
    solution: 'Specify allowed origins explicitly',
    fileTypes: ['.ts', '.js'],
  },
  {
    name: 'Disabled Security Headers',
    level: 'low',
    pattern: /helmet\s*\(\s*\{\s*[^}]*:\s*false/gi,
    description: 'Security headers explicitly disabled',
    risk: 'Missing security headers increase attack surface',
    solution: 'Enable all recommended security headers',
    fileTypes: ['.ts', '.js'],
  },

  // Data Exposure
  {
    name: 'Console Log Sensitive Data',
    level: 'low',
    pattern: /console\.log\s*\([^)]*(?:password|secret|token|key|credential)/gi,
    description: 'Potentially sensitive data in console.log',
    risk: 'Sensitive data may be exposed in logs',
    solution: 'Remove sensitive data from logs or use proper logging levels',
    fileTypes: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    name: 'Error Message Exposure',
    level: 'medium',
    pattern: /res\.(?:json|send)\s*\([^)]*(?:err|error)\.(?:message|stack)/gi,
    description: 'Error details exposed in API response',
    risk: 'Stack traces reveal implementation details to attackers',
    solution: 'Return generic error messages to clients',
    fileTypes: ['.ts', '.js'],
  },
];

/**
 * Analyzes files for security issues using pattern matching
 */
export function analyzeFilesForSecurity(files: FileContent[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    const fileFindings = analyzeFile(file);
    findings.push(...fileFindings);
  }

  return findings;
}

/**
 * Analyzes a single file for security issues
 */
function analyzeFile(file: FileContent): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const fileExtension = getFileExtension(file.path);

  for (const pattern of SECURITY_PATTERNS) {
    // Skip if pattern is for specific file types and this file doesn't match
    if (pattern.fileTypes && !pattern.fileTypes.includes(fileExtension)) {
      continue;
    }

    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;

    const matches = Array.from(file.content.matchAll(pattern.pattern));
    for (const match of matches) {
      // Skip if it looks like a test file or example
      if (isTestOrExample(file.path, file.content, match.index || 0)) {
        continue;
      }

      findings.push({
        title: pattern.name,
        level: pattern.level,
        description: `${pattern.description} in \`${file.path}\``,
        risk: pattern.risk,
        solutions: [pattern.solution],
        relevantFiles: [file.path],
      });

      // Only report first occurrence per pattern per file
      break;
    }
  }

  return findings;
}

/**
 * Gets the file extension from a path
 */
function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot >= 0 ? path.slice(lastDot) : '';
}

/**
 * Checks if the match is in a test file or example context
 */
function isTestOrExample(path: string, content: string, matchIndex: number): boolean {
  // Check if it's a test file
  if (/\.(test|spec)\.[jt]sx?$/.test(path) || /__(tests?|mocks?)__/.test(path)) {
    return true;
  }

  // Check if match is in a comment
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineContent = content.slice(lineStart, matchIndex);
  if (/^\s*(\/\/|\/\*|\*)/.test(lineContent)) {
    return true;
  }

  // Check for example/placeholder patterns near the match
  const context = content.slice(Math.max(0, matchIndex - 50), matchIndex + 50);
  if (/example|placeholder|todo|fixme|test/i.test(context)) {
    return true;
  }

  return false;
}

/**
 * Quick security check for a single file
 */
export function quickSecurityCheck(content: string, path: string): SecurityFinding[] {
  return analyzeFile({ path, content });
}

/**
 * Gets the severity score for sorting/prioritization
 */
export function getSeverityScore(level: SecurityLevel): number {
  switch (level) {
    case 'critical':
      return 100;
    case 'high':
      return 75;
    case 'medium':
      return 50;
    case 'low':
      return 25;
  }
}

/**
 * Calculates total security score (lower is worse)
 */
export function calculateSecurityScore(findings: SecurityFinding[]): number {
  if (findings.length === 0) return 100;

  const totalDeductions = findings.reduce((sum, finding) => {
    return sum + getSeverityScore(finding.level);
  }, 0);

  // Cap at 0
  return Math.max(0, 100 - totalDeductions);
}
