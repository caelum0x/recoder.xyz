import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { installServer } from '@/lib/services/mcp.service';
import { isMcpRuntimeDisabledError, toMcpRuntimeErrorResponse } from '@/lib/mcp/runtime';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverId, config } = await req.json();
    if (!serverId) {
      return NextResponse.json({ error: 'serverId is required' }, { status: 400 });
    }

    const server = await installServer(user.id, serverId, config);
    return NextResponse.json({ server });
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(response.body, { status: response.status });
    }

    console.error('Failed to install server:', error);
    return NextResponse.json(
      { error: 'Failed to install server' },
      { status: 500 }
    );
  }
}
