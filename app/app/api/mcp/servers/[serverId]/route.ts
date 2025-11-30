import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import * as mcpService from '@/lib/services/mcp.service';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ serverId: string }> }
) {
  const { user } = await requireAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await context.params;
  await mcpService.removeServer(user.id, params.serverId);
  return NextResponse.json({ success: true });
}
