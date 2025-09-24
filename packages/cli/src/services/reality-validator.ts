/**
 * Reality Validation System - Ensures generated code has actual functionality
 */

import { GenerationResult, Logger } from 'recoder-shared';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: ValidationCategory;
  severity: 'error' | 'warning' | 'info';
  check: (context: ValidationContext) => Promise<ValidationResult>;
}

export interface ValidationContext {
  projectPath: string;
  files: string[];
  packageJson?: any;
  env?: Record<string, string>;
  options: ValidationOptions;
}

export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string;
  fixes?: string[];
  file?: string;
  line?: number;
}

export interface ValidationReport {
  projectPath: string;
  timestamp: Date;
  categories: {
    [key in ValidationCategory]: {
      passed: number;
      failed: number;
      warnings: number;
      rules: ValidationRuleResult[];
    };
  };
  summary: {
    totalRules: number;
    passed: number;
    failed: number;
    warnings: number;
    score: number;
  };
  fixes: string[];
}

export interface ValidationRuleResult {
  rule: ValidationRule;
  result: ValidationResult;
}

export interface ValidationOptions {
  includeCategories?: ValidationCategory[];
  excludeCategories?: ValidationCategory[];
  includeSeverity?: ('error' | 'warning' | 'info')[];
  customRules?: ValidationRule[];
  skipFilePatterns?: string[];
  maxFileSize?: number;
  timeout?: number;
}

export enum ValidationCategory {
  CODE_QUALITY = 'code_quality',
  INTEGRATION = 'integration',
  BLOCKCHAIN = 'blockchain',
  PRODUCTION = 'production'
}

export class RealityValidationSystem {
  validateGeneration(result: GenerationResult) {
    throw new Error('Method not implemented.');
  }
  private rules: ValidationRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.rules = [
      ...this.getCodeQualityRules(),
      ...this.getIntegrationRules(),
      ...this.getBlockchainRules(),
      ...this.getProductionRules()
    ];
  }

  public async validateProject(projectPath: string, options: ValidationOptions = {}): Promise<ValidationReport> {
    Logger.info('Starting reality validation', { projectPath });

    const context = await this.buildContext(projectPath, options);
    const applicableRules = this.filterRules(options);

    const report: ValidationReport = {
      projectPath,
      timestamp: new Date(),
      categories: {
        [ValidationCategory.CODE_QUALITY]: { passed: 0, failed: 0, warnings: 0, rules: [] },
        [ValidationCategory.INTEGRATION]: { passed: 0, failed: 0, warnings: 0, rules: [] },
        [ValidationCategory.BLOCKCHAIN]: { passed: 0, failed: 0, warnings: 0, rules: [] },
        [ValidationCategory.PRODUCTION]: { passed: 0, failed: 0, warnings: 0, rules: [] }
      },
      summary: { totalRules: 0, passed: 0, failed: 0, warnings: 0, score: 0 },
      fixes: []
    };

    for (const rule of applicableRules) {
      try {
        const result = await this.executeRule(rule, context);
        const ruleResult: ValidationRuleResult = { rule, result };
        
        report.categories[rule.category].rules.push(ruleResult);
        
        if (result.passed) {
          report.categories[rule.category].passed++;
        } else if (rule.severity === 'error') {
          report.categories[rule.category].failed++;
        } else if (rule.severity === 'warning') {
          report.categories[rule.category].warnings++;
        }

        if (result.fixes) {
          report.fixes.push(...result.fixes);
        }
      } catch (error) {
        Logger.error('Rule execution failed', { rule: rule.id, error });
      }
    }

    this.calculateSummary(report);
    return report;
  }

  private async buildContext(projectPath: string, options: ValidationOptions): Promise<ValidationContext> {
    const files = await this.getProjectFiles(projectPath, options);
    let packageJson;
    
    try {
      packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
    } catch (error) {
      // Package.json not found or invalid
    }

    return {
      projectPath,
      files,
      packageJson,
      env: process.env as Record<string, string>,
      options
    };
  }

  private async getProjectFiles(projectPath: string, options: ValidationOptions): Promise<string[]> {
    const patterns = [
      '**/*.ts',
      '**/*.js',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.json',
      '**/*.md',
      '**/*.sol',
      '**/*.py',
      '**/*.go',
      '**/*.rs',
      '**/*.java',
      '**/*.php',
      '**/*.rb',
      '**/*.cs',
      '**/*.cpp',
      '**/*.c'
    ];

    const ignore = [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      'coverage/**',
      '.next/**',
      '.nuxt/**',
      ...(options.skipFilePatterns || [])
    ];

    try {
      const fileMatches: string[] = [];
      for (const pattern of patterns) {
        try {
          // Use sync glob for simplicity  
          const globModule = await import('glob');
          const matches = globModule.sync(pattern, { cwd: projectPath });
          fileMatches.push(...matches.map(m => path.resolve(projectPath, m)));
        } catch (error) {
          Logger.warn(`Failed to process pattern ${pattern}:`, error);
          continue;
        }
      }

      if (options.maxFileSize) {
        const filteredFiles: string[] = [];
        for (const file of fileMatches) {
          try {
            const stats = await fs.stat(file);
            if (stats.size <= options.maxFileSize) {
              filteredFiles.push(file);
            }
          } catch (error) {
            // Skip files that can't be accessed
            continue;
          }
        }
        return filteredFiles;
      }

      return fileMatches;
    } catch (error) {
      Logger.warn('Failed to scan files:', error);
      return [];
    }
  }

  private filterRules(options: ValidationOptions): ValidationRule[] {
    let rules = [...this.rules];

    if (options.customRules) {
      rules.push(...options.customRules);
    }

    if (options.includeCategories) {
      rules = rules.filter(rule => options.includeCategories!.includes(rule.category));
    }

    if (options.excludeCategories) {
      rules = rules.filter(rule => !options.excludeCategories!.includes(rule.category));
    }

    if (options.includeSeverity) {
      rules = rules.filter(rule => options.includeSeverity!.includes(rule.severity));
    }

    return rules;
  }

  private async executeRule(rule: ValidationRule, context: ValidationContext): Promise<ValidationResult> {
    const timeout = context.options.timeout || 30000;
    
    return Promise.race([
      rule.check(context),
      new Promise<ValidationResult>((_, reject) => 
        setTimeout(() => reject(new Error('Rule timeout')), timeout)
      )
    ]);
  }

  private calculateSummary(report: ValidationReport): void {
    let totalRules = 0;
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    for (const category of Object.values(report.categories)) {
      totalRules += category.rules.length;
      passed += category.passed;
      failed += category.failed;
      warnings += category.warnings;
    }

    const score = totalRules > 0 ? Math.round((passed / totalRules) * 100) : 0;

    report.summary = {
      totalRules,
      passed,
      failed,
      warnings,
      score
    };
  }

  private getCodeQualityRules(): ValidationRule[] {
    return [
      {
        id: 'no-hardcoded-data',
        name: 'No Hardcoded Data',
        description: 'Ensure no hardcoded fake data is present',
        category: ValidationCategory.CODE_QUALITY,
        severity: 'error',
        check: async (context: ValidationContext) => {
          const patterns = [
            /const\s+\w+\s*=\s*\[\s*{[^}]*name\s*:\s*['"`]fake['"`]/i,
            /const\s+\w+\s*=\s*\[\s*{[^}]*title\s*:\s*['"`]test['"`]/i,
            /const\s+\w+\s*=\s*\[\s*{[^}]*email\s*:\s*['"`]test@example\.com['"`]/i,
            /const\s+\w+\s*=\s*\[\s*{[^}]*id\s*:\s*['"`]mock['"`]/i,
            /\/\*.*mock.*data.*\*\//i,
            /\/\/.*TODO.*replace.*with.*real.*data/i
          ];

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of patterns) {
                if (pattern.test(content)) {
                  return {
                    passed: false,
                    message: 'Hardcoded fake data detected',
                    details: `Found suspicious hardcoded data in ${path.basename(file)}`,
                    file,
                    fixes: [
                      'Replace hardcoded data with API calls',
                      'Use environment variables for configuration',
                      'Implement proper data fetching mechanisms'
                    ]
                  };
                }
              }
            }
          }

          return {
            passed: true,
            message: 'No hardcoded fake data detected'
          };
        }
      },
      {
        id: 'no-mock-api-responses',
        name: 'No Mock API Responses',
        description: 'Ensure no mock API responses are used in production code',
        category: ValidationCategory.CODE_QUALITY,
        severity: 'error',
        check: async (context: ValidationContext) => {
          const patterns = [
            /fetch\s*\(\s*['"`].*mock.*['"`]/i,
            /axios\s*\.\s*get\s*\(\s*['"`].*mock.*['"`]/i,
            /return\s*Promise\s*\.\s*resolve\s*\(\s*{.*mock.*}/i,
            /setTimeout\s*\(\s*\(\s*\)\s*=>\s*{.*resolve.*fake.*}/i,
            /\/\*.*mock.*response.*\*\//i
          ];

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of patterns) {
                if (pattern.test(content)) {
                  return {
                    passed: false,
                    message: 'Mock API responses detected',
                    details: `Found mock API responses in ${path.basename(file)}`,
                    file,
                    fixes: [
                      'Replace mock responses with real API endpoints',
                      'Use proper HTTP clients with real servers',
                      'Implement proper error handling for API calls'
                    ]
                  };
                }
              }
            }
          }

          return {
            passed: true,
            message: 'No mock API responses detected'
          };
        }
      },
      {
        id: 'no-placeholder-functions',
        name: 'No Placeholder Functions',
        description: 'Ensure no placeholder or TODO functions exist',
        category: ValidationCategory.CODE_QUALITY,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          const patterns = [
            /function\s+\w+\s*\([^)]*\)\s*{\s*\/\/\s*TODO/i,
            /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{\s*\/\/\s*TODO/i,
            /throw\s+new\s+Error\s*\(\s*['"`]Not\s+implemented['"`]/i,
            /console\.log\s*\(\s*['"`]TODO.*['"`]/i,
            /return\s*null;\s*\/\/\s*TODO/i
          ];

          const issues: string[] = [];

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of patterns) {
                if (pattern.test(content)) {
                  issues.push(path.basename(file));
                  break;
                }
              }
            }
          }

          if (issues.length > 0) {
            return {
              passed: false,
              message: 'Placeholder functions detected',
              details: `Found placeholder functions in: ${issues.join(', ')}`,
              fixes: [
                'Implement all placeholder functions',
                'Remove TODO comments and add real functionality',
                'Replace console.log statements with proper logging'
              ]
            };
          }

          return {
            passed: true,
            message: 'No placeholder functions detected'
          };
        }
      },
      {
        id: 'proper-error-handling',
        name: 'Proper Error Handling',
        description: 'Ensure proper error handling is implemented',
        category: ValidationCategory.CODE_QUALITY,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          let hasAsyncFunctions = false;
          let hasTryCatch = false;
          let hasErrorHandling = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              if (/async\s+function|async\s+\w+\s*\(|\w+\s*=\s*async\s*\(/i.test(content)) {
                hasAsyncFunctions = true;
              }
              
              if (/try\s*{[\s\S]*}\s*catch\s*\(/i.test(content)) {
                hasTryCatch = true;
              }
              
              if (/\.catch\s*\(|\.then\s*\([^)]*,\s*\w+\)|throw\s+new\s+Error/i.test(content)) {
                hasErrorHandling = true;
              }
            }
          }

          if (hasAsyncFunctions && !hasTryCatch && !hasErrorHandling) {
            return {
              passed: false,
              message: 'Insufficient error handling',
              details: 'Async functions found without proper error handling',
              fixes: [
                'Add try-catch blocks around async operations',
                'Implement proper error handling with .catch()',
                'Use proper error logging and recovery mechanisms'
              ]
            };
          }

          return {
            passed: true,
            message: 'Proper error handling implemented'
          };
        }
      }
    ];
  }

  private getIntegrationRules(): ValidationRule[] {
    return [
      {
        id: 'database-connection',
        name: 'Database Connection',
        description: 'Ensure database connections are properly configured',
        category: ValidationCategory.INTEGRATION,
        severity: 'error',
        check: async (context: ValidationContext) => {
          const dbPatterns = [
            /DATABASE_URL|DB_HOST|DB_CONNECTION/i,
            /mongoose\.connect|createConnection/i,
            /Pool\s*\(\s*{|Client\s*\(\s*{/i,
            /Sequelize\s*\(|TypeORM|Prisma/i
          ];

          let hasDbConfig = false;
          let hasDbConnection = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.env') || file.endsWith('.json')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of dbPatterns) {
                if (pattern.test(content)) {
                  hasDbConfig = true;
                  if (!/localhost|127\.0\.0\.1|example\.com/i.test(content)) {
                    hasDbConnection = true;
                  }
                  break;
                }
              }
            }
          }

          if (hasDbConfig && !hasDbConnection) {
            return {
              passed: false,
              message: 'Database configuration uses placeholder values',
              details: 'Database connection strings appear to use localhost or example values',
              fixes: [
                'Configure real database connection strings',
                'Set up proper database instances',
                'Use environment variables for database credentials'
              ]
            };
          }

          return {
            passed: true,
            message: 'Database connection properly configured'
          };
        }
      },
      {
        id: 'api-endpoints',
        name: 'Real API Endpoints',
        description: 'Ensure API endpoints are not using placeholder URLs',
        category: ValidationCategory.INTEGRATION,
        severity: 'error',
        check: async (context: ValidationContext) => {
          const suspiciousPatterns = [
            /['"`]https?:\/\/api\.example\.com/i,
            /['"`]https?:\/\/localhost:3000\/api/i,
            /['"`]https?:\/\/127\.0\.0\.1/i,
            /['"`]https?:\/\/jsonplaceholder\.typicode\.com/i,
            /['"`]https?:\/\/reqres\.in/i,
            /REACT_APP_API_URL.*localhost/i,
            /API_BASE_URL.*example/i
          ];

          const issues: string[] = [];

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.env')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of suspiciousPatterns) {
                if (pattern.test(content)) {
                  issues.push(path.basename(file));
                  break;
                }
              }
            }
          }

          if (issues.length > 0) {
            return {
              passed: false,
              message: 'Placeholder API endpoints detected',
              details: `Found placeholder endpoints in: ${issues.join(', ')}`,
              fixes: [
                'Replace example.com URLs with real API endpoints',
                'Configure production API base URLs',
                'Set up proper API versioning and endpoints'
              ]
            };
          }

          return {
            passed: true,
            message: 'API endpoints properly configured'
          };
        }
      },
      {
        id: 'authentication-flow',
        name: 'Authentication Flow',
        description: 'Ensure authentication flows are properly implemented',
        category: ValidationCategory.INTEGRATION,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          let hasAuthCode = false;
          let hasRealAuth = false;

          const authPatterns = [
            /jwt|JWT|token|Token/,
            /auth|Auth|login|Login/,
            /passport|oauth|OAuth/i,
            /session|Session/
          ];

          const realAuthPatterns = [
            /process\.env\.[A-Z_]*SECRET/,
            /process\.env\.[A-Z_]*KEY/,
            /bcrypt|argon2|scrypt/i,
            /jsonwebtoken|jose/i
          ];

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of authPatterns) {
                if (pattern.test(content)) {
                  hasAuthCode = true;
                  break;
                }
              }

              for (const pattern of realAuthPatterns) {
                if (pattern.test(content)) {
                  hasRealAuth = true;
                  break;
                }
              }
            }
          }

          if (hasAuthCode && !hasRealAuth) {
            return {
              passed: false,
              message: 'Authentication implementation appears incomplete',
              details: 'Found authentication code but no real security measures',
              fixes: [
                'Implement proper password hashing',
                'Add JWT token generation and validation',
                'Configure authentication middleware properly'
              ]
            };
          }

          return {
            passed: true,
            message: 'Authentication flow properly implemented'
          };
        }
      }
    ];
  }

  private getBlockchainRules(): ValidationRule[] {
    return [
      {
        id: 'smart-contract-deployment',
        name: 'Smart Contract Deployment',
        description: 'Ensure smart contracts are properly configured for deployment',
        category: ValidationCategory.BLOCKCHAIN,
        severity: 'error',
        check: async (context: ValidationContext) => {
          const solidityFiles = context.files.filter(f => f.endsWith('.sol'));
          
          if (solidityFiles.length === 0) {
            return {
              passed: true,
              message: 'No smart contracts found'
            };
          }

          let hasDeploymentConfig = false;
          let hasNetworkConfig = false;

          for (const file of context.files) {
            if (file.includes('hardhat.config') || file.includes('truffle.config') || file.includes('foundry.toml')) {
              hasDeploymentConfig = true;
              const content = await fs.readFile(file, 'utf8');
              
              if (!/localhost|127\.0\.0\.1|ganache/i.test(content) && 
                  /(mainnet|polygon|arbitrum|optimism|sepolia|goerli)/i.test(content)) {
                hasNetworkConfig = true;
              }
            }
          }

          if (hasDeploymentConfig && !hasNetworkConfig) {
            return {
              passed: false,
              message: 'Smart contract deployment uses only local networks',
              details: 'Found deployment configuration but only localhost/testnet networks',
              fixes: [
                'Configure mainnet and testnet deployment networks',
                'Add proper RPC URLs for different networks',
                'Set up deployment scripts for production networks'
              ]
            };
          }

          return {
            passed: true,
            message: 'Smart contract deployment properly configured'
          };
        }
      },
      {
        id: 'wallet-integration',
        name: 'Wallet Integration',
        description: 'Ensure wallet connections use real providers',
        category: ValidationCategory.BLOCKCHAIN,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          const walletPatterns = [
            /metamask|MetaMask/,
            /walletconnect|WalletConnect/i,
            /web3modal|Web3Modal/i,
            /wagmi|rainbow|Rainbow/i
          ];

          let hasWalletCode = false;
          let hasProviderConfig = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              for (const pattern of walletPatterns) {
                if (pattern.test(content)) {
                  hasWalletCode = true;
                  break;
                }
              }

              if (/INFURA_ID|ALCHEMY_ID|RPC_URL/i.test(content)) {
                hasProviderConfig = true;
              }
            }
          }

          if (hasWalletCode && !hasProviderConfig) {
            return {
              passed: false,
              message: 'Wallet integration lacks proper provider configuration',
              details: 'Found wallet connection code but no RPC provider configuration',
              fixes: [
                'Configure Infura, Alchemy, or other RPC providers',
                'Set up proper network configurations',
                'Add fallback providers for reliability'
              ]
            };
          }

          return {
            passed: true,
            message: 'Wallet integration properly configured'
          };
        }
      },
      {
        id: 'gas-optimization',
        name: 'Gas Optimization',
        description: 'Ensure gas calculations are properly implemented',
        category: ValidationCategory.BLOCKCHAIN,
        severity: 'info',
        check: async (context: ValidationContext) => {
          let hasGasEstimation = false;
          let hasGasPrice = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
              const content = await fs.readFile(file, 'utf8');
              
              if (/estimateGas|gasLimit|gasPrice/i.test(content)) {
                hasGasEstimation = true;
              }
              
              if (/maxFeePerGas|maxPriorityFeePerGas|gasPrice/i.test(content)) {
                hasGasPrice = true;
              }
            }
          }

          if (!hasGasEstimation || !hasGasPrice) {
            return {
              passed: false,
              message: 'Gas optimization not properly implemented',
              details: 'Missing gas estimation or gas price configuration',
              fixes: [
                'Implement gas estimation before transactions',
                'Configure dynamic gas pricing',
                'Add gas optimization strategies'
              ]
            };
          }

          return {
            passed: true,
            message: 'Gas optimization properly implemented'
          };
        }
      }
    ];
  }

  private getProductionRules(): ValidationRule[] {
    return [
      {
        id: 'security-headers',
        name: 'Security Headers',
        description: 'Ensure security headers are properly configured',
        category: ValidationCategory.PRODUCTION,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          let hasSecurityConfig = false;
          let hasHelmet = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json')) {
              const content = await fs.readFile(file, 'utf8');
              
              if (/helmet|cors|csp|content-security-policy/i.test(content)) {
                hasSecurityConfig = true;
              }
              
              if (/app\.use\s*\(\s*helmet|helmet\s*\(\s*\)/i.test(content)) {
                hasHelmet = true;
              }
            }
          }

          if (!hasSecurityConfig && !hasHelmet) {
            return {
              passed: false,
              message: 'Security headers not configured',
              details: 'No security middleware or headers configuration found',
              fixes: [
                'Install and configure helmet.js',
                'Add CORS configuration',
                'Implement Content Security Policy',
                'Add rate limiting middleware'
              ]
            };
          }

          return {
            passed: true,
            message: 'Security headers properly configured'
          };
        }
      },
      {
        id: 'environment-variables',
        name: 'Environment Variables',
        description: 'Ensure environment variables are properly configured',
        category: ValidationCategory.PRODUCTION,
        severity: 'error',
        check: async (context: ValidationContext) => {
          let hasEnvFile = false;
          let hasEnvExample = false;
          let hasEnvValidation = false;

          for (const file of context.files) {
            if (file.endsWith('.env')) {
              hasEnvFile = true;
            }
            if (file.endsWith('.env.example')) {
              hasEnvExample = true;
            }
            if (file.endsWith('.ts') || file.endsWith('.js')) {
              const content = await fs.readFile(file, 'utf8');
              if (/dotenv|process\.env|env\./.test(content)) {
                hasEnvValidation = true;
              }
            }
          }

          if (!hasEnvFile || !hasEnvExample) {
            return {
              passed: false,
              message: 'Environment configuration incomplete',
              details: 'Missing .env or .env.example files',
              fixes: [
                'Create .env file with required variables',
                'Add .env.example with sample values',
                'Document all required environment variables'
              ]
            };
          }

          return {
            passed: true,
            message: 'Environment variables properly configured'
          };
        }
      },
      {
        id: 'logging-monitoring',
        name: 'Logging and Monitoring',
        description: 'Ensure logging and monitoring are properly set up',
        category: ValidationCategory.PRODUCTION,
        severity: 'warning',
        check: async (context: ValidationContext) => {
          let hasLogging = false;
          let hasMonitoring = false;

          for (const file of context.files) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json')) {
              const content = await fs.readFile(file, 'utf8');
              
              if (/winston|pino|bunyan|logger/i.test(content)) {
                hasLogging = true;
              }
              
              if (/sentry|datadog|newrelic|prometheus|grafana/i.test(content)) {
                hasMonitoring = true;
              }
            }
          }

          if (!hasLogging) {
            return {
              passed: false,
              message: 'Logging not properly configured',
              details: 'No structured logging framework found',
              fixes: [
                'Install and configure Winston or Pino',
                'Add structured logging throughout application',
                'Configure log levels and outputs'
              ]
            };
          }

          return {
            passed: true,
            message: 'Logging and monitoring properly configured'
          };
        }
      },
      {
        id: 'deployment-scripts',
        name: 'Deployment Scripts',
        description: 'Ensure deployment scripts are ready for production',
        category: ValidationCategory.PRODUCTION,
        severity: 'info',
        check: async (context: ValidationContext) => {
          let hasDeploymentConfig = false;
          let hasDockerfile = false;
          let hasCIConfig = false;

          for (const file of context.files) {
            const filename = path.basename(file);
            
            if (filename === 'Dockerfile' || filename === 'docker-compose.yml') {
              hasDockerfile = true;
            }
            
            if (filename.includes('.yml') || filename.includes('.yaml')) {
              const content = await fs.readFile(file, 'utf8');
              if (/deploy|build|ci|cd/i.test(content)) {
                hasCIConfig = true;
              }
            }
            
            if (filename.includes('deploy') || filename.includes('build')) {
              hasDeploymentConfig = true;
            }
          }

          if (!hasDeploymentConfig && !hasDockerfile && !hasCIConfig) {
            return {
              passed: false,
              message: 'Deployment configuration not found',
              details: 'No deployment scripts, Dockerfile, or CI/CD configuration found',
              fixes: [
                'Create Dockerfile for containerization',
                'Add deployment scripts',
                'Configure CI/CD pipelines',
                'Document deployment process'
              ]
            };
          }

          return {
            passed: true,
            message: 'Deployment scripts properly configured'
          };
        }
      }
    ];
  }
}