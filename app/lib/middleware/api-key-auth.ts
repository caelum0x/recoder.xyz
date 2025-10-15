import { NextRequest, NextResponse } from 'next/server';
import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';

export interface AuthenticatedRequest extends NextRequest {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    plan: string;
    status: string;
  };
  keyInfo?: {
    keyId: string;
    name: string;
    scopes: string[];
  };
}

/**
 * Middleware to authenticate requests using API keys
 * Extracts API key from Authorization header and validates it
 *
 * Usage in API routes:
 * ```typescript
 * import { withApiKeyAuth } from '@/lib/middleware/api-key-auth';
 *
 * async function handler(req: AuthenticatedRequest) {
 *   // req.user is now available
 *   // req.keyInfo contains key details
 * }
 *
 * export const POST = withApiKeyAuth(handler);
 * ```
 */
export function withApiKeyAuth(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or invalid Authorization header' },
          { status: 401 }
        );
      }

      const apiKey = authHeader.replace('Bearer ', '');

      if (!apiKey.startsWith('sk-recoder-')) {
        return NextResponse.json(
          { error: 'Invalid API key format' },
          { status: 401 }
        );
      }

      // Validate the API key
      const result = await PlatformApiKeyService.validateApiKey(apiKey);

      if (!result.valid) {
        return NextResponse.json(
          { error: result.message || 'Invalid API key' },
          { status: 401 }
        );
      }

      // Attach user info to request
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.userId = result.userId;
      authenticatedReq.user = result.user;
      authenticatedReq.keyInfo = result.keyInfo;

      // Call the actual handler
      return await handler(authenticatedReq);
    } catch (error: any) {
      console.error('API key authentication error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware that checks if the authenticated user has specific scopes
 *
 * Usage:
 * ```typescript
 * export const POST = withApiKeyAuth(
 *   requireScopes(['ai:advanced', 'write'])(handler)
 * );
 * ```
 */
export function requireScopes(requiredScopes: string[]) {
  return (handler: (req: AuthenticatedRequest) => Promise<NextResponse>) => {
    return async (req: AuthenticatedRequest): Promise<NextResponse> => {
      const userScopes = req.keyInfo?.scopes || [];

      // Check if user has wildcard scope
      if (userScopes.includes('*')) {
        return await handler(req);
      }

      // Check if user has all required scopes
      const hasAllScopes = requiredScopes.every(scope =>
        userScopes.includes(scope)
      );

      if (!hasAllScopes) {
        return NextResponse.json(
          {
            error: 'Insufficient permissions',
            required: requiredScopes,
            available: userScopes,
          },
          { status: 403 }
        );
      }

      return await handler(req);
    };
  };
}

/**
 * Middleware that checks if the authenticated user has a specific plan
 *
 * Usage:
 * ```typescript
 * export const POST = withApiKeyAuth(
 *   requirePlan(['pro', 'enterprise'])(handler)
 * );
 * ```
 */
export function requirePlan(allowedPlans: string[]) {
  return (handler: (req: AuthenticatedRequest) => Promise<NextResponse>) => {
    return async (req: AuthenticatedRequest): Promise<NextResponse> => {
      const userPlan = req.user?.plan;

      if (!userPlan || !allowedPlans.includes(userPlan)) {
        return NextResponse.json(
          {
            error: 'Plan upgrade required',
            currentPlan: userPlan,
            requiredPlans: allowedPlans,
          },
          { status: 403 }
        );
      }

      return await handler(req);
    };
  };
}

/**
 * Extract API key from request (supports both header and body)
 */
export async function extractApiKey(req: NextRequest): Promise<string | null> {
  // Try Authorization header first
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const key = authHeader.replace('Bearer ', '');
    if (key.startsWith('sk-recoder-')) {
      return key;
    }
  }

  // Try request body
  try {
    const body = await req.json();
    if (body.apiKey && body.apiKey.startsWith('sk-recoder-')) {
      return body.apiKey;
    }
  } catch {
    // Body is not JSON or already consumed
  }

  return null;
}
