const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    logger.warn('Validation failed:', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      userId: req.user ? req.user.id : null
    });

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errorDetails
      }
    });
  }

  next();
};

const sanitizeInput = (req, res, next) => {
  try {
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      
      // Remove potentially dangerous characters
      return str
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocols
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim();
    };

    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    next();
  }
};

const validateFileUpload = (options = {}) => {
  const {
    allowedMimeTypes = [],
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    maxFiles = 5,
    required = false
  } = options;

  return (req, res, next) => {
    try {
      const files = req.files;
      
      if (!files || files.length === 0) {
        if (required) {
          return res.status(400).json({
            error: {
              message: 'File upload is required',
              code: 'FILE_REQUIRED'
            }
          });
        }
        return next();
      }

      if (files.length > maxFiles) {
        return res.status(400).json({
          error: {
            message: `Maximum ${maxFiles} files allowed`,
            code: 'TOO_MANY_FILES'
          }
        });
      }

      for (const file of files) {
        // Check file size
        if (file.size > maxFileSize) {
          return res.status(400).json({
            error: {
              message: `File size exceeds ${maxFileSize / (1024 * 1024)}MB limit`,
              code: 'FILE_TOO_LARGE'
            }
          });
        }

        // Check MIME type
        if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
          return res.status(400).json({
            error: {
              message: `File type ${file.mimetype} not allowed`,
              code: 'INVALID_FILE_TYPE'
            }
          });
        }

        // Check for potentially dangerous files
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.vbs', '.js'];
        const fileExtension = file.originalname.toLowerCase().substr(file.originalname.lastIndexOf('.'));
        
        if (dangerousExtensions.includes(fileExtension)) {
          return res.status(400).json({
            error: {
              message: 'File type not allowed for security reasons',
              code: 'DANGEROUS_FILE_TYPE'
            }
          });
        }
      }

      next();
    } catch (error) {
      logger.error('File upload validation error:', error);
      return res.status(500).json({
        error: {
          message: 'File validation failed',
          code: 'FILE_VALIDATION_ERROR'
        }
      });
    }
  };
};

const validateJsonStructure = (schema) => {
  return (req, res, next) => {
    try {
      const validateSchema = (data, schemaObj, path = '') => {
        for (const [key, rules] of Object.entries(schemaObj)) {
          const currentPath = path ? `${path}.${key}` : key;
          const value = data[key];

          if (rules.required && (value === undefined || value === null)) {
            throw new Error(`${currentPath} is required`);
          }

          if (value !== undefined && value !== null) {
            if (rules.type && typeof value !== rules.type) {
              throw new Error(`${currentPath} must be of type ${rules.type}`);
            }

            if (rules.enum && !rules.enum.includes(value)) {
              throw new Error(`${currentPath} must be one of: ${rules.enum.join(', ')}`);
            }

            if (rules.minLength && value.length < rules.minLength) {
              throw new Error(`${currentPath} must be at least ${rules.minLength} characters long`);
            }

            if (rules.maxLength && value.length > rules.maxLength) {
              throw new Error(`${currentPath} must be at most ${rules.maxLength} characters long`);
            }

            if (rules.pattern && !rules.pattern.test(value)) {
              throw new Error(`${currentPath} format is invalid`);
            }

            if (rules.properties && typeof value === 'object') {
              validateSchema(value, rules.properties, currentPath);
            }
          }
        }
      };

      validateSchema(req.body, schema);
      next();
    } catch (error) {
      logger.warn('JSON structure validation failed:', {
        path: req.path,
        error: error.message,
        userId: req.user ? req.user.id : null
      });

      return res.status(400).json({
        error: {
          message: error.message,
          code: 'SCHEMA_VALIDATION_ERROR'
        }
      });
    }
  };
};

const validatePagination = (req, res, next) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({
        error: {
          message: 'Limit must be a number between 1 and 100',
          code: 'INVALID_LIMIT'
        }
      });
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        error: {
          message: 'Offset must be a non-negative number',
          code: 'INVALID_OFFSET'
        }
      });
    }

    req.pagination = {
      limit: parsedLimit,
      offset: parsedOffset
    };

    next();
  } catch (error) {
    logger.error('Pagination validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Pagination validation failed',
        code: 'PAGINATION_ERROR'
      }
    });
  }
};

const validateContentType = (expectedType) => {
  return (req, res, next) => {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes(expectedType)) {
      return res.status(400).json({
        error: {
          message: `Content-Type must be ${expectedType}`,
          code: 'INVALID_CONTENT_TYPE'
        }
      });
    }

    next();
  };
};

const validateApiVersion = (req, res, next) => {
  const apiVersion = req.headers['x-api-version'] || req.query.version || 'v1';
  const supportedVersions = ['v1', 'v2'];

  if (!supportedVersions.includes(apiVersion)) {
    return res.status(400).json({
      error: {
        message: `API version ${apiVersion} is not supported`,
        code: 'UNSUPPORTED_API_VERSION'
      }
    });
  }

  req.apiVersion = apiVersion;
  next();
};

const validateUserAgent = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  
  if (!userAgent) {
    return res.status(400).json({
      error: {
        message: 'User-Agent header is required',
        code: 'MISSING_USER_AGENT'
      }
    });
  }

  // Block known malicious user agents
  const blockedAgents = [
    'sqlmap',
    'nikto',
    'masscan',
    'nmap'
  ];

  if (blockedAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    return res.status(403).json({
      error: {
        message: 'Blocked user agent',
        code: 'BLOCKED_USER_AGENT'
      }
    });
  }

  next();
};

const validateRequestId = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || 
                   req.headers['x-correlation-id'] || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

module.exports = {
  validateRequest,
  sanitizeInput,
  validateFileUpload,
  validateJsonStructure,
  validatePagination,
  validateContentType,
  validateApiVersion,
  validateUserAgent,
  validateRequestId
};