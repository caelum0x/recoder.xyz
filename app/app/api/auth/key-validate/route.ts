import { NextRequest, NextResponse } from 'next/server';
import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';
import { z } from 'zod';

const validateSchema = z.object({
  apiKey: z.string().startsWith('sk-recoder-', 'Invalid API key format'),
});

/**
 * POST /api/auth/key-validate
 * Validate API key and return user information
 * Used by external CLI (recoder-code) to authenticate users
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = validateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid request format',
          details: validation.error.errors
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
  } catch (error: any) {
    console.error('Error validating API key:', error);
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
  } catch (error: any) {
    console.error('Error validating API key:', error);
    return NextResponse.json(
      {
        valid: false,
        error: 'Validation failed',
      },
      { status: 500 }
    );
  }
}
