import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import * as mcpService from '@/lib/services/mcp.service';
import { DEFAULT_SERVERS } from '@/lib/mcp/servers';
import { isMcpRuntimeDisabledError, toMcpRuntimeErrorResponse } from '@/lib/mcp/runtime';

export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const servers = await mcpService.getUserServers(user.id);
  return NextResponse.json({ servers, defaults: DEFAULT_SERVERS });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverId, config } = await req.json();
    const server = await mcpService.installServer(user.id, serverId, config);
    return NextResponse.json({ server });
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(response.body, { status: response.status });
    }

    return NextResponse.json({ error: 'Failed to install server' }, { status: 500 });
  }
}
