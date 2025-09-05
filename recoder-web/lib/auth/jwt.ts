import jwt, { SignOptions } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  subscriptionTier: string;
  teamId?: string;
}

export class JWTService {
  static generateToken(payload: JWTPayload): string {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    const options = {
      expiresIn: JWT_EXPIRES_IN
    } as SignOptions;
    return jwt.sign(payload, JWT_SECRET, options);
  }

  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static extractTokenFromRequest(request: NextRequest): string | null {
    // Check Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    const tokenCookie = request.cookies.get('auth-token');
    if (tokenCookie) {
      return tokenCookie.value;
    }

    return null;
  }

  static getUserFromRequest(request: NextRequest): JWTPayload | null {
    try {
      const token = this.extractTokenFromRequest(request);
      if (!token) return null;
      
      return this.verifyToken(token);
    } catch (error) {
      return null;
    }
  }
}

// Middleware helper for protecting routes
export function requireAuth(handler: (request: NextRequest, user: JWTPayload) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    const user = JWTService.getUserFromRequest(request);
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return handler(request, user);
  };
}

// Role-based access control
export function requireRole(roles: string[], handler: (request: NextRequest, user: JWTPayload) => Promise<Response>) {
  return requireAuth(async (request: NextRequest, user: JWTPayload): Promise<Response> => {
    if (!roles.includes(user.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return handler(request, user);
  });
}

// Subscription tier check
export function requireSubscription(tiers: string[], handler: (request: NextRequest, user: JWTPayload) => Promise<Response>) {
  return requireAuth(async (request: NextRequest, user: JWTPayload): Promise<Response> => {
    if (!tiers.includes(user.subscriptionTier)) {
      return new Response(JSON.stringify({ 
        error: 'Upgrade required',
        requiredTier: tiers[0],
        currentTier: user.subscriptionTier
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return handler(request, user);
  });
}