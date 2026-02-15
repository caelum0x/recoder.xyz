/**
 * API endpoint to get current user session
 * Proxies to main site's better-auth session endpoint
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Session');

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const session = await verifySession(request);

    if (!session) {
      return json({ user: null, authenticated: false });
    }

    return json({
      user: session.user,
      authenticated: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('[api.session] Error:', error);
    return json({ user: null, authenticated: false, error: 'Session error' }, { status: 500 });
  }
}
