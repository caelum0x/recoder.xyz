import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

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
          commits: 0,
        })),
      },
    });
  } catch (error) {
    console.error('Team load error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load team members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const currentUser = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: { id: true, organization: true, name: true },
    });

    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { email, role } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const organization = currentUser.organization || `${currentUser.name || 'Recoder'} Team`;
    if (!currentUser.organization) {
      await prisma.users.update({
        where: { id: currentUser.id },
        data: { organization, updatedAt: new Date() },
      });
    }

    const invitedUser = await prisma.users.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!invitedUser) {
      return NextResponse.json(
        { success: false, error: 'That user must sign up before they can join the team.' },
        { status: 404 }
      );
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
    console.error('Team invite error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add team member' }, { status: 500 });
  }
}
