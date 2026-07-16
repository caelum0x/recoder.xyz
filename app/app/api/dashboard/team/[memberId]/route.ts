import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const currentUser = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: { id: true, organization: true },
    });

    if (!currentUser?.organization) {
      return NextResponse.json({ success: false, error: 'No active team found' }, { status: 400 });
    }

    const { memberId } = await context.params;
    if (memberId === currentUser.id) {
      return NextResponse.json({ success: false, error: 'You cannot remove yourself here.' }, { status: 400 });
    }

    await prisma.users.updateMany({
      where: { id: memberId, organization: currentUser.organization },
      data: { organization: null, role: 'user', updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Team member delete error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to remove team member' }, { status: 500 });
  }
}
