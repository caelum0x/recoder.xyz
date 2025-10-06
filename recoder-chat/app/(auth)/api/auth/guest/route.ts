import { NextResponse } from 'next/server';
import { createGuestUser } from '@/lib/db/queries';
import { encode } from 'next-auth/jwt';

export async function GET(request: Request) {
  try {
    console.log('Guest auth route called - creating guest user');

    const { searchParams } = new URL(request.url);
    const redirectUrl = searchParams.get('redirectUrl') || '/';

    // Create guest user directly
    const [guestUser] = await createGuestUser();
    console.log('Guest user created:', guestUser.email);

    // Create JWT token manually
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new Error('AUTH_SECRET not configured');
    }

    const token = await encode({
      token: {
        id: guestUser.id,
        email: guestUser.email,
        type: 'guest',
        name: guestUser.email,
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    console.log('JWT token created, setting cookie and redirecting to:', redirectUrl);

    // Create response with redirect
    const response = NextResponse.redirect(new URL(redirectUrl, request.url));

    // Set the session cookie
    const cookieName = process.env.NODE_ENV === 'production'
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;

  } catch (error) {
    console.error('Guest auth error:', error);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', '/');
    loginUrl.searchParams.set('error', 'guest_auth_failed');
    return NextResponse.redirect(loginUrl);
  }
}
