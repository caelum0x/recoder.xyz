import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import * as mcpService from '@/lib/services/mcp.service';

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const { user } = await requireAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { serverId, toolName, args } = await req.json();
  const result = await mcpService.callTool(user.id, serverId, toolName, args);
  return NextResponse.json({ result });
}
