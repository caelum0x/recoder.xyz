import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { enableServer, disableServer, uninstallServer, getServerHealth } from '@/lib/services/mcp.service';
import { isMcpRuntimeDisabledError, toMcpRuntimeErrorResponse } from '@/lib/mcp/runtime';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ serverId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { serverId } = await context.params;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const health = await getServerHealth(user.id, serverId);
    return NextResponse.json(health);
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(response.body, { status: response.status });
    }

    console.error('Failed to get server health:', error);
    return NextResponse.json(
      { error: 'Failed to get server health' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ serverId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { serverId } = await context.params;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();
    
    switch (action) {
      case 'enable':
        await enableServer(user.id, serverId);
        return NextResponse.json({ success: true, action: 'enabled' });
      
      case 'disable':
        await disableServer(user.id, serverId);
        return NextResponse.json({ success: true, action: 'disabled' });
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to update server:', error);
    return NextResponse.json(
      { error: 'Failed to update server' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ serverId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { serverId } = await context.params;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await uninstallServer(user.id, serverId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to uninstall server:', error);
    return NextResponse.json(
      { error: 'Failed to uninstall server' },
      { status: 500 }
    );
  }
}
