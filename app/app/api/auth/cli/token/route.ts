import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '@/lib/services/cli-auth.service';

/**
 * POST /api/auth/cli/token
 * Step 3: CLI polls to get access token
 *
 * Request body (device code flow):
 * {
 *   "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
 *   "device_code": "abc123...",
 *   "client_id": "recoder-cli"
 * }
 *
 * Request body (refresh token):
 * {
 *   "grant_type": "refresh_token",
 *   "refresh_token": "recr_..."
 * }
 *
 * Response (success):
 * {
 *   "status": "authorized",
 *   "access_token": "reco_...",
 *   "refresh_token": "recr_...",
 *   "token_type": "Bearer",
 *   "expires_in": 7776000,
 *   "user": {
 *     "id": "...",
 *     "email": "...",
 *     "name": "...",
 *     "plan": "free"
 *   }
 * }
 *
 * Response (pending):
 * {
 *   "status": "pending",
 *   "message": "Authorization pending"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, device_code, refresh_token } = body;

    if (!grant_type) {
      return NextResponse.json(
        { error: 'Missing grant_type' },
        { status: 400 }
      );
    }

    // Handle refresh token
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        return NextResponse.json(
          { error: 'Missing refresh_token' },
          { status: 400 }
        );
      }

      try {
        const result = await CLIAuthService.refreshAccessToken(refresh_token);
        return NextResponse.json(result, { status: 200 });
      } catch (error: any) {
        return NextResponse.json(
          { error: 'Invalid refresh token', message: error.message },
          { status: 401 }
        );
      }
    }

    // Handle device code flow
    if (grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      if (!device_code) {
        return NextResponse.json(
          { error: 'Missing device_code' },
          { status: 400 }
        );
      }

      try {
        const result = await CLIAuthService.pollDeviceCode(device_code);

        // If still pending, return 428
        if (result.status === 'pending') {
          return NextResponse.json(result, { status: 428 });
        }

        // If authorized, return tokens
        return NextResponse.json(result, { status: 200 });
      } catch (error: any) {
        const message = error.message.toLowerCase();

        // Return appropriate status codes for different errors
        if (message.includes('expired')) {
          return NextResponse.json(
            { error: 'Device code expired', message: error.message },
            { status: 410 }
          );
        }

        if (message.includes('denied')) {
          return NextResponse.json(
            { error: 'Authorization denied', message: error.message },
            { status: 403 }
          );
        }

        return NextResponse.json(
          { error: 'Invalid device code', message: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid grant_type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Token request error:', error);
    return NextResponse.json(
      { error: 'Token request failed', message: error.message },
      { status: 500 }
    );
  }
}
