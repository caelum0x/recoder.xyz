import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getAllServersHealth } from '@/lib/services/mcp.service';
import { isMcpRuntimeDisabledError, toMcpRuntimeErrorResponse } from '@/lib/mcp/runtime';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const health = await getAllServersHealth(user.id);
    const allHealthy = health.every((s) => s.healthy);

    return NextResponse.json({
      healthy: allHealthy,
      servers: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(
        {
          healthy: false,
          timestamp: new Date().toISOString(),
          ...response.body,
        },
        { status: response.status }
      );
    }

    console.error('Failed to check MCP health:', error);
    return NextResponse.json(
      { 
        healthy: false, 
        error: 'Failed to check MCP health',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
