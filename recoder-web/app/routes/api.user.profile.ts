/**
 * User Profile API for recoder-web
 * Gets user profile data from shared session
 */

import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UserProfile');

export async function loader({ request }: ActionFunctionArgs) {
  try {
    // Verify session with main site
    const session = await verifySession(request);

    if (!session?.user) {
      return json({
        success: false,
        error: 'Not authenticated',
        user: null,
      }, { status: 401 });
    }

    logger.info('[API Profile] Returning profile for:', session.user.email);

    // Return user profile
    return json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        subscription: session.user.subscriptionPlan || 'free',
      },
    });
  } catch (error) {
    logger.error('[API Profile] Error:', error);
    return json({
      success: false,
      error: 'Failed to load profile',
      user: null,
    }, { status: 500 });
  }
}
