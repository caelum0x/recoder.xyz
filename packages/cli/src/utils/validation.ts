/**
 * Validation utilities and helpers
 */

import Joi from 'joi';
import { Logger } from '@recoder/shared';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: any;
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url';
  min?: number;
  max?: number;
  pattern?: RegExp;
  choices?: any[];
  custom?: (value: any) => boolean | string;
}

export class ValidationHelper {
  /**
   * Validate data against Joi schema
   */
  static validateWithJoi<T = any>(data: any, schema: Joi.Schema): ValidationResult {
    try {
      const { error, value, warning } = schema.validate(data, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
      });

      const errors = error ? error.details.map(detail => detail.message) : [];
      const warnings = warning ? warning.details.map(detail => detail.message) : [];

      return {
        valid: !error,
        errors,
        warnings,
        data: value,
      };
    } catch (err) {
      return {
        valid: false,
        errors: [`Validation error: ${err}`],
        warnings: [],
      };
    }
  }

  /**
   * Validate data against custom rules
   */
  static validateWithRules(data: any, rules: ValidationRule[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      
      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }

      // Skip validation if field is not required and empty
      if (!rule.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Type validation
      if (rule.type && !this.validateType(value, rule.type)) {
        errors.push(`${rule.field} must be of type ${rule.type}`);
        continue;
      }

      // Length/size validation
      if (rule.min !== undefined && !this.validateMin(value, rule.min)) {
        errors.push(`${rule.field} must be at least ${rule.min}`);
      }

      if (rule.max !== undefined && !this.validateMax(value, rule.max)) {
        errors.push(`${rule.field} must not exceed ${rule.max}`);
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors.push(`${rule.field} format is invalid`);
      }

      // Choice validation
      if (rule.choices && !rule.choices.includes(value)) {
        errors.push(`${rule.field} must be one of: ${rule.choices.join(', ')}`);
      }

      // Custom validation
      if (rule.custom) {
        const customResult = rule.custom(value);
        if (customResult !== true) {
          errors.push(typeof customResult === 'string' ? customResult : `${rule.field} is invalid`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      data,
    };
  }

  /**
   * Validate email address
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL
   */
  static validateURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate semantic version
   */
  static validateSemVer(version: string): boolean {
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  /**
   * Validate JSON string
   */
  static validateJSON(jsonString: string): { valid: boolean; data?: any; error?: string } {
    try {
      const data = JSON.parse(jsonString);
      return { valid: true, data };
    } catch (error) {
      return { valid: false, error: `Invalid JSON: ${error}` };
    }
  }

  /**
   * Validate project name
   */
  static validateProjectName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('Project name is required');
    } else {
      if (name.length < 2) {
        errors.push('Project name must be at least 2 characters long');
      }
      
      if (name.length > 100) {
        errors.push('Project name must not exceed 100 characters');
      }

      if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
        errors.push('Project name can only contain letters, numbers, hyphens, underscores, and spaces');
      }

      if (/^\s/.test(name) || /\s$/.test(name)) {
        errors.push('Project name cannot start or end with spaces');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate file path
   */
  static validateFilePath(filePath: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!filePath || filePath.trim().length === 0) {
      errors.push('File path is required');
    } else {
      // Check for invalid characters
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(filePath)) {
        errors.push('File path contains invalid characters');
      }

      // Check for reserved names (Windows)
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
      const fileName = filePath.split(/[/\\]/).pop()?.split('.')[0]?.toUpperCase();
      if (fileName && reservedNames.includes(fileName)) {
        errors.push('File name is reserved and cannot be used');
      }

      // Check path length
      if (filePath.length > 260) {
        warnings.push('File path is very long and may cause issues on some systems');
      }

      // Check for relative path indicators
      if (filePath.includes('..')) {
        warnings.push('File path contains relative path indicators');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate package.json structure
   */
  static validatePackageJson(packageData: any): ValidationResult {
    const schema = Joi.object({
      name: Joi.string().required().pattern(/^[a-z0-9@][a-z0-9._-]*$/),
      version: Joi.string().required().pattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/),
      description: Joi.string().allow(''),
      main: Joi.string(),
      scripts: Joi.object().pattern(Joi.string(), Joi.string()),
      dependencies: Joi.object().pattern(Joi.string(), Joi.string()),
      devDependencies: Joi.object().pattern(Joi.string(), Joi.string()),
      keywords: Joi.array().items(Joi.string()),
      author: Joi.alternatives().try(
        Joi.string(),
        Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email(),
          url: Joi.string().uri(),
        })
      ),
      license: Joi.string(),
      repository: Joi.alternatives().try(
        Joi.string(),
        Joi.object({
          type: Joi.string().required(),
          url: Joi.string().required(),
        })
      ),
      bugs: Joi.alternatives().try(
        Joi.string().uri(),
        Joi.object({
          url: Joi.string().uri(),
          email: Joi.string().email(),
        })
      ),
      homepage: Joi.string().uri(),
    }).unknown(true);

    return this.validateWithJoi(packageData, schema);
  }

  /**
   * Validate API request data
   */
  static validateRequestData(data: any, method: string, url: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Common validation for all requests
    if (data && typeof data !== 'object') {
      errors.push('Request data must be an object');
      return { valid: false, errors, warnings };
    }

    // Method-specific validation
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (!data && !url.includes('/health') && !url.includes('/status')) {
        warnings.push('Request body is empty for data modification request');
      }
    }

    // URL-specific validation
    if (url.includes('/projects')) {
      if (data && method === 'POST') {
        const projectValidation = this.validateProjectData(data);
        if (!projectValidation.valid) {
          errors.push(...projectValidation.errors);
        }
      }
    }

    if (url.includes('/agents')) {
      if (data && method === 'POST') {
        const agentValidation = this.validateAgentData(data);
        if (!agentValidation.valid) {
          errors.push(...agentValidation.errors);
        }
      }
    }

    if (url.includes('/planner')) {
      if (data && method === 'POST') {
        const planValidation = this.validatePlanData(data);
        if (!planValidation.valid) {
          errors.push(...planValidation.errors);
        }
      }
    }

    if (url.includes('/templates')) {
      if (data && method === 'POST') {
        const templateValidation = this.validateTemplateData(data);
        if (!templateValidation.valid) {
          errors.push(...templateValidation.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      data
    };
  }

  /**
   * Validate project data
   */
  static validateProjectData(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      { field: 'name', required: true, type: 'string', min: 2, max: 100 },
      { field: 'description', type: 'string', max: 500 },
      { field: 'type', required: true, type: 'string', choices: ['web', 'mobile', 'blockchain', 'ai', 'fullstack', 'api'] },
      { field: 'framework', required: true, type: 'string', min: 1 },
      { field: 'language', required: true, type: 'string', min: 1 },
      { field: 'features', type: 'array' },
      { field: 'integrations', type: 'array' },
      { field: 'dependencies', type: 'array' },
      { field: 'team_members', type: 'array' },
      { field: 'configuration', type: 'object' }
    ];

    const validation = this.validateWithRules(data, rules);

    // Additional project-specific validation
    if (data.name) {
      const nameValidation = this.validateProjectName(data.name);
      if (!nameValidation.valid) {
        validation.errors.push(...nameValidation.errors);
      }
    }

    return validation;
  }

  /**
   * Validate agent data
   */
  static validateAgentData(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      { field: 'name', required: true, type: 'string', min: 2, max: 100 },
      { field: 'type', required: true, type: 'string', choices: ['planner', 'structure', 'integration', 'web', 'mobile', 'blockchain', 'ai', 'backend', 'devops'] },
      { field: 'description', type: 'string', max: 500 },
      { field: 'capabilities', type: 'array' },
      { field: 'configuration', type: 'object' },
      { field: 'version', type: 'string' }
    ];

    const validation = this.validateWithRules(data, rules);

    // Additional agent-specific validation
    if (data.version && !this.validateSemVer(data.version)) {
      validation.errors.push('Agent version must be a valid semantic version');
    }

    return validation;
  }

  /**
   * Validate plan data
   */
  static validatePlanData(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      { field: 'name', required: true, type: 'string', min: 2, max: 100 },
      { field: 'description', type: 'string', max: 1000 },
      { field: 'project_id', type: 'string' },
      { field: 'requirements', type: 'array' },
      { field: 'architecture', type: 'object' },
      { field: 'phases', type: 'array' },
      { field: 'timeline', type: 'object' },
      { field: 'cost_analysis', type: 'object' },
      { field: 'risk_assessment', type: 'object' },
      { field: 'success_metrics', type: 'array' }
    ];

    const validation = this.validateWithRules(data, rules);

    // Additional plan-specific validation
    if (data.phases && Array.isArray(data.phases)) {
      data.phases.forEach((phase: any, index: number) => {
        if (!phase.name || typeof phase.name !== 'string') {
          validation.errors.push(`Phase ${index + 1} must have a name`);
        }
        if (!phase.tasks || !Array.isArray(phase.tasks)) {
          validation.errors.push(`Phase ${index + 1} must have tasks array`);
        }
      });
    }

    return validation;
  }

  /**
   * Validate template data
   */
  static validateTemplateData(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      { field: 'name', required: true, type: 'string', min: 2, max: 100 },
      { field: 'description', required: true, type: 'string', max: 500 },
      { field: 'category', required: true, type: 'string', choices: ['web', 'mobile', 'blockchain', 'ai', 'fullstack', 'api', 'library'] },
      { field: 'framework', required: true, type: 'string', min: 1 },
      { field: 'language', required: true, type: 'string', min: 1 },
      { field: 'version', required: true, type: 'string' },
      { field: 'tags', type: 'array' },
      { field: 'features', type: 'array' },
      { field: 'dependencies', type: 'array' },
      { field: 'configuration', type: 'object' }
    ];

    const validation = this.validateWithRules(data, rules);

    // Additional template-specific validation
    if (data.version && !this.validateSemVer(data.version)) {
      validation.errors.push('Template version must be a valid semantic version');
    }

    return validation;
  }

  /**
   * Validate CLI command options
   */
  static validateCommandOptions(command: string, options: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (command) {
      case 'init':
        if (!options.name) {
          errors.push('Project name is required');
        } else {
          const nameValidation = this.validateProjectName(options.name);
          if (!nameValidation.valid) {
            errors.push(...nameValidation.errors);
          }
        }
        if (options.output && !this.validateFilePath(options.output).valid) {
          errors.push('Invalid output path');
        }
        break;

      case 'generate':
        if (!options.type) {
          errors.push('Generation type is required');
        } else if (!['component', 'service', 'controller', 'model', 'page', 'hook', 'utility'].includes(options.type)) {
          errors.push('Invalid generation type');
        }
        if (!options.name) {
          errors.push('Name is required for generation');
        }
        break;

      case 'deploy':
        if (!options.environment) {
          errors.push('Deployment environment is required');
        } else if (!['development', 'staging', 'production'].includes(options.environment)) {
          errors.push('Invalid deployment environment');
        }
        break;

      case 'validate':
        if (!options.type) {
          warnings.push('No validation type specified, running all validations');
        } else if (!['code', 'security', 'performance', 'accessibility', 'integration'].includes(options.type)) {
          errors.push('Invalid validation type');
        }
        break;

      case 'plan':
        if (options.budget && (typeof options.budget !== 'number' || options.budget <= 0)) {
          errors.push('Budget must be a positive number');
        }
        if (options.timeline && typeof options.timeline !== 'string') {
          errors.push('Timeline must be a string');
        }
        if (options.quality && (typeof options.quality !== 'number' || options.quality < 0 || options.quality > 100)) {
          errors.push('Quality score must be between 0 and 100');
        }
        break;

      case 'analyze':
        if (options.depth && (typeof options.depth !== 'number' || options.depth < 1 || options.depth > 10)) {
          errors.push('Analysis depth must be between 1 and 10');
        }
        break;

      default:
        // No specific validation for unknown commands
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate project options for generation
   */
  static validateProjectOptions(options: any): ValidationResult {
    const rules: ValidationRule[] = [
      { field: 'type', required: true, type: 'string', choices: ['web', 'mobile', 'blockchain', 'ai', 'fullstack', 'api'] },
      { field: 'framework', required: true, type: 'string', min: 1 },
      { field: 'language', required: true, type: 'string', min: 1 },
      { field: 'features', type: 'array' },
      { field: 'integrations', type: 'array' },
      { field: 'structure', type: 'string', choices: ['monorepo', 'standard', 'microservices', 'serverless'] },
      { field: 'testing', type: 'string', choices: ['unit', 'integration', 'e2e', 'all'] },
      { field: 'linting', type: 'boolean' },
      { field: 'formatting', type: 'boolean' },
      { field: 'cicd', type: 'boolean' },
      { field: 'docker', type: 'boolean' },
      { field: 'documentation', type: 'boolean' },
      { field: 'monitoring', type: 'boolean' },
      { field: 'security', type: 'boolean' },
      { field: 'performance', type: 'boolean' },
      { field: 'accessibility', type: 'boolean' }
    ];

    const validation = this.validateWithRules(options, rules);

    // Additional cross-validation
    if (options.type === 'blockchain' && !options.integrations?.includes('web3')) {
      validation.warnings.push('Blockchain projects typically require web3 integration');
    }

    if (options.type === 'mobile' && !['react-native', 'flutter', 'ionic'].includes(options.framework)) {
      validation.warnings.push('Selected framework may not be optimal for mobile development');
    }

    if (options.features?.length > 10) {
      validation.warnings.push('Large number of features may increase complexity');
    }

    if (options.integrations?.length > 5) {
      validation.warnings.push('Multiple integrations may increase development time');
    }

    return validation;
  }

  /**
   * Validate environment variables
   */
  static validateEnvironmentVariables(envVars: Record<string, string>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required environment variables
    const requiredVars = ['NODE_ENV'];
    for (const varName of requiredVars) {
      if (!envVars[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate specific environment variables
    if (envVars.NODE_ENV && !['development', 'staging', 'production', 'test'].includes(envVars.NODE_ENV)) {
      errors.push('NODE_ENV must be one of: development, staging, production, test');
    }

    if (envVars.PORT && (isNaN(Number(envVars.PORT)) || Number(envVars.PORT) < 1 || Number(envVars.PORT) > 65535)) {
      errors.push('PORT must be a valid port number (1-65535)');
    }

    if (envVars.DATABASE_URL && !this.validateURL(envVars.DATABASE_URL)) {
      errors.push('DATABASE_URL must be a valid URL');
    }

    if (envVars.REDIS_URL && !this.validateURL(envVars.REDIS_URL)) {
      errors.push('REDIS_URL must be a valid URL');
    }

    if (envVars.JWT_SECRET && envVars.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long for security');
    }

    // Check for potential security issues
    const sensitiveVars = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'API_KEY'];
    for (const [varName, varValue] of Object.entries(envVars)) {
      if (sensitiveVars.some(sensitive => varName.includes(sensitive))) {
        if (varValue.length < 16) {
          warnings.push(`${varName} appears to be a sensitive value but is quite short`);
        }
        if (varValue === 'password' || varValue === 'secret' || varValue === '123456') {
          errors.push(`${varName} has a weak/default value`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate configuration object
   */
  static validateConfiguration(config: any, type: 'database' | 'cache' | 'api' | 'auth' | 'monitoring'): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (type) {
      case 'database':
        if (!config.host) errors.push('Database host is required');
        if (!config.port || isNaN(Number(config.port))) errors.push('Database port must be a valid number');
        if (!config.database) errors.push('Database name is required');
        if (!config.username) errors.push('Database username is required');
        if (!config.password) warnings.push('Database password is not set');
        if (config.ssl === false && config.host !== 'localhost') {
          warnings.push('SSL is disabled for remote database connection');
        }
        break;

      case 'cache':
        if (!config.host) errors.push('Cache host is required');
        if (!config.port || isNaN(Number(config.port))) errors.push('Cache port must be a valid number');
        if (config.ttl && (isNaN(Number(config.ttl)) || Number(config.ttl) < 0)) {
          errors.push('Cache TTL must be a positive number');
        }
        break;

      case 'api':
        if (!config.baseURL) errors.push('API base URL is required');
        if (config.baseURL && !this.validateURL(config.baseURL)) {
          errors.push('API base URL must be a valid URL');
        }
        if (config.timeout && (isNaN(Number(config.timeout)) || Number(config.timeout) < 1000)) {
          errors.push('API timeout must be at least 1000ms');
        }
        if (config.retries && (isNaN(Number(config.retries)) || Number(config.retries) < 0)) {
          errors.push('API retries must be a non-negative number');
        }
        break;

      case 'auth':
        if (!config.jwtSecret) errors.push('JWT secret is required');
        if (config.jwtSecret && config.jwtSecret.length < 32) {
          warnings.push('JWT secret should be at least 32 characters long');
        }
        if (config.tokenExpiry && typeof config.tokenExpiry !== 'string') {
          errors.push('Token expiry must be a string (e.g., "1h", "7d")');
        }
        if (config.bcryptRounds && (isNaN(Number(config.bcryptRounds)) || Number(config.bcryptRounds) < 10)) {
          warnings.push('Bcrypt rounds should be at least 10 for security');
        }
        break;

      case 'monitoring':
        if (config.enabled && !config.endpoint) {
          errors.push('Monitoring endpoint is required when monitoring is enabled');
        }
        if (config.endpoint && !this.validateURL(config.endpoint)) {
          errors.push('Monitoring endpoint must be a valid URL');
        }
        if (config.sampleRate && (isNaN(Number(config.sampleRate)) || Number(config.sampleRate) < 0 || Number(config.sampleRate) > 1)) {
          errors.push('Sample rate must be between 0 and 1');
        }
        break;

      default:
        errors.push(`Unknown configuration type: ${type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate security configuration
   */
  static validateSecurityConfig(config: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // CORS configuration
    if (config.cors) {
      if (config.cors.origin === '*') {
        warnings.push('CORS origin is set to wildcard (*) which may be insecure');
      }
      if (config.cors.credentials && config.cors.origin === '*') {
        errors.push('CORS credentials cannot be used with wildcard origin');
      }
    }

    // Rate limiting
    if (config.rateLimit) {
      if (!config.rateLimit.windowMs || config.rateLimit.windowMs < 60000) {
        warnings.push('Rate limit window should be at least 1 minute');
      }
      if (!config.rateLimit.max || config.rateLimit.max > 1000) {
        warnings.push('Rate limit max should be reasonable (typically < 1000)');
      }
    }

    // Helmet configuration
    if (config.helmet === false) {
      warnings.push('Helmet security headers are disabled');
    }

    // Session configuration
    if (config.session) {
      if (!config.session.secret) {
        errors.push('Session secret is required');
      }
      if (config.session.secret && config.session.secret.length < 32) {
        warnings.push('Session secret should be at least 32 characters long');
      }
      if (config.session.cookie?.secure === false) {
        warnings.push('Session cookies are not secure (HTTPS only)');
      }
    }

    // CSP configuration
    if (config.csp) {
      if (config.csp.directives?.['default-src']?.includes('*')) {
        warnings.push('CSP default-src includes wildcard which may be insecure');
      }
      if (config.csp.directives?.['script-src']?.includes('unsafe-eval')) {
        warnings.push('CSP script-src includes unsafe-eval which may be dangerous');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Helper methods
  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private static validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'email':
        return typeof value === 'string' && this.validateEmail(value);
      case 'url':
        return typeof value === 'string' && this.validateURL(value);
      default:
        return true;
    }
  }

  private static validateMin(value: any, min: number): boolean {
    if (typeof value === 'string' || Array.isArray(value)) {
      return value.length >= min;
    }
    if (typeof value === 'number') {
      return value >= min;
    }
    return true;
  }

  private static validateMax(value: any, max: number): boolean {
    if (typeof value === 'string' || Array.isArray(value)) {
      return value.length <= max;
    }
    if (typeof value === 'number') {
      return value <= max;
    }
    return true;
  }
}

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  // User schemas
  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }),

  userRegister: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100),
  }),

  // Project schemas
  projectCreate: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500),
    template: Joi.string().required(),
    outputDir: Joi.string().required(),
    features: Joi.array().items(Joi.string()),
    integrations: Joi.array().items(Joi.string()),
    variables: Joi.object(),
  }),

  projectUpdate: Joi.object({
    name: Joi.string().min(2).max(100),
    description: Joi.string().max(500),
    features: Joi.array().items(Joi.string()),
    integrations: Joi.array().items(Joi.string()),
  }),

  // API schemas
  apiConfig: Joi.object({
    baseUrl: Joi.string().uri().required(),
    timeout: Joi.number().min(1000).max(300000),
    retries: Joi.number().min(0).max(10),
  }),

  // Chat schemas
  chatConfig: Joi.object({
    model: Joi.string().required(),
    maxTokens: Joi.number().min(1).max(100000),
    temperature: Joi.number().min(0).max(1),
    streaming: Joi.boolean(),
  }),

  // Template schemas
  templateInfo: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    version: Joi.string().pattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/).required(),
    category: Joi.string().valid('web', 'mobile', 'api', 'library', 'fullstack').required(),
    tags: Joi.array().items(Joi.string()),
    features: Joi.array().items(Joi.string()),
    dependencies: Joi.object(),
    variables: Joi.object(),
  }),
};

/**
 * Reality check utilities
 */
export class RealityCheck {
  /**
   * Check if project requirements are realistic
   */
  static checkProjectComplexity(requirements: {
    features: string[];
    integrations: string[];
    timeline?: string;
    teamSize?: number;
  }): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    const complexityScore = this.calculateComplexityScore(requirements.features, requirements.integrations);

    if (complexityScore > 100) {
      warnings.push('This project appears to be very complex. Consider breaking it into smaller phases.');
    }

    if (requirements.timeline) {
      const timelineWarning = this.checkTimelineRealism(complexityScore, requirements.timeline, requirements.teamSize || 1);
      if (timelineWarning) {
        warnings.push(timelineWarning);
      }
    }

    if (requirements.features.length > 20) {
      warnings.push('Large number of features detected. Consider prioritizing core functionality first.');
    }

    if (requirements.integrations.length > 10) {
      warnings.push('Many integrations detected. Each integration adds complexity and potential failure points.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      data: { complexityScore },
    };
  }

  /**
   * Check if dependencies are compatible
   */
  static checkDependencyCompatibility(dependencies: Record<string, string>): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for known incompatible combinations
    const incompatiblePairs = [
      ['react', 'vue'],
      ['angular', 'react'],
      ['angular', 'vue'],
    ];

    for (const [dep1, dep2] of incompatiblePairs) {
      if (dependencies[dep1] && dependencies[dep2]) {
        errors.push(`${dep1} and ${dep2} are not typically used together`);
      }
    }

    // Check for outdated versions
    const outdatedThreshold = 365; // days
    const commonPackages = {
      'react': '18.0.0',
      'vue': '3.0.0',
      'angular': '15.0.0',
      'express': '4.18.0',
    };

    for (const [pkg, version] of Object.entries(dependencies)) {
      if (commonPackages[pkg as keyof typeof commonPackages] && this.isVersionOutdated(version, commonPackages[pkg as keyof typeof commonPackages])) {
        warnings.push(`${pkg}@${version} may be outdated. Consider upgrading to ${commonPackages[pkg as keyof typeof commonPackages]} or later.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if resource requirements are realistic
   */
  static checkResourceRequirements(requirements: {
    storage?: number; // MB
    memory?: number; // MB
    cpu?: number; // cores
    bandwidth?: number; // MB/s
  }): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (requirements.storage && requirements.storage > 10000) { // 10GB
      warnings.push('High storage requirements detected. Consider data optimization strategies.');
    }

    if (requirements.memory && requirements.memory > 8000) { // 8GB
      warnings.push('High memory requirements detected. This may limit deployment options.');
    }

    if (requirements.cpu && requirements.cpu > 8) {
      warnings.push('High CPU requirements detected. Consider performance optimization.');
    }

    if (requirements.bandwidth && requirements.bandwidth > 100) { // 100MB/s
      warnings.push('High bandwidth requirements detected. Consider CDN and caching strategies.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static calculateComplexityScore(features: string[], integrations: string[]): number {
    const featureComplexity = {
      'auth': 10,
      'payment': 15,
      'chat': 20,
      'real-time': 15,
      'ai': 25,
      'blockchain': 30,
      'video': 20,
      'geolocation': 10,
      'push-notifications': 10,
      'file-upload': 10,
      'search': 15,
      'analytics': 10,
      'admin-panel': 15,
    };

    const integrationComplexity = {
      'stripe': 10,
      'paypal': 10,
      'aws': 15,
      'firebase': 10,
      'mongodb': 8,
      'postgresql': 8,
      'redis': 5,
      'elasticsearch': 15,
      'docker': 10,
      'kubernetes': 20,
    };

    let score = 0;
    
    for (const feature of features) {
      score += featureComplexity[feature.toLowerCase() as keyof typeof featureComplexity] || 5;
    }
    
    for (const integration of integrations) {
      score += integrationComplexity[integration.toLowerCase() as keyof typeof integrationComplexity] || 5;
    }

    return score;
  }

  private static checkTimelineRealism(complexityScore: number, timeline: string, teamSize: number): string | null {
    const timelineMap = {
      '1 week': 1,
      '2 weeks': 2,
      '1 month': 4,
      '2 months': 8,
      '3 months': 12,
      '6 months': 24,
      '1 year': 48,
    };

    const weeks = timelineMap[timeline as keyof typeof timelineMap] || 4;
    const capacity = weeks * teamSize; // person-weeks

    const requiredCapacity = complexityScore / 5; // rough estimate

    if (requiredCapacity > capacity * 1.5) {
      return `Timeline may be too aggressive. Consider ${Math.ceil(requiredCapacity / teamSize)} weeks or more.`;
    }

    return null;
  }

  private static isVersionOutdated(currentVersion: string, latestVersion: string): boolean {
    // Simple version comparison - in reality, you'd use a proper semver library
    const current = currentVersion.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (current[i] < latest[i]) return true;
      if (current[i] > latest[i]) return false;
    }

    return false;
  }
}