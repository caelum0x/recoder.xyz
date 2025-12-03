import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { checkForUpdates, updateServer, updateAllServers } from '@/lib/mcp/auto-update';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await checkForUpdates(user.id);
    return NextResponse.json({ updates });
  } catch (error) {
    console.error('Failed to check updates:', error);
    return NextResponse.json(
      { error: 'Failed to check updates' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverId, updateAll } = await req.json();

    if (updateAll) {
      const results = await updateAllServers(user.id);
      return NextResponse.json({ results });
    }

    if (!serverId) {
      return NextResponse.json({ error: 'serverId is required' }, { status: 400 });
    }

    const result = await updateServer(user.id, serverId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to update server:', error);
    return NextResponse.json(
      { error: 'Failed to update server' },
      { status: 500 }
    );
  }
}
