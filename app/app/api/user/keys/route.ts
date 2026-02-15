import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';
import { z } from 'zod';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * GET /api/user/keys
 * List all API keys for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const keys = await PlatformApiKeyService.listUserApiKeys(user.id);

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error: any) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/keys
 * Generate a new API key for premium user
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = createKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { name, description, expiresAt } = validation.data;

    // Check if user can create more keys
    const canCreate = await PlatformApiKeyService.canCreateApiKey(user.id);

    if (!canCreate.canCreate) {
      return NextResponse.json(
        {
          error: canCreate.reason || 'Cannot create API key',
          limit: canCreate.limit,
          current: canCreate.current,
        },
        { status: 403 }
      );
    }

    // Generate the API key
    const result = await PlatformApiKeyService.generateApiKey(
      user.id,
      name,
      description,
      expiresAt ? new Date(expiresAt) : undefined
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: result.message.includes('premium') ? 403 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      apiKey: result.apiKey, // Only returned once!
      keyId: result.keyId,
    });
  } catch (error: any) {
    console.error('Error generating API key:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/keys
 * Revoke an API key
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('keyId');

    if (!keyId) {
      return NextResponse.json(
        { error: 'keyId is required' },
        { status: 400 }
      );
    }

    const result = await PlatformApiKeyService.revokeApiKey(keyId, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}
