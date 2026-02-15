import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, maskApiKey, validateApiKeyFormat } from '@/lib/encryption';
import { requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

/**
 * GET /api/user/ai-provider-keys
 * List all AI provider API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
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

    // Fetch user's AI provider keys
    const apiKeys = await prisma.user_api_keys.findMany({
      where: {
        userId,
        isActive: true
      },
      select: {
        id: true,
        provider: true,
        name: true,
        keyPrefix: true,
        lastUsed: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      keys: apiKeys
    });
  } catch (error) {
    console.error('Error fetching AI provider keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/ai-provider-keys
 * Add a new AI provider API key
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    console.log('[DEBUG Add API Key] User from session:', JSON.stringify(user, null, 2));

    // Look up the user in the users table (Better Auth uses 'user' table, app uses 'users' table)
    const appUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true }
    });

    if (!appUser) {
      console.error('[DEBUG Add API Key] User not found in users table for email:', user.email);
      return NextResponse.json(
        { error: 'User not found in application database' },
        { status: 404 }
      );
    }

    const userId = appUser.id;
    console.log('[DEBUG Add API Key] App User ID:', userId);
    console.log('[DEBUG Add API Key] User email:', user.email);

    const body = await request.json();
    const { provider, apiKey, name } = body;

    // Validation
    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Provider and API key are required' },
        { status: 400 }
      );
    }

    // Validate API key format
    if (!validateApiKeyFormat(apiKey, provider)) {
      return NextResponse.json(
        { error: `Invalid API key format for ${provider}` },
        { status: 400 }
      );
    }

    // Check if user already has a key for this provider
    const existingKey = await prisma.user_api_keys.findFirst({
      where: {
        userId,
        provider,
        isActive: true
      }
    });

    if (existingKey) {
      // Update existing key instead of creating duplicate
      const encryptedKey = encrypt(apiKey);
      const keyPrefix = maskApiKey(apiKey);

      const updatedKey = await prisma.user_api_keys.update({
        where: { id: existingKey.id },
        data: {
          name: name || existingKey.name,
          keyPrefix,
          encryptedKey,
          updatedAt: new Date()
        },
        select: {
          id: true,
          provider: true,
          name: true,
          keyPrefix: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json({
        success: true,
        key: updatedKey,
        message: 'API key updated successfully'
      });
    }

    // Encrypt the API key
    const encryptedKey = encrypt(apiKey);
    const keyPrefix = maskApiKey(apiKey);

    // Store in database
    const newApiKey = await prisma.user_api_keys.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        provider,
        name: name || `${provider} API Key`,
        keyPrefix,
        encryptedKey,
        isActive: true,
        updatedAt: new Date()
      },
      select: {
        id: true,
        provider: true,
        name: true,
        keyPrefix: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      success: true,
      key: newApiKey,
      message: 'API key added successfully'
    });
  } catch (error) {
    console.error('Error adding AI provider key:', error);
    return NextResponse.json(
      { error: 'Failed to add API key' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/ai-provider-keys (Internal)
 * Get decrypted AI provider keys for container injection
 * This should only be called by the docker-backend service
 */
export async function PUT(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: { userId?: string } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const authResult = verifyInternalServiceRequest(request, { rawBody });
    if (!authResult.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Find user by Better Auth ID (web users use 'user' table)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (!user) {
      return NextResponse.json({
        keys: {},
        message: 'User not found'
      });
    }

    // Look up the user in the users table (app uses 'users' table for API keys)
    const appUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true }
    });

    if (!appUser) {
      return NextResponse.json({
        keys: {},
        message: 'User not found in app database'
      });
    }

    // Fetch user's AI provider keys
    const apiKeys = await prisma.user_api_keys.findMany({
      where: {
        userId: appUser.id,
        isActive: true
      },
      select: {
        provider: true,
        encryptedKey: true,
      }
    });

    // Decrypt keys and map by provider
    const decryptedKeys: Record<string, string> = {};
    for (const key of apiKeys) {
      try {
        const decrypted = decrypt(key.encryptedKey);
        decryptedKeys[key.provider] = decrypted;
      } catch (e) {
        console.error(`Failed to decrypt key for provider ${key.provider}:`, e);
      }
    }

    console.log(`[AI Provider Keys] Retrieved ${Object.keys(decryptedKeys).length} keys for user ${userId}`);

    return NextResponse.json({
      keys: decryptedKeys,
    });
  } catch (error: any) {
    console.error('Get decrypted AI provider keys error:', error);
    return NextResponse.json({ error: 'Failed to get keys' }, { status: 500 });
  }
}

/**
 * DELETE /api/user/ai-provider-keys?id=<keyId>
 * Delete an AI provider API key
 */
export async function DELETE(request: NextRequest) {
  try {
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
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    // Verify the key belongs to the user
    const apiKey = await prisma.user_api_keys.findFirst({
      where: {
        id: keyId,
        userId
      }
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found or access denied' },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.user_api_keys.update({
      where: { id: keyId },
      data: { isActive: false }
    });

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting AI provider key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
