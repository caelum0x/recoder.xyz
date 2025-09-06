// Complete Team Members management API with full CRUD operations
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import crypto from 'crypto';

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
  message: z.string().max(500).optional()
});

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  permissions: z.array(z.string()).optional()
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  message: z.string().max(500).optional(),
  expiresInDays: z.number().min(1).max(30).default(7)
});

export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { teamId } = params;
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const includeInvites = searchParams.get('includeInvites') === 'true';
    const role = searchParams.get('role');

    // Verify user has access to this team
    const userMembership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId
      },
      include: { team: true }
    });

    if (!userMembership) {
      return NextResponse.json(
        { error: 'Team not found or access denied' },
        { status: 404 }
      );
    }

    // Get team members
    const members = await prisma.teamMember.findMany({
      where: {
        teamId,
        ...(role && { role })
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true
          }
        }
      },
      orderBy: [
        { role: 'asc' },
        { joinedAt: 'desc' }
      ]
    });

    // Transform member data
    const transformedMembers = members.map(member => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      permissions: member.permissions || [],
      joinedAt: member.joinedAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
        memberSince: member.user.createdAt.toISOString()
      },
      isCurrentUser: member.userId === userId,
      canManage: ['owner', 'admin'].includes(userMembership.role) && member.userId !== userId
    }));

    let pendingInvites = [];
    if (includeInvites && ['owner', 'admin'].includes(userMembership.role)) {
      const invites = await prisma.teamInvite.findMany({
        where: {
          teamId,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      pendingInvites = invites.map(invite => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        message: invite.message,
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
        status: 'pending'
      }));
    }

    return NextResponse.json({
      members: transformedMembers,
      pendingInvites,
      team: {
        id: userMembership.team.id,
        name: userMembership.team.name,
        userRole: userMembership.role,
        canInviteMembers: ['owner', 'admin'].includes(userMembership.role),
        canManageMembers: ['owner', 'admin'].includes(userMembership.role)
      },
      total: transformedMembers.length,
      stats: {
        owners: transformedMembers.filter(m => m.role === 'owner').length,
        admins: transformedMembers.filter(m => m.role === 'admin').length,
        members: transformedMembers.filter(m => m.role === 'member').length,
        pendingInvites: pendingInvites.length
      }
    });

  } catch (error) {
    console.error('Team members fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { teamId } = params;
    const userId = session.user.id;
    const body = await request.json();
    const { action = 'invite' } = body;

    // Verify user has permission to manage this team
    const userMembership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId,
        role: { in: ['owner', 'admin'] }
      },
      include: { team: true }
    });

    if (!userMembership) {
      return NextResponse.json(
        { error: 'Team not found or insufficient permissions' },
        { status: 404 }
      );
    }

    if (action === 'invite') {
      const { email, role, message, expiresInDays } = inviteMemberSchema.parse(body);

      // Check if user is already a member or has pending invite
      const existingMember = await prisma.teamMember.findFirst({
        where: {
          teamId,
          user: { email }
        }
      });

      if (existingMember) {
        return NextResponse.json(
          { error: 'User is already a member of this team' },
          { status: 400 }
        );
      }

      const existingInvite = await prisma.teamInvite.findFirst({
        where: {
          teamId,
          email,
          expiresAt: { gt: new Date() }
        }
      });

      if (existingInvite) {
        return NextResponse.json(
          { error: 'User already has a pending invitation' },
          { status: 400 }
        );
      }

      // Generate invitation token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      // Create team invite
      const invite = await prisma.teamInvite.create({
        data: {
          teamId,
          email,
          role,
          token,
          message: message || null,
          invitedBy: userId,
          expiresAt
        },
        include: {
          team: {
            select: { id: true, name: true }
          }
        }
      });

      // Log the invitation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'team_member_invited',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            teamId,
            teamName: userMembership.team.name,
            invitedEmail: email,
            role,
            inviteId: invite.id,
            expiresAt: expiresAt.toISOString()
          }
        }
      });

      // Security event
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: 'team_member_invited',
          severity: 'low',
          description: `User ${email} was invited to team "${userMembership.team.name}"`,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            teamId,
            invitedEmail: email,
            role
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Team invitation sent successfully',
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          token: invite.token,
          createdAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/teams/invite/${invite.token}`,
          team: invite.team
        }
      }, { status: 201 });

    } else if (action === 'add') {
      // Direct add (for existing users)
      const { email, role } = addMemberSchema.parse(body);

      // Find user by email
      const targetUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true }
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found. Consider sending an invitation instead.' },
          { status: 404 }
        );
      }

      // Check if user is already a member
      const existingMember = await prisma.teamMember.findFirst({
        where: {
          teamId,
          userId: targetUser.id
        }
      });

      if (existingMember) {
        return NextResponse.json(
          { error: 'User is already a member of this team' },
          { status: 400 }
        );
      }

      // Add user as team member
      const newMember = await prisma.teamMember.create({
        data: {
          teamId,
          userId: targetUser.id,
          role,
          permissions: []
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              createdAt: true
            }
          }
        }
      });

      // Log the addition
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'team_member_added',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            teamId,
            addedUserId: targetUser.id,
            addedUserEmail: targetUser.email,
            role
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Team member added successfully',
        member: {
          id: newMember.id,
          userId: newMember.userId,
          role: newMember.role,
          permissions: newMember.permissions,
          joinedAt: newMember.joinedAt.toISOString(),
          user: newMember.user,
          isCurrentUser: false,
          canManage: true
        }
      }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Team member management error:', error);
    return NextResponse.json(
      { error: 'Failed to manage team member' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { teamId } = params;
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = updateMemberSchema.parse(body);

    // Verify user has permission to manage this team
    const userMembership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId,
        role: { in: ['owner', 'admin'] }
      }
    });

    if (!userMembership) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update team members' },
        { status: 403 }
      );
    }

    // Get the member to update
    const targetMember = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        teamId
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!targetMember) {
      return NextResponse.json(
        { error: 'Team member not found' },
        { status: 404 }
      );
    }

    // Prevent users from modifying themselves or owners (unless they are the owner)
    if (targetMember.userId === userId) {
      return NextResponse.json(
        { error: 'Cannot modify your own membership' },
        { status: 400 }
      );
    }

    if (targetMember.role === 'owner' && userMembership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only team owners can modify other owners' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.role !== undefined) {
      // Only owners can assign owner role
      if (updates.role === 'owner' && userMembership.role !== 'owner') {
        return NextResponse.json(
          { error: 'Only team owners can assign owner role' },
          { status: 403 }
        );
      }
      updateData.role = updates.role;
    }
    
    if (updates.permissions !== undefined) {
      updateData.permissions = updates.permissions;
    }

    // Update the member
    const updatedMember = await prisma.teamMember.update({
      where: { id: memberId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'team_member_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          teamId,
          memberId,
          updatedUserId: targetMember.userId,
          updatedUserEmail: targetMember.user.email,
          previousRole: targetMember.role,
          newRole: updates.role || targetMember.role,
          updates: Object.keys(updateData)
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Team member updated successfully',
      member: {
        id: updatedMember.id,
        userId: updatedMember.userId,
        role: updatedMember.role,
        permissions: updatedMember.permissions,
        joinedAt: updatedMember.joinedAt.toISOString(),
        user: updatedMember.user,
        isCurrentUser: false,
        canManage: true
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Team member update error:', error);
    return NextResponse.json(
      { error: 'Failed to update team member' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { teamId } = params;
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const action = searchParams.get('action') || 'remove';

    if (!memberId && action === 'remove') {
      return NextResponse.json(
        { error: 'Member ID is required for removal' },
        { status: 400 }
      );
    }

    // Verify user has permission to manage this team
    const userMembership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId
      }
    });

    if (!userMembership) {
      return NextResponse.json(
        { error: 'Team not found or access denied' },
        { status: 404 }
      );
    }

    if (action === 'leave') {
      // User is leaving the team
      if (userMembership.role === 'owner') {
        // Check if there are other owners
        const otherOwners = await prisma.teamMember.count({
          where: {
            teamId,
            role: 'owner',
            userId: { not: userId }
          }
        });

        if (otherOwners === 0) {
          return NextResponse.json(
            { error: 'Cannot leave team as the only owner. Transfer ownership first or delete the team.' },
            { status: 400 }
          );
        }
      }

      // Remove user's membership
      await prisma.teamMember.delete({
        where: { id: userMembership.id }
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'team_left',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            teamId,
            previousRole: userMembership.role
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'You have successfully left the team'
      });

    } else if (action === 'remove') {
      // Admin/owner removing another member
      if (!['owner', 'admin'].includes(userMembership.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions to remove team members' },
          { status: 403 }
        );
      }

      // Get the member to remove
      const targetMember = await prisma.teamMember.findFirst({
        where: {
          id: memberId,
          teamId
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!targetMember) {
        return NextResponse.json(
          { error: 'Team member not found' },
          { status: 404 }
        );
      }

      // Cannot remove yourself
      if (targetMember.userId === userId) {
        return NextResponse.json(
          { error: 'Cannot remove yourself. Use the leave action instead.' },
          { status: 400 }
        );
      }

      // Only owners can remove other owners
      if (targetMember.role === 'owner' && userMembership.role !== 'owner') {
        return NextResponse.json(
          { error: 'Only team owners can remove other owners' },
          { status: 403 }
        );
      }

      // Remove the member
      await prisma.teamMember.delete({
        where: { id: memberId }
      });

      // Log the removal
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'team_member_removed',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            teamId,
            removedUserId: targetMember.userId,
            removedUserEmail: targetMember.user.email,
            removedUserRole: targetMember.role
          }
        }
      });

      // Security event
      await prisma.securityEvent.create({
        data: {
          userId: targetMember.userId,
          eventType: 'team_membership_revoked',
          severity: 'medium',
          description: `User was removed from team by ${userMembership.role}`,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            teamId,
            removedBy: userId
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Team member removed successfully'
      });

    } else if (action === 'cancel_invite') {
      // Cancel pending invitation
      const inviteId = searchParams.get('inviteId');
      
      if (!inviteId) {
        return NextResponse.json(
          { error: 'Invite ID is required' },
          { status: 400 }
        );
      }

      if (!['owner', 'admin'].includes(userMembership.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions to cancel invitations' },
          { status: 403 }
        );
      }

      const invite = await prisma.teamInvite.findFirst({
        where: {
          id: inviteId,
          teamId
        }
      });

      if (!invite) {
        return NextResponse.json(
          { error: 'Invitation not found' },
          { status: 404 }
        );
      }

      // Delete the invitation
      await prisma.teamInvite.delete({
        where: { id: inviteId }
      });

      // Log the cancellation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'team_invite_cancelled',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            teamId,
            inviteId,
            invitedEmail: invite.email,
            inviteRole: invite.role
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Team invitation cancelled successfully'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Team member removal error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}