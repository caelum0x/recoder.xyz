import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

export async function GET(request: NextRequest) {
  // Redirect to GitHub OAuth
  const githubClientId = process.env.GITHUB_ID;
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback/github`;
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${githubClientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=read:user user:email&` +
    `state=${nanoid()}`;

  return NextResponse.redirect(githubAuthUrl);
}
