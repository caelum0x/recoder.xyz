import { NextRequest, NextResponse } from 'next/server';
import { validateUserApiKey } from '@/lib/api-key-resolver';
import { rateLimit, rateLimitConfigs, ipIdentifier } from '@/lib/middleware/rate-limit';

// Unauthenticated endpoint that validates a caller-supplied key against an
// upstream provider. Cap it so it can't be used to flood the provider or
// brute-force keys through us.
// IP-keyed (not token-keyed): the Bearer token is the guessed secret,
// so the bucket must throttle the source IP, not each distinct guess.
const validateRateLimiter = rateLimit({ ...rateLimitConfigs.public, identifier: ipIdentifier });

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await validateRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { apiKey, provider = 'openrouter' } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ 
        valid: false, 
        error: 'API key is required' 
      }, { status: 400 });
    }

    const result = await validateUserApiKey(apiKey, provider);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      valid: false, 
      error: 'Validation failed' 
    }, { status: 500 });
  }
}
