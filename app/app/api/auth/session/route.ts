/**
 * Session verification endpoint
 * GET /api/auth/session
 *
 * Returns the current user session if authenticated
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookies or Authorization header
    const token = request.cookies.get('auth-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Fetch user from database
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        hasOwnApiKey: true,
        apiKey: true,
      }
    });

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        hasApiKey: !!(user.hasOwnApiKey || user.apiKey),
      },
      expires: new Date(decoded.exp * 1000).toISOString()
    });

  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
