import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { decrypt } from '@/lib/encryption';
import { requireAuth } from '@/lib/auth-helpers';

const prisma = new PrismaClient();

/**
 * GET /api/user/ai-provider-keys/decrypt?provider=openrouter
 * Get decrypted API key for a specific provider
 * This endpoint is used internally when making AI API calls
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    const userId = user.id;
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
    console.error('Error decrypting API key:', error);
    return NextResponse.json(
      { error: 'Failed to decrypt API key' },
      { status: 500 }
    );
  }
}
