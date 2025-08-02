/**
 * IP Ban Management API
 * Allows manual banning and unbanning of IP addresses
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { banIP, unbanIP } from '@/lib/security/router-security-middleware';

export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.email !== 'admin@recoder.xyz') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { ip, reason } = body;

    if (!ip || typeof ip !== 'string') {
      return NextResponse.json({ error: 'Valid IP address is required' }, { status: 400 });
    }

    // Validate IP format (basic validation)
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return NextResponse.json({ error: 'Invalid IP address format' }, { status: 400 });
    }

    // Ban the IP
    banIP(ip, reason || 'Manual admin ban');

    return NextResponse.json({ 
      success: true, 
      message: `IP ${ip} has been banned`,
      ip,
      reason: reason || 'Manual admin ban',
      bannedBy: session.user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('IP ban API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.email !== 'admin@recoder.xyz') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');

    if (!ip) {
      return NextResponse.json({ error: 'IP address is required' }, { status: 400 });
    }

    // Unban the IP
    unbanIP(ip);

    return NextResponse.json({ 
      success: true, 
      message: `IP ${ip} has been unbanned`,
      ip,
      unbannedBy: session.user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('IP unban API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}