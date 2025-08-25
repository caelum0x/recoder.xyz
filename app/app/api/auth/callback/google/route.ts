import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/auth/signin?error=oauth_error', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/auth/signin?error=no_code', request.url));
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'https://recoder.xyz/api/auth/callback/google',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL('/auth/signin?error=token_error', request.url));
    }

    // Get user information
    const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`);
    const userData = await userResponse.json();

    if (!userData.email) {
      return NextResponse.redirect(new URL('/auth/signin?error=no_email', request.url));
    }

    // Create user session
    const userSession = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      image: userData.picture,
      provider: 'google',
    };

    // Set session cookie and redirect to dashboard
    const response = NextResponse.redirect(new URL('/dashboard?auth=success', request.url));
    
    // Store user session data in cookie (in production, use proper session management)
    response.cookies.set('user_session', JSON.stringify(userSession), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;

  } catch (error) {
    console.error('Google OAuth Error:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=oauth_failed', request.url));
  }
}