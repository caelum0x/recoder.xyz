import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { neon } from '@neondatabase/serverless';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare?.env as Env;
    if (!env?.DATABASE_URL) {
      return json({
        status: 'error',
        connected: false,
        message: 'Database not configured',
      }, { status: 500 });
    }

    const sql = neon(env.DATABASE_URL);
    const session = await verifySession(request);
    
    if (!session) {
      return json({
        status: 'unauthenticated',
        connected: false,
        message: 'User not authenticated',
      });
    }

    // Check if user has GitHub OAuth connected
    const [oauthAccount] = await sql`
      SELECT provider, access_token 
      FROM oauth_accounts 
      WHERE user_id = ${session.user.id} AND provider = 'github'
    `;

    if (!oauthAccount) {
      return json({
        status: 'not_connected',
        connected: false,
        message: 'GitHub account not connected',
      });
    }

    // Check if token is valid by making a test API call
    const testResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${oauthAccount.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!testResponse.ok) {
      return json({
        status: 'token_invalid',
        connected: false,
        message: 'GitHub token is invalid or expired',
      });
    }

    const userData = await testResponse.json();

    return json({
      status: 'connected',
      connected: true,
      username: userData.login,
      message: `Connected as ${userData.login}`,
    });
  } catch (error: any) {
    return json({
      status: 'error',
      connected: false,
      message: error.message || 'Failed to check GitHub status',
    }, { status: 500 });
  }
}
