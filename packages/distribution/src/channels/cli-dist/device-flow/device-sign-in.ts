import type { HttpTransportPort } from '../../../ports/http-transport-port';
import type { DeviceFlowConfig } from './device-flow-config';
import {
  requestDeviceAuthorization,
  runDeviceFlow,
  type DeviceAuthorizationResponse,
  type DeviceFlowOutcome,
  type DeviceTokenResponse,
  type RunDeviceFlowDeps,
} from './device-auth-client';

/**
 * The full CLIENT sign-in facade (RFC 8628), in ONE call, for the desktop / CLI
 * to consume. It chains the two device-flow steps that a host would otherwise
 * have to wire by hand:
 *
 *   1. `requestDeviceAuthorization` — get the `user_code` + `verification_uri`.
 *   2. `runDeviceFlow`             — poll the token endpoint until success,
 *                                    denial, or the grant's real expiry.
 *
 * Between the two, it invokes `onPrompt` so the host can show the user where to
 * go and what code to enter (open a browser, render a QR, etc.). recoder.xyz is
 * the source of truth: nothing here mints or fabricates a token — only a real
 * token response from recoder.xyz completes the flow, and the loop ends `expired`
 * at the grant's true deadline rather than spinning forever.
 */

/** What the host needs to display so the user can approve the device. */
export interface DeviceSignInPrompt {
  readonly userCode: string;
  readonly verificationUri: string;
  /** The verification URI with the code pre-filled, when the server provides it. */
  readonly verificationUriComplete?: string;
  /** Seconds until the grant expires (the truthful timeout). */
  readonly expiresIn: number;
}

export interface DeviceSignInDeps extends RunDeviceFlowDeps {
  /**
   * Invoked once, right after authorization is granted, with the code + URI the
   * user must visit. The flow then begins polling. May be async (e.g. to open a
   * browser); a thrown error from it aborts the sign-in.
   */
  onPrompt: (prompt: DeviceSignInPrompt) => void | Promise<void>;
}

export interface DeviceSignInInput {
  readonly scope?: string;
  readonly clientId?: string;
}

/** The terminal outcome of a full sign-in, carrying the authorization context. */
export type DeviceSignInResult =
  | {
      readonly status: 'success';
      readonly token: DeviceTokenResponse;
      readonly authorization: DeviceAuthorizationResponse;
    }
  | {
      readonly status: 'denied';
      readonly description?: string;
      readonly authorization: DeviceAuthorizationResponse;
    }
  | {
      readonly status: 'expired';
      readonly description?: string;
      readonly authorization: DeviceAuthorizationResponse;
    };

function toPrompt(auth: DeviceAuthorizationResponse): DeviceSignInPrompt {
  return {
    userCode: auth.userCode,
    verificationUri: auth.verificationUri,
    ...(auth.verificationUriComplete
      ? { verificationUriComplete: auth.verificationUriComplete }
      : {}),
    expiresIn: auth.expiresIn,
  };
}

function withAuthorization(
  outcome: DeviceFlowOutcome,
  authorization: DeviceAuthorizationResponse,
): DeviceSignInResult {
  switch (outcome.status) {
    case 'success':
      return { status: 'success', token: outcome.token, authorization };
    case 'denied':
      return outcome.description
        ? { status: 'denied', description: outcome.description, authorization }
        : { status: 'denied', authorization };
    case 'expired':
      return outcome.description
        ? { status: 'expired', description: outcome.description, authorization }
        : { status: 'expired', authorization };
  }
}

/**
 * Run the complete device-flow sign-in. Throws a typed `DistributionError` only
 * when authorization cannot even start (transport/HTTP/malformed response); a
 * denial or expiry after authorization is returned as a `DeviceSignInResult`,
 * never thrown — the host decides how to surface it.
 */
export async function signInWithDeviceFlow(
  config: DeviceFlowConfig,
  transport: HttpTransportPort,
  deps: DeviceSignInDeps,
  input: DeviceSignInInput = {},
): Promise<DeviceSignInResult> {
  const authorization = await requestDeviceAuthorization(config, transport, {
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
  });

  await deps.onPrompt(toPrompt(authorization));

  const outcome = await runDeviceFlow(config, transport, authorization, {
    sleep: deps.sleep,
    ...(deps.now ? { now: deps.now } : {}),
  });
  return withAuthorization(outcome, authorization);
}
