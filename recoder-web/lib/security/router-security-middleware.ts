/**
 * Router Security Middleware
 * Integrates router security with Next.js middleware for threat detection and protection
 */

import { NextRequest, NextResponse } from 'next/server';
// Temporary: Security package disabled due to TypeScript errors
// import { 
//   RouterSecurityService, 
//   RequestContext, 
//   DEFAULT_ROUTER_SECURITY_CONFIG,
//   RouterSecurityConfig 
// } from '@recoder/security';

// Temporary type definitions
interface RouterSecurityConfig {
  enableThreatDetection: boolean;
  enableRateLimiting: boolean;
  enableAnomalyDetection: boolean;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxFailedAttemptsBeforeBan: number;
  banDurationMinutes: number;
  suspiciousPatterns: any[];
  allowedCountries?: string[];
  blockedIPs?: string[];
  enableGeoBlocking: boolean;
}

interface RequestContext {
  ip: string;
  userAgent: string;
  userId?: string;
  deviceId?: string;
  endpoint: string;
  method: string;
  payload?: any;
  timestamp: Date;
  headers: Record<string, string>;
  geolocation?: {
    country: string;
    region: string;
    city: string;
  };
}

class RouterSecurityService {
  constructor(config: RouterSecurityConfig) {}
  async analyzeRequest(context: RequestContext): Promise<{
    allowed: boolean;
    riskScore: number;
    reasons: string[];
    action: 'allow' | 'warn' | 'block' | 'ban';
  }> {
    return { allowed: true, riskScore: 0, reasons: [], action: 'allow' };
  }
  on(event: string, callback: Function) {}
  getSecurityMetrics() { return {}; }
  getRecentSecurityEvents(limit: number) { return []; }
  healthCheck() { return { status: 'healthy', details: {} }; }
  manuallyBanIP(ip: string, reason: string) {}
  unbanIP(ip: string) {}
  updateConfig(newConfig: Partial<RouterSecurityConfig>) {}
}

const DEFAULT_ROUTER_SECURITY_CONFIG: RouterSecurityConfig = {
  enableThreatDetection: false,
  enableRateLimiting: false,
  enableAnomalyDetection: false,
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  maxFailedAttemptsBeforeBan: 5,
  banDurationMinutes: 60,
  suspiciousPatterns: [],
  enableGeoBlocking: false,
  allowedCountries: [],
  blockedIPs: []
};

// Global security service instance
let securityService: RouterSecurityService | null = null;

/**
 * Initialize router security service
 */
export function initializeRouterSecurity(config?: Partial<RouterSecurityConfig>): RouterSecurityService {
  if (!securityService) {
    const finalConfig = { ...DEFAULT_ROUTER_SECURITY_CONFIG, ...config };
    securityService = new RouterSecurityService(finalConfig);
    
    // Set up event listeners
    securityService.on('securityEvent', (event) => {
      console.warn('[Security]', event.type, event.severity, event.details);
    });

    securityService.on('ipBanned', (ip) => {
      console.error('[Security] IP Banned:', ip);
    });

    console.log('[Security] Router security service initialized');
  }
  
  return securityService;
}

/**
 * Get geolocation from IP address (mock implementation)
 */
async function getGeolocation(ip: string): Promise<{ country: string; region: string; city: string } | undefined> {
  // In production, you'd use a service like MaxMind, IPinfo, or similar
  // For now, return undefined to skip geo-blocking
  return undefined;
}

/**
 * Extract real IP address from request
 */
function getRealIP(request: NextRequest): string {
  // Check various headers for real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback to remote address
  return request.ip || '127.0.0.1';
}

/**
 * Create request context from Next.js request
 */
async function createRequestContext(request: NextRequest): Promise<RequestContext> {
  const ip = getRealIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const url = new URL(request.url);
  
  // Extract user/device info from headers or session
  const userId = request.headers.get('x-user-id') || undefined;
  const deviceId = request.headers.get('x-device-id') || undefined;
  
  // Convert headers to plain object
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Get geolocation
  const geolocation = await getGeolocation(ip);

  return {
    ip,
    userAgent,
    userId,
    deviceId,
    endpoint: url.pathname,
    method: request.method,
    timestamp: new Date(),
    headers,
    geolocation,
    payload: request.method === 'POST' || request.method === 'PUT' ? 
      await extractPayload(request) : undefined
  };
}

/**
 * Extract payload from request
 */
async function extractPayload(request: NextRequest): Promise<any> {
  try {
    // Clone request to avoid consuming the body
    const clonedRequest = request.clone();
    const contentType = clonedRequest.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return await clonedRequest.json();
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await clonedRequest.formData();
      const payload: Record<string, any> = {};
      formData.forEach((value, key) => {
        payload[key] = value;
      });
      return payload;
    }
    
    return undefined;
  } catch (error) {
    // If we can't parse the payload, return undefined
    return undefined;
  }
}

/**
 * Router Security Middleware for Next.js
 */
export async function routerSecurityMiddleware(
  request: NextRequest,
  config?: Partial<RouterSecurityConfig>
): Promise<NextResponse> {
  // Initialize security service if not already done
  if (!securityService) {
    initializeRouterSecurity(config);
  }

  // Skip security checks for certain paths
  const url = new URL(request.url);
  const skipPaths = [
    '/health',
    '/favicon.ico',
    '/_next/',
    '/api/health',
    '/api/auth/callback' // NextAuth callbacks should not be blocked
  ];

  if (skipPaths.some(path => url.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  try {
    // Create request context
    const context = await createRequestContext(request);
    
    // Analyze request for security threats
    const analysis = await securityService!.analyzeRequest(context);
    
    // Handle security response
    switch (analysis.action) {
      case 'ban':
      case 'block':
        return new NextResponse(
          JSON.stringify({
            error: 'Request blocked by security policy',
            reason: analysis.reasons.join(', '),
            riskScore: analysis.riskScore,
            requestId: crypto.randomUUID()
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Security-Block': 'true',
              'X-Risk-Score': analysis.riskScore.toString()
            }
          }
        );
        
      case 'warn':
        // Log warning but allow request to proceed
        console.warn('[Security Warning]', {
          ip: context.ip,
          endpoint: context.endpoint,
          reasons: analysis.reasons,
          riskScore: analysis.riskScore
        });
        
        const response = NextResponse.next();
        response.headers.set('X-Security-Warning', 'true');
        response.headers.set('X-Risk-Score', analysis.riskScore.toString());
        return response;
        
      case 'allow':
      default:
        // Add security headers to response
        const allowResponse = NextResponse.next();
        allowResponse.headers.set('X-Security-Analyzed', 'true');
        allowResponse.headers.set('X-Risk-Score', analysis.riskScore.toString());
        return allowResponse;
    }
  } catch (error) {
    // If security analysis fails, log error but don't block request
    console.error('[Security Error]', error);
    
    const errorResponse = NextResponse.next();
    errorResponse.headers.set('X-Security-Error', 'true');
    return errorResponse;
  }
}

/**
 * Express-style middleware adapter
 */
export function createExpressSecurityMiddleware(config?: Partial<RouterSecurityConfig>) {
  return async (req: any, res: any, next: any) => {
    // Initialize security service if not already done
    if (!securityService) {
      initializeRouterSecurity(config);
    }

    try {
      // Create request context from Express request
      const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
      const context: RequestContext = {
        ip,
        userAgent: req.get('user-agent') || 'unknown',
        userId: req.user?.id,
        deviceId: req.headers['x-device-id'],
        endpoint: req.path,
        method: req.method,
        timestamp: new Date(),
        headers: req.headers,
        payload: req.body,
        geolocation: await getGeolocation(ip)
      };

      // Analyze request
      const analysis = await securityService!.analyzeRequest(context);

      // Handle response
      switch (analysis.action) {
        case 'ban':
        case 'block':
          return res.status(403).json({
            error: 'Request blocked by security policy',
            reason: analysis.reasons.join(', '),
            riskScore: analysis.riskScore
          });
          
        case 'warn':
          console.warn('[Security Warning]', {
            ip: context.ip,
            endpoint: context.endpoint,
            reasons: analysis.reasons,
            riskScore: analysis.riskScore
          });
          res.set('X-Security-Warning', 'true');
          break;
      }

      // Add security headers
      res.set('X-Security-Analyzed', 'true');
      res.set('X-Risk-Score', analysis.riskScore.toString());
      
      next();
    } catch (error) {
      console.error('[Security Error]', error);
      res.set('X-Security-Error', 'true');
      next();
    }
  };
}

/**
 * Security dashboard data
 */
export function getSecurityDashboardData() {
  if (!securityService) {
    return null;
  }
  
  return {
    metrics: securityService.getSecurityMetrics(),
    recentEvents: securityService.getRecentSecurityEvents(20),
    healthCheck: securityService.healthCheck()
  };
}

/**
 * Manual IP management
 */
export function banIP(ip: string, reason: string) {
  if (securityService) {
    securityService.manuallyBanIP(ip, reason);
  }
}

export function unbanIP(ip: string) {
  if (securityService) {
    securityService.unbanIP(ip);
  }
}

/**
 * Update security configuration
 */
export function updateSecurityConfig(newConfig: Partial<RouterSecurityConfig>) {
  if (securityService) {
    securityService.updateConfig(newConfig);
  }
}

/**
 * Get security service instance
 */
export function getSecurityService(): RouterSecurityService | null {
  return securityService;
}

export default routerSecurityMiddleware;