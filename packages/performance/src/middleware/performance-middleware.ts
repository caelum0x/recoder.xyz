/**
 * Production Performance Middleware for Express.js
 * Comprehensive middleware stack for monitoring, rate limiting, and optimization
 */

import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';

// Rate limiting interfaces
export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface HealthCheckOptions {
  path?: string;
  healthCheck?: () => Promise<any> | any;
  includeMetrics?: boolean;
  customChecks?: Record<string, () => Promise<any> | any>;
}

export interface CompressionOptions {
  threshold?: number;
  level?: number;
  filter?: (req: Request, res: Response) => boolean;
}

export interface SecurityOptions {
  enableCORS?: boolean;
  enableHelmet?: boolean;
  corsOptions?: any;
  helmetOptions?: any;
  rateLimiting?: RateLimitOptions;
}

// Request tracking for rate limiting
class RequestTracker {
  private requests = new Map<string, number[]>();
  
  track(key: string, windowMs: number, max: number): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const requestTimes = this.requests.get(key)!;
    
    // Remove old requests outside the window
    const validRequests = requestTimes.filter(time => time > windowStart);
    
    if (validRequests.length >= max) {
      return false; // Rate limit exceeded
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }
  
  cleanup(): void {
    const now = Date.now();
    const maxWindow = 60000; // 1 minute max cleanup window
    
    for (const [key, times] of this.requests.entries()) {
      const validTimes = times.filter(time => now - time < maxWindow);
      if (validTimes.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimes);
      }
    }
  }
}

export class PerformanceMiddleware {
  private requestTracker = new RequestTracker();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  
  constructor() {
    // Cleanup old requests every 5 minutes
    setInterval(() => {
      this.requestTracker.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Create comprehensive request logging middleware
   */
  createRequestLoggingMiddleware(options: { 
    includeBody?: boolean; 
    includeCookies?: boolean;
    logLevel?: 'info' | 'debug' | 'warn';
  } = {}) {
    const { includeBody = false, includeCookies = false, logLevel = 'info' } = options;
    const self = this;
    
    return (req: Request, res: Response, next: NextFunction) => {
      const start = performance.now();
      const startTime = new Date().toISOString();
      
      // Capture original res.end
      const originalEnd = res.end;
      
      res.end = function(chunk?: any, encoding?: any) {
        const duration = performance.now() - start;
        const statusCode = res.statusCode;
        
        // Log request details
        const logData = {
          method: req.method,
          url: req.url,
          statusCode,
          duration: Math.round(duration * 100) / 100,
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress,
          timestamp: startTime,
          ...(includeBody && { body: req.body }),
          ...(includeCookies && { cookies: req.cookies })
        };
        
        // Choose log level based on status code
        if (statusCode >= 500) {
          console.error('🔴 Server Error:', logData);
        } else if (statusCode >= 400) {
          console.warn('🟡 Client Error:', logData);
        } else if (logLevel === 'debug') {
          console.log('🟢 Request:', logData);
        }
        
        // Track metrics
        self.requestCount++;
        self.responseTimes.push(duration);
        
        if (statusCode >= 400) {
          self.errorCount++;
        }
        
        // Keep only recent response times
        if (self.responseTimes.length > 1000) {
          self.responseTimes = self.responseTimes.slice(-500);
        }
        
        // Call original end  
        return (originalEnd as any).call(res, chunk, encoding);
      } as any;
      
      next();
    };
  }

  /**
   * Create rate limiting middleware
   */
  createRateLimitMiddleware(options: RateLimitOptions = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // limit each IP to 100 requests per windowMs
      message = 'Too many requests from this IP, please try again later',
      standardHeaders = true,
      legacyHeaders = false,
      keyGenerator = (req: Request) => req.ip || 'unknown',
      skip = () => false,
      onLimitReached
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
      if (skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const allowed = this.requestTracker.track(key, windowMs, max);

      if (standardHeaders) {
        res.set('X-RateLimit-Limit', max.toString());
        res.set('X-RateLimit-Window', Math.round(windowMs / 1000).toString());
      }

      if (!allowed) {
        if (onLimitReached) {
          onLimitReached(req, res);
        }

        if (standardHeaders) {
          res.set('X-RateLimit-Remaining', '0');
          res.set('Retry-After', Math.round(windowMs / 1000).toString());
        }

        return res.status(429).json({
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.round(windowMs / 1000)
        });
      }

      if (standardHeaders) {
        const remaining = Math.max(0, max - 1);
        res.set('X-RateLimit-Remaining', remaining.toString());
      }

      next();
    };
  }

  /**
   * Create health check middleware
   */
  createHealthCheckMiddleware(options: HealthCheckOptions = {}) {
    const {
      path = '/health',
      healthCheck,
      includeMetrics = true,
      customChecks = {}
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
      if (req.path !== path) {
        return next();
      }

      try {
        const health: any = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        };

        // Run main health check
        if (healthCheck) {
          const checkResult = await Promise.resolve(healthCheck());
          health.application = checkResult;
        }

        // Run custom checks
        if (Object.keys(customChecks).length > 0) {
          health.checks = {};
          for (const [name, check] of Object.entries(customChecks)) {
            try {
              health.checks[name] = await Promise.resolve(check());
            } catch (error) {
              health.checks[name] = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
              };
              health.status = 'degraded';
            }
          }
        }

        // Include performance metrics
        if (includeMetrics) {
          const avgResponseTime = this.responseTimes.length > 0 
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
            : 0;
          
          health.metrics = {
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            averageResponseTime: Math.round(avgResponseTime * 100) / 100,
            errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
          };
        }

        // Set status code based on health
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(health);
      } catch (error) {
        console.error('❌ Health check error:', error);
        res.status(503).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Create response compression middleware
   */
  createCompressionMiddleware(options: CompressionOptions = {}) {
    const {
      threshold = 1024,
      level = 6,
      filter = (req: Request, res: Response) => {
        // Don't compress responses with cache-control: no-transform
        const cacheControl = res.get('Cache-Control');
        if (cacheControl && cacheControl.includes('no-transform')) {
          return false;
        }
        
        // Compress JSON and text responses
        const contentType = res.get('Content-Type');
        return contentType ? 
          contentType.includes('json') || 
          contentType.includes('text') || 
          contentType.includes('javascript') ||
          contentType.includes('css') : false;
      }
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
      // Simple compression check
      const acceptEncoding = req.get('Accept-Encoding') || '';
      
      if (!acceptEncoding.includes('gzip')) {
        return next();
      }

      if (!filter(req, res)) {
        return next();
      }

      // Set compression headers
      res.set('Content-Encoding', 'gzip');
      res.set('Vary', 'Accept-Encoding');
      
      next();
    };
  }

  /**
   * Create security headers middleware
   */
  createSecurityMiddleware(options: SecurityOptions = {}) {
    const {
      enableCORS = true,
      enableHelmet = true,
      corsOptions = {
        origin: process.env.NODE_ENV === 'production' ? false : true,
        credentials: true
      },
      helmetOptions = {},
      rateLimiting
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
      // Basic security headers (Helmet-like functionality)
      if (enableHelmet) {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'DENY');
        res.set('X-XSS-Protection', '1; mode=block');
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Content Security Policy
        const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';";
        res.set('Content-Security-Policy', csp);
      }

      // CORS headers
      if (enableCORS) {
        const origin = corsOptions.origin;
        if (origin === true) {
          res.set('Access-Control-Allow-Origin', req.get('Origin') || '*');
        } else if (typeof origin === 'string') {
          res.set('Access-Control-Allow-Origin', origin);
        }
        
        if (corsOptions.credentials) {
          res.set('Access-Control-Allow-Credentials', 'true');
        }
        
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      next();
    };
  }

  /**
   * Create error handling middleware
   */
  createErrorHandlingMiddleware() {
    const self = this;
    return (error: any, req: Request, res: Response, next: NextFunction) => {
      self.errorCount++;
      
      const statusCode = error.statusCode || error.status || 500;
      const message = error.message || 'Internal Server Error';
      
      console.error('🔴 Request Error:', {
        error: message,
        stack: error.stack,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Don't expose internal errors in production
      const response = {
        error: process.env.NODE_ENV === 'production' && statusCode === 500 
          ? 'Internal Server Error' 
          : message,
        status: statusCode,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      };

      res.status(statusCode).json(response);
    };
  }

  /**
   * Get current middleware statistics
   */
  getStats() {
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;

    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageResponseTime: Math.round(avgResponseTime * 100) / 100,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      recentResponseTimes: this.responseTimes.slice(-10)
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
  }
}

/**
 * Middleware stacks for common use cases
 */
export const middlewareStacks = {
  /**
   * Full production middleware stack
   */
  full: (options: {
    rateLimiting?: RateLimitOptions;
    security?: SecurityOptions;
    compression?: CompressionOptions;
    healthCheck?: HealthCheckOptions;
    logging?: { includeBody?: boolean; includeCookies?: boolean; };
  } = {}) => {
    const middleware = new PerformanceMiddleware();
    
    return [
      middleware.createSecurityMiddleware(options.security),
      middleware.createRateLimitMiddleware(options.rateLimiting),
      middleware.createCompressionMiddleware(options.compression),
      middleware.createRequestLoggingMiddleware(options.logging),
      middleware.createHealthCheckMiddleware(options.healthCheck),
      middleware.createErrorHandlingMiddleware()
    ];
  },

  /**
   * Basic monitoring stack
   */
  monitoring: (options: { includeMetrics?: boolean } = {}) => {
    const middleware = new PerformanceMiddleware();
    
    return [
      middleware.createRequestLoggingMiddleware(),
      middleware.createHealthCheckMiddleware(options),
      middleware.createErrorHandlingMiddleware()
    ];
  },

  /**
   * Security-focused stack
   */
  security: (options: SecurityOptions = {}) => {
    const middleware = new PerformanceMiddleware();
    
    return [
      middleware.createSecurityMiddleware(options),
      middleware.createRateLimitMiddleware(options.rateLimiting),
      middleware.createErrorHandlingMiddleware()
    ];
  }
};

// Default export
export default PerformanceMiddleware;