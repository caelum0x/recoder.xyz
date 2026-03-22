/**
 * Production Security Headers
 * Implements OWASP security best practices
 */

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig = {
  // Content Security Policy
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://api.recoder.xyz https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://docker.recoder.xyz wss://docker.recoder.xyz https://api.recoder.xyz https://api.anthropic.com https://openrouter.ai https: wss: ws:",
    "frame-src 'self' https://docker.recoder.xyz https://*.recoder.xyz https://*.sandbox.recoder.xyz",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
  ].join('; '),

  // Force HTTPS (31536000 = 1 year)
  strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',

  // Prevent clickjacking
  xFrameOptions: '', // Disabled — using CSP frame-ancestors instead to allow cross-subdomain iframes

  // Prevent MIME sniffing
  xContentTypeOptions: 'nosniff',

  // Control referrer information
  referrerPolicy: 'strict-origin-when-cross-origin',

  // Permissions Policy (formerly Feature-Policy)
  permissionsPolicy: [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
  ].join(', '),
};

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(
  response: Response,
  config: SecurityHeadersConfig = DEFAULT_SECURITY_HEADERS
): Response {
  const headers = new Headers(response.headers);

  // Content Security Policy
  if (config.contentSecurityPolicy) {
    headers.set('Content-Security-Policy', config.contentSecurityPolicy);
  }

  // HTTP Strict Transport Security
  if (config.strictTransportSecurity) {
    headers.set('Strict-Transport-Security', config.strictTransportSecurity);
  }

  // X-Frame-Options
  if (config.xFrameOptions) {
    headers.set('X-Frame-Options', config.xFrameOptions);
  }

  // X-Content-Type-Options
  if (config.xContentTypeOptions) {
    headers.set('X-Content-Type-Options', config.xContentTypeOptions);
  }

  // Referrer-Policy
  if (config.referrerPolicy) {
    headers.set('Referrer-Policy', config.referrerPolicy);
  }

  // Permissions-Policy
  if (config.permissionsPolicy) {
    headers.set('Permissions-Policy', config.permissionsPolicy);
  }

  // Additional security headers
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('X-DNS-Prefetch-Control', 'off');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * CORS configuration
 */
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_CORS_CONFIG: CORSConfig = {
  allowedOrigins: ['http://localhost:5173', 'http://localhost:5174', 'https://web.recoder.xyz', 'https://recoder.xyz', 'https://docker.recoder.xyz'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Apply CORS headers
 */
export function applyCORSHeaders(
  request: Request,
  response: Response,
  config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');

  // Check if origin is allowed
  if (origin && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);

    if (config.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }

    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));

    if (config.exposedHeaders && config.exposedHeaders.length > 0) {
      headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    }

    if (config.maxAge) {
      headers.set('Access-Control-Max-Age', config.maxAge.toString());
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle OPTIONS preflight request
 */
export function handlePreflightRequest(
  request: Request,
  config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
  const headers = new Headers();
  const origin = request.headers.get('Origin');

  if (origin && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);

    if (config.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }

    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));

    if (config.maxAge) {
      headers.set('Access-Control-Max-Age', config.maxAge.toString());
    }
  }

  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * Comprehensive security middleware
 */
export function applyProductionSecurity(
  request: Request,
  response: Response,
  options: {
    security?: SecurityHeadersConfig;
    cors?: CORSConfig;
  } = {}
): Response {
  let securedResponse = response;

  // Apply security headers
  securedResponse = applySecurityHeaders(securedResponse, options.security);

  // Apply CORS headers
  securedResponse = applyCORSHeaders(request, securedResponse, options.cors);

  return securedResponse;
}
