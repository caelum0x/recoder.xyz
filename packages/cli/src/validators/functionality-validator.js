const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');
const { CodeValidator } = require('./code-validator');
const { IntegrationValidator } = require('./integration-validator');
const { SecurityValidator } = require('./security-validator');

class FunctionalityValidator {
  constructor() {
    this.codeValidator = new CodeValidator();
    this.integrationValidator = new IntegrationValidator();
    this.securityValidator = new SecurityValidator();
    
    this.validationRules = {
      // CRITICAL: No mock/placeholder code allowed
      noMockCode: {
        patterns: [
          /\/\*\s*TODO:/gi,
          /\/\/\s*TODO:/gi,
          /console\.log\(['"`]mock/gi,
          /placeholder/gi,
          /fake\s*data/gi,
          /dummy\s*data/gi,
          /\{\s*\/\*\s*mock\s*\*\/\s*\}/gi,
          /return\s*\{\s*mock:/gi,
          /fetch\(['"`]\/mock/gi
        ],
        severity: 'critical',
        message: 'Mock/placeholder code detected - must implement real functionality'
      },
      
      // Real API endpoints and database operations
      realApiEndpoints: {
        required: [
          /app\.get\(|app\.post\(|app\.put\(|app\.delete\(/gi,
          /router\.get\(|router\.post\(|router\.put\(|router\.delete\(/gi,
          /export\s+async\s+function/gi
        ],
        severity: 'high',
        message: 'Real API endpoints must be implemented'
      },
      
      // Database operations
      realDatabaseOps: {
        required: [
          /prisma\.\w+\.create|prisma\.\w+\.update|prisma\.\w+\.findMany/gi,
          /db\.\w+\.insert|db\.\w+\.update|db\.\w+\.select/gi,
          /mongoose\.\w+\.create|mongoose\.\w+\.findOne/gi
        ],
        severity: 'high',
        message: 'Real database operations must be implemented'
      },
      
      // Authentication implementation
      realAuth: {
        required: [
          /bcrypt\.hash|bcrypt\.compare/gi,
          /jwt\.sign|jwt\.verify/gi,
          /passport\.authenticate/gi,
          /NextAuth/gi
        ],
        severity: 'high',
        message: 'Real authentication system must be implemented'
      },
      
      // Error handling
      errorHandling: {
        required: [
          /try\s*\{[\s\S]*catch\s*\(/gi,
          /\.catch\(/gi,
          /throw\s+new\s+Error/gi,
          /error\s*=>/gi
        ],
        severity: 'medium',
        message: 'Proper error handling must be implemented'
      },
      
      // Input validation
      inputValidation: {
        required: [
          /joi\.validate|Joi\./gi,
          /yup\.validate|yup\./gi,
          /zod\.parse|z\./gi,
          /express-validator/gi
        ],
        severity: 'high',
        message: 'Input validation must be implemented'
      }
    };
  }

  async validateProject(projectPath, plan) {
    try {
      logger.info('Starting comprehensive functionality validation...');
      
      const validationResults = {
        overall: 'pending',
        score: 0,
        maxScore: 0,
        categories: {
          functionality: await this.validateFunctionality(projectPath, plan),
          integrations: await this.validateIntegrations(projectPath, plan),
          security: await this.validateSecurity(projectPath, plan),
          performance: await this.validatePerformance(projectPath, plan),
          production: await this.validateProductionReadiness(projectPath, plan)
        },
        issues: [],
        recommendations: []
      };

      // Calculate overall score
      validationResults.score = this.calculateOverallScore(validationResults.categories);
      validationResults.maxScore = this.calculateMaxScore(validationResults.categories);
      
      // Determine overall result
      const scorePercentage = (validationResults.score / validationResults.maxScore) * 100;
      if (scorePercentage >= 90) {
        validationResults.overall = 'excellent';
      } else if (scorePercentage >= 75) {
        validationResults.overall = 'good';
      } else if (scorePercentage >= 50) {
        validationResults.overall = 'needs_improvement';
      } else {
        validationResults.overall = 'critical_issues';
      }

      // Collect all issues and recommendations
      Object.values(validationResults.categories).forEach(category => {
        validationResults.issues.push(...(category.issues || []));
        validationResults.recommendations.push(...(category.recommendations || []));
      });

      logger.info(`Validation completed. Score: ${validationResults.score}/${validationResults.maxScore} (${scorePercentage.toFixed(1)}%)`);
      
      return validationResults;
    } catch (error) {
      throw new Error(`Functionality validation failed: ${error.message}`);
    }
  }

  async validateFunctionality(projectPath, plan) {
    logger.debug('Validating core functionality...');
    
    const results = {
      status: 'pending',
      score: 0,
      maxScore: 100,
      checks: [],
      issues: [],
      recommendations: []
    };

    try {
      // Get all source files
      const sourceFiles = await this.getSourceFiles(projectPath);
      
      // Validate each rule
      for (const [ruleName, rule] of Object.entries(this.validationRules)) {
        const ruleResult = await this.validateRule(sourceFiles, ruleName, rule);
        results.checks.push(ruleResult);
        
        if (ruleResult.passed) {
          results.score += ruleResult.points;
        } else {
          results.issues.push({
            type: 'functionality',
            severity: rule.severity,
            message: rule.message,
            files: ruleResult.failedFiles
          });
        }
      }

      // Validate specific functionality based on project type
      const typeSpecificResult = await this.validateTypeSpecificFunctionality(sourceFiles, plan);
      results.checks.push(...typeSpecificResult.checks);
      results.score += typeSpecificResult.score;
      results.issues.push(...typeSpecificResult.issues);

      // Determine status
      const scorePercentage = (results.score / results.maxScore) * 100;
      if (scorePercentage >= 80) {
        results.status = 'pass';
      } else if (scorePercentage >= 60) {
        results.status = 'warning';
      } else {
        results.status = 'fail';
      }

      return results;
    } catch (error) {
      results.status = 'error';
      results.issues.push({
        type: 'validation_error',
        severity: 'critical',
        message: `Functionality validation error: ${error.message}`
      });
      return results;
    }
  }

  async validateRule(sourceFiles, ruleName, rule) {
    const result = {
      name: ruleName,
      passed: false,
      points: this.getSeverityPoints(rule.severity),
      failedFiles: [],
      message: rule.message
    };

    for (const filePath of sourceFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        if (rule.patterns) {
          // Check for forbidden patterns (e.g., mock code)
          for (const pattern of rule.patterns) {
            if (pattern.test(content)) {
              result.failedFiles.push({
                path: filePath,
                matches: this.getMatches(content, pattern)
              });
            }
          }
          // For forbidden patterns, passing means NO matches found
          result.passed = result.failedFiles.length === 0;
        }
        
        if (rule.required) {
          // Check for required patterns (e.g., real API endpoints)
          let hasRequired = false;
          for (const pattern of rule.required) {
            if (pattern.test(content)) {
              hasRequired = true;
              break;
            }
          }
          if (!hasRequired && this.isRelevantFile(filePath, ruleName)) {
            result.failedFiles.push({
              path: filePath,
              reason: 'Missing required implementation'
            });
          }
        }
      } catch (error) {
        logger.warn(`Error reading file ${filePath}: ${error.message}`);
      }
    }

    // For required patterns, passing means at least one file has the pattern
    if (rule.required) {
      const relevantFiles = sourceFiles.filter(f => this.isRelevantFile(f, ruleName));
      result.passed = relevantFiles.length === 0 || result.failedFiles.length < relevantFiles.length;
    }

    return result;
  }

  async validateTypeSpecificFunctionality(sourceFiles, plan) {
    const results = {
      checks: [],
      score: 0,
      issues: []
    };

    switch (plan.type) {
      case 'blockchain':
        const blockchainResult = await this.validateBlockchainFunctionality(sourceFiles, plan);
        results.checks.push(...blockchainResult.checks);
        results.score += blockchainResult.score;
        results.issues.push(...blockchainResult.issues);
        break;
        
      case 'ai':
        const aiResult = await this.validateAIFunctionality(sourceFiles, plan);
        results.checks.push(...aiResult.checks);
        results.score += aiResult.score;
        results.issues.push(...aiResult.issues);
        break;
        
      case 'web':
      case 'fullstack':
        const webResult = await this.validateWebFunctionality(sourceFiles, plan);
        results.checks.push(...webResult.checks);
        results.score += webResult.score;
        results.issues.push(...webResult.issues);
        break;
    }

    return results;
  }

  async validateBlockchainFunctionality(sourceFiles, plan) {
    const checks = [];
    const issues = [];
    let score = 0;
    const maxPoints = 20;

    // Check for real Solana integration
    const solanaCheck = {
      name: 'Real Solana Integration',
      passed: false,
      points: 10,
      message: 'Must implement real Solana blockchain interactions'
    };

    const solanaPatterns = [
      /@solana\/web3\.js/gi,
      /Connection\(/gi,
      /PublicKey\(/gi,
      /Transaction\(/gi,
      /sendAndConfirmTransaction/gi
    ];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const hasRealSolana = solanaPatterns.some(pattern => pattern.test(content));
      
      if (hasRealSolana) {
        solanaCheck.passed = true;
        score += solanaCheck.points;
        break;
      }
    }

    if (!solanaCheck.passed) {
      issues.push({
        type: 'blockchain',
        severity: 'critical',
        message: 'Missing real Solana blockchain integration - found only mock/placeholder code'
      });
    }

    checks.push(solanaCheck);

    // Check for wallet integration
    const walletCheck = {
      name: 'Wallet Integration',
      passed: false,
      points: 10,
      message: 'Must implement real wallet connection and transaction signing'
    };

    const walletPatterns = [
      /@solana\/wallet-adapter/gi,
      /useWallet\(/gi,
      /wallet\.signTransaction/gi,
      /wallet\.signAllTransactions/gi
    ];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const hasWalletIntegration = walletPatterns.some(pattern => pattern.test(content));
      
      if (hasWalletIntegration) {
        walletCheck.passed = true;
        score += walletCheck.points;
        break;
      }
    }

    if (!walletCheck.passed) {
      issues.push({
        type: 'blockchain',
        severity: 'high',
        message: 'Missing wallet integration - users cannot connect wallets or sign transactions'
      });
    }

    checks.push(walletCheck);

    return { checks, score, issues };
  }

  async validateAIFunctionality(sourceFiles, plan) {
    const checks = [];
    const issues = [];
    let score = 0;

    // Check for real AI API integration
    const aiApiCheck = {
      name: 'Real AI API Integration',
      passed: false,
      points: 15,
      message: 'Must implement real AI model API calls'
    };

    const aiPatterns = [
      /openai\.chat\.completions\.create/gi,
      /anthropic\.messages\.create/gi,
      /await\s+fetch.*openai\.com/gi,
      /await\s+fetch.*api\.anthropic\.com/gi
    ];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const hasRealAI = aiPatterns.some(pattern => pattern.test(content));
      
      if (hasRealAI) {
        aiApiCheck.passed = true;
        score += aiApiCheck.points;
        break;
      }
    }

    if (!aiApiCheck.passed) {
      issues.push({
        type: 'ai',
        severity: 'critical',
        message: 'Missing real AI API integration - found only mock responses'
      });
    }

    checks.push(aiApiCheck);

    return { checks, score, issues };
  }

  async validateWebFunctionality(sourceFiles, plan) {
    const checks = [];
    const issues = [];
    let score = 0;

    // Check for real API routes
    const apiRoutesCheck = {
      name: 'Real API Routes',
      passed: false,
      points: 10,
      message: 'Must implement real API endpoints with business logic'
    };

    const apiPatterns = [
      /export\s+async\s+function\s+(GET|POST|PUT|DELETE)/gi,
      /app\.(get|post|put|delete)\(/gi,
      /router\.(get|post|put|delete)\(/gi
    ];

    let hasApiRoutes = false;
    for (const filePath of sourceFiles) {
      if (filePath.includes('/api/') || filePath.includes('/routes/')) {
        const content = await fs.readFile(filePath, 'utf8');
        const hasRealApi = apiPatterns.some(pattern => pattern.test(content));
        
        if (hasRealApi) {
          hasApiRoutes = true;
          break;
        }
      }
    }

    apiRoutesCheck.passed = hasApiRoutes;
    if (hasApiRoutes) {
      score += apiRoutesCheck.points;
    } else {
      issues.push({
        type: 'web',
        severity: 'high',
        message: 'Missing real API routes - found only placeholder endpoints'
      });
    }

    checks.push(apiRoutesCheck);

    return { checks, score, issues };
  }

  async validateIntegrations(projectPath, plan) {
    return await this.integrationValidator.validate(projectPath, plan.integrations || []);
  }

  async validateSecurity(projectPath, plan) {
    return await this.securityValidator.validate(projectPath, plan);
  }

  async validatePerformance(projectPath, plan) {
    logger.debug('Validating performance optimizations...');
    
    const results = {
      status: 'pending',
      score: 0,
      maxScore: 50,
      checks: [],
      issues: [],
      recommendations: []
    };

    try {
      const sourceFiles = await this.getSourceFiles(projectPath);
      
      // Check for performance optimizations
      const optimizations = [
        {
          name: 'Database Query Optimization',
          patterns: [/\.select\(/gi, /\.include\(/gi, /\.where\(/gi],
          points: 10,
          message: 'Database queries should be optimized with proper select and include clauses'
        },
        {
          name: 'Caching Implementation',
          patterns: [/redis/gi, /cache/gi, /useSWR/gi, /react-query/gi],
          points: 10,
          message: 'Caching should be implemented for better performance'
        },
        {
          name: 'Image Optimization',
          patterns: [/next\/image/gi, /Image\s+from/gi, /\.webp/gi],
          points: 10,
          message: 'Images should be optimized using proper libraries'
        },
        {
          name: 'Code Splitting',
          patterns: [/dynamic\s*\(/gi, /lazy\s*\(/gi, /import\s*\(/gi],
          points: 10,
          message: 'Code splitting should be implemented for better load times'
        },
        {
          name: 'Bundle Optimization',
          patterns: [/webpack\.config/gi, /next\.config/gi, /vite\.config/gi],
          points: 10,
          message: 'Bundle optimization configuration should be present'
        }
      ];

      for (const optimization of optimizations) {
        const hasOptimization = sourceFiles.some(async (filePath) => {
          const content = await fs.readFile(filePath, 'utf8');
          return optimization.patterns.some(pattern => pattern.test(content));
        });

        const check = {
          name: optimization.name,
          passed: hasOptimization,
          points: optimization.points,
          message: optimization.message
        };

        if (hasOptimization) {
          results.score += optimization.points;
        } else {
          results.recommendations.push({
            type: 'performance',
            message: optimization.message
          });
        }

        results.checks.push(check);
      }

      // Determine status
      const scorePercentage = (results.score / results.maxScore) * 100;
      results.status = scorePercentage >= 70 ? 'pass' : scorePercentage >= 40 ? 'warning' : 'fail';

      return results;
    } catch (error) {
      results.status = 'error';
      results.issues.push({
        type: 'validation_error',
        severity: 'medium',
        message: `Performance validation error: ${error.message}`
      });
      return results;
    }
  }

  async validateProductionReadiness(projectPath, plan) {
    logger.debug('Validating production readiness...');
    
    const results = {
      status: 'pending',
      score: 0,
      maxScore: 80,
      checks: [],
      issues: [],
      recommendations: []
    };

    try {
      // Check for essential production files
      const requiredFiles = [
        { name: 'package.json', points: 5 },
        { name: '.env.example', points: 5 },
        { name: 'README.md', points: 5 },
        { name: 'Dockerfile', points: 10 },
        { name: 'docker-compose.yml', points: 5 },
        { name: '.github/workflows', points: 10, isDirectory: true },
        { name: 'tests', points: 15, isDirectory: true },
        { name: 'docs', points: 10, isDirectory: true }
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(projectPath, file.name);
        const exists = await fs.pathExists(filePath);
        
        if (file.isDirectory) {
          const isDir = exists && (await fs.stat(filePath)).isDirectory();
          const check = {
            name: `${file.name} directory`,
            passed: isDir,
            points: file.points,
            message: `${file.name} directory should exist for production deployment`
          };
          
          if (isDir) {
            results.score += file.points;
          } else {
            results.issues.push({
              type: 'production',
              severity: 'medium',
              message: `Missing ${file.name} directory`
            });
          }
          
          results.checks.push(check);
        } else {
          const check = {
            name: file.name,
            passed: exists,
            points: file.points,
            message: `${file.name} should exist for proper project setup`
          };
          
          if (exists) {
            results.score += file.points;
          } else {
            results.issues.push({
              type: 'production',
              severity: 'medium',
              message: `Missing ${file.name} file`
            });
          }
          
          results.checks.push(check);
        }
      }

      // Check for environment configuration
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fs.pathExists(envExamplePath)) {
        const envContent = await fs.readFile(envExamplePath, 'utf8');
        const hasProperEnvVars = envContent.includes('DATABASE_URL') && 
                                 envContent.includes('NODE_ENV') &&
                                 !envContent.includes('your-secret-here');
        
        const envCheck = {
          name: 'Environment Configuration',
          passed: hasProperEnvVars,
          points: 15,
          message: 'Environment variables should be properly configured'
        };
        
        if (hasProperEnvVars) {
          results.score += 15;
        } else {
          results.issues.push({
            type: 'production',
            severity: 'high',
            message: 'Environment configuration is incomplete or contains placeholder values'
          });
        }
        
        results.checks.push(envCheck);
      }

      // Determine status
      const scorePercentage = (results.score / results.maxScore) * 100;
      results.status = scorePercentage >= 80 ? 'pass' : scorePercentage >= 60 ? 'warning' : 'fail';

      return results;
    } catch (error) {
      results.status = 'error';
      results.issues.push({
        type: 'validation_error',
        severity: 'high',
        message: `Production readiness validation error: ${error.message}`
      });
      return results;
    }
  }

  async getSourceFiles(projectPath) {
    const sourceFiles = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte'];
    
    async function scanDirectory(dir) {
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            // Skip node_modules and other irrelevant directories
            if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(item.name)) {
              await scanDirectory(fullPath);
            }
          } else if (item.isFile()) {
            const ext = path.extname(item.name);
            if (extensions.includes(ext)) {
              sourceFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        logger.warn(`Error scanning directory ${dir}: ${error.message}`);
      }
    }
    
    await scanDirectory(projectPath);
    return sourceFiles;
  }

  getMatches(content, pattern) {
    const matches = [];
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lines = content.substring(0, match.index).split('\n');
      matches.push({
        text: match[0],
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      });
    }
    return matches;
  }

  isRelevantFile(filePath, ruleName) {
    const relevanceMap = {
      realApiEndpoints: ['/api/', '/routes/', '/controllers/'],
      realDatabaseOps: ['/models/', '/database/', '/db/', '/prisma/'],
      realAuth: ['/auth/', '/middleware/', '/guards/'],
      errorHandling: ['.js', '.ts', '.jsx', '.tsx'],
      inputValidation: ['/api/', '/routes/', '/controllers/', '/validators/']
    };

    const relevantPaths = relevanceMap[ruleName] || [];
    return relevantPaths.some(relPath => filePath.includes(relPath));
  }

  getSeverityPoints(severity) {
    const points = {
      critical: 25,
      high: 20,
      medium: 15,
      low: 10
    };
    return points[severity] || 10;
  }

  calculateOverallScore(categories) {
    return Object.values(categories).reduce((total, category) => total + category.score, 0);
  }

  calculateMaxScore(categories) {
    return Object.values(categories).reduce((total, category) => total + category.maxScore, 0);
  }
}

module.exports = { FunctionalityValidator };