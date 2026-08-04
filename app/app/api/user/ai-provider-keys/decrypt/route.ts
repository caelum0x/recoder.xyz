import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

/**
 * GET /api/user/ai-provider-keys/decrypt?provider=openrouter
 * Get decrypted API key for a specific provider
 * This endpoint is used internally when making AI API calls
 *
 * The response contains a decrypted BYOK provider key, so this handler is
 * rate limited before any other work and must never log the decrypted value.
 */
export async function GET(request: NextRequest) {
  try {
    // Throttle before auth: decrypted keys are high-value, so brute-force
    // probing of this endpoint is limited even for unauthenticated callers.
    const limited = await rateLimit(rateLimitConfigs.apiKeys)(request);
    if (limited) return limited;

    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    // Look up the user in the users table (Better Auth uses 'user' table, app uses 'users' table)
    const appUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true }
    });

    if (!appUser) {
      return NextResponse.json(
        { error: 'User not found in application database' },
        { status: 404 }
      );
    }

    const userId = appUser.id;
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider parameter is required' },
        { status: 400 }
      );
    }

    // Fetch the encrypted key
    const apiKeyRecord = await prisma.user_api_keys.findFirst({
      where: {
        userId,
        provider,
        isActive: true
      },
      select: {
        id: true,
        provider: true,
        encryptedKey: true,
        lastUsed: true
      }
    });

    if (!apiKeyRecord) {
      return NextResponse.json(
        { error: `No active API key found for provider: ${provider}` },
        { status: 404 }
      );
    }

    // Decrypt the key
    const decryptedKey = decrypt(apiKeyRecord.encryptedKey);

    // Update lastUsed timestamp
    await prisma.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsed: new Date() }
    });

    return NextResponse.json({
      success: true,
      provider,
      apiKey: decryptedKey
    });
  } catch (error) {
    logger.error('Error decrypting API key', { route: 'api/user/ai-provider-keys/decrypt', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to decrypt API key' },
      { status: 500 }
    );
  }
}
