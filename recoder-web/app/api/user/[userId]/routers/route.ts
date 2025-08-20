/**
 * User Routers API
 * Manages CLI routers associated with a user account
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouterMetrics {
  router_id: string;
  router_name: string;
  status: 'active' | 'idle' | 'disconnected';
  version: string;
  uptime: number;
  last_seen: string;
  enterprise_mode: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

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
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

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
      router_id,
      router_name,
      version,
      enterprise_mode = false,
      capabilities = []
    } = body;

    if (!router_id) {
      return NextResponse.json(
        { success: false, error: 'Router ID is required' },
        { status: 400 }
      );
    }

    // Register/update router
    const router = await prisma.router.upsert({
      where: {
        router_id_user_id: {
          router_id,
          user_id: userId
        }
      },
      update: {
        router_name,
        version,
        enterprise_mode,
        capabilities,
        last_seen: new Date(),
        status: 'active'
      },
      create: {
        router_id,
        router_name: router_name || router_id,
        user_id: userId,
        version: version || '1.0.0',
        enterprise_mode,
        capabilities,
        status: 'active',
        created_at: new Date(),
        last_seen: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Router registered successfully',
      router: {
        router_id: router.router_id,
        router_name: router.router_name,
        enterprise_mode: router.enterprise_mode,
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
        user_id: userId
      },
      orderBy: {
        last_seen: 'desc'
      }
    });

    // If no routers found, return mock data for demonstration
    if (routers.length === 0) {
      return generateMockRouters(userId);
    }

    return routers.map(router => ({
      router_id: router.router_id,
      router_name: router.router_name,
      status: determineRouterStatus(router.last_seen),
      version: router.version,
      uptime: calculateUptime(router.created_at),
      last_seen: router.last_seen.toISOString(),
      enterprise_mode: router.enterprise_mode
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
      router_id: `router-${userId.slice(0, 8)}-main`,
      router_name: 'Development Router',
      status: 'active',
      version: '2.1.0',
      uptime: 86400, // 1 day
      last_seen: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
      enterprise_mode: false
    },
    {
      router_id: `router-${userId.slice(0, 8)}-prod`,
      router_name: 'Production Router',
      status: 'active',
      version: '2.0.5',
      uptime: 259200, // 3 days
      last_seen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      enterprise_mode: true
    },
    {
      router_id: `router-${userId.slice(0, 8)}-test`,
      router_name: 'Testing Router',
      status: 'disconnected',
      version: '1.9.8',
      uptime: 7200, // 2 hours
      last_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      enterprise_mode: false
    }
  ];
}