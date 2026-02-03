/**
 * CORS Middleware for recoder-web
 * Provides Cross-Origin Resource Sharing configuration
 */

import type { Request, Response, NextFunction } from 'express';
import type { CorsConfig, EnvironmentConfig, MiddlewareHandler } from './types';

/**
 * Default CORS configuration
 */
const DEFAULT_CORS_CONFIG: CorsConfig = {
  allowedOrigins: [],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'Accept',
    'Origin',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  exposeHeaders: ['X-Request-ID', 'X-Response-Time'],
};

/**
 * Get environment-specific CORS origins
 */
function getEnvironmentOrigins(environment: string): string[] {
  const isDevelopment = environment === 'development';

  if (isDevelopment) {
    // Development: Allow localhost and common development ports
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3005',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:8080',
    ];
  }

  // Production: Allow specific recoder domains
  return [
    'https://recoder.xyz',
    'https://www.recoder.xyz',
    'https://app.recoder.xyz',
    'https://api.recoder.xyz',
  ];
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  isDevelopment: boolean
): boolean {
  if (!origin) {
    // Allow requests without origin (e.g., same-origin requests, curl, etc.)
    return true;
  }

  // Check exact match first
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Development: Allow any localhost or 127.0.0.1 port
  if (isDevelopment) {
    if (origin.match(/^https?:\/\/localhost:\d+$/)) {
      return true;
    }
    if (origin.match(/^https?:\/\/127\.0\.0\.1:\d+$/)) {
      return true;
    }
  }

  // Production: Allow subdomains of recoder.xyz
  if (!isDevelopment) {
    if (origin.match(/^https:\/\/[a-zA-Z0-9-]+\.recoder\.xyz$/)) {
      return true;
    }
  }

  return false;
}

/**
 * Create environment-aware CORS middleware
 */
export function createCorsMiddleware(
  config?: Partial<CorsConfig>,
  envConfig?: Partial<EnvironmentConfig>
): MiddlewareHandler {
  const environment =
    envConfig?.ENVIRONMENT || process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
  const isDevelopment = environment === 'development';

  const finalConfig: CorsConfig = {
    ...DEFAULT_CORS_CONFIG,
    allowedOrigins: [
      ...getEnvironmentOrigins(environment),
      ...(config?.allowedOrigins || []),
    ],
    ...config,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('Origin');

    // Check if origin is allowed
    const allowed = isOriginAllowed(origin, finalConfig.allowedOrigins, isDevelopment);

    if (allowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (isDevelopment && !origin) {
      // In development, allow requests without origin
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Set CORS headers
    if (finalConfig.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', finalConfig.allowMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', finalConfig.allowHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', String(finalConfig.maxAge));

    if (finalConfig.exposeHeaders && finalConfig.exposeHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', finalConfig.exposeHeaders.join(', '));
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Log rejected origins in debug mode
    if (!allowed && origin && envConfig?.LOG_LEVEL === 'debug') {
      console.log(`CORS: Rejected origin ${origin}`);
    }

    next();
  };
}

/**
 * Create public CORS middleware for public endpoints
 * Allows all origins for public access
 */
export function createPublicCorsMiddleware(): MiddlewareHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Create strict CORS middleware for sensitive endpoints
 * Only allows specific origins
 */
export function createStrictCorsMiddleware(allowedOrigins: string[]): MiddlewareHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('Origin');

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '3600');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Create CDN-specific CORS middleware for asset delivery
 */
export function createCdnCorsMiddleware(): MiddlewareHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Range, If-None-Match, If-Modified-Since'
    );
    res.setHeader('Access-Control-Max-Age', String(86400 * 7)); // 7 days
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges'
    );

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
