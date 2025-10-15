import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { trackSessionUsage } from '@/lib/session-management';

const JWT_SECRET = process.env.JWT_SECRET!;

async function authenticateRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.substring(7);
  const decoded = verify(token, JWT_SECRET) as any;
  return decoded.userId;
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}
