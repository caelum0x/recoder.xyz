import { NextRequest, NextResponse } from 'next/server';
import logger from './logger';

// Rate limiting storage (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(requests: number = 100, windowMs: number = 15 * 60 * 1000) {
  return (req: NextRequest): boolean => {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean up old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
    
    const current = rateLimitStore.get(ip);
    
    if (!current || current.resetTime < now) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (current.count >= requests) {
      logger.warn('Rate limit exceeded', { ip, count: current.count, limit: requests });
      return false;
    }
    
    current.count++;
    return true;
  };
}

export function validateApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-api-key');
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!apiKey) return false;
  
  return validApiKeys.includes(apiKey);
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .trim()
    .substring(0, 1000); // Limit length
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function generateSecureHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

export function withSecurity(handler: Function) {
  return async (req: NextRequest) => {
    // Apply rate limiting
    const rateLimiter = rateLimit();
    if (!rateLimiter(req)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { 
          status: 429,
          headers: generateSecureHeaders()
        }
      );
    }
    
    try {
      const response = await handler(req);
      
      // Add security headers to response
      const secureHeaders = generateSecureHeaders();
      Object.entries(secureHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      return response;
    } catch (error) {
      logger.error('Security middleware error', { error });
      return NextResponse.json(
        { error: 'Internal server error' },
        { 
          status: 500,
          headers: generateSecureHeaders()
        }
      );
    }
  };
}