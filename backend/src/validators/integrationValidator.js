const { BaseValidator } = require('./baseValidator');
const { logger } = require('../utils/logger');

class IntegrationValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.registerIntegrationRules();
  }

  registerIntegrationRules() {
    // Integration-specific validation rules
    this.registerRule('valid_endpoint', {
      check: (url) => this.validateEndpoint(url),
      message: 'Invalid API endpoint URL',
      severity: 'error'
    });

    this.registerRule('valid_auth_config', {
      check: (config) => this.validateAuthConfig(config),
      message: 'Invalid authentication configuration',
      severity: 'error'
    });

    this.registerRule('valid_rate_limits', {
      check: (limits) => this.validateRateLimits(limits),
      message: 'Invalid rate limiting configuration',
      severity: 'warning'
    });

    this.registerRule('secure_connection', {
      check: (config) => this.validateSecureConnection(config),
      message: 'Integration should use secure connections (HTTPS)',
      severity: 'warning'
    });

    this.registerRule('proper_error_handling', {
      check: (config) => this.validateErrorHandling(config),
      message: 'Integration lacks proper error handling configuration',
      severity: 'warning'
    });

    this.registerRule('valid_timeout', {
      check: (timeout) => this.validateTimeout(timeout),
      message: 'Invalid timeout configuration',
      severity: 'warning'
    });

    this.registerRule('valid_retry_policy', {
      check: (policy) => this.validateRetryPolicy(policy),
      message: 'Invalid retry policy configuration',
      severity: 'warning'
    });

    this.registerRule('data_format_compatibility', {
      check: (format) => this.validateDataFormat(format),
      message: 'Incompatible data format specification',
      severity: 'error'
    });
  }

  async validate(input, context = {}) {
    try {
      this.validateInput(input, ['integrations']);

      const result = await this.performAsyncValidation(input, async () => {
        this.reset();

        const integrationConfig = this.analyzeIntegrations(input);
        
        // Validate each integration
        await this.validateAllIntegrations(integrationConfig);
        
        // Validate integration dependencies
        this.validateIntegrationDependencies(integrationConfig);
        
        // Check security configurations
        this.validateSecurityConfigurations(integrationConfig);
        
        // Validate data flow and compatibility
        this.validateDataFlowCompatibility(integrationConfig);
        
        // Check performance considerations
        this.validatePerformanceConfigurations(integrationConfig);
        
        return this.createValidationResult(true, {
          totalIntegrations: integrationConfig.integrations.length,
          secureIntegrations: integrationConfig.secureCount,
          warnings: this.results.warnings.length
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeIntegrations(input) {
    const config = {
      integrations: input.integrations || [],
      environment: input.environment || 'production',
      security: input.security || 'standard',
      timeout: input.timeout || 30000,
      retryAttempts: input.retryAttempts || 3,
      secureCount: 0,
      dependencies: this.extractDependencies(input.integrations || [])
    };

    return config;
  }

  extractDependencies(integrations) {
    const dependencies = [];
    
    integrations.forEach(integration => {
      if (integration.dependsOn) {
        dependencies.push({
          from: integration.name,
          to: integration.dependsOn,
          type: 'dependency'
        });
      }
    });

    return dependencies;
  }

  async validateAllIntegrations(config) {
    for (const integration of config.integrations) {
      await this.validateSingleIntegration(integration, config);
    }
  }

  async validateSingleIntegration(integration, globalConfig) {
    const context = { integration: integration.name, type: integration.type };
    
    // Validate basic integration structure
    this.validateIntegrationStructure(integration, context);
    
    // Validate by integration type
    switch (integration.type) {
      case 'api':
        this.validateAPIIntegration(integration, context);
        break;
      case 'database':
        this.validateDatabaseIntegration(integration, context);
        break;
      case 'message_queue':
        this.validateMessageQueueIntegration(integration, context);
        break;
      case 'file_storage':
        this.validateFileStorageIntegration(integration, context);
        break;
      case 'payment':
        this.validatePaymentIntegration(integration, context);
        break;
      case 'authentication':
        this.validateAuthIntegration(integration, context);
        break;
      default:
        this.validateGenericIntegration(integration, context);
    }
  }

  validateIntegrationStructure(integration, context) {
    // Required fields validation
    const requiredFields = ['name', 'type'];
    for (const field of requiredFields) {
      if (!integration[field]) {
        this.addError(`Integration ${context.integration}: Missing required field '${field}'`);
      }
    }

    // Name validation
    if (integration.name && !this.validateIdentifier(integration.name, 'integration name')) {
      return;
    }

    // Type validation
    const validTypes = [
      'api', 'database', 'message_queue', 'file_storage', 
      'payment', 'authentication', 'analytics', 'monitoring'
    ];
    
    if (!this.validateEnum(integration.type, validTypes, 'integration type')) {
      return;
    }

    // Configuration validation
    if (integration.config) {
      this.validateIntegrationConfig(integration.config, context);
    }
  }

  validateIntegrationConfig(config, context) {
    // Timeout validation
    if (config.timeout !== undefined) {
      this.validateField('timeout', config.timeout, ['valid_timeout'], context);
    }

    // Retry policy validation
    if (config.retryPolicy) {
      this.validateField('retryPolicy', config.retryPolicy, ['valid_retry_policy'], context);
    }

    // Error handling validation
    this.validateField('config', config, ['proper_error_handling'], context);

    // Security validation
    this.validateField('config', config, ['secure_connection'], context);
  }

  validateAPIIntegration(integration, context) {
    const config = integration.config || {};
    
    // Endpoint validation
    if (config.endpoint) {
      this.validateField('endpoint', config.endpoint, ['valid_endpoint'], context);
    } else {
      this.addError(`API integration ${integration.name}: Missing endpoint configuration`);
    }

    // Authentication validation
    if (config.auth) {
      this.validateField('auth', config.auth, ['valid_auth_config'], context);
    }

    // Rate limiting validation
    if (config.rateLimits) {
      this.validateField('rateLimits', config.rateLimits, ['valid_rate_limits'], context);
    }

    // Headers validation
    if (config.headers) {
      this.validateAPIHeaders(config.headers, context);
    }

    // Request/Response format validation
    if (config.requestFormat) {
      this.validateField('requestFormat', config.requestFormat, ['data_format_compatibility'], context);
    }

    if (config.responseFormat) {
      this.validateField('responseFormat', config.responseFormat, ['data_format_compatibility'], context);
    }
  }

  validateAPIHeaders(headers, context) {
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-auth-token'];
    
    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
          // Good - using template variables
          continue;
        } else {
          this.addWarning(`Header '${key}' may contain hardcoded sensitive information`);
        }
      }
    }
  }

  validateDatabaseIntegration(integration, context) {
    const config = integration.config || {};
    
    // Connection string validation
    if (config.connectionString) {
      this.validateDatabaseConnectionString(config.connectionString, context);
    }

    // Pool configuration validation
    if (config.pool) {
      this.validateDatabasePoolConfig(config.pool, context);
    }

    // Migration configuration
    if (config.migrations) {
      this.validateMigrationConfig(config.migrations, context);
    }

    // Backup configuration
    if (config.backup) {
      this.validateBackupConfig(config.backup, context);
    }
  }

  validateDatabaseConnectionString(connectionString, context) {
    // Check for hardcoded credentials
    const hasHardcodedCredentials = 
      connectionString.includes('password=') && 
      !connectionString.includes('${') &&
      !connectionString.includes('{{');
    
    if (hasHardcodedCredentials) {
      this.addError('Database connection string contains hardcoded credentials');
    }

    // Check for SSL/TLS
    if (!connectionString.includes('ssl=true') && !connectionString.includes('sslmode=require')) {
      this.addWarning('Database connection should use SSL/TLS encryption');
    }
  }

  validateDatabasePoolConfig(poolConfig, context) {
    if (poolConfig.min !== undefined && poolConfig.max !== undefined) {
      if (poolConfig.min > poolConfig.max) {
        this.addError('Database pool min connections cannot exceed max connections');
      }
    }

    if (poolConfig.max !== undefined && poolConfig.max > 100) {
      this.addWarning('Database pool max connections seems very high, may cause resource issues');
    }
  }

  validateMigrationConfig(migrationConfig, context) {
    if (!migrationConfig.directory) {
      this.addWarning('Migration directory not specified');
    }

    if (!migrationConfig.tableName) {
      this.addSuggestion('Consider specifying custom migration table name');
    }
  }

  validateBackupConfig(backupConfig, context) {
    if (!backupConfig.schedule) {
      this.addWarning('No backup schedule specified');
    }

    if (!backupConfig.retention) {
      this.addWarning('No backup retention policy specified');
    }
  }

  validateMessageQueueIntegration(integration, context) {
    const config = integration.config || {};
    
    // Queue configuration validation
    if (config.queues) {
      for (const queue of config.queues) {
        this.validateQueueConfig(queue, context);
      }
    }

    // Consumer configuration
    if (config.consumers) {
      this.validateConsumerConfig(config.consumers, context);
    }

    // Dead letter queue configuration
    if (config.deadLetterQueue) {
      this.validateDeadLetterQueueConfig(config.deadLetterQueue, context);
    }
  }

  validateQueueConfig(queueConfig, context) {
    if (!queueConfig.name) {
      this.addError('Queue name is required');
    }

    if (queueConfig.maxSize && queueConfig.maxSize < 1000) {
      this.addWarning('Queue size seems small, may cause message loss');
    }
  }

  validateConsumerConfig(consumerConfig, context) {
    if (consumerConfig.concurrency && consumerConfig.concurrency > 50) {
      this.addWarning('High consumer concurrency may overwhelm the system');
    }

    if (!consumerConfig.errorHandler) {
      this.addWarning('No error handler specified for consumer');
    }
  }

  validateDeadLetterQueueConfig(dlqConfig, context) {
    if (!dlqConfig.maxRetries) {
      this.addWarning('No max retries specified for dead letter queue');
    }

    if (dlqConfig.maxRetries > 10) {
      this.addWarning('Dead letter queue max retries seems high');
    }
  }

  validateFileStorageIntegration(integration, context) {
    const config = integration.config || {};
    
    // Storage provider validation
    if (!config.provider) {
      this.addError('File storage provider not specified');
    }

    // Bucket/container validation
    if (!config.bucket && !config.container) {
      this.addError('Storage bucket/container not specified');
    }

    // Access control validation
    if (config.publicRead && !config.encryption) {
      this.addWarning('Public read access without encryption may pose security risks');
    }

    // CDN configuration
    if (config.cdn) {
      this.validateCDNConfig(config.cdn, context);
    }
  }

  validateCDNConfig(cdnConfig, context) {
    if (!cdnConfig.domain) {
      this.addWarning('CDN domain not specified');
    }

    if (!cdnConfig.caching) {
      this.addSuggestion('Consider configuring CDN caching rules');
    }
  }

  validatePaymentIntegration(integration, context) {
    const config = integration.config || {};
    
    // Provider validation
    const validProviders = ['stripe', 'paypal', 'square', 'braintree'];
    if (config.provider && !validProviders.includes(config.provider)) {
      this.addWarning(`Payment provider '${config.provider}' is not commonly supported`);
    }

    // Webhook validation
    if (!config.webhooks) {
      this.addError('Payment integration must configure webhooks for transaction status');
    }

    // Security validation
    if (!config.encryption) {
      this.addError('Payment integration must use encryption');
    }

    // PCI compliance check
    if (!config.pciCompliant) {
      this.addWarning('Ensure payment integration meets PCI compliance requirements');
    }
  }

  validateAuthIntegration(integration, context) {
    const config = integration.config || {};
    
    // Provider validation
    const validProviders = ['oauth2', 'saml', 'ldap', 'jwt', 'openid'];
    if (config.provider && !validProviders.includes(config.provider)) {
      this.addWarning(`Auth provider '${config.provider}' may not be widely supported`);
    }

    // Token validation
    if (config.tokenExpiry && config.tokenExpiry > 86400000) { // 24 hours
      this.addWarning('Token expiry seems very long, consider shorter duration for security');
    }

    // Refresh token validation
    if (!config.refreshToken && config.tokenExpiry) {
      this.addWarning('Consider implementing refresh tokens for better user experience');
    }

    // Multi-factor authentication
    if (!config.mfa && integration.securityLevel === 'high') {
      this.addSuggestion('Consider implementing multi-factor authentication');
    }
  }

  validateGenericIntegration(integration, context) {
    const config = integration.config || {};
    
    // Basic configuration validation
    if (!config.endpoint && !config.connectionString && !config.provider) {
      this.addWarning('Integration lacks connection configuration');
    }

    // Security validation
    this.validateField('config', config, ['secure_connection'], context);
  }

  validateIntegrationDependencies(config) {
    // Check for circular dependencies
    this.checkCircularDependencies(config.dependencies);
    
    // Validate dependency resolution order
    this.validateDependencyOrder(config.integrations, config.dependencies);
  }

  checkCircularDependencies(dependencies) {
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = (node) => {
      if (recursionStack.has(node)) {
        return true;
      }
      
      if (visited.has(node)) {
        return false;
      }
      
      visited.add(node);
      recursionStack.add(node);
      
      const dependents = dependencies
        .filter(dep => dep.from === node)
        .map(dep => dep.to);
      
      for (const dependent of dependents) {
        if (hasCycle(dependent)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    const allNodes = new Set([
      ...dependencies.map(d => d.from),
      ...dependencies.map(d => d.to)
    ]);
    
    for (const node of allNodes) {
      if (hasCycle(node)) {
        this.addError('Circular dependency detected in integrations');
        break;
      }
    }
  }

  validateDependencyOrder(integrations, dependencies) {
    const integrationNames = integrations.map(i => i.name);
    
    for (const dep of dependencies) {
      if (!integrationNames.includes(dep.from)) {
        this.addError(`Dependency references unknown integration: ${dep.from}`);
      }
      
      if (!integrationNames.includes(dep.to)) {
        this.addError(`Dependency references unknown integration: ${dep.to}`);
      }
    }
  }

  validateSecurityConfigurations(config) {
    let secureCount = 0;
    
    for (const integration of config.integrations) {
      if (this.isIntegrationSecure(integration)) {
        secureCount++;
      }
    }
    
    config.secureCount = secureCount;
    
    const securityRatio = secureCount / config.integrations.length;
    if (securityRatio < 0.8 && config.environment === 'production') {
      this.addWarning('Less than 80% of integrations use secure configurations');
    }
  }

  isIntegrationSecure(integration) {
    const config = integration.config || {};
    
    // Check for HTTPS
    if (config.endpoint && config.endpoint.startsWith('http://')) {
      return false;
    }
    
    // Check for encryption
    if (integration.type === 'database' && !config.ssl) {
      return false;
    }
    
    // Check for authentication
    if (!config.auth && integration.type !== 'file_storage') {
      return false;
    }
    
    return true;
  }

  validateDataFlowCompatibility(config) {
    // Check data format compatibility between connected integrations
    const dataFlows = this.extractDataFlows(config.integrations, config.dependencies);
    
    for (const flow of dataFlows) {
      this.validateDataFlowFormats(flow);
    }
  }

  extractDataFlows(integrations, dependencies) {
    const flows = [];
    
    for (const dep of dependencies) {
      const fromIntegration = integrations.find(i => i.name === dep.from);
      const toIntegration = integrations.find(i => i.name === dep.to);
      
      if (fromIntegration && toIntegration) {
        flows.push({
          from: fromIntegration,
          to: toIntegration,
          dependency: dep
        });
      }
    }
    
    return flows;
  }

  validateDataFlowFormats(flow) {
    const fromFormat = flow.from.config?.responseFormat || flow.from.config?.dataFormat;
    const toFormat = flow.to.config?.requestFormat || flow.to.config?.dataFormat;
    
    if (fromFormat && toFormat && fromFormat !== toFormat) {
      this.addWarning(
        `Data format mismatch between ${flow.from.name} (${fromFormat}) and ${flow.to.name} (${toFormat})`
      );
    }
  }

  validatePerformanceConfigurations(config) {
    for (const integration of config.integrations) {
      this.validateIntegrationPerformance(integration);
    }
  }

  validateIntegrationPerformance(integration) {
    const config = integration.config || {};
    
    // Timeout validation
    if (config.timeout && config.timeout > 60000) {
      this.addWarning(`Integration ${integration.name} has very high timeout (${config.timeout}ms)`);
    }
    
    // Connection pool validation
    if (config.pool) {
      if (config.pool.max > 100) {
        this.addWarning(`Integration ${integration.name} has large connection pool size`);
      }
    }
    
    // Rate limiting validation
    if (!config.rateLimits && integration.type === 'api') {
      this.addSuggestion(`Consider adding rate limiting to API integration ${integration.name}`);
    }
  }

  // Rule implementation methods
  validateEndpoint(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
    } catch {
      return false;
    }
  }

  validateAuthConfig(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }
    
    const validAuthTypes = ['bearer', 'basic', 'apikey', 'oauth2', 'jwt'];
    return validAuthTypes.includes(config.type);
  }

  validateRateLimits(limits) {
    if (!limits || typeof limits !== 'object') {
      return false;
    }
    
    return limits.requestsPerSecond > 0 || limits.requestsPerMinute > 0 || limits.requestsPerHour > 0;
  }

  validateSecureConnection(config) {
    if (config.endpoint) {
      return config.endpoint.startsWith('https://');
    }
    
    if (config.ssl !== undefined) {
      return config.ssl === true;
    }
    
    return true; // Assume secure if can't determine
  }

  validateErrorHandling(config) {
    return config.errorHandler !== undefined || 
           config.onError !== undefined ||
           config.errorHandling !== undefined;
  }

  validateTimeout(timeout) {
    return typeof timeout === 'number' && timeout > 0 && timeout <= 300000; // Max 5 minutes
  }

  validateRetryPolicy(policy) {
    if (!policy || typeof policy !== 'object') {
      return false;
    }
    
    return policy.attempts >= 0 && 
           policy.attempts <= 10 &&
           policy.delay >= 0;
  }

  validateDataFormat(format) {
    const validFormats = ['json', 'xml', 'csv', 'yaml', 'protobuf', 'avro'];
    return validFormats.includes(format);
  }
}

module.exports = { IntegrationValidator };