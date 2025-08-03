// API Authentication middleware for CLI and Extension access
import { NextRequest, NextResponse } from 'next/server';
import { userDb, subscriptionDb, usageDb, PlanType } from './database';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// API Key management
export class ApiKeyManager {
  private static instance: ApiKeyManager;
  private readonly JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret';
  private readonly ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  // Generate API key for user
  generateApiKey(userId: string, productType: 'cli' | 'extension' | 'router'): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const prefix = productType === 'cli' ? 'rcli' : productType === 'extension' ? 'rext' : 'rrtr';
    
    // Create payload
    const payload = {
      userId,
      productType,
      createdAt: timestamp,
      version: '1'
    };

    // Sign with JWT
    const token = jwt.sign(payload, this.JWT_SECRET, { 
      expiresIn: '1y',
      issuer: 'recoder.xyz',
      audience: productType
    });

    // Create final API key format: prefix_base64token_checksum
    const encodedToken = Buffer.from(token).toString('base64url');
    const checksum = crypto.createHash('sha256')
      .update(encodedToken + this.ENCRYPTION_KEY)
      .digest('hex')
      .substring(0, 8);

    return `${prefix}_${encodedToken}_${checksum}`;
  }

  // Validate API key format and extract payload
  validateApiKey(apiKey: string): { isValid: boolean, payload?: any, productType?: string } {
    try {
      // Parse API key format
      const parts = apiKey.split('_');
      if (parts.length !== 3) {
        return { isValid: false };
      }

      const [prefix, encodedToken, checksum] = parts;
      
      // Determine product type from prefix
      const productType = prefix === 'rcli' ? 'cli' : 
                         prefix === 'rext' ? 'extension' : 
                         prefix === 'rrtr' ? 'router' : null;

      if (!productType) {
        return { isValid: false };
      }

      // Verify checksum
      const expectedChecksum = crypto.createHash('sha256')
        .update(encodedToken + this.ENCRYPTION_KEY)
        .digest('hex')
        .substring(0, 8);

      if (checksum !== expectedChecksum) {
        return { isValid: false };
      }

      // Decode and verify JWT
      const token = Buffer.from(encodedToken, 'base64url').toString();
      const payload = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'recoder.xyz',
        audience: productType
      });

      return { 
        isValid: true, 
        payload, 
        productType 
      };
    } catch (error) {
      console.error('API key validation error:', error);
      return { isValid: false };
    }
  }

  // Encrypt sensitive API key for storage
  encryptApiKey(apiKey: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt API key from storage
  decryptApiKey(encryptedKey: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

// Rate limiting for API access
export class ApiRateLimiter {
  private static instance: ApiRateLimiter;
  private requests: Map<string, { count: number, resetTime: number }> = new Map();

  static getInstance(): ApiRateLimiter {
    if (!ApiRateLimiter.instance) {
      ApiRateLimiter.instance = new ApiRateLimiter();
    }
    return ApiRateLimiter.instance;
  }

  // Check if request is allowed
  isAllowed(identifier: string, plan: PlanType): { allowed: boolean, remaining: number, resetTime: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    // Get rate limits based on plan
    const limits = {
      FREE: 60,        // 60 requests per minute
      PRO: 300,        // 300 requests per minute  
      ENTERPRISE: 1000 // 1000 requests per minute
    };

    const limit = limits[plan];
    const key = `${identifier}:${Math.floor(now / windowMs)}`;
    
    const current = this.requests.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (current.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: current.resetTime
      };
    }

    // Increment counter
    current.count++;
    this.requests.set(key, current);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanup();
    }

    return {
      allowed: true,
      remaining: limit - current.count,
      resetTime: current.resetTime
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (value.resetTime < now) {
        this.requests.delete(key);
      }
    }
  }
}

// Authentication context for API requests
export interface ApiAuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    plan: PlanType;
  };
  productType: 'cli' | 'extension' | 'router' | 'web' | 'chat';
  rateLimit: {
    remaining: number;
    resetTime: number;
  };
}

// Main API authentication middleware
export async function authenticateApiRequest(
  request: NextRequest,
  productType?: 'cli' | 'extension' | 'router'
): Promise<{ success: boolean, context?: ApiAuthContext, error?: string }> {
  try {
    const authorization = request.headers.get('authorization');
    
    if (!authorization) {
      return { success: false, error: 'Missing authorization header' };
    }

    // Handle different auth types
    if (authorization.startsWith('Bearer ')) {
      const token = authorization.replace('Bearer ', '');
      
      // Check if it's an API key or JWT session token
      if (token.startsWith('rcli_') || token.startsWith('rext_') || token.startsWith('rrtr_')) {
        return await authenticateWithApiKey(token, request);
      } else {
        return await authenticateWithJWT(token, request, productType);
      }
    }

    return { success: false, error: 'Invalid authorization format' };
  } catch (error) {
    console.error('API authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

// Authenticate with API key (CLI/Extension)
async function authenticateWithApiKey(
  apiKey: string,
  request: NextRequest
): Promise<{ success: boolean, context?: ApiAuthContext, error?: string }> {
  const keyManager = ApiKeyManager.getInstance();
  const rateLimiter = ApiRateLimiter.getInstance();

  // Validate API key format and extract payload
  const validation = keyManager.validateApiKey(apiKey);
  if (!validation.isValid || !validation.payload) {
    return { success: false, error: 'Invalid API key' };
  }

  const { userId, productType } = validation.payload;

  // Get user from database
  const user = await userDb.findById(userId);
  if (!user || !user.is_active) {
    return { success: false, error: 'User not found or inactive' };
  }

  // Get user's current plan
  const plan = await subscriptionDb.getUserPlan(userId);

  // Check rate limits
  const rateCheck = rateLimiter.isAllowed(userId, plan);
  if (!rateCheck.allowed) {
    return { 
      success: false, 
      error: 'Rate limit exceeded',
    };
  }

  // Log API usage
  await usageDb.logUsage({
    user_id: userId,
    product: productType,
    action: 'api_request',
    resource_type: 'api_call',
    metadata: {
      endpoint: request.nextUrl.pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent'),
      ip: request.ip || request.headers.get('x-forwarded-for'),
    }
  });

  return {
    success: true,
    context: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan,
      },
      productType,
      rateLimit: {
        remaining: rateCheck.remaining,
        resetTime: rateCheck.resetTime,
      }
    }
  };
}

// Authenticate with JWT session token (Web/Chat)
async function authenticateWithJWT(
  token: string,
  request: NextRequest,
  productType?: string
): Promise<{ success: boolean, context?: ApiAuthContext, error?: string }> {
  try {
    // Verify JWT token (NextAuth format)
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    
    if (!decoded.sub) {
      return { success: false, error: 'Invalid session token' };
    }

    const userId = decoded.sub;
    const user = await userDb.findById(userId);
    
    if (!user || !user.is_active) {
      return { success: false, error: 'User not found or inactive' };
    }

    const plan = await subscriptionDb.getUserPlan(userId);
    const detectedProductType = productType || detectProductType(request);

    // Rate limiting for web/chat is handled differently (session-based)
    const rateLimiter = ApiRateLimiter.getInstance();
    const rateCheck = rateLimiter.isAllowed(userId, plan);

    // Log usage
    await usageDb.logUsage({
      user_id: userId,
      product: detectedProductType,
      action: 'api_request',
      resource_type: 'web_api_call',
      metadata: {
        endpoint: request.nextUrl.pathname,
        method: request.method,
      }
    });

    return {
      success: true,
      context: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan,
        },
        productType: detectedProductType as any,
        rateLimit: {
          remaining: rateCheck.remaining,
          resetTime: rateCheck.resetTime,
        }
      }
    };
  } catch (error) {
    return { success: false, error: 'Invalid session token' };
  }
}

// Detect product type from request
function detectProductType(request: NextRequest): string {
  const hostname = request.nextUrl.hostname;
  
  if (hostname.includes('web.recoder.xyz')) return 'web';
  if (hostname.includes('chat.recoder.xyz')) return 'chat';
  if (hostname.includes('cli.recoder.xyz')) return 'cli';
  
  // Default based on path
  if (request.nextUrl.pathname.startsWith('/api/chat')) return 'chat';
  if (request.nextUrl.pathname.startsWith('/api/web')) return 'web';
  if (request.nextUrl.pathname.startsWith('/api/cli')) return 'cli';
  
  return 'web'; // default
}

// Middleware wrapper for Next.js API routes
export function withApiAuth(
  handler: (req: NextRequest, context: ApiAuthContext) => Promise<NextResponse>,
  options: {
    requiredPlan?: PlanType;
    productType?: 'cli' | 'extension' | 'router';
  } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Authenticate request
    const auth = await authenticateApiRequest(request, options.productType);
    
    if (!auth.success || !auth.context) {
      return NextResponse.json(
        { error: auth.error || 'Authentication failed' },
        { status: 401 }
      );
    }

    // Check plan requirements
    if (options.requiredPlan) {
      const planHierarchy = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
      const userLevel = planHierarchy[auth.context.user.plan];
      const requiredLevel = planHierarchy[options.requiredPlan];
      
      if (userLevel < requiredLevel) {
        return NextResponse.json(
          { error: 'Insufficient plan access', requiredPlan: options.requiredPlan },
          { status: 403 }
        );
      }
    }

    // Add rate limit headers
    const response = await handler(request, auth.context);
    response.headers.set('X-RateLimit-Remaining', auth.context.rateLimit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', auth.context.rateLimit.resetTime.toString());
    
    return response;
  };
}

// Usage tracking helpers
export const apiUsageHelpers = {
  // Check if user can make API request
  async canMakeRequest(userId: string, productType: string): Promise<boolean> {
    const limit = await usageDb.checkUsageLimit(userId, productType, 'requests_per_month');
    return limit.canUse;
  },

  // Get user's API usage stats
  async getUsageStats(userId: string, productType: string) {
    const dailyUsage = await usageDb.getUserUsage(userId, productType, 1);
    const monthlyUsage = await usageDb.getUserUsage(userId, productType, 30);
    const monthlyLimit = await usageDb.getUserLimit(userId, productType, 'requests_per_month');
    
    return {
      dailyUsage,
      monthlyUsage,
      monthlyLimit,
      monthlyRemaining: monthlyLimit === -1 ? Infinity : Math.max(0, monthlyLimit - monthlyUsage),
      canMakeRequest: monthlyLimit === -1 || monthlyUsage < monthlyLimit,
    };
  }
};

// Export singleton instances
export const apiKeyManager = ApiKeyManager.getInstance();
export const apiRateLimiter = ApiRateLimiter.getInstance();