import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';
import { z } from 'zod';

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

/**
 * PATCH /api/user/keys/[keyId]
 * Update API key name or description
 */
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ keyId: string }> }
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const params = await props.params;

    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { keyId } = params;

    if (!keyId) {
      return NextResponse.json(
        { error: 'keyId is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validation = updateKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const result = await PlatformApiKeyService.updateApiKey(
      keyId,
      user.id,
      validation.data
    );

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
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}
