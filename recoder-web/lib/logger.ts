// Simple logger that works in both Node.js and Edge Runtime
const isDevelopment = process.env.NODE_ENV === 'development';

// Simple logger implementation that works in edge runtime
const createLogger = () => {
  const formatMessage = (level: string, message: string, metadata?: any) => {
    const timestamp = new Date().toISOString();
    const meta = metadata ? JSON.stringify(metadata) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${meta}`;
  };

  return {
    debug: (message: string, metadata?: any) => {
      if (isDevelopment) {
        console.debug(formatMessage('debug', message, metadata));
      }
    },
    info: (message: string, metadata?: any) => {
      console.info(formatMessage('info', message, metadata));
    },
    warn: (message: string, metadata?: any) => {
      console.warn(formatMessage('warn', message, metadata));
    },
    error: (message: string, metadata?: any) => {
      console.error(formatMessage('error', message, metadata));
    },
    log: (level: string, message: string, metadata?: any) => {
      console.log(formatMessage(level, message, metadata));
    }
  };
};

const logger = createLogger();

// Export both named and default exports to fix import issues
export { logger };
export default logger;

// Add performance and request logging utilities
export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    type: 'performance',
    ...metadata
  });
};

export const logRequest = (method: string, url: string, statusCode: number, duration: number) => {
  const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
  logger.log(level, `${method} ${url} ${statusCode}`, {
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    type: 'request'
  });
};

export const logSecurity = (event: string, details: any) => {
  logger.warn(`Security: ${event}`, {
    event,
    type: 'security',
    ...details
  });
};