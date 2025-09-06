// Complete Teams management API with full CRUD operations
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import crypto from 'crypto';

const createTeamSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s-_]+$/, 'Team name can only contain letters, numbers, spaces, hyphens, and underscores'),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']).default('private'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free')
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s-_]+$/).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']).optional()
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role'); // Filter by user role
    const includeInvites = searchParams.get('includeInvites') === 'true';

    // Get teams where user is a member
    const teamMemberships = await prisma.teamMember.findMany({
      where: {
        userId,
        ...(role && { role })
      },
      include: {
        team: {
          include: {
            _count: {
              select: {
                members: true,
                projects: true
              }
            }
          }
        }
      },
      orderBy: {
        joinedAt: 'desc'
      }
    });

    // Transform teams data
    const teams = await Promise.all(teamMemberships.map(async (membership) => {
      const team = membership.team;
      
      // Get team owner info
      const owner = await prisma.user.findUnique({
        where: { id: team.ownerId },
        select: { id: true, name: true, email: true }
      });

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        slug: team.slug,
        plan: team.plan,
        visibility: team.visibility || 'private',
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt.toISOString(),
        ownerId: team.ownerId,
        ownerName: owner?.name || owner?.email || 'Unknown',
        userRole: membership.role,
        memberCount: team._count.members,
        projectCount: team._count.projects,
        joinedAt: membership.joinedAt.toISOString(),
        settings: team.settings || {}
      };
    }));

    // Include pending invites if requested
    let pendingInvites = [];
    if (includeInvites) {
      const invites = await prisma.teamInvite.findMany({
        where: {
          email: session.user.email,
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              description: true,
              slug: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      pendingInvites = invites.map(invite => ({
        id: invite.id,
        team: invite.team,
        role: invite.role,
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
        token: invite.token
      }));
    }

    return NextResponse.json({
      teams,
      pendingInvites,
      total: teams.length
    });

  } catch (error) {
    console.error('Teams fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, description, visibility, plan } = createTeamSchema.parse(body);
    const userId = session.user.id;

    // Generate unique slug from team name
    const baseSlug = name.toLowerCase()
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    let slug = baseSlug;
    let counter = 1;
    
    // Ensure slug is unique
    while (await prisma.team.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Check team limits based on subscription
    const userSubscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const userPlan = userSubscription?.plan || 'free';
    const teamLimits = {
      free: 2,
      pro: 10,
      enterprise: 50
    };

    const ownedTeamsCount = await prisma.teamMember.count({
      where: {
        userId,
        role: 'owner'
      }
    });

    if (ownedTeamsCount >= teamLimits[userPlan as keyof typeof teamLimits]) {
      return NextResponse.json(
        { 
          error: `Team limit reached. ${userPlan} plan allows ${teamLimits[userPlan as keyof typeof teamLimits]} teams.`,
          upgradeRequired: userPlan === 'free'
        },
        { status: 403 }
      );
    }

    // Create team and team member in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the team
      const newTeam = await tx.team.create({
        data: {
          name,
          description: description || null,
          slug,
          plan,
          ownerId: userId,
          settings: {
            visibility,
            allowPublicProjects: visibility === 'public',
            requireApprovalForJoining: true,
            defaultMemberRole: 'member'
          }
        }
      });

      // Add owner as first team member
      await tx.teamMember.create({
        data: {
          teamId: newTeam.id,
          userId,
          role: 'owner'
        }
      });

      return newTeam;
    });

    // Log team creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'team_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          teamId: result.id,
          teamName: name,
          teamSlug: slug,
          plan
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'team_created',
        severity: 'low',
        description: `Team "${name}" created`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          teamId: result.id,
          teamName: name
        }
      }
    });

    return NextResponse.json({
      success: true,
      team: {
        id: result.id,
        name: result.name,
        description: result.description,
        slug: result.slug,
        plan: result.plan,
        visibility,
        createdAt: result.createdAt.toISOString(),
        ownerId: result.ownerId,
        userRole: 'owner',
        memberCount: 1,
        projectCount: 0,
        settings: result.settings
      },
      message: 'Team created successfully'
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid team data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Team creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = updateTeamSchema.parse(body);
    const userId = session.user.id;

    // Verify user has permission to update team (owner or admin)
    const teamMembership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId,
        role: { in: ['owner', 'admin'] }
      },
      include: { team: true }
    });

    if (!teamMembership) {
      return NextResponse.json(
        { error: 'Team not found or insufficient permissions' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.visibility !== undefined) {
      updateData.settings = {
        ...teamMembership.team.settings,
        visibility: updates.visibility,
        allowPublicProjects: updates.visibility === 'public'
      };
    }

    // Update the team
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...updateData,
        updatedAt: new Date()
      },
      include: {
        _count: {
          select: {
            members: true,
            projects: true
          }
        }
      }
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'team_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          teamId,
          updates: Object.keys(updateData)
        }
      }
    });

    return NextResponse.json({
      success: true,
      team: {
        id: updatedTeam.id,
        name: updatedTeam.name,
        description: updatedTeam.description,
        slug: updatedTeam.slug,
        plan: updatedTeam.plan,
        visibility: (updatedTeam.settings as any)?.visibility || 'private',
        updatedAt: updatedTeam.updatedAt.toISOString(),
        memberCount: updatedTeam._count.members,
        projectCount: updatedTeam._count.projects,
        settings: updatedTeam.settings
      },
      message: 'Team updated successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Team update error:', error);
    return NextResponse.json(
      { error: 'Failed to update team' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // Verify user is the team owner
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        ownerId: userId
      },
      include: {
        _count: {
          select: {
            members: true,
            projects: true
          }
        }
      }
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found or you are not the owner' },
        { status: 404 }
      );
    }

    // Check if team has active projects
    if (team._count.projects > 0) {
      return NextResponse.json(
        { error: 'Cannot delete team with active projects. Please transfer or delete projects first.' },
        { status: 400 }
      );
    }

    // Delete team and related data in transaction
    await prisma.$transaction(async (tx) => {
      // Delete team invites
      await tx.teamInvite.deleteMany({
        where: { teamId }
      });

      // Delete team members
      await tx.teamMember.deleteMany({
        where: { teamId }
      });

      // Delete team projects (if any)
      await tx.teamProject.deleteMany({
        where: { teamId }
      });

      // Delete the team
      await tx.team.delete({
        where: { id: teamId }
      });
    });

    // Log team deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'team_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          teamId,
          teamName: team.name,
          memberCount: team._count.members
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'team_deleted',
        severity: 'medium',
        description: `Team "${team.name}" was deleted`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          teamId,
          teamName: team.name
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Team deleted successfully'
    });

  } catch (error) {
    console.error('Team deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete team' },
      { status: 500 }
    );
  }
}