import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '../services/cli-auth.service';
import { getCommercialEntitlements, normalizeCommercialPlan } from '@/lib/plan-entitlements';

/**
 * Middleware to validate CLI authentication
 * Supports both access tokens and API keys
 */

export interface CLIAuthContext {
  userId: string;
  email: string;
  name: string;
  plan: string;
  status: string;
  isPremium: boolean;
  authType: 'token' | 'api_key';
  sessionId?: string;
  keyId?: string;
}

/**
 * Extract and validate CLI authentication from request
 */
export async function validateCLIAuth(request: NextRequest): Promise<CLIAuthContext> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  // Check if it's a Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Check if it's an access token (starts with reco_)
    if (token.startsWith('reco_')) {
      const userData = await CLIAuthService.validateAccessToken(token);
      return {
        ...userData,
        isPremium: ['weekly', 'monthly', 'pro', 'enterprise'].includes(userData.plan),
        authType: 'token',
      };
    }

    // Check if it's an API key (starts with rk_)
    if (token.startsWith('rk_')) {
      const userData = await CLIAuthService.validateApiKey(token);
      return {
        ...userData,
        isPremium: ['weekly', 'monthly', 'pro', 'enterprise'].includes(userData.plan),
        authType: 'api_key',
      };
    }

    throw new Error('Invalid token format');
  }

  throw new Error('Invalid authorization header format. Use: Bearer <token>');
}

/**
 * Middleware wrapper for API routes
 */
export function withCLIAuth(
  handler: (request: NextRequest, context: CLIAuthContext) => Promise<Response>,
  options?: {
    requirePremium?: boolean;
  }
) {
  return async (request: NextRequest) => {
    try {
      const context = await validateCLIAuth(request);

      // Check premium requirement
      if (options?.requirePremium && !context.isPremium) {
        return NextResponse.json(
          {
            error: 'Premium plan required',
            message: 'This feature requires a premium subscription',
            currentPlan: context.plan,
            upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/pricing`,
          },
          { status: 403 }
        );
      }

      // Check subscription status
      if (context.status !== 'active') {
        return NextResponse.json(
          {
            error: 'Subscription inactive',
            message: 'Your subscription is not active',
            status: context.status,
          },
          { status: 403 }
        );
      }

      return handler(request, context);
    } catch (error: any) {
      return NextResponse.json(
        {
          error: 'Authentication failed',
          message: error.message,
        },
        { status: 401 }
      );
    }
  };
}

/**
 * Get plan features and limits
 */
export function getPlanFeatures(plan: string) {
  const normalizedPlan = normalizeCommercialPlan(plan);
  const entitlements = getCommercialEntitlements(normalizedPlan);

  return {
    name: normalizedPlan,
    workspaces: entitlements.workspaces,
    connectedAgents: entitlements.connectedAgents,
    artifactRetentionDays: entitlements.artifactRetentionDays,
    previewDeploysPerMonth: entitlements.previewDeploysPerMonth,
    approvalWorkflows: entitlements.approvalWorkflows,
    governance: entitlements.governance,
    features: {
      basicCodeGeneration: true,
      advancedModels: normalizedPlan !== 'free',
      prioritySupport: normalizedPlan === 'monthly' || normalizedPlan === 'pro' || normalizedPlan === 'enterprise',
      teamCollaboration: entitlements.connectedAgents > 1,
      customModels: normalizedPlan === 'pro' || normalizedPlan === 'enterprise',
      dedicatedSupport: normalizedPlan === 'enterprise',
    },
  };
}
