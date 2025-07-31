/**
 * Secret Detection and Prevention System
 * Prevents API keys, passwords, and sensitive data from being leaked in generated code
 * Provides real-time scanning, pattern matching, and automatic remediation
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Logger } from '@recoder/shared';

export interface SecretPattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1 scale
  category: 'api_key' | 'password' | 'token' | 'certificate' | 'database' | 'cloud' | 'generic';
  provider?: string; // AWS, GitHub, Google, etc.
  entropy?: number; // Expected entropy for validation
  examples: string[];
  falsePositivePatterns?: RegExp[];
  validationUrl?: string; // URL to validate if secret is real
}

export interface SecretDetection {
  id: string;
  pattern: SecretPattern;
  match: string;
  redactedMatch: string;
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
  entropy: number;
  verified: boolean;
  remediation: {
    action: 'remove' | 'redact' | 'replace' | 'warn';
    replacement: string;
    explanation: string;
  };
  metadata: {
    timestamp: number;
    userId?: string;
    sessionId?: string;
    scanType: 'pre_generation' | 'post_generation' | 'file_scan' | 'realtime';
  };
}

export interface ScanResult {
  scanId: string;
  timestamp: number;
  target: string;
  totalFiles: number;
  scannedFiles: number;
  totalDetections: number;
  detections: SecretDetection[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    verified: number;
    falsePositives: number;
  };
  remediated: boolean;
  duration: number;
}

export interface SecretDetectorConfig {
  enabled: boolean;
  scanGenerated: boolean;
  scanUploaded: boolean;
  scanRealtime: boolean;
  autoRemediate: boolean;
  alertOnDetection: boolean;
  maxFileSize: number;
  excludePatterns: string[];
  customPatterns: SecretPattern[];
  verificationEnabled: boolean;
  verificationTimeout: number;
}

export class SecretDetector {
  private readonly logger = new Logger('SecretDetector');
  private readonly config: SecretDetectorConfig;
  private readonly patterns: Map<string, SecretPattern> = new Map();
  private readonly detectionHistory: Map<string, SecretDetection[]> = new Map();

  constructor(config?: Partial<SecretDetectorConfig>) {
    this.config = {
      enabled: true,
      scanGenerated: true,
      scanUploaded: true,
      scanRealtime: false,
      autoRemediate: true,
      alertOnDetection: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      excludePatterns: ['node_modules/**', '.git/**', '*.min.js', '*.map'],
      customPatterns: [],
      verificationEnabled: false, // Disabled by default to avoid external calls
      verificationTimeout: 5000,
      ...config,
    };

    this.loadSecretPatterns();
    this.loadCustomPatterns();
  }

  /**
   * Scan text for secrets
   */
  async scanText(
    text: string,
    context: {
      file?: string;
      userId?: string;
      sessionId?: string;
      scanType: 'pre_generation' | 'post_generation' | 'file_scan' | 'realtime';
    }
  ): Promise<SecretDetection[]> {
    if (!this.config.enabled) {
      return [];
    }

    const detections: SecretDetection[] = [];
    const lines = text.split('\n');

    for (const [patternId, pattern] of this.patterns) {
      const matches = text.matchAll(pattern.pattern);

      for (const match of matches) {
        const matchText = match[0];
        const matchIndex = match.index || 0;

        // Skip if this looks like a false positive
        if (this.isFalsePositive(matchText, pattern)) {
          continue;
        }

        // Calculate entropy to reduce false positives
        const entropy = this.calculateEntropy(matchText);
        if (pattern.entropy && entropy < pattern.entropy) {
          continue;
        }

        // Get line and column information
        const lineInfo = this.getLineInfo(text, matchIndex);
        const contextLine = lines[lineInfo.line - 1] || '';

        // Calculate confidence score
        const confidence = this.calculateConfidence(matchText, pattern, contextLine);

        // Skip low confidence matches unless they're critical patterns
        if (confidence < 0.3 && pattern.severity !== 'critical') {
          continue;
        }

        const detection: SecretDetection = {
          id: this.generateDetectionId(),
          pattern,
          match: matchText,
          redactedMatch: this.redactSecret(matchText),
          file: context.file || 'generated_code',
          line: lineInfo.line,
          column: lineInfo.column,
          context: contextLine,
          confidence,
          entropy,
          verified: false,
          remediation: this.generateRemediation(matchText, pattern, contextLine),
          metadata: {
            timestamp: Date.now(),
            userId: context.userId,
            sessionId: context.sessionId,
            scanType: context.scanType,
          },
        };

        detections.push(detection);
      }
    }

    // Verify secrets if enabled
    if (this.config.verificationEnabled) {
      await this.verifySecrets(detections);
    }

    // Store detection history
    const sessionKey = context.sessionId || 'default';
    const existingDetections = this.detectionHistory.get(sessionKey) || [];
    this.detectionHistory.set(sessionKey, [...existingDetections, ...detections]);

    // Alert on critical detections
    if (this.config.alertOnDetection && detections.length > 0) {
      await this.alertOnDetections(detections);
    }

    return detections.sort((a, b) => {
      // Sort by severity then confidence
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      if (severityOrder[a.pattern.severity] !== severityOrder[b.pattern.severity]) {
        return severityOrder[b.pattern.severity] - severityOrder[a.pattern.severity];
      }
      return b.confidence - a.confidence;
    });
  }

  /**
   * Scan file for secrets
   */
  async scanFile(filePath: string, context?: { userId?: string; sessionId?: string }): Promise<SecretDetection[]> {
    try {
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxFileSize) {
        this.logger.warn(`File too large to scan: ${filePath} (${stats.size} bytes)`);
        return [];
      }

      // Check if file should be excluded
      const relativePath = path.relative(process.cwd(), filePath);
      if (this.shouldExcludeFile(relativePath)) {
        return [];
      }

      // Read and scan file
      const content = await fs.readFile(filePath, 'utf8');
      return await this.scanText(content, {
        file: filePath,
        userId: context?.userId,
        sessionId: context?.sessionId,
        scanType: 'file_scan',
      });

    } catch (error) {
      this.logger.error(`Failed to scan file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Scan directory recursively
   */
  async scanDirectory(
    dirPath: string,
    context?: { userId?: string; sessionId?: string }
  ): Promise<ScanResult> {
    const scanId = this.generateScanId();
    const startTime = Date.now();
    
    this.logger.info(`Starting secret scan: ${scanId} on ${dirPath}`);

    try {
      const files = await this.getFilesToScan(dirPath);
      const allDetections: SecretDetection[] = [];
      let scannedFiles = 0;

      for (const file of files) {
        try {
          const detections = await this.scanFile(file, context);
          allDetections.push(...detections);
          scannedFiles++;
        } catch (error) {
          this.logger.warn(`Failed to scan ${file}:`, error);
        }
      }

      const result: ScanResult = {
        scanId,
        timestamp: startTime,
        target: dirPath,
        totalFiles: files.length,
        scannedFiles,
        totalDetections: allDetections.length,
        detections: allDetections,
        summary: {
          critical: allDetections.filter(d => d.pattern.severity === 'critical').length,
          high: allDetections.filter(d => d.pattern.severity === 'high').length,
          medium: allDetections.filter(d => d.pattern.severity === 'medium').length,
          low: allDetections.filter(d => d.pattern.severity === 'low').length,
          verified: allDetections.filter(d => d.verified).length,
          falsePositives: allDetections.filter(d => d.confidence < 0.5).length,
        },
        remediated: false,
        duration: Date.now() - startTime,
      };

      // Auto-remediate if enabled
      if (this.config.autoRemediate && allDetections.length > 0) {
        await this.remediateDetections(allDetections);
        result.remediated = true;
      }

      this.logger.info(`Scan completed: ${allDetections.length} secrets detected in ${scannedFiles} files`);
      
      return result;

    } catch (error) {
      this.logger.error('Directory scan failed:', error);
      throw error;
    }
  }

  /**
   * Remediate detected secrets by removing or replacing them
   */
  async remediateText(text: string, detections: SecretDetection[]): Promise<string> {
    if (!this.config.autoRemediate || detections.length === 0) {
      return text;
    }

    let remediatedText = text;
    
    // Sort detections by position (reverse order to maintain indices)
    const sortedDetections = [...detections].sort((a, b) => {
      const aIndex = text.indexOf(a.match);
      const bIndex = text.indexOf(b.match);
      return bIndex - aIndex;
    });

    for (const detection of sortedDetections) {
      const { action, replacement } = detection.remediation;
      
      switch (action) {
        case 'remove':
          remediatedText = remediatedText.replace(detection.match, '');
          break;
        case 'redact':
          remediatedText = remediatedText.replace(detection.match, detection.redactedMatch);
          break;
        case 'replace':
          remediatedText = remediatedText.replace(detection.match, replacement);
          break;
        case 'warn':
          // Add warning comment
          const warningComment = `// WARNING: Potential secret detected and removed\n`;
          remediatedText = remediatedText.replace(detection.match, warningComment + replacement);
          break;
      }
    }

    return remediatedText;
  }

  /**
   * Add custom secret pattern
   */
  addCustomPattern(pattern: SecretPattern): void {
    this.patterns.set(pattern.id, pattern);
    this.logger.info(`Added custom secret pattern: ${pattern.name}`);
  }

  /**
   * Remove custom pattern
   */
  removeCustomPattern(patternId: string): void {
    if (this.patterns.delete(patternId)) {
      this.logger.info(`Removed custom pattern: ${patternId}`);
    }
  }

  /**
   * Get detection statistics
   */
  getStatistics(): {
    patternsLoaded: number;
    totalDetections: number;
    criticalDetections: number;
    verifiedDetections: number;
    sessionsScanned: number;
  } {
    const allDetections = Array.from(this.detectionHistory.values()).flat();
    
    return {
      patternsLoaded: this.patterns.size,
      totalDetections: allDetections.length,
      criticalDetections: allDetections.filter(d => d.pattern.severity === 'critical').length,
      verifiedDetections: allDetections.filter(d => d.verified).length,
      sessionsScanned: this.detectionHistory.size,
    };
  }

  /**
   * Load built-in secret patterns
   */
  private loadSecretPatterns(): void {
    const patterns: SecretPattern[] = [
      // AWS Access Keys
      {
        id: 'aws-access-key',
        name: 'AWS Access Key ID',
        description: 'Amazon Web Services access key identifier',
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: 'critical',
        confidence: 0.9,
        category: 'cloud',
        provider: 'AWS',
        entropy: 4.5,
        examples: ['AKIAIOSFODNN7EXAMPLE'],
        validationUrl: 'https://sts.amazonaws.com/',
      },
      
      // AWS Secret Keys
      {
        id: 'aws-secret-key',
        name: 'AWS Secret Access Key',
        description: 'Amazon Web Services secret access key',
        pattern: /[A-Za-z0-9/+=]{40}/g,
        severity: 'critical',
        confidence: 0.7,
        category: 'cloud',
        provider: 'AWS',
        entropy: 5.0,
        examples: ['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
      },

      // GitHub Personal Access Tokens
      {
        id: 'github-token',
        name: 'GitHub Personal Access Token',
        description: 'GitHub personal access token',
        pattern: /ghp_[a-zA-Z0-9]{36}/g,
        severity: 'high',
        confidence: 0.95,
        category: 'token',
        provider: 'GitHub',
        entropy: 5.2,
        examples: ['ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
      },

      // GitHub OAuth Tokens
      {
        id: 'github-oauth',
        name: 'GitHub OAuth Token',
        description: 'GitHub OAuth access token',
        pattern: /gho_[a-zA-Z0-9]{36}/g,
        severity: 'high',
        confidence: 0.95,
        category: 'token',
        provider: 'GitHub',
        examples: ['gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
      },

      // Slack Tokens
      {
        id: 'slack-token',
        name: 'Slack Token',
        description: 'Slack API token',
        pattern: /xox[baprs]-([0-9a-zA-Z]{10,48})?/g,
        severity: 'high',
        confidence: 0.9,
        category: 'api_key',
        provider: 'Slack',
        examples: ['xoxb-1234567890123-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxx'],
      },

      // Google API Keys
      {
        id: 'google-api-key',
        name: 'Google API Key',
        description: 'Google Cloud Platform API key',
        pattern: /AIza[0-9A-Za-z\-_]{35}/g,
        severity: 'high',
        confidence: 0.9,
        category: 'api_key',
        provider: 'Google',
        examples: ['AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe'],
      },

      // JWT Tokens
      {
        id: 'jwt-token',
        name: 'JWT Token',
        description: 'JSON Web Token',
        pattern: /eyJ[a-zA-Z0-9=]+\.[a-zA-Z0-9=]+\.[a-zA-Z0-9=\-_+/]*/g,
        severity: 'medium',
        confidence: 0.8,
        category: 'token',
        entropy: 4.8,
        examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'],
      },

      // Private Keys
      {
        id: 'private-key-rsa',
        name: 'RSA Private Key',
        description: 'RSA private key',
        pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
        severity: 'critical',
        confidence: 0.95,
        category: 'certificate',
        examples: ['-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'],
      },

      // Database URLs
      {
        id: 'database-url',
        name: 'Database Connection URL',
        description: 'Database connection string with credentials',
        pattern: /(mysql|postgres|mongodb|redis):\/\/[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-!@#$%^&*()]+@[a-zA-Z0-9\-._]+:[0-9]+\/[a-zA-Z0-9_\-]+/g,
        severity: 'critical',
        confidence: 0.85,
        category: 'database',
        examples: ['postgres://user:password@localhost:5432/database'],
      },

      // Generic API Keys
      {
        id: 'generic-api-key',
        name: 'Generic API Key',
        description: 'Generic API key pattern',
        pattern: /['"](api_key|apikey|api-key|secret|password|token)['"]\s*[:=]\s*['"][a-zA-Z0-9\-_!@#$%^&*()+=]{16,}['"]/gi,
        severity: 'medium',
        confidence: 0.6,
        category: 'api_key',
        entropy: 4.0,
        examples: ['"api_key": "sk_live_1234567890abcdef"'],
        falsePositivePatterns: [
          /placeholder/i,
          /example/i,
          /test/i,
          /demo/i,
          /\*\*\*\*/,
          /xxx/i,
        ],
      },

      // Stripe Keys
      {
        id: 'stripe-secret-key',
        name: 'Stripe Secret Key',
        description: 'Stripe secret API key',
        pattern: /sk_(test|live)_[a-zA-Z0-9]{24,34}/g,
        severity: 'critical',
        confidence: 0.95,
        category: 'api_key',
        provider: 'Stripe',
        examples: ['sk_test_1234567890abcdef1234567890ab'],
      },

      // SendGrid API Keys
      {
        id: 'sendgrid-api-key',
        name: 'SendGrid API Key',
        description: 'SendGrid email service API key',
        pattern: /SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43}/g,
        severity: 'high',
        confidence: 0.9,
        category: 'api_key',
        provider: 'SendGrid',
        examples: ['SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
      },

      // Password patterns
      {
        id: 'hardcoded-password',
        name: 'Hardcoded Password',
        description: 'Hardcoded password in source code',
        pattern: /(password|pwd|pass)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
        severity: 'high',
        confidence: 0.7,
        category: 'password',
        examples: ['password: "mySecretPassword123"'],
        falsePositivePatterns: [
          /password.*placeholder/i,
          /password.*example/i,
          /\*\*\*\*/,
        ],
      },
    ];

    // Load patterns into map
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }

    this.logger.info(`Loaded ${patterns.length} built-in secret patterns`);
  }

  /**
   * Load custom patterns from configuration
   */
  private loadCustomPatterns(): void {
    for (const pattern of this.config.customPatterns) {
      this.patterns.set(pattern.id, pattern);
    }
    
    if (this.config.customPatterns.length > 0) {
      this.logger.info(`Loaded ${this.config.customPatterns.length} custom secret patterns`);
    }
  }

  /**
   * Check if match is a false positive
   */
  private isFalsePositive(match: string, pattern: SecretPattern): boolean {
    if (!pattern.falsePositivePatterns) {
      return false;
    }

    return pattern.falsePositivePatterns.some(fpPattern => fpPattern.test(match));
  }

  /**
   * Calculate entropy of a string
   */
  private calculateEntropy(str: string): number {
    const charCounts = new Map<string, number>();
    
    for (const char of str) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }
    
    let entropy = 0;
    const length = str.length;
    
    for (const count of charCounts.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  }

  /**
   * Calculate confidence score for a detection
   */
  private calculateConfidence(match: string, pattern: SecretPattern, context: string): number {
    let confidence = pattern.confidence;
    
    // Adjust based on entropy
    const entropy = this.calculateEntropy(match);
    if (pattern.entropy && entropy < pattern.entropy) {
      confidence *= 0.7; // Reduce confidence for low entropy
    }
    
    // Adjust based on context
    const suspiciousContext = /config|env|secret|key|token|password|credential/i.test(context);
    if (suspiciousContext) {
      confidence *= 1.2; // Increase confidence
    }
    
    // Check for test/example indicators
    const testIndicators = /test|example|demo|placeholder|mock|fake/i.test(context);
    if (testIndicators) {
      confidence *= 0.5; // Reduce confidence significantly
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Generate remediation strategy for a detection
   */
  private generateRemediation(match: string, pattern: SecretPattern, context: string): {
    action: 'remove' | 'redact' | 'replace' | 'warn';
    replacement: string;
    explanation: string;
  } {
    const redacted = this.redactSecret(match);
    
    // Critical secrets should be removed entirely
    if (pattern.severity === 'critical') {
      return {
        action: 'remove',
        replacement: '',
        explanation: `Critical secret (${pattern.name}) detected and removed for security`,
      };
    }
    
    // API keys and tokens should be replaced with environment variables
    if (pattern.category === 'api_key' || pattern.category === 'token') {
      const envVarName = this.generateEnvVarName(pattern.name);
      return {
        action: 'replace',
        replacement: `process.env.${envVarName}`,
        explanation: `Replaced ${pattern.name} with environment variable reference`,
      };
    }
    
    // Passwords should be replaced with secure references
    if (pattern.category === 'password') {
      return {
        action: 'replace',
        replacement: 'process.env.PASSWORD',
        explanation: 'Replaced hardcoded password with environment variable',
      };
    }
    
    // Default to redaction
    return {
      action: 'redact',
      replacement: redacted,
      explanation: `Redacted ${pattern.name} for security`,
    };
  }

  /**
   * Redact secret by showing only first and last few characters
   */
  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    
    const start = secret.substring(0, 3);
    const end = secret.substring(secret.length - 3);
    const middle = '*'.repeat(secret.length - 6);
    
    return start + middle + end;
  }

  /**
   * Generate environment variable name from pattern name
   */
  private generateEnvVarName(patternName: string): string {
    return patternName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Get line and column information for character index
   */
  private getLineInfo(text: string, index: number): { line: number; column: number } {
    const lines = text.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * Check if file should be excluded from scanning
   */
  private shouldExcludeFile(filePath: string): boolean {
    return this.config.excludePatterns.some(pattern => {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      
      return new RegExp(regexPattern).test(filePath);
    });
  }

  /**
   * Get files to scan in directory
   */
  private async getFilesToScan(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!this.shouldExcludeFile(path.relative(dirPath, fullPath))) {
            await scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          if (!this.shouldExcludeFile(path.relative(dirPath, fullPath))) {
            files.push(fullPath);
          }
        }
      }
    };
    
    await scanDir(dirPath);
    return files;
  }

  /**
   * Verify if detected secrets are real (optional)
   */
  private async verifySecrets(detections: SecretDetection[]): Promise<void> {
    // This would make external API calls to verify if secrets are valid
    // Disabled by default for security and privacy reasons
    
    for (const detection of detections) {
      // Placeholder - in real implementation, this would:
      // 1. Make safe API calls to verify if the secret is valid
      // 2. Update the 'verified' field accordingly
      // 3. Handle rate limiting and errors gracefully
      
      // For now, just mark high-confidence detections as potentially verified
      detection.verified = detection.confidence > 0.8;
    }
  }

  /**
   * Alert on critical secret detections
   */
  private async alertOnDetections(detections: SecretDetection[]): Promise<void> {
    const criticalDetections = detections.filter(d => d.pattern.severity === 'critical');
    
    if (criticalDetections.length > 0) {
      this.logger.error(`SECURITY ALERT: ${criticalDetections.length} critical secrets detected!`);
      
      for (const detection of criticalDetections) {
        this.logger.error(`Critical secret: ${detection.pattern.name} in ${detection.file}:${detection.line}`);
      }
    }
  }

  /**
   * Remediate detections by modifying files
   */
  private async remediateDetections(detections: SecretDetection[]): Promise<void> {
    // Group detections by file
    const fileDetections = new Map<string, SecretDetection[]>();
    
    for (const detection of detections) {
      const existing = fileDetections.get(detection.file) || [];
      existing.push(detection);
      fileDetections.set(detection.file, existing);
    }
    
    // Remediate each file
    for (const [filePath, fileDetectionList] of fileDetections) {
      try {
        if (filePath !== 'generated_code') {
          const content = await fs.readFile(filePath, 'utf8');
          const remediatedContent = await this.remediateText(content, fileDetectionList);
          await fs.writeFile(filePath, remediatedContent);
          
          this.logger.info(`Remediated ${fileDetectionList.length} secrets in ${filePath}`);
        }
      } catch (error) {
        this.logger.error(`Failed to remediate ${filePath}:`, error);
      }
    }
  }

  /**
   * Generate unique detection ID
   */
  private generateDetectionId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate unique scan ID
   */
  private generateScanId(): string {
    return `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}