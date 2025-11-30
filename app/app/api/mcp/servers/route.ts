import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import * as mcpService from '@/lib/services/mcp.service';
import { DEFAULT_SERVERS } from '@/lib/mcp/servers';

export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const servers = await mcpService.getUserServers(user.id);
  return NextResponse.json({ servers, defaults: DEFAULT_SERVERS });
}

export async function POST(req: NextRequest) {
  const { user } = await requireAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await req.json();
  const server = await mcpService.addServer(user.id, config);
  return NextResponse.json({ server });
}
