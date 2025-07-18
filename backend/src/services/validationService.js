const { CodeValidator } = require('../validators/codeValidator');
const { IntegrationValidator } = require('../validators/integrationValidator');
const { BlockchainValidator } = require('../validators/blockchainValidator');
const { ApiValidator } = require('../validators/apiValidator');
const { DeploymentValidator } = require('../validators/deploymentValidator');
const { logger } = require('../utils/logger');

class ValidationService {
  constructor() {
    this.validators = {
      code: new CodeValidator(),
      integration: new IntegrationValidator(),
      blockchain: new BlockchainValidator(),
      api: new ApiValidator(),
      deployment: new DeploymentValidator()
    };
    
    this.validationRules = new Map();
    this.loadDefaultRules();
  }

  /**
   * Run complete validation suite
   * @param {string} projectPath - Path to the project directory
   * @param {array} validationTypes - Types of validation to run
   * @param {object} options - Validation options
   * @returns {object} Complete validation results
   */
  async runCompleteValidation(projectPath, validationTypes, options = {}) {
    try {
      const {
        parallel = true,
        stopOnError = false,
        generateReport = true
      } = options;

      logger.info('Running complete validation suite', {
        projectPath,
        validationTypes,
        parallel,
        stopOnError
      });

      const results = {
        overall: {
          status: 'success',
          score: 0,
          startTime: new Date().toISOString(),
          endTime: null,
          duration: 0
        },
        validations: {},
        summary: {
          total: validationTypes.length,
          passed: 0,
          failed: 0,
          warnings: 0,
          errors: 0
        },
        report: null
      };

      const startTime = Date.now();

      if (parallel) {
        // Run validations in parallel
        const validationPromises = validationTypes.map(type => 
          this.runSingleValidation(projectPath, type, options)
        );

        const validationResults = await Promise.allSettled(validationPromises);

        validationTypes.forEach((type, index) => {
          const result = validationResults[index];
          if (result.status === 'fulfilled') {
            results.validations[type] = result.value;
            this.updateSummary(results.summary, result.value);
          } else {
            results.validations[type] = {
              status: 'failed',
              error: result.reason.message,
              score: 0
            };
            results.summary.failed++;
            results.summary.errors++;
          }
        });
      } else {
        // Run validations sequentially
        for (const type of validationTypes) {
          try {
            const validationResult = await this.runSingleValidation(projectPath, type, options);
            results.validations[type] = validationResult;
            this.updateSummary(results.summary, validationResult);

            if (stopOnError && validationResult.status === 'failed') {
              logger.warn(`Stopping validation suite due to error in ${type}`);
              break;
            }
          } catch (error) {
            results.validations[type] = {
              status: 'failed',
              error: error.message,
              score: 0
            };
            results.summary.failed++;
            results.summary.errors++;

            if (stopOnError) {
              logger.warn(`Stopping validation suite due to error in ${type}`);
              break;
            }
          }
        }
      }

      // Calculate overall results
      const endTime = Date.now();
      results.overall.endTime = new Date().toISOString();
      results.overall.duration = endTime - startTime;

      // Calculate overall score
      const totalScore = Object.values(results.validations)
        .reduce((sum, validation) => sum + (validation.score || 0), 0);
      results.overall.score = validationTypes.length > 0 ? totalScore / validationTypes.length : 0;

      // Determine overall status
      results.overall.status = results.summary.failed === 0 ? 'success' : 'failed';

      // Generate report if requested
      if (generateReport) {
        results.report = await this.generateValidationReport(results);
      }

      logger.info('Complete validation suite finished', {
        duration: results.overall.duration,
        score: results.overall.score,
        status: results.overall.status,
        summary: results.summary
      });

      return results;

    } catch (error) {
      logger.error('Complete validation suite failed:', error);
      throw error;
    }
  }

  /**
   * Run a single validation
   * @param {string} projectPath - Path to the project directory
   * @param {string} validationType - Type of validation to run
   * @param {object} options - Validation options
   * @returns {object} Validation result
   */
  async runSingleValidation(projectPath, validationType, options = {}) {
    try {
      const validator = this.validators[validationType];
      if (!validator) {
        throw new Error(`Unknown validation type: ${validationType}`);
      }

      logger.info(`Running ${validationType} validation`, { projectPath });

      const startTime = Date.now();
      let result;

      switch (validationType) {
        case 'code':
          result = await validator.validate(projectPath, options.rules || [], options);
          break;

        case 'integration':
          result = await validator.validate(options.integrations || [], options);
          break;

        case 'blockchain':
          result = await validator.validate(
            options.contracts || [],
            options.network || 'mainnet',
            options
          );
          break;

        case 'api':
          result = await validator.validate(options.apiSpecs || [], options);
          break;

        case 'deployment':
          result = await validator.validate(
            options.deploymentConfig || {},
            options.environment || 'production',
            options
          );
          break;

        default:
          throw new Error(`Unsupported validation type: ${validationType}`);
      }

      const endTime = Date.now();
      result.duration = endTime - startTime;
      result.timestamp = new Date().toISOString();

      logger.info(`${validationType} validation completed`, {
        duration: result.duration,
        score: result.score,
        status: result.status
      });

      return result;

    } catch (error) {
      logger.error(`${validationType} validation failed:`, error);
      throw error;
    }
  }

  /**
   * Get validation rules
   * @param {object} filters - Filter options
   * @returns {array} Validation rules
   */
  async getValidationRules(filters = {}) {
    try {
      const { type, category } = filters;
      
      let rules = Array.from(this.validationRules.values());

      if (type) {
        rules = rules.filter(rule => rule.type === type);
      }

      if (category) {
        rules = rules.filter(rule => rule.category === category);
      }

      return rules.sort((a, b) => a.name.localeCompare(b.name));

    } catch (error) {
      logger.error('Failed to get validation rules:', error);
      throw error;
    }
  }

  /**
   * Add custom validation rule
   * @param {object} rule - Validation rule
   * @returns {boolean} Success status
   */
  addValidationRule(rule) {
    try {
      // Validate rule structure
      if (!rule.id || !rule.name || !rule.type || !rule.validator) {
        throw new Error('Invalid rule structure');
      }

      this.validationRules.set(rule.id, rule);
      logger.info(`Added validation rule: ${rule.id}`);
      return true;

    } catch (error) {
      logger.error('Failed to add validation rule:', error);
      throw error;
    }
  }

  /**
   * Remove validation rule
   * @param {string} ruleId - Rule ID
   * @returns {boolean} Success status
   */
  removeValidationRule(ruleId) {
    try {
      const removed = this.validationRules.delete(ruleId);
      if (removed) {
        logger.info(`Removed validation rule: ${ruleId}`);
      }
      return removed;

    } catch (error) {
      logger.error('Failed to remove validation rule:', error);
      throw error;
    }
  }

  /**
   * Validate configuration
   * @param {object} config - Configuration to validate
   * @param {string} type - Configuration type
   * @returns {object} Validation result
   */
  async validateConfiguration(config, type) {
    try {
      const result = {
        isValid: true,
        score: 100,
        issues: [],
        warnings: [],
        recommendations: []
      };

      // Get rules for configuration type
      const rules = await this.getValidationRules({ type, category: 'configuration' });

      // Apply rules
      for (const rule of rules) {
        const ruleResult = await this.applyConfigurationRule(config, rule);
        
        if (ruleResult.status === 'failed') {
          result.issues.push(ruleResult);
          result.isValid = false;
        } else if (ruleResult.status === 'warning') {
          result.warnings.push(ruleResult);
        } else if (ruleResult.status === 'recommendation') {
          result.recommendations.push(ruleResult);
        }
      }

      // Calculate score
      const totalRules = rules.length;
      const failedRules = result.issues.length;
      const warningRules = result.warnings.length;
      
      result.score = Math.max(0, ((totalRules - failedRules - (warningRules * 0.5)) / totalRules) * 100);

      return result;

    } catch (error) {
      logger.error('Configuration validation failed:', error);
      throw error;
    }
  }

  /**
   * Generate validation report
   * @param {object} results - Validation results
   * @returns {object} Validation report
   */
  async generateValidationReport(results) {
    try {
      const report = {
        metadata: {
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          generator: 'recoder-validation-service'
        },
        executive: {
          overall: results.overall,
          summary: results.summary,
          recommendations: []
        },
        detailed: {
          validations: results.validations,
          issues: [],
          warnings: [],
          passed: []
        },
        metrics: {
          coverage: 0,
          quality: 0,
          security: 0,
          performance: 0,
          maintainability: 0
        },
        trends: {
          improvement: 0,
          degradation: 0,
          stable: 0
        }
      };

      // Extract detailed information
      for (const [type, validation] of Object.entries(results.validations)) {
        if (validation.issues) {
          report.detailed.issues.push(...validation.issues.map(issue => ({
            ...issue,
            validationType: type
          })));
        }

        if (validation.warnings) {
          report.detailed.warnings.push(...validation.warnings.map(warning => ({
            ...warning,
            validationType: type
          })));
        }

        if (validation.passed) {
          report.detailed.passed.push(...validation.passed.map(passed => ({
            ...passed,
            validationType: type
          })));
        }
      }

      // Calculate metrics
      report.metrics = this.calculateValidationMetrics(results.validations);

      // Generate recommendations
      report.executive.recommendations = this.generateRecommendations(results.validations);

      return report;

    } catch (error) {
      logger.error('Failed to generate validation report:', error);
      throw error;
    }
  }

  /**
   * Load default validation rules
   */
  loadDefaultRules() {
    const defaultRules = [
      // Code validation rules
      {
        id: 'code-coverage',
        name: 'Code Coverage',
        type: 'code',
        category: 'quality',
        description: 'Ensure adequate code coverage',
        threshold: 80,
        validator: (result) => result.coverage >= 80
      },
      {
        id: 'code-complexity',
        name: 'Code Complexity',
        type: 'code',
        category: 'quality',
        description: 'Check code complexity',
        threshold: 10,
        validator: (result) => result.complexity <= 10
      },
      {
        id: 'code-duplication',
        name: 'Code Duplication',
        type: 'code',
        category: 'quality',
        description: 'Check for code duplication',
        threshold: 5,
        validator: (result) => result.duplication <= 5
      },

      // Security validation rules
      {
        id: 'security-vulnerabilities',
        name: 'Security Vulnerabilities',
        type: 'security',
        category: 'security',
        description: 'Check for security vulnerabilities',
        threshold: 0,
        validator: (result) => result.vulnerabilities === 0
      },
      {
        id: 'security-headers',
        name: 'Security Headers',
        type: 'security',
        category: 'security',
        description: 'Check for security headers',
        required: ['X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection'],
        validator: (result) => result.securityHeaders?.length >= 3
      },

      // Performance validation rules
      {
        id: 'performance-response-time',
        name: 'Response Time',
        type: 'performance',
        category: 'performance',
        description: 'Check API response times',
        threshold: 200,
        validator: (result) => result.responseTime <= 200
      },
      {
        id: 'performance-memory-usage',
        name: 'Memory Usage',
        type: 'performance',
        category: 'performance',
        description: 'Check memory usage',
        threshold: 512,
        validator: (result) => result.memoryUsage <= 512
      },

      // API validation rules
      {
        id: 'api-documentation',
        name: 'API Documentation',
        type: 'api',
        category: 'documentation',
        description: 'Check API documentation completeness',
        threshold: 90,
        validator: (result) => result.documentationCoverage >= 90
      },
      {
        id: 'api-versioning',
        name: 'API Versioning',
        type: 'api',
        category: 'design',
        description: 'Check API versioning strategy',
        validator: (result) => result.hasVersioning === true
      },

      // Integration validation rules
      {
        id: 'integration-connectivity',
        name: 'Integration Connectivity',
        type: 'integration',
        category: 'connectivity',
        description: 'Test integration connectivity',
        validator: (result) => result.connectivityTests?.passed === true
      },
      {
        id: 'integration-error-handling',
        name: 'Integration Error Handling',
        type: 'integration',
        category: 'reliability',
        description: 'Check integration error handling',
        validator: (result) => result.errorHandling?.implemented === true
      },

      // Deployment validation rules
      {
        id: 'deployment-environment',
        name: 'Deployment Environment',
        type: 'deployment',
        category: 'environment',
        description: 'Validate deployment environment',
        validator: (result) => result.environment?.configured === true
      },
      {
        id: 'deployment-rollback',
        name: 'Deployment Rollback',
        type: 'deployment',
        category: 'reliability',
        description: 'Check rollback capability',
        validator: (result) => result.rollback?.available === true
      }
    ];

    defaultRules.forEach(rule => {
      this.validationRules.set(rule.id, rule);
    });

    logger.info(`Loaded ${defaultRules.length} default validation rules`);
  }

  /**
   * Update summary statistics
   * @param {object} summary - Summary object to update
   * @param {object} validationResult - Validation result
   */
  updateSummary(summary, validationResult) {
    if (validationResult.status === 'success' || validationResult.status === 'passed') {
      summary.passed++;
    } else if (validationResult.status === 'failed') {
      summary.failed++;
    }

    summary.warnings += validationResult.warnings?.length || 0;
    summary.errors += validationResult.issues?.length || 0;
  }

  /**
   * Apply configuration rule
   * @param {object} config - Configuration to validate
   * @param {object} rule - Validation rule
   * @returns {object} Rule result
   */
  async applyConfigurationRule(config, rule) {
    const result = {
      ruleId: rule.id,
      ruleName: rule.name,
      status: 'passed',
      message: '',
      details: ''
    };

    try {
      const isValid = await rule.validator(config);
      
      if (!isValid) {
        result.status = 'failed';
        result.message = `${rule.name} validation failed`;
        result.details = rule.description;
      } else {
        result.message = `${rule.name} validation passed`;
      }

    } catch (error) {
      result.status = 'failed';
      result.message = `Rule validation error: ${error.message}`;
      result.details = error.stack;
    }

    return result;
  }

  /**
   * Calculate validation metrics
   * @param {object} validations - Validation results
   * @returns {object} Calculated metrics
   */
  calculateValidationMetrics(validations) {
    const metrics = {
      coverage: 0,
      quality: 0,
      security: 0,
      performance: 0,
      maintainability: 0
    };

    const validationCount = Object.keys(validations).length;
    if (validationCount === 0) return metrics;

    // Calculate average scores by category
    let totalCoverage = 0;
    let totalQuality = 0;
    let totalSecurity = 0;
    let totalPerformance = 0;
    let totalMaintainability = 0;

    for (const [type, validation] of Object.entries(validations)) {
      const score = validation.score || 0;
      
      switch (type) {
        case 'code':
          totalQuality += score;
          totalMaintainability += score;
          break;
        case 'security':
          totalSecurity += score;
          break;
        case 'performance':
          totalPerformance += score;
          break;
        case 'api':
          totalCoverage += score;
          totalQuality += score;
          break;
        case 'integration':
          totalCoverage += score;
          break;
        case 'deployment':
          totalCoverage += score;
          break;
      }
    }

    // Calculate averages
    metrics.coverage = totalCoverage / validationCount;
    metrics.quality = totalQuality / validationCount;
    metrics.security = totalSecurity / validationCount;
    metrics.performance = totalPerformance / validationCount;
    metrics.maintainability = totalMaintainability / validationCount;

    return metrics;
  }

  /**
   * Generate recommendations based on validation results
   * @param {object} validations - Validation results
   * @returns {array} Recommendations
   */
  generateRecommendations(validations) {
    const recommendations = [];

    for (const [type, validation] of Object.entries(validations)) {
      const score = validation.score || 0;
      
      if (score < 70) {
        recommendations.push({
          type: 'improvement',
          category: type,
          priority: 'high',
          message: `${type} validation score is low (${score}%)`,
          suggestion: `Review and improve ${type} practices to achieve better results`
        });
      } else if (score < 85) {
        recommendations.push({
          type: 'optimization',
          category: type,
          priority: 'medium',
          message: `${type} validation score could be improved (${score}%)`,
          suggestion: `Consider optimizing ${type} practices for better results`
        });
      }

      // Add specific recommendations based on issues
      if (validation.issues) {
        for (const issue of validation.issues) {
          recommendations.push({
            type: 'fix',
            category: type,
            priority: 'high',
            message: issue.message,
            suggestion: issue.suggestion || `Address ${issue.message.toLowerCase()}`
          });
        }
      }
    }

    return recommendations;
  }
}

module.exports = { ValidationService };