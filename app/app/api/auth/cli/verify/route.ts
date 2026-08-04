import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { rateLimit, rateLimitConfigs, ipIdentifier } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';

// Unauthenticated token-introspection endpoint. Lenient public cap blocks
// flooding / token-guessing while allowing normal CLI verify calls. GET
// delegates to POST, so this one guard covers both verbs.
// IP-keyed (not token-keyed): the Bearer token is the guessed secret,
// so the bucket must throttle the source IP, not each distinct guess.
const verifyRateLimiter = rateLimit({ ...rateLimitConfigs.public, identifier: ipIdentifier });

/**
 * POST /api/auth/cli/verify
 * Verify access token and get user info
 *
 * Headers:
 * Authorization: Bearer reco_...
 *
 * Or Request body:
 * {
 *   "access_token": "reco_..."
 * }
 *
 * Response:
 * {
 *   "valid": true,
 *   "user": {
 *     "userId": "...",
 *     "email": "...",
 *     "name": "...",
 *     "plan": "free",
 *     "status": "active"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await verifyRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    // Try to get token from Authorization header
    const authHeader = request.headers.get('authorization');
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Try to get from body
      const body = await request.json().catch(() => ({}));
      token = body.access_token;
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Missing access token' },
        { status: 401 }
      );
    }

    try {
      const user = await CLIAuthService.validateAccessToken(token);

      return NextResponse.json({
        valid: true,
        user,
      }, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid token',
        },
        { status: 401 }
      );
    }
  } catch (error) {
    logger.error('Token verification error:', { error: String(error), route: 'auth/cli/verify' });
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/cli/verify
 * Same as POST but via GET
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
