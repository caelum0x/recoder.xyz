import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const provider = searchParams.get('provider') || 'github'; // Default to github

    if (error) {
      return NextResponse.redirect(new URL('/auth/signin?error=oauth_error', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/auth/signin?error=no_code', request.url));
    }

    let userData: any;

    if (provider === 'github') {
      // GitHub OAuth flow
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_ID,
          client_secret: process.env.GITHUB_SECRET,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        return NextResponse.redirect(new URL('/auth/signin?error=token_error', request.url));
      }

      // Get user information
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      });

      const githubUser = await userResponse.json();

      // Get user email
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      });

      const emailData = await emailResponse.json();
      const primaryEmail = emailData.find((email: any) => email.primary)?.email || githubUser.email;

      userData = {
        id: githubUser.id.toString(),
        name: githubUser.name || githubUser.login,
        email: primaryEmail,
        image: githubUser.avatar_url,
        provider: 'github',
      };
    } else if (provider === 'google') {
      // Google OAuth flow
      // Dynamic redirect URI based on environment
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
      const redirectUri = `${baseUrl}/api/auth/callback?provider=google`;

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
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        return NextResponse.redirect(new URL('/auth/signin?error=token_error', request.url));
      }

      // Get user information
      const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`);
      const googleUser = await userResponse.json();

      if (!googleUser.email) {
        return NextResponse.redirect(new URL('/auth/signin?error=no_email', request.url));
      }

      userData = {
        id: googleUser.id,
        name: googleUser.name,
        email: googleUser.email,
        image: googleUser.picture,
        provider: 'google',
      };
    }

    if (!userData) {
      return NextResponse.redirect(new URL('/auth/signin?error=invalid_provider', request.url));
    }

    // Set session cookie and redirect to dashboard
    const response = NextResponse.redirect(new URL('/dashboard?auth=success', request.url));
    
    // Store user session data in cookie (in production, use proper session management)
    response.cookies.set('user_session', JSON.stringify(userData), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;

  } catch (error) {
    console.error('OAuth Error:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=oauth_failed', request.url));
  }
}