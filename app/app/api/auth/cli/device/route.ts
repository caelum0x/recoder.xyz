import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/cli/device
 * Step 1: Generate device code for CLI authentication
 *
 * Request body:
 * {
 *   "client_id": "recoder-cli" (optional)
 * }
 *
 * Response:
 * {
 *   "device_code": "abc123...",
 *   "user_code": "ABCD-1234",
 *   "verification_uri": "https://recoder.xyz/cli/auth",
 *   "verification_uri_complete": "https://recoder.xyz/cli/auth?code=ABCD-1234",
 *   "expires_in": 600,
 *   "interval": 5
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = body.client_id || 'recoder-cli';

    const result = await CLIAuthService.generateDeviceCode(clientId);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('Device code generation error:', { error: String(error), route: 'auth/cli/device' });
    return NextResponse.json(
      { error: 'Failed to generate device code' },
      { status: 500 }
    );
  }
}
