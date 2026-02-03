/**
 * Logging Middleware for recoder-web
 * Provides structured request/response logging
 */

import type { Request, Response, NextFunction } from 'express';
import type { LoggingConfig, LogEntry, ExtendedRequest, MiddlewareHandler } from './types';

/**
 * Default logging configuration
 */
const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  service: 'recoder-web',
  level: 'info',
  includeHeaders: false,
  includeBody: false,
  excludePaths: ['/health', '/api/health', '/favicon.ico', '/_static/*'],
};

/**
 * Check if path should be excluded from logging
 */
function shouldExcludePath(path: string, excludePaths: string[]): boolean {
  return excludePaths.some((excludePath) => {
    if (excludePath.endsWith('*')) {
      return path.startsWith(excludePath.slice(0, -1));
    }
    return path === excludePath;
  });
}

/**
 * Get client IP from request
 */
function getClientIp(req: Request): string {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Create request ID middleware
 * Generates a unique request ID for each request
 */
export function createRequestIdMiddleware(): MiddlewareHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;

    // Use existing request ID from header or generate new one
    const requestId =
      req.get('X-Request-ID') || req.get('X-Request-Id') || crypto.randomUUID();

    extendedReq.requestId = requestId;
    extendedReq.startTime = Date.now();

    // Set request ID in response header
    res.setHeader('X-Request-ID', requestId);

    next();
  };
}

/**
 * Create logging middleware for request/response logging
 */
export function createLoggingMiddleware(config?: Partial<LoggingConfig>): MiddlewareHandler {
  const finalConfig: LoggingConfig = {
    ...DEFAULT_LOGGING_CONFIG,
    ...config,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;
    const startTime = extendedReq.startTime || Date.now();
    const requestId = extendedReq.requestId || crypto.randomUUID();

    // Set request ID if not already set
    if (!extendedReq.requestId) {
      extendedReq.requestId = requestId;
      extendedReq.startTime = startTime;
    }

    // Check if this path should be excluded from logging
    if (shouldExcludePath(req.path, finalConfig.excludePaths || [])) {
      next();
      return;
    }

    // Extract request information
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.get('user-agent') || 'Unknown';
    const clientIp = getClientIp(req);
    const referer = req.get('referer') || req.get('referrer');

    // Log request start (only for debug level)
    if (finalConfig.level === 'debug') {
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'debug',
        message: 'Request started',
        service: finalConfig.service,
        requestId,
        metadata: {
          method,
          url,
          userAgent,
          clientIp,
          referer,
          ...(finalConfig.includeHeaders && {
            headers: Object.fromEntries(
              Object.entries(req.headers).filter(
                ([key]) => !key.toLowerCase().includes('authorization')
              )
            ),
          }),
        },
      };
      console.log(JSON.stringify(logEntry));
    }

    // Capture response finish
    const originalEnd = res.end.bind(res);
    let responseLogged = false;

    res.end = function (this: Response, ...args: any[]): Response {
      if (!responseLogged) {
        responseLogged = true;

        // Calculate response time
        const duration = Date.now() - startTime;
        const status = res.statusCode;

        // Add response headers for debugging
        if (!res.headersSent) {
          res.setHeader('X-Response-Time', `${duration}ms`);
        }

        // Log response
        if (finalConfig.level === 'debug' || finalConfig.level === 'info') {
          const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: logLevel,
            message: 'Request completed',
            service: finalConfig.service,
            requestId,
            metadata: {
              method,
              url,
              status,
              duration,
              userAgent,
              clientIp,
              referer,
              contentLength: res.get('content-length'),
            },
          };
          console[logLevel === 'error' ? 'error' : logLevel === 'warn' ? 'warn' : 'log'](
            JSON.stringify(logEntry)
          );
        }
      }

      return originalEnd(...args);
    };

    // Handle errors
    res.on('error', (error: Error) => {
      const duration = Date.now() - startTime;

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Response error',
        service: finalConfig.service,
        requestId,
        metadata: {
          method,
          url,
          duration,
          error: error.message,
          stack: error.stack,
        },
      };
      console.error(JSON.stringify(logEntry));
    });

    next();
  };
}

/**
 * Create structured logger for application use
 */
export function createLogger(service: string) {
  const shouldLog = (level: 'debug' | 'info' | 'warn' | 'error'): boolean => {
    const configLevel = process.env.LOG_LEVEL || 'info';
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  };

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => {
      if (shouldLog('debug')) {
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'debug',
          message,
          service,
          requestId: crypto.randomUUID(),
          metadata,
        };
        console.log(JSON.stringify(logEntry));
      }
    },

    info: (message: string, metadata?: Record<string, unknown>) => {
      if (shouldLog('info')) {
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          service,
          requestId: crypto.randomUUID(),
          metadata,
        };
        console.log(JSON.stringify(logEntry));
      }
    },

    warn: (message: string, metadata?: Record<string, unknown>) => {
      if (shouldLog('warn')) {
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
          service,
          requestId: crypto.randomUUID(),
          metadata,
        };
        console.warn(JSON.stringify(logEntry));
      }
    },

    error: (message: string, metadata?: Record<string, unknown>, error?: Error) => {
      if (shouldLog('error')) {
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'error',
          message,
          service,
          requestId: crypto.randomUUID(),
          metadata: {
            ...metadata,
            ...(error && {
              error: error.message,
              stack: error.stack,
            }),
          },
        };
        console.error(JSON.stringify(logEntry));
      }
    },

    /**
     * Log with request context
     */
    withRequest: (req: Request) => {
      const extendedReq = req as ExtendedRequest;
      const requestId = extendedReq.requestId || crypto.randomUUID();

      return {
        debug: (message: string, metadata?: Record<string, unknown>) => {
          if (shouldLog('debug')) {
            const logEntry: LogEntry = {
              timestamp: new Date().toISOString(),
              level: 'debug',
              message,
              service,
              requestId,
              metadata,
            };
            console.log(JSON.stringify(logEntry));
          }
        },

        info: (message: string, metadata?: Record<string, unknown>) => {
          if (shouldLog('info')) {
            const logEntry: LogEntry = {
              timestamp: new Date().toISOString(),
              level: 'info',
              message,
              service,
              requestId,
              metadata,
            };
            console.log(JSON.stringify(logEntry));
          }
        },

        warn: (message: string, metadata?: Record<string, unknown>) => {
          if (shouldLog('warn')) {
            const logEntry: LogEntry = {
              timestamp: new Date().toISOString(),
              level: 'warn',
              message,
              service,
              requestId,
              metadata,
            };
            console.warn(JSON.stringify(logEntry));
          }
        },

        error: (message: string, metadata?: Record<string, unknown>, error?: Error) => {
          if (shouldLog('error')) {
            const logEntry: LogEntry = {
              timestamp: new Date().toISOString(),
              level: 'error',
              message,
              service,
              requestId,
              metadata: {
                ...metadata,
                ...(error && {
                  error: error.message,
                  stack: error.stack,
                }),
              },
            };
            console.error(JSON.stringify(logEntry));
          }
        },
      };
    },
  };
}

/**
 * Create performance logging middleware
 * Logs slow requests based on threshold
 */
export function createPerformanceLoggingMiddleware(
  service: string,
  thresholdMs = 1000
): MiddlewareHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;
    const startTime = extendedReq.startTime || Date.now();
    const requestId = extendedReq.requestId || crypto.randomUUID();

    // Capture response finish
    const originalEnd = res.end.bind(res);
    let logged = false;

    res.end = function (this: Response, ...args: any[]): Response {
      if (!logged) {
        logged = true;
        const duration = Date.now() - startTime;

        if (duration > thresholdMs) {
          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: 'Slow request detected',
            service,
            requestId,
            metadata: {
              method: req.method,
              url: req.originalUrl || req.url,
              duration,
              threshold: thresholdMs,
              status: res.statusCode,
            },
          };
          console.warn(JSON.stringify(logEntry));
        }
      }

      return originalEnd(...args);
    };

    next();
  };
}

/**
 * Create access log middleware (Apache/Nginx style)
 */
export function createAccessLogMiddleware(service?: string): MiddlewareHandler {
  const serviceName = service || 'recoder-web';

  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;
    const startTime = extendedReq.startTime || Date.now();

    const originalEnd = res.end.bind(res);
    let logged = false;

    res.end = function (this: Response, ...args: any[]): Response {
      if (!logged) {
        logged = true;
        const duration = Date.now() - startTime;
        const clientIp = getClientIp(req);
        const method = req.method;
        const url = req.originalUrl || req.url;
        const status = res.statusCode;
        const contentLength = res.get('content-length') || '-';
        const userAgent = req.get('user-agent') || '-';

        // Combined log format: %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-agent}i"
        const timestamp = new Date().toISOString();
        console.log(
          `[${serviceName}] ${clientIp} - - [${timestamp}] "${method} ${url}" ${status} ${contentLength} "${userAgent}" ${duration}ms`
        );
      }

      return originalEnd(...args);
    };

    next();
  };
}
