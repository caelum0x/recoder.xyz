/**
 * Platform Access API Route
 * Handles cross-platform authentication and redirects
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

interface PlatformAccessRequest {
  platform: 'web' | 'chat' | 'cli' | 'extension';
  userId?: string;
  redirect?: string;
}

const PLATFORM_URLS = {
  web: process.env.RECODER_WEB_URL || 'http://localhost:3009',
  chat: process.env.RECODER_CHAT_URL || 'http://localhost:3008',
  cli: '/cli',
  extension: '/extension'
};

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let decoded: any;
    
    try {
      decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'development-secret');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body: PlatformAccessRequest = await request.json();
    const { platform } = body;

    if (!platform || !PLATFORM_URLS[platform]) {
      return NextResponse.json(
        { error: 'Invalid platform' },
        { status: 400 }
      );
    }

    // Create platform-specific access token
    const platformToken = jwt.sign({
      userId: decoded.userId,
      email: decoded.email,
      platform: platform,
      accessGranted: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, process.env.NEXTAUTH_SECRET || 'development-secret');

    // Return platform access info
    return NextResponse.json({
      success: true,
      platform: platform,
      accessUrl: PLATFORM_URLS[platform],
      token: platformToken,
      redirectUrl: body.redirect || PLATFORM_URLS[platform],
      message: `Access granted to Recoder ${platform.toUpperCase()}`
    });

  } catch (error) {
    console.error('Platform Access Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  
  if (!platform || !PLATFORM_URLS[platform as keyof typeof PLATFORM_URLS]) {
    return NextResponse.json(
      { error: 'Invalid platform' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    platform: platform,
    url: PLATFORM_URLS[platform as keyof typeof PLATFORM_URLS],
    available: true,
    requiresAuth: true
  });
}