import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Use production URL directly since NEXT_PUBLIC_ vars are build-time only
  const origin = 'https://recoder.xyz';
  
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${origin}/api/auth/callback/google`;
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${googleClientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=openid email profile&` +
    `access_type=offline&` +
    `prompt=consent`;

  return NextResponse.redirect(googleAuthUrl);
}
