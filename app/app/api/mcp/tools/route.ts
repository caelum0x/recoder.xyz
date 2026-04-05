import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import * as mcpService from '@/lib/services/mcp.service';
import { isMcpRuntimeDisabledError, toMcpRuntimeErrorResponse } from '@/lib/mcp/runtime';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serverId = req.nextUrl.searchParams.get('serverId');
    if (!serverId) {
      return NextResponse.json({ error: 'serverId required' }, { status: 400 });
    }

    const tools = await mcpService.listTools(user.id, serverId);
    return NextResponse.json({ tools });
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(response.body, { status: response.status });
    }

    return NextResponse.json({ error: 'Failed to list tools' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverId, toolName, args } = await req.json();
    const result = await mcpService.callTool(user.id, serverId, toolName, args);
    return NextResponse.json({ result });
  } catch (error) {
    if (isMcpRuntimeDisabledError(error)) {
      const response = toMcpRuntimeErrorResponse();
      return NextResponse.json(response.body, { status: response.status });
    }

    return NextResponse.json({ error: 'Failed to call tool' }, { status: 500 });
  }
}
