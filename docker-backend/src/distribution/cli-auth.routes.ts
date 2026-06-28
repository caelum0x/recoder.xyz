/**
 * CLI device-flow auth routes (RFC 8628), backed by `@recoder/distribution`.
 *
 * recoder.xyz is the source of truth: the browser-authorize step verifies the
 * user's recoder.xyz session via the AuthPort, and the issued token's plan is
 * the authoritative plan recoder.xyz/Polar reports.
 *
 * Endpoints (the shape scripts/verify-cli-device-flow-e2e.sh exercises):
 *  - POST /device    → device authorize (mint device_code + user_code)
 *  - POST /authorize → browser approval (consume user_code with session cookie)
 *  - POST /token     → exchange (device_code grant) OR refresh (refresh_token grant)
 *  - POST /verify    → validate an issued access token (against recoder.xyz)
 *
 * Fail safe: a missing signing key denies token issuance; an invalid session or
 * token denies; nothing is ever faked as success.
 */
import { Router, type Request, type Response } from 'express';
import {
  deviceAuthorize,
  browserAuthorize,
  pollDeviceToken,
  verifyCliToken,
  refreshCliToken,
  DistributionError,
} from '@recoder/distribution';
import type { DistributionModule } from './module.js';
import { getSessionTokenFromRequest } from './session-token.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-cli-auth');

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const REFRESH_GRANT = 'refresh_token';

function requireSigningKey(mod: DistributionModule, res: Response): string | null {
  if (!mod.signingKey) {
    res.status(503).json({
      success: false,
      error: 'CLI token signing is not configured (CLI_TOKEN_SIGNING_KEY missing)',
      code: 'key_missing',
    });
    return null;
  }
  return mod.signingKey;
}

export function createCliAuthRouter(mod: DistributionModule): Router {
  const router = Router();
  const { config, grants } = mod.deviceFlow;

  // POST /device — device authorization request.
  router.post('/device', (req: Request, res: Response) => {
    try {
      const clientId =
        typeof req.body?.client_id === 'string' ? req.body.client_id : undefined;
      const grant = deviceAuthorize(config, grants, clientId ? { clientId } : {});
      res.json({
        device_code: grant.deviceCode,
        user_code: grant.userCode,
        verification_uri: grant.verificationUri,
        verification_uri_complete: grant.verificationUriComplete,
        expires_in: grant.expiresIn,
        interval: grant.interval,
      });
    } catch (e) {
      logger.error('device authorize failed', { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json({ success: false, error: 'failed to issue device code' });
    }
  });

  // POST /authorize — browser approval of a user_code with the session cookie.
  router.post('/authorize', async (req: Request, res: Response) => {
    const userCode = req.body?.user_code;
    const action = req.body?.action ?? 'approve';
    if (typeof userCode !== 'string' || userCode.length === 0) {
      res.status(400).json({ success: false, error: 'user_code is required' });
      return;
    }
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) {
      res.status(401).json({ success: false, error: 'recoder.xyz session required to approve' });
      return;
    }
    if (action === 'deny') {
      grants.transition(grants.getByUserCode(userCode)?.deviceCode ?? '', 'denied');
      res.json({ success: true, status: 'denied' });
      return;
    }
    try {
      const result = await browserAuthorize(mod.auth, grants, { userCode, sessionToken });
      res.json({ success: true, status: 'approved', userId: result.approvedUserId });
    } catch (e) {
      if (e instanceof DistributionError) {
        res.status(400).json({ success: false, error: e.message, code: e.code });
        return;
      }
      logger.error('browser authorize failed', { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json({ success: false, error: 'authorization failed' });
    }
  });

  // POST /token — device-code exchange OR refresh-token grant.
  router.post('/token', async (req: Request, res: Response) => {
    const grantType = req.body?.grant_type;
    const signingKey = requireSigningKey(mod, res);
    if (!signingKey) return;

    if (grantType === DEVICE_CODE_GRANT) {
      const deviceCode = req.body?.device_code;
      if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
        res.status(400).json({ success: false, error: 'device_code is required' });
        return;
      }
      try {
        const result = await pollDeviceToken(config, grants, {
          deviceCode,
          getProfile: (userId) => mod.auth.getUserProfile(userId),
          signingKey,
        });
        switch (result.status) {
          case 'pending':
            res
              .status(400)
              .json({ error: 'authorization_pending', interval: result.interval });
            return;
          case 'slow_down':
            res.status(400).json({ error: 'slow_down', interval: result.interval });
            return;
          case 'denied':
            res.status(400).json({ error: 'access_denied' });
            return;
          case 'expired':
            res.status(400).json({ error: 'expired_token' });
            return;
          case 'completed':
            res.json({
              access_token: result.token.accessToken,
              refresh_token: result.token.refreshToken,
              token_type: 'Bearer',
              expires_at: result.token.expiresAt,
              user: {
                id: result.token.userId,
                email: result.token.email,
                subscription_plan: result.token.plan,
              },
              scopes: result.token.scopes,
            });
            return;
        }
      } catch (e) {
        logger.error('token exchange failed', { error: e instanceof Error ? e.message : String(e) });
        res.status(500).json({ success: false, error: 'token exchange failed' });
        return;
      }
    }

    if (grantType === REFRESH_GRANT) {
      const refreshToken = req.body?.refresh_token;
      if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
        res.status(400).json({ success: false, error: 'refresh_token is required' });
        return;
      }
      // Identify the subject: prefer an explicit user_id, else decode the bearer.
      const userId =
        typeof req.body?.user_id === 'string' ? req.body.user_id : undefined;
      const bearer = getSessionTokenFromRequest(req);
      const subjectId = userId ?? (await subjectFromAccessToken(mod, bearer));
      if (!subjectId) {
        res
          .status(400)
          .json({ success: false, error: 'cannot resolve subject for refresh (user_id required)' });
        return;
      }
      try {
        const token = await refreshCliToken(
          config,
          mod.auth,
          { refreshToken, userId: subjectId },
          signingKey,
        );
        res.json({
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
          token_type: 'Bearer',
          expires_at: token.expiresAt,
          user: { id: token.userId, email: token.email, subscription_plan: token.plan },
          scopes: token.scopes,
        });
      } catch (e) {
        logger.warn('refresh denied', { error: e instanceof Error ? e.message : String(e) });
        res.status(401).json({ success: false, error: 'refresh denied' });
      }
      return;
    }

    res.status(400).json({ success: false, error: 'unsupported grant_type' });
  });

  // POST /verify — validate an issued access token against recoder.xyz.
  router.post('/verify', async (req: Request, res: Response) => {
    const accessToken = req.body?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      res.status(400).json({ valid: false, error: 'access_token is required' });
      return;
    }
    const signingKey = requireSigningKey(mod, res);
    if (!signingKey) return;
    const result = await verifyCliToken(mod.auth, accessToken, signingKey);
    if (!result.valid) {
      res.json({ valid: false, reason: result.reason });
      return;
    }
    res.json({
      valid: true,
      user: result.profile
        ? {
            id: result.profile.userId,
            email: result.profile.email,
            subscription_plan: result.profile.plan,
          }
        : undefined,
    });
  });

  return router;
}

/** Best-effort subject id from a presented access token (for refresh). */
async function subjectFromAccessToken(
  mod: DistributionModule,
  accessToken: string | null,
): Promise<string | undefined> {
  if (!accessToken || !mod.signingKey) return undefined;
  const profile = await mod.auth.verifyCliAccessToken(accessToken);
  return profile?.userId;
}
