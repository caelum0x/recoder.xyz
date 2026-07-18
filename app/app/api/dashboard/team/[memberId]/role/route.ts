import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Mirror the role model used in team/route.ts (`normalizeRole`): within an
 * organization a stored role of null/'user' denotes the org owner, 'admin'
 * is a privileged manager, and anything else ('member') is unprivileged.
 * Only owners and admins may change another member's role.
 */
function callerCanManageRoles(role: string | null | undefined): boolean {
  return !role || role === 'user' || role === 'owner' || role === 'admin';
}

export async function PATCH(
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

    // Privilege check: only org owners/admins may change roles. A plain member
    // must not be able to escalate themselves or anyone else.
    if (!callerCanManageRoles(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to change member roles.' },
        { status: 403 }
      );
    }

    const { role } = await request.json();
    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const { memberId } = await context.params;
    if (memberId === currentUser.id) {
      return NextResponse.json({ success: false, error: 'You cannot change your own role here.' }, { status: 400 });
    }

    // Enforce that the target belongs to the caller's organization.
    const targetMember = await prisma.users.findFirst({
      where: { id: memberId, organization: currentUser.organization },
      select: { id: true },
    });

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: 'Member not found in your team.' },
        { status: 404 }
      );
    }

    await prisma.users.updateMany({
      where: { id: memberId, organization: currentUser.organization },
      data: { role, updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Team role update error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to update member role' }, { status: 500 });
  }
}
