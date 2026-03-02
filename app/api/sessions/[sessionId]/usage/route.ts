import { NextRequest, NextResponse } from 'next/server';
import { trackSessionUsage } from '@/lib/session-management';
import { getUserIdFromBearerAuthHeader } from '@/lib/auth/jwt-auth';

async function authenticateRequest(request: NextRequest): Promise<string> {
  return getUserIdFromBearerAuthHeader(request.headers.get('authorization'));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userId = await authenticateRequest(request);
    const { model, tokens, cost, provider } = await request.json();
    
    const result = await trackSessionUsage(
      params.sessionId,
      userId,
      { model, tokens, cost, provider }
    );
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          shouldFallbackToFreeModels: result.shouldFallbackToFreeModels
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      tokensUsed: result.tokensUsed,
      premiumTokensUsed: result.premiumTokensUsed,
      remainingPremiumTokens: result.remainingPremiumTokens
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }
}
