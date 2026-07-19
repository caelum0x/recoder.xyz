import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Mirror the role model used in team/route.ts (`normalizeRole`) and the
 * sibling role/route.ts: within an organization a stored role of null/'user'
 * denotes the org owner, 'admin' is a privileged manager, and anything else
 * ('member') is unprivileged. Only owners and admins may remove a member.
 */
function callerCanManageMembers(role: string | null | undefined): boolean {
  return !role || role === 'user' || role === 'owner' || role === 'admin';
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    // Derive the caller from the VERIFIED session/token — never the request body.
    const currentUser = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: { id: true, organization: true, role: true },
    });

    if (!currentUser?.organization) {
      return NextResponse.json({ success: false, error: 'No active team found' }, { status: 400 });
    }

    // Privilege check: only org owners/admins may remove members. Without this
    // a plain 'member' of the org could remove the owner and every admin,
    // hijacking or griefing the team. Mirrors the guard in role/route.ts.
    if (!callerCanManageMembers(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to remove team members.' },
        { status: 403 }
      );
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
