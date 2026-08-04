import { NextRequest, NextResponse } from 'next/server';
import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';
import { rateLimit, rateLimitConfigs, ipIdentifier } from '@/lib/middleware/rate-limit';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const validateSchema = z.object({
  apiKey: z.string().startsWith('sk-recoder-', 'Invalid API key format'),
});

// Unauthenticated credential-check endpoint (the caller supplies a key to
// validate). Cap it so it can't be used to brute-force/flood key guesses.
// IP-keyed (not token-keyed): the Bearer token is the guessed secret,
// so the bucket must throttle the source IP, not each distinct guess.
const keyValidateRateLimiter = rateLimit({ ...rateLimitConfigs.public, identifier: ipIdentifier });

/**
 * POST /api/auth/key-validate
 * Validate API key and return user information
 * Used by external CLI (recoder-code) to authenticate users
 */
export async function POST(req: NextRequest) {
  try {
    const rateLimitResponse = await keyValidateRateLimiter(req);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json();
    const validation = validateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid request format'
        },
        { status: 400 }
      );
    }

    const { apiKey } = validation.data;

    // Validate the API key
    const result = await PlatformApiKeyService.validateApiKey(apiKey);

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.message || 'Invalid API key',
        },
        { status: 401 }
      );
    }

    // Return user information and key details
    return NextResponse.json({
      valid: true,
      user: result.user,
      keyInfo: result.keyInfo,
    });
  } catch (error) {
    logger.error('Error validating API key:', { error: String(error), route: 'auth/key-validate' });
    return NextResponse.json(
      {
        valid: false,
        error: 'Validation failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/key-validate
 * Validate API key via Authorization header
 * Alternative method for CLI authentication
 */
export async function GET(req: NextRequest) {
  try {
    const rateLimitResponse = await keyValidateRateLimiter(req);
    if (rateLimitResponse) return rateLimitResponse;

    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Missing or invalid Authorization header',
        },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace('Bearer ', '');

    if (!apiKey.startsWith('sk-recoder-')) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid API key format',
        },
        { status: 401 }
      );
    }

    // Validate the API key
    const result = await PlatformApiKeyService.validateApiKey(apiKey);

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.message || 'Invalid API key',
        },
        { status: 401 }
      );
    }

    // Return user information and key details
    return NextResponse.json({
      valid: true,
      user: result.user,
      keyInfo: result.keyInfo,
    });
  } catch (error) {
    logger.error('Error validating API key:', { error: String(error), route: 'auth/key-validate' });
    return NextResponse.json(
      {
        valid: false,
        error: 'Validation failed',
      },
      { status: 500 }
    );
  }
}
