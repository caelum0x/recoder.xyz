import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

function normalizeRole(role: string | null | undefined, isCurrentUser: boolean) {
  if (isCurrentUser && (!role || role === 'user')) return 'owner';
  if (role === 'admin') return 'admin';
  return 'member';
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const currentUser = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        organization: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const members = await prisma.users.findMany({
      where: currentUser.organization ? { organization: currentUser.organization } : { id: currentUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        ai_generated_projects: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        teamMembers: members.map((member) => ({
          id: member.id,
          name: member.name || member.email.split('@')[0],
          email: member.email,
          role: normalizeRole(member.role, member.id === currentUser.id),
          status: 'active',
          joinedDate: member.createdAt.toISOString(),
          lastActive: (member.lastLoginAt || member.updatedAt).toISOString(),
          projects: member.ai_generated_projects.length,
        })),
      },
    });
  } catch (error) {
    logger.error('Team load error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to load team members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    // Identity is derived from the verified session (never the request body).
    const currentUser = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: { id: true, organization: true, name: true, role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Only an admin/owner of an organization may invite members. A plain
    // 'member' cannot pull other users into (or reshuffle) the team.
    const callerRole = normalizeRole(currentUser.role, true);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only an organization admin or owner can invite members.' },
        { status: 403 }
      );
    }

    const { email, role } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const organization = currentUser.organization || `${currentUser.name || 'Recoder'} Team`;

    const invitedUser = await prisma.users.findUnique({
      where: { email },
      select: { id: true, organization: true },
    });

    if (!invitedUser) {
      return NextResponse.json(
        { success: false, error: 'That user must sign up before they can join the team.' },
        { status: 404 }
      );
    }

    // Refuse to silently move a user who already belongs to a DIFFERENT
    // organization. Overwriting their org/role here would hijack them out of
    // their existing team without consent. Only unaffiliated users (no org)
    // or users already in this same org may be (re)assigned.
    if (invitedUser.organization && invitedUser.organization !== organization) {
      return NextResponse.json(
        {
          success: false,
          error: 'That user already belongs to another organization and cannot be moved.',
        },
        { status: 409 }
      );
    }

    // Lazily materialize the caller's org only once we know the invite is valid.
    if (!currentUser.organization) {
      // The `organization` value is a free-text string derived from the caller's
      // (user-controllable) display name. Without a stable org identifier, a
      // caller who has NO org of their own could otherwise "bootstrap" straight
      // into an EXISTING organization whose name their display name happens to
      // collide with (e.g. naming yourself "Cara" to land in "Cara Team"), and
      // from there read and rewrite that org's members. A caller with no org may
      // therefore only CREATE a brand-new organization — never join one that any
      // other user already occupies. Membership in a populated org is only ever
      // acquired through an explicit invite from a genuine member (this route).
      const orgAlreadyOwned = await prisma.users.findFirst({
        where: { organization, id: { not: currentUser.id } },
        select: { id: true },
      });

      if (orgAlreadyOwned) {
        return NextResponse.json(
          {
            success: false,
            error:
              'That organization name is already in use. Ask one of its owners to invite you instead of joining by name.',
          },
          { status: 409 }
        );
      }

      await prisma.users.update({
        where: { id: currentUser.id },
        data: { organization, updatedAt: new Date() },
      });
    }

    await prisma.users.update({
      where: { id: invitedUser.id },
      data: {
        organization,
        role: role === 'admin' ? 'admin' : 'member',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Team invite error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to add team member' }, { status: 500 });
  }
}
