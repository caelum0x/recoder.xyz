import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { logger } from '@/lib/logger';

type TokenRequestBody = {
  grant_type?: string;
  device_code?: string;
  refresh_token?: string;
  client_id?: string;
};

/**
 * POST /api/auth/cli/token
 * OAuth-style token endpoint used by recoder-code CLI and VS Code extension.
 *
 * Supported grants:
 * - urn:ietf:params:oauth:grant-type:device_code
 * - refresh_token
 */
export async function POST(request: NextRequest) {
  let body: TokenRequestBody = {};

  try {
    body = (await request.json().catch(() => ({}))) as TokenRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const grantType = typeof body.grant_type === 'string' ? body.grant_type : '';

  if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
    const deviceCode =
      typeof body.device_code === 'string' ? body.device_code : '';

    if (!deviceCode) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'device_code is required' },
        { status: 400 },
      );
    }

    try {
      const pollResult = await CLIAuthService.pollDeviceCode(deviceCode);

      if (pollResult.status === 'pending') {
        return NextResponse.json(
          {
            error: 'authorization_pending',
            status: 'pending',
          },
          { status: 400 },
        );
      }

      // CLIAuthService returns access/refresh token payload on authorization.
      return NextResponse.json(pollResult, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.toLowerCase().includes('denied')) {
        return NextResponse.json(
          { error: 'access_denied', status: 'denied' },
          { status: 400 },
        );
      }

      if (message.toLowerCase().includes('expired')) {
        return NextResponse.json(
          { error: 'expired_token', status: 'expired' },
          { status: 400 },
        );
      }

      if (message.toLowerCase().includes('invalid device code')) {
        return NextResponse.json(
          { error: 'invalid_grant' },
          { status: 400 },
        );
      }

      logger.error('CLI token device flow polling failed', {
        route: 'api/auth/cli/token',
        error: message,
      });
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
  }

  if (grantType === 'refresh_token') {
    const refreshToken =
      typeof body.refresh_token === 'string' ? body.refresh_token : '';

    if (!refreshToken) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'refresh_token is required',
        },
        { status: 400 },
      );
    }

    try {
      const refreshed = await CLIAuthService.refreshAccessToken(refreshToken);
      return NextResponse.json(
        {
          ...refreshed,
          // Keep compatibility with clients that expect refresh_token in response.
          refresh_token: refreshToken,
        },
        { status: 200 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('invalid refresh token')) {
        return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
      }

      logger.error('CLI token refresh failed', {
        route: 'api/auth/cli/token',
        error: message,
      });
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      error: 'unsupported_grant_type',
      error_description:
        'Supported grant_type values: urn:ietf:params:oauth:grant-type:device_code, refresh_token',
    },
    { status: 400 },
  );
}
