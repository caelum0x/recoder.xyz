import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { callTool } from '@/lib/services/mcp.service';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverId, toolName, args } = await req.json();

    if (!serverId || !toolName) {
      return NextResponse.json(
        { error: 'serverId and toolName are required' },
        { status: 400 }
      );
    }

    const result = await callTool(user.id, serverId, toolName, args);

    // Log the call
    await prisma.mCPToolCall.create({
      data: {
        userId: user.id,
        serverId,
        toolName,
        params: args || {},
        result: result.result,
        error: result.error,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to call tool:', error);
    return NextResponse.json(
      { error: 'Failed to call tool' },
      { status: 500 }
    );
  }
}
