import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const from = url.searchParams.get('from');
  
  if (!token) {
    return json({ error: 'No token provided' }, { status: 401 });
  }

  try {
    // Verify token with main app
    const verifyResponse = await fetch('https://recoder.xyz/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!verifyResponse.ok) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const userData = await verifyResponse.json();

    // Set session cookie
    return json(
      { success: true, user: userData },
      {
        headers: {
          'Set-Cookie': `recoder_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        }
      }
    );
  } catch (error) {
    console.error('Token verification error:', error);
    return json({ error: 'Verification failed' }, { status: 500 });
  }
}
