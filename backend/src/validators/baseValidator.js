const { logger } = require('../utils/logger');

class BaseValidator {
  constructor(options = {}) {
    this.options = {
      strict: false,
      skipWarnings: false,
      includeMetrics: true,
      customRules: [],
      ...options
    };
    
    this.rules = new Map();
    this.results = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      metrics: {}
    };
    
    this.registerDefaultRules();
  }

  async validate(input, context = {}) {
    throw new Error('validate method must be implemented by subclass');
  }

  registerDefaultRules() {
    // Base rules that apply to all validators
    this.registerRule('not_empty', {
      check: (value) => value !== null && value !== undefined && value !== '',
      message: 'Value cannot be empty',
      severity: 'error'
    });

    this.registerRule('valid_string', {
      check: (value) => typeof value === 'string' && value.trim().length > 0,
      message: 'Value must be a non-empty string',
      severity: 'error'
    });

    this.registerRule('valid_number', {
      check: (value) => typeof value === 'number' && !isNaN(value) && isFinite(value),
      message: 'Value must be a valid number',
      severity: 'error'
    });

    this.registerRule('valid_boolean', {
      check: (value) => typeof value === 'boolean',
      message: 'Value must be a boolean',
      severity: 'error'
    });

    this.registerRule('valid_array', {
      check: (value) => Array.isArray(value),
      message: 'Value must be an array',
      severity: 'error'
    });

    this.registerRule('valid_object', {
      check: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
      message: 'Value must be an object',
      severity: 'error'
    });
  }

  registerRule(name, rule) {
    if (!rule.check || typeof rule.check !== 'function') {
      throw new Error('Rule must have a check function');
    }
    
    this.rules.set(name, {
      check: rule.check,
      message: rule.message || `Rule ${name} failed`,
      severity: rule.severity || 'error',
      context: rule.context || null,
      fix: rule.fix || null
    });
  }

  validateInput(input, requiredFields = []) {
    if (!input) {
      this.addError('Input is required for validation');
      return false;
    }

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in input)) {
        this.addError(`Required field '${field}' is missing from input`);
      }
    }

    return this.results.errors.length === 0;
  }

  applyRule(ruleName, value, context = {}) {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      this.addWarning(`Unknown rule: ${ruleName}`);
      return false;
    }

    try {
      const isValid = rule.check(value, context);
      
      if (!isValid) {
        const issue = {
          rule: ruleName,
          message: rule.message,
          value: value,
          context: context,
          fix: rule.fix
        };

        if (rule.severity === 'error') {
          this.addError(issue);
        } else if (rule.severity === 'warning') {
          this.addWarning(issue);
        } else if (rule.severity === 'suggestion') {
          this.addSuggestion(issue);
        }
      }

      return isValid;
    } catch (error) {
      this.addError(`Rule ${ruleName} failed with error: ${error.message}`);
      return false;
    }
  }

  applyRules(rules, value, context = {}) {
    let allValid = true;
    
    for (const ruleName of rules) {
      const isValid = this.applyRule(ruleName, value, context);
      if (!isValid) {
        allValid = false;
        if (this.options.strict) {
          break; // Stop on first error in strict mode
        }
      }
    }

    return allValid;
  }

  validateField(fieldName, value, rules, context = {}) {
    const fieldContext = { ...context, field: fieldName };
    const isValid = this.applyRules(rules, value, fieldContext);
    
    if (this.options.includeMetrics) {
      this.updateMetrics(fieldName, isValid);
    }

    return isValid;
  }

  validateObject(obj, schema, context = {}) {
    let isValid = true;

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = obj[fieldName];
      const fieldRules = Array.isArray(fieldSchema) ? fieldSchema : fieldSchema.rules || [];
      const fieldContext = { ...context, ...fieldSchema.context };

      // Check if field is required
      if (fieldSchema.required && (value === undefined || value === null)) {
        this.addError(`Required field '${fieldName}' is missing`);
        isValid = false;
        continue;
      }

      // Skip validation if field is optional and not provided
      if (!fieldSchema.required && (value === undefined || value === null)) {
        continue;
      }

      const fieldValid = this.validateField(fieldName, value, fieldRules, fieldContext);
      if (!fieldValid) {
        isValid = false;
      }

      // Validate nested objects
      if (fieldSchema.schema && typeof value === 'object' && value !== null) {
        const nestedValid = this.validateObject(value, fieldSchema.schema, fieldContext);
        if (!nestedValid) {
          isValid = false;
        }
      }

      // Validate array items
      if (fieldSchema.items && Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const itemContext = { ...fieldContext, index: i };
          if (fieldSchema.items.schema) {
            const itemValid = this.validateObject(value[i], fieldSchema.items.schema, itemContext);
            if (!itemValid) {
              isValid = false;
            }
          } else if (fieldSchema.items.rules) {
            const itemValid = this.validateField(`${fieldName}[${i}]`, value[i], fieldSchema.items.rules, itemContext);
            if (!itemValid) {
              isValid = false;
            }
          }
        }
      }
    }

    return isValid;
  }

  addError(error) {
    const errorObj = typeof error === 'string' ? { message: error } : error;
    errorObj.timestamp = new Date().toISOString();
    errorObj.severity = 'error';
    
    this.results.errors.push(errorObj);
    this.results.isValid = false;
    
    logger.debug('Validation error added:', errorObj);
  }

  addWarning(warning) {
    if (this.options.skipWarnings) return;
    
    const warningObj = typeof warning === 'string' ? { message: warning } : warning;
    warningObj.timestamp = new Date().toISOString();
    warningObj.severity = 'warning';
    
    this.results.warnings.push(warningObj);
    
    logger.debug('Validation warning added:', warningObj);
  }

  addSuggestion(suggestion) {
    const suggestionObj = typeof suggestion === 'string' ? { message: suggestion } : suggestion;
    suggestionObj.timestamp = new Date().toISOString();
    suggestionObj.severity = 'suggestion';
    
    this.results.suggestions.push(suggestionObj);
    
    logger.debug('Validation suggestion added:', suggestionObj);
  }

  updateMetrics(fieldName, isValid) {
    if (!this.results.metrics.fields) {
      this.results.metrics.fields = {};
    }

    this.results.metrics.fields[fieldName] = {
      isValid: isValid,
      timestamp: new Date().toISOString()
    };
  }

  getResults() {
    if (this.options.includeMetrics) {
      this.results.metrics.summary = {
        totalErrors: this.results.errors.length,
        totalWarnings: this.results.warnings.length,
        totalSuggestions: this.results.suggestions.length,
        validationTime: new Date().toISOString(),
        validator: this.constructor.name
      };
    }

    return { ...this.results };
  }

  reset() {
    this.results = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      metrics: {}
    };
  }

  createValidationResult(success = true, metadata = {}) {
    const results = this.getResults();
    
    return {
      success: success && results.isValid,
      valid: results.isValid,
      errors: results.errors,
      warnings: results.warnings,
      suggestions: results.suggestions,
      metrics: results.metrics,
      summary: {
        totalIssues: results.errors.length + results.warnings.length,
        criticalIssues: results.errors.length,
        hasErrors: results.errors.length > 0,
        hasWarnings: results.warnings.length > 0,
        hasSuggestions: results.suggestions.length > 0
      },
      metadata: {
        validator: this.constructor.name,
        validatedAt: new Date().toISOString(),
        options: this.options,
        ...metadata
      }
    };
  }

  createErrorResult(error, context = {}) {
    logger.error(`Validation failed in ${this.constructor.name}:`, {
      error: error.message,
      context
    });

    return {
      success: false,
      valid: false,
      error: {
        message: error.message,
        code: error.code || 'VALIDATION_ERROR',
        validator: this.constructor.name
      },
      errors: this.results.errors,
      warnings: this.results.warnings,
      suggestions: this.results.suggestions,
      metadata: {
        validator: this.constructor.name,
        validatedAt: new Date().toISOString(),
        context
      }
    };
  }

  async performAsyncValidation(input, validationFunction) {
    try {
      const startTime = Date.now();
      const result = await validationFunction(input);
      const duration = Date.now() - startTime;
      
      logger.debug(`Validation completed in ${duration}ms`, {
        validator: this.constructor.name,
        errors: this.results.errors.length,
        warnings: this.results.warnings.length
      });
      
      return result;
    } catch (error) {
      logger.error(`Async validation failed:`, {
        validator: this.constructor.name,
        error: error.message
      });
      throw error;
    }
  }

  // Utility methods for common validation patterns
  validateEnum(value, allowedValues, fieldName = 'value') {
    if (!allowedValues.includes(value)) {
      this.addError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
      return false;
    }
    return true;
  }

  validateRange(value, min, max, fieldName = 'value') {
    if (typeof value !== 'number') {
      this.addError(`${fieldName} must be a number`);
      return false;
    }
    
    if (value < min || value > max) {
      this.addError(`${fieldName} must be between ${min} and ${max}`);
      return false;
    }
    return true;
  }

  validateLength(value, minLength, maxLength, fieldName = 'value') {
    const length = typeof value === 'string' ? value.length : (value && value.length) || 0;
    
    if (length < minLength) {
      this.addError(`${fieldName} must be at least ${minLength} characters long`);
      return false;
    }
    
    if (maxLength && length > maxLength) {
      this.addError(`${fieldName} cannot exceed ${maxLength} characters`);
      return false;
    }
    
    return true;
  }

  validatePattern(value, pattern, fieldName = 'value', patternName = 'pattern') {
    if (typeof value !== 'string') {
      this.addError(`${fieldName} must be a string`);
      return false;
    }
    
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    if (!regex.test(value)) {
      this.addError(`${fieldName} does not match required ${patternName} format`);
      return false;
    }
    
    return true;
  }

  validateEmail(email, fieldName = 'email') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.validatePattern(email, emailPattern, fieldName, 'email');
  }

  validateUrl(url, fieldName = 'url') {
    try {
      new URL(url);
      return true;
    } catch {
      this.addError(`${fieldName} must be a valid URL`);
      return false;
    }
  }

  validateDate(date, fieldName = 'date') {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      this.addError(`${fieldName} must be a valid date`);
      return false;
    }
    return true;
  }

  validateUUID(uuid, fieldName = 'UUID') {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return this.validatePattern(uuid, uuidPattern, fieldName, 'UUID');
  }

  validateJSON(jsonString, fieldName = 'JSON') {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      this.addError(`${fieldName} must be valid JSON`);
      return false;
    }
  }

  // Validation for common programming concepts
  validateIdentifier(value, fieldName = 'identifier') {
    const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return this.validatePattern(value, identifierPattern, fieldName, 'identifier');
  }

  validateSemver(version, fieldName = 'version') {
    const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return this.validatePattern(version, semverPattern, fieldName, 'semantic version');
  }

  validatePath(path, fieldName = 'path') {
    if (typeof path !== 'string' || path.length === 0) {
      this.addError(`${fieldName} must be a non-empty string`);
      return false;
    }
    
    // Check for invalid characters (basic check)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      this.addError(`${fieldName} contains invalid characters`);
      return false;
    }
    
    return true;
  }

  // Helper method to merge validation results
  mergeResults(otherResults) {
    this.results.errors.push(...otherResults.errors);
    this.results.warnings.push(...otherResults.warnings);
    this.results.suggestions.push(...otherResults.suggestions);
    
    if (otherResults.errors.length > 0) {
      this.results.isValid = false;
    }
    
    // Merge metrics
    if (otherResults.metrics && this.results.metrics) {
      this.results.metrics = { ...this.results.metrics, ...otherResults.metrics };
    }
  }

  // Method to apply custom validation rules from options
  applyCustomRules(value, context = {}) {
    if (!this.options.customRules || this.options.customRules.length === 0) {
      return true;
    }

    let allValid = true;
    
    for (const customRule of this.options.customRules) {
      try {
        const isValid = customRule.check(value, context);
        if (!isValid) {
          this.addError(customRule.message || 'Custom validation rule failed');
          allValid = false;
        }
      } catch (error) {
        this.addError(`Custom rule failed: ${error.message}`);
        allValid = false;
      }
    }

    return allValid;
  }
}

module.exports = { BaseValidator };