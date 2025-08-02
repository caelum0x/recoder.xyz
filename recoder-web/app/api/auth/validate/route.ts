import { NextRequest, NextResponse } from 'next/server';
import { unifiedAuth } from '@/lib/unified-auth';
import { prisma } from '@/lib/prisma';

// Validate API key or token
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, apiKey } = body;

    let validationResult: any = { valid: false };

    if (apiKey) {
      // Validate API key
      validationResult = await unifiedAuth.validateAPIKey(apiKey);
      
      if (validationResult.valid) {
        // Log API key usage
        await prisma.auditLog.create({
          data: {
            userId: validationResult.userId,
            action: 'api_key_used',
            platform: 'api',
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            success: true,
            metadata: {
              scopes: validationResult.scopes
            }
          }
        });
      }
    } else if (token) {
      // Validate unified token
      const session = await unifiedAuth.validateUnifiedToken(token);
      
      if (session) {
        validationResult = {
          valid: true,
          userId: session.userId,
          scopes: session.scopes,
          platform: session.platform,
          expiresAt: session.expiresAt
        };

        // Log token usage
        await prisma.auditLog.create({
          data: {
            userId: session.userId,
            action: 'token_used',
            platform: session.platform,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            success: true,
            metadata: {
              scopes: session.scopes,
              deviceId: session.deviceId
            }
          }
        });
      }
    } else {
      return NextResponse.json({ 
        error: 'Missing token or apiKey' 
      }, { status: 400 });
    }

    return NextResponse.json(validationResult);
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json({ 
      error: 'Failed to validate credentials' 
    }, { status: 500 });
  }
}

// Refresh token
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json({ 
        error: 'Missing refresh token' 
      }, { status: 400 });
    }

    const newSession = await unifiedAuth.refreshUnifiedToken(refreshToken);

    if (newSession) {
      // Log token refresh
      await prisma.auditLog.create({
        data: {
          userId: newSession.userId,
          action: 'token_refreshed',
          platform: newSession.platform,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            deviceId: newSession.deviceId
          }
        }
      });

      return NextResponse.json({
        accessToken: newSession.accessToken,
        refreshToken: newSession.refreshToken,
        expiresAt: newSession.expiresAt
      });
    } else {
      return NextResponse.json({ 
        error: 'Invalid refresh token' 
      }, { status: 401 });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json({ 
      error: 'Failed to refresh token' 
    }, { status: 500 });
  }
}