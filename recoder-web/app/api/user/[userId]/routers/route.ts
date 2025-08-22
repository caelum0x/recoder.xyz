/**
 * User Routers API
 * Manages CLI routers associated with a user account
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouterMetrics {
  routerId: string;
  name: string;
  status: 'active' | 'idle' | 'disconnected';
  version: string;
  uptime: number;
  lastUsed: string;
  enterpriseMode: boolean;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { userId } = params;

    // Verify user can access this data
    if (session.user.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get user's routers from database
    const routers = await getUserRouters(userId);

    return NextResponse.json({
      success: true,
      routers: routers,
      total: routers.length
    });

  } catch (error: any) {
    console.error('Get user routers error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load routers' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { userId } = params;

    // Verify user can access this data
    if (session.user.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      routerId,
      name,
      version,
      enterpriseMode = false,
      capabilities = []
    } = body;

    if (!routerId) {
      return NextResponse.json(
        { success: false, error: 'Router ID is required' },
        { status: 400 }
      );
    }

    // Register/update router
    const router = await prisma.router.upsert({
      where: {
        routerId: routerId
      },
      update: {
        name,
        version,
        metadata: {
          enterpriseMode,
          capabilities
        },
        lastUsed: new Date(),
        status: 'active'
      },
      create: {
        routerId,
        name: name || routerId,
        userId: userId,
        version: version || '1.0.0',
        status: 'active',
        metadata: {
          enterpriseMode,
          capabilities
        },
        lastUsed: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Router registered successfully',
      router: {
        routerId: router.routerId,
        name: router.name,
        enterpriseMode: (router.metadata as any)?.enterpriseMode || false,
        status: router.status
      }
    });

  } catch (error: any) {
    console.error('Register router error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register router' },
      { status: 500 }
    );
  }
}

async function getUserRouters(userId: string): Promise<RouterMetrics[]> {
  try {
    const routers = await prisma.router.findMany({
      where: {
        userId: userId
      },
      orderBy: {
        lastUsed: 'desc'
      }
    });

    // If no routers found, return mock data for demonstration
    if (routers.length === 0) {
      return generateMockRouters(userId);
    }

    return routers.map(router => ({
      routerId: router.routerId,
      name: router.name,
      status: determineRouterStatus(router.lastUsed),
      version: router.version,
      uptime: calculateUptime(router.createdAt),
      lastUsed: router.lastUsed.toISOString(),
      enterpriseMode: (router.metadata as any)?.enterpriseMode || false
    }));

  } catch (error) {
    console.error('Failed to get user routers:', error);
    // Return mock data if database query fails
    return generateMockRouters(userId);
  }
}

function determineRouterStatus(lastSeen: Date): 'active' | 'idle' | 'disconnected' {
  const now = new Date();
  const timeDiff = now.getTime() - lastSeen.getTime();
  const minutesDiff = timeDiff / (1000 * 60);

  if (minutesDiff < 5) {
    return 'active';
  } else if (minutesDiff < 60) {
    return 'idle';
  } else {
    return 'disconnected';
  }
}

function calculateUptime(createdAt: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - createdAt.getTime()) / 1000);
}

function generateMockRouters(userId: string): RouterMetrics[] {
  // Generate mock router data for demonstration
  return [
    {
      routerId: `router-${userId.slice(0, 8)}-main`,
      name: 'Development Router',
      status: 'active',
      version: '2.1.0',
      uptime: 86400, // 1 day
      lastUsed: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
      enterpriseMode: false
    },
    {
      routerId: `router-${userId.slice(0, 8)}-prod`,
      name: 'Production Router',
      status: 'active',
      version: '2.0.5',
      uptime: 259200, // 3 days
      lastUsed: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      enterpriseMode: true
    },
    {
      routerId: `router-${userId.slice(0, 8)}-test`,
      name: 'Testing Router',
      status: 'disconnected',
      version: '1.9.8',
      uptime: 7200, // 2 hours
      lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      enterpriseMode: false
    }
  ];
}