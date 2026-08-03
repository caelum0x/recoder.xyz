/**
 * Credential (email+password) auth kill-switch.
 *
 * The hosted product is OAuth-only; self-host operators may re-enable
 * local accounts by setting AUTH_EMAIL_PASSWORD=on.
 */

import { NextResponse } from 'next/server';

export function isCredentialAuthEnabled(): boolean {
  return process.env.AUTH_EMAIL_PASSWORD === 'on';
}

export function credentialAuthDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: 'credential auth disabled', reason: 'oauth_only' },
    { status: 410 }
  );
}
