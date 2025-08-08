const { BaseValidator } = require('./baseValidator');
const { logger } = require('../utils/logger');

class ApiValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.registerAPIRules();
  }

  registerAPIRules() {
    // API-specific validation rules
    this.registerRule('valid_rest_endpoint', {
      check: (endpoint) => this.validateRESTEndpoint(endpoint),
      message: 'Invalid REST API endpoint structure',
      severity: 'error'
    });

    this.registerRule('proper_http_methods', {
      check: (methods) => this.validateHTTPMethods(methods),
      message: 'Invalid or inappropriate HTTP methods',
      severity: 'error'
    });

    this.registerRule('valid_status_codes', {
      check: (codes) => this.validateStatusCodes(codes),
      message: 'Invalid or inappropriate HTTP status codes',
      severity: 'warning'
    });

    this.registerRule('proper_content_types', {
      check: (types) => this.validateContentTypes(types),
      message: 'Invalid or missing content type specifications',
      severity: 'warning'
    });

    this.registerRule('valid_authentication', {
      check: (auth) => this.validateAuthentication(auth),
      message: 'Invalid authentication configuration',
      severity: 'error'
    });

    this.registerRule('proper_versioning', {
      check: (versioning) => this.validateVersioning(versioning),
      message: 'API versioning strategy is missing or inadequate',
      severity: 'warning'
    });

    this.registerRule('rate_limiting_configured', {
      check: (rateLimiting) => this.validateRateLimiting(rateLimiting),
      message: 'Rate limiting should be configured for API protection',
      severity: 'warning'
    });

    this.registerRule('proper_error_responses', {
      check: (errors) => this.validateErrorResponses(errors),
      message: 'Error responses are not properly structured',
      severity: 'warning'
    });

    this.registerRule('valid_request_validation', {
      check: (validation) => this.validateRequestValidation(validation),
      message: 'Request validation is insufficient',
      severity: 'error'
    });

    this.registerRule('proper_documentation', {
      check: (docs) => this.validateDocumentation(docs),
      message: 'API documentation is missing or incomplete',
      severity: 'suggestion'
    });

    this.registerRule('security_headers', {
      check: (headers) => this.validateSecurityHeaders(headers),
      message: 'Important security headers are missing',
      severity: 'warning'
    });

    this.registerRule('cors_configuration', {
      check: (cors) => this.validateCORSConfiguration(cors),
      message: 'CORS configuration may be insecure',
      severity: 'warning'
    });
  }

  async validate(input, context = {}) {
    try {
      this.validateInput(input, ['apiSpec']);

      const result = await this.performAsyncValidation(input, async () => {
        this.reset();

        const apiConfig = this.analyzeAPISpecification(input);
        
        // Validate API structure and design
        await this.validateAPIStructure(apiConfig);
        
        // Validate endpoints
        this.validateEndpoints(apiConfig);
        
        // Validate security configurations
        this.validateAPISecurity(apiConfig);
        
        // Validate performance considerations
        this.validateAPIPerformance(apiConfig);
        
        // Validate documentation and contracts
        this.validateAPIDocumentation(apiConfig);
        
        // Validate data models and schemas
        this.validateDataModels(apiConfig);
        
        return this.createValidationResult(true, {
          apiVersion: apiConfig.version,
          endpointCount: apiConfig.endpoints.length,
          securityScore: this.calculateSecurityScore(apiConfig)
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeAPISpecification(input) {
    const spec = input.apiSpec;
    
    const config = {
      format: input.format || this.detectSpecFormat(spec),
      version: spec.info?.version || spec.version || '1.0.0',
      title: spec.info?.title || spec.title || 'API',
      baseUrl: spec.servers?.[0]?.url || spec.basePath || '',
      endpoints: this.extractEndpoints(spec),
      security: this.extractSecuritySchemes(spec),
      models: this.extractDataModels(spec),
      documentation: spec.info || {},
      extensions: input.extensions || {},
      environment: input.environment || 'production'
    };

    return config;
  }

  detectSpecFormat(spec) {
    if (spec.openapi) return 'openapi';
    if (spec.swagger) return 'swagger';
    if (spec.asyncapi) return 'asyncapi';
    if (spec.graphql) return 'graphql';
    return 'custom';
  }

  extractEndpoints(spec) {
    const endpoints = [];
    
    if (spec.paths) {
      // OpenAPI/Swagger format
      for (const [path, pathObj] of Object.entries(spec.paths)) {
        for (const [method, methodObj] of Object.entries(pathObj)) {
          if (typeof methodObj === 'object' && methodObj.operationId) {
            endpoints.push({
              path,
              method: method.toUpperCase(),
              operationId: methodObj.operationId,
              summary: methodObj.summary,
              parameters: methodObj.parameters || [],
              responses: methodObj.responses || {},
              security: methodObj.security || [],
              tags: methodObj.tags || []
            });
          }
        }
      }
    }
    
    return endpoints;
  }

  extractSecuritySchemes(spec) {
    if (spec.components?.securitySchemes) {
      return spec.components.securitySchemes;
    }
    
    if (spec.securityDefinitions) {
      return spec.securityDefinitions;
    }
    
    return {};
  }

  extractDataModels(spec) {
    if (spec.components?.schemas) {
      return spec.components.schemas;
    }
    
    if (spec.definitions) {
      return spec.definitions;
    }
    
    return {};
  }

  async validateAPIStructure(config) {
    // Basic API information validation
    if (!config.title || config.title.length < 3) {
      this.addError('API title should be descriptive (at least 3 characters)');
    }
    
    if (!config.version) {
      this.addError('API version is required');
    } else if (!this.validateSemver(config.version, 'API version')) {
      // Error already added by validateSemver
    }
    
    // Base URL validation
    if (config.baseUrl) {
      if (!this.validateUrl(config.baseUrl, 'base URL')) {
        // Error already added by validateUrl
      }
    }
    
    // Endpoint count validation
    if (config.endpoints.length === 0) {
      this.addError('API specification contains no endpoints');
    } else if (config.endpoints.length > 100) {
      this.addWarning('API has a very large number of endpoints, consider breaking into multiple APIs');
    }
    
    // Versioning strategy validation
    this.validateField('versioning', config, ['proper_versioning']);
  }

  validateEndpoints(config) {
    const endpointGroups = this.groupEndpointsByPath(config.endpoints);
    
    for (const endpoint of config.endpoints) {
      this.validateSingleEndpoint(endpoint, config);
    }
    
    // Check for RESTful design
    this.validateRESTfulDesign(endpointGroups);
    
    // Check for consistency
    this.validateEndpointConsistency(config.endpoints);
  }

  groupEndpointsByPath(endpoints) {
    const groups = {};
    
    for (const endpoint of endpoints) {
      const basePath = endpoint.path.split('/').slice(0, 3).join('/');
      if (!groups[basePath]) {
        groups[basePath] = [];
      }
      groups[basePath].push(endpoint);
    }
    
    return groups;
  }

  validateSingleEndpoint(endpoint, config) {
    const context = { endpoint: endpoint.operationId || endpoint.path };
    
    // Path validation
    this.validateField('path', endpoint.path, ['valid_rest_endpoint'], context);
    
    // HTTP method validation
    this.validateField('method', endpoint.method, ['proper_http_methods'], context);
    
    // Parameters validation
    if (endpoint.parameters) {
      this.validateEndpointParameters(endpoint.parameters, context);
    }
    
    // Responses validation
    this.validateField('responses', endpoint.responses, ['valid_status_codes'], context);
    this.validateField('responses', endpoint.responses, ['proper_error_responses'], context);
    
    // Security validation
    if (endpoint.security) {
      this.validateField('security', endpoint.security, ['valid_authentication'], context);
    }
  }

  validateEndpointParameters(parameters, context) {
    const paramNames = new Set();
    
    for (const param of parameters) {
      // Check for duplicate parameter names
      if (paramNames.has(param.name)) {
        this.addError(`Duplicate parameter name '${param.name}' in endpoint`);
      }
      paramNames.add(param.name);
      
      // Validate parameter structure
      if (!param.name) {
        this.addError('Parameter name is required');
      }
      
      if (!param.in) {
        this.addError('Parameter location (in) is required');
      }
      
      // Validate parameter types
      if (param.schema && !this.isValidParameterType(param.schema.type)) {
        this.addWarning(`Parameter '${param.name}' has unusual type: ${param.schema.type}`);
      }
    }
  }

  isValidParameterType(type) {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    return validTypes.includes(type);
  }

  validateRESTfulDesign(endpointGroups) {
    for (const [basePath, endpoints] of Object.entries(endpointGroups)) {
      this.validateResourceEndpoints(basePath, endpoints);
    }
  }

  validateResourceEndpoints(basePath, endpoints) {
    const methods = endpoints.map(e => e.method);
    const hasCRUD = {
      create: methods.includes('POST'),
      read: methods.includes('GET'),
      update: methods.includes('PUT') || methods.includes('PATCH'),
      delete: methods.includes('DELETE')
    };
    
    // Check for common REST patterns
    if (hasCRUD.create && !hasCRUD.read) {
      this.addSuggestion(`Resource ${basePath} allows creation but not reading`);
    }
    
    if (hasCRUD.update && !hasCRUD.read) {
      this.addSuggestion(`Resource ${basePath} allows updates but not reading`);
    }
    
    // Check for proper use of HTTP methods
    const postEndpoints = endpoints.filter(e => e.method === 'POST');
    if (postEndpoints.length > 1) {
      this.addWarning(`Multiple POST endpoints for resource ${basePath} may indicate design issues`);
    }
  }

  validateEndpointConsistency(endpoints) {
    // Check naming consistency
    const namingPatterns = this.analyzeNamingPatterns(endpoints);
    if (namingPatterns.inconsistent) {
      this.addWarning('Inconsistent endpoint naming patterns detected');
    }
    
    // Check response format consistency
    this.validateResponseFormatConsistency(endpoints);
  }

  analyzeNamingPatterns(endpoints) {
    const patterns = {
      camelCase: 0,
      kebabCase: 0,
      snake_case: 0,
      inconsistent: false
    };
    
    for (const endpoint of endpoints) {
      const pathSegments = endpoint.path.split('/').filter(s => s && !s.startsWith('{'));
      
      for (const segment of pathSegments) {
        if (this.isCamelCase(segment)) patterns.camelCase++;
        else if (this.isKebabCase(segment)) patterns.kebabCase++;
        else if (this.isSnakeCase(segment)) patterns.snake_case++;
      }
    }
    
    const totalNonZero = Object.values(patterns).filter(v => v > 0).length;
    patterns.inconsistent = totalNonZero > 1;
    
    return patterns;
  }

  isCamelCase(str) {
    return /^[a-z][a-zA-Z0-9]*$/.test(str) && /[A-Z]/.test(str);
  }

  isKebabCase(str) {
    return /^[a-z0-9-]+$/.test(str) && str.includes('-');
  }

  isSnakeCase(str) {
    return /^[a-z0-9_]+$/.test(str) && str.includes('_');
  }

  validateResponseFormatConsistency(endpoints) {
    const responseFormats = new Set();
    
    for (const endpoint of endpoints) {
      for (const [statusCode, response] of Object.entries(endpoint.responses)) {
        if (response.content) {
          responseFormats.add(Object.keys(response.content).join(','));
        }
      }
    }
    
    if (responseFormats.size > 3) {
      this.addWarning('Many different response formats detected, consider standardizing');
    }
  }

  validateAPISecurity(config) {
    // Security schemes validation
    this.validateField('security', config.security, ['valid_authentication']);
    
    // Check for security on sensitive endpoints
    this.validateEndpointSecurity(config.endpoints);
    
    // CORS validation
    if (config.extensions.cors) {
      this.validateField('cors', config.extensions.cors, ['cors_configuration']);
    }
    
    // Security headers validation
    if (config.extensions.headers) {
      this.validateField('headers', config.extensions.headers, ['security_headers']);
    }
    
    // Rate limiting validation
    if (config.extensions.rateLimiting) {
      this.validateField('rateLimiting', config.extensions.rateLimiting, ['rate_limiting_configured']);
    } else {
      this.addWarning('No rate limiting configuration found');
    }
  }

  validateEndpointSecurity(endpoints) {
    const sensitivePaths = ['/auth', '/login', '/user', '/admin', '/payment'];
    
    for (const endpoint of endpoints) {
      const isSensitive = sensitivePaths.some(path => endpoint.path.includes(path));
      
      if (isSensitive && (!endpoint.security || endpoint.security.length === 0)) {
        this.addWarning(`Sensitive endpoint ${endpoint.path} lacks security configuration`);
      }
      
      if (endpoint.method === 'DELETE' && (!endpoint.security || endpoint.security.length === 0)) {
        this.addWarning(`DELETE endpoint ${endpoint.path} should require authentication`);
      }
    }
  }

  validateAPIPerformance(config) {
    // Check for pagination on list endpoints
    this.validatePagination(config.endpoints);
    
    // Check for filtering and sorting capabilities
    this.validateFiltering(config.endpoints);
    
    // Validate caching headers
    this.validateCaching(config.endpoints);
  }

  validatePagination(endpoints) {
    const listEndpoints = endpoints.filter(e => 
      e.method === 'GET' && 
      !e.path.includes('{') && 
      e.path.split('/').length <= 3
    );
    
    for (const endpoint of listEndpoints) {
      const hasLimitParam = endpoint.parameters.some(p => 
        ['limit', 'pageSize', 'count'].includes(p.name)
      );
      
      const hasOffsetParam = endpoint.parameters.some(p => 
        ['offset', 'page', 'skip'].includes(p.name)
      );
      
      if (!hasLimitParam || !hasOffsetParam) {
        this.addSuggestion(`List endpoint ${endpoint.path} should support pagination`);
      }
    }
  }

  validateFiltering(endpoints) {
    const listEndpoints = endpoints.filter(e => 
      e.method === 'GET' && 
      !e.path.includes('{')
    );
    
    for (const endpoint of listEndpoints) {
      const hasFilterParams = endpoint.parameters.some(p => 
        ['filter', 'search', 'q', 'where'].includes(p.name)
      );
      
      if (!hasFilterParams && endpoint.path.split('/').length <= 3) {
        this.addSuggestion(`List endpoint ${endpoint.path} could benefit from filtering parameters`);
      }
    }
  }

  validateCaching(endpoints) {
    const getEndpoints = endpoints.filter(e => e.method === 'GET');
    
    for (const endpoint of getEndpoints) {
      // Check if caching headers are documented
      const hasETagResponse = Object.values(endpoint.responses).some(response =>
        response.headers && response.headers.ETag
      );
      
      const hasCacheControlResponse = Object.values(endpoint.responses).some(response =>
        response.headers && response.headers['Cache-Control']
      );
      
      if (!hasETagResponse && !hasCacheControlResponse) {
        this.addSuggestion(`GET endpoint ${endpoint.path} should consider caching headers`);
      }
    }
  }

  validateAPIDocumentation(config) {
    // Documentation completeness
    this.validateField('documentation', config.documentation, ['proper_documentation']);
    
    // Endpoint documentation
    this.validateEndpointDocumentation(config.endpoints);
    
    // Examples validation
    this.validateExamples(config.endpoints);
  }

  validateEndpointDocumentation(endpoints) {
    for (const endpoint of endpoints) {
      if (!endpoint.summary || endpoint.summary.length < 10) {
        this.addWarning(`Endpoint ${endpoint.path} lacks proper summary`);
      }
      
      if (!endpoint.description) {
        this.addSuggestion(`Endpoint ${endpoint.path} could benefit from detailed description`);
      }
      
      // Check for response documentation
      const has200Response = endpoint.responses['200'] || endpoint.responses['201'];
      if (!has200Response) {
        this.addWarning(`Endpoint ${endpoint.path} missing success response documentation`);
      }
    }
  }

  validateExamples(endpoints) {
    for (const endpoint of endpoints) {
      const hasRequestExample = endpoint.requestBody && 
                               endpoint.requestBody.content &&
                               Object.values(endpoint.requestBody.content).some(c => c.example);
      
      const hasResponseExample = Object.values(endpoint.responses).some(response =>
        response.content && 
        Object.values(response.content).some(c => c.example)
      );
      
      if (endpoint.method !== 'GET' && !hasRequestExample) {
        this.addSuggestion(`Endpoint ${endpoint.path} could benefit from request examples`);
      }
      
      if (!hasResponseExample) {
        this.addSuggestion(`Endpoint ${endpoint.path} could benefit from response examples`);
      }
    }
  }

  validateDataModels(config) {
    for (const [modelName, model] of Object.entries(config.models)) {
      this.validateSingleDataModel(modelName, model);
    }
    
    // Check for model relationships
    this.validateModelRelationships(config.models);
  }

  validateSingleDataModel(name, model) {
    if (!model.type && !model.properties) {
      this.addWarning(`Data model '${name}' lacks type or properties definition`);
    }
    
    if (model.properties) {
      for (const [propName, prop] of Object.entries(model.properties)) {
        if (!prop.type && !prop.$ref) {
          this.addWarning(`Property '${propName}' in model '${name}' lacks type definition`);
        }
      }
    }
    
    // Check for required fields
    if (model.type === 'object' && (!model.required || model.required.length === 0)) {
      this.addSuggestion(`Object model '${name}' should specify required fields`);
    }
  }

  validateModelRelationships(models) {
    const modelNames = Object.keys(models);
    
    for (const [modelName, model] of Object.entries(models)) {
      if (model.properties) {
        for (const [propName, prop] of Object.entries(model.properties)) {
          if (prop.$ref) {
            const refModel = prop.$ref.split('/').pop();
            if (!modelNames.includes(refModel)) {
              this.addError(`Model '${modelName}' references unknown model '${refModel}'`);
            }
          }
        }
      }
    }
  }

  calculateSecurityScore(config) {
    let score = 0;
    const maxScore = 100;
    
    // Security schemes defined
    if (Object.keys(config.security).length > 0) score += 20;
    
    // HTTPS endpoints
    if (config.baseUrl.startsWith('https://')) score += 20;
    
    // Authentication on endpoints
    const securedEndpoints = config.endpoints.filter(e => e.security && e.security.length > 0);
    score += Math.min(30, (securedEndpoints.length / config.endpoints.length) * 30);
    
    // Rate limiting
    if (config.extensions.rateLimiting) score += 15;
    
    // CORS configuration
    if (config.extensions.cors) score += 10;
    
    // Security headers
    if (config.extensions.headers) score += 5;
    
    return Math.round((score / maxScore) * 100);
  }

  // Rule implementation methods
  validateRESTEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return false;
    
    // Should start with /
    if (!endpoint.startsWith('/')) return false;
    
    // Should not end with / (except root)
    if (endpoint.length > 1 && endpoint.endsWith('/')) return false;
    
    // Should use lowercase and hyphens
    const segments = endpoint.split('/').slice(1);
    for (const segment of segments) {
      if (segment.startsWith('{') && segment.endsWith('}')) continue; // Path parameter
      if (!/^[a-z0-9-]+$/.test(segment)) return false;
    }
    
    return true;
  }

  validateHTTPMethods(method) {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    return validMethods.includes(method);
  }

  validateStatusCodes(responses) {
    for (const code of Object.keys(responses)) {
      const numCode = parseInt(code);
      if (isNaN(numCode) || numCode < 100 || numCode > 599) {
        return false;
      }
    }
    return true;
  }

  validateContentTypes(types) {
    const validTypes = [
      'application/json',
      'application/xml',
      'text/plain',
      'text/html',
      'multipart/form-data',
      'application/x-www-form-urlencoded'
    ];
    
    if (Array.isArray(types)) {
      return types.every(type => validTypes.includes(type));
    }
    
    return validTypes.includes(types);
  }

  validateAuthentication(auth) {
    if (!auth || (Array.isArray(auth) && auth.length === 0)) {
      return true; // No auth is valid for some endpoints
    }
    
    const validAuthTypes = ['bearer', 'basic', 'apiKey', 'oauth2', 'openIdConnect'];
    
    if (Array.isArray(auth)) {
      return auth.every(scheme => 
        typeof scheme === 'object' && 
        Object.keys(scheme).every(key => validAuthTypes.includes(key))
      );
    }
    
    return typeof auth === 'object';
  }

  validateVersioning(api) {
    // Check for version in URL, header, or parameter
    const hasUrlVersioning = api.baseUrl && /\/v\d+/.test(api.baseUrl);
    const hasHeaderVersioning = api.extensions && api.extensions.versionHeader;
    const hasParameterVersioning = api.extensions && api.extensions.versionParameter;
    
    return hasUrlVersioning || hasHeaderVersioning || hasParameterVersioning;
  }

  validateRateLimiting(rateLimiting) {
    if (!rateLimiting) return false;
    
    return rateLimiting.limit && rateLimiting.window;
  }

  validateErrorResponses(responses) {
    // Check for standard error responses
    const hasClientError = Object.keys(responses).some(code => 
      code.startsWith('4') && responses[code].description
    );
    
    const hasServerError = Object.keys(responses).some(code => 
      code.startsWith('5') && responses[code].description
    );
    
    return hasClientError || hasServerError;
  }

  validateRequestValidation(validation) {
    // This would be checked at the framework level
    return true;
  }

  validateDocumentation(docs) {
    return docs.title && docs.description && docs.version;
  }

  validateSecurityHeaders(headers) {
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection'
    ];
    
    if (!headers) return false;
    
    return requiredHeaders.some(header => headers[header]);
  }

  validateCORSConfiguration(cors) {
    if (!cors) return true; // No CORS config is okay
    
    // Check for overly permissive settings
    if (cors.origin === '*' && cors.credentials === true) {
      return false; // Dangerous combination
    }
    
    return true;
  }
}

module.exports = { ApiValidator };