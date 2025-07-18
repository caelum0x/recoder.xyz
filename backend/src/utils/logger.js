const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston about the colors
winston.addColors(colors);

// Define the format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Define the format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: fileFormat,
  defaultMeta: { service: 'craft-code-backend' },
  transports: [
    // Write all logs with importance level of 'error' or higher to error.log
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: fileFormat
    }),
    // Write all logs with importance level of 'info' or higher to combined.log
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: fileFormat
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create a stream object for morgan HTTP request logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Helper functions for structured logging
const createLoggerWithContext = (context) => {
  return {
    error: (message, meta = {}) => logger.error(message, { ...meta, ...context }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, ...context }),
    info: (message, meta = {}) => logger.info(message, { ...meta, ...context }),
    http: (message, meta = {}) => logger.http(message, { ...meta, ...context }),
    debug: (message, meta = {}) => logger.debug(message, { ...meta, ...context })
  };
};

// Helper function to log API requests
const logApiRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.user ? req.user.id : null
  };

  if (res.statusCode >= 400) {
    logger.warn('API Request', logData);
  } else {
    logger.http('API Request', logData);
  }
};

// Helper function to log database queries
const logDatabaseQuery = (query, duration, error = null) => {
  const logData = {
    query: query.substr(0, 200), // Limit query length
    duration: `${duration}ms`
  };

  if (error) {
    logger.error('Database Query Error', { ...logData, error: error.message });
  } else {
    logger.debug('Database Query', logData);
  }
};

// Helper function to log security events
const logSecurityEvent = (event, details) => {
  logger.warn('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Helper function to log business events
const logBusinessEvent = (event, details) => {
  logger.info('Business Event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Helper function to log errors with context
const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
};

// Helper function to log performance metrics
const logPerformanceMetric = (metric, value, unit = 'ms') => {
  logger.info('Performance Metric', {
    metric,
    value,
    unit,
    timestamp: new Date().toISOString()
  });
};

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  logger,
  createLoggerWithContext,
  logApiRequest,
  logDatabaseQuery,
  logSecurityEvent,
  logBusinessEvent,
  logError,
  logPerformanceMetric
};