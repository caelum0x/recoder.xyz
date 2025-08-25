import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const env = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AUTH_URL: process.env.AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
    GITHUB_ID: process.env.GITHUB_ID ? '✓ Set' : '✗ Missing',
    GITHUB_SECRET: process.env.GITHUB_SECRET ? '✓ Set' : '✗ Missing',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? '✓ Set' : '✗ Missing',
    AUTH_SECRET: process.env.AUTH_SECRET ? '✓ Set' : '✗ Missing',
  };

  return NextResponse.json({ env, timestamp: new Date().toISOString() });
}
