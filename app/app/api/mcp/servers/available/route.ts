import { NextResponse } from 'next/server';
import { getAvailableServers } from '@/lib/services/mcp.service';

export async function GET() {
  try {
    const servers = getAvailableServers();
    return NextResponse.json({ servers });
  } catch (error) {
    console.error('Failed to get available servers:', error);
    return NextResponse.json(
      { error: 'Failed to get available servers' },
      { status: 500 }
    );
  }
}
