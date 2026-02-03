import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify the token is a valid session token
    // In production with useSecureCookies=true, Better Auth expects __Secure-recoder.session_token
    // In development, it expects recoder.session_token
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction ? '__Secure-recoder.session_token' : 'recoder.session_token';

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `${cookieName}=${token}`
      })
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Return user data
    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Token verification failed' },
      { status: 500 }
    );
  }
}
