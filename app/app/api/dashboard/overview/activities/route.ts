import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { ensureAppUserFromAuthUser } from '@/lib/auth-helpers';

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await ensureAppUserFromAuthUser(authUser);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get recent audit logs
    const auditLogs = await prisma.audit_logs.findMany({
      where: { userId: user.id },
      orderBy: { timestamp: 'desc' },
      take: 20
    });

    // Map audit logs to activities
    const activities = auditLogs.map(log => {
      let icon: 'project' | 'api' | 'usage' | 'billing' = 'usage';
      let description = log.action;

      if (log.resource === 'project') {
        icon = 'project';
        description = `Project ${log.action}: ${log.resourceId}`;
      } else if (log.resource === 'api_key') {
        icon = 'api';
        description = `API Key ${log.action}`;
      } else if (log.resource === 'subscription' || log.resource === 'payment') {
        icon = 'billing';
        description = `${log.resource} ${log.action}`;
      }

      return {
        id: log.id,
        type: log.resource,
        description,
        timestamp: log.timestamp.toISOString(),
        icon
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        activities
      }
    });

  } catch (error) {
    console.error('Dashboard activities error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}
