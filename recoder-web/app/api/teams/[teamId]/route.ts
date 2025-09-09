// Team management API endpoint  
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import crypto from 'crypto';

// Rate limiting for team operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member', 'viewer']).default('member')
});

const updateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'member', 'viewer'])
});

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1)
});

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending' | 'suspended';
  joinedAt: string;
  lastActivity?: string;
  permissions: string[];
}

interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

interface Team {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  updatedAt: string;
  settings: {
    visibility: 'private' | 'public';
    allowInvites: boolean;
    requireApproval: boolean;
    defaultRole: 'member' | 'viewer';
  };
  stats: {
    memberCount: number;
    projectCount: number;
    storageUsed: number;
    storageLimit: number;
  };
}

export async function GET(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'team-get');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId } = params;
    const url = new URL(request.url);
    const section = url.searchParams.get('section') || 'overview';
    const userId = session.user.id;

    // Verify user has access to this team
    const hasAccess = await verifyTeamAccess(userId, teamId);
    if (!hasAccess) {
      return Response.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    switch (section) {
      case 'overview':
        return await getTeamOverview(teamId, userId);
      case 'members':
        return await getTeamMembers(teamId, userId);
      case 'invites':
        return await getTeamInvites(teamId, userId);
      case 'settings':
        return await getTeamSettings(teamId, userId);
      default:
        return Response.json({ error: 'Invalid section' }, { status: 400 });
    }
  } catch (error) {
    console.error('Team API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId } = params;
    const updates = await request.json();

    // Verify user is team owner or admin
    const userRole = await getUserTeamRole(session.user.id, teamId);
    if (!userRole || !['owner', 'admin'].includes(userRole)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Validate and sanitize updates
    const allowedFields = ['name', 'description', 'settings'];
    const validUpdates: any = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'settings' && typeof value === 'object') {
          const allowedSettings = ['visibility', 'allowInvites', 'requireApproval', 'defaultRole'];
          validUpdates.settings = {};
          for (const [settingKey, settingValue] of Object.entries(value as object)) {
            if (allowedSettings.includes(settingKey)) {
              validUpdates.settings[settingKey] = settingValue;
            }
          }
        } else if (typeof value === 'string') {
          validUpdates[key] = value;
        }
      }
    }

    // Mock update - in production, update database
    console.log(`Updating team ${teamId}:`, validUpdates);

    return Response.json({
      success: true,
      message: 'Team updated successfully'
    });
  } catch (error) {
    console.error('Team update error:', error);
    return Response.json({ error: 'Failed to update team' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId } = params;

    // Verify user is team owner
    const userRole = await getUserTeamRole(session.user.id, teamId);
    if (userRole !== 'owner') {
      return Response.json({ error: 'Only team owners can delete teams' }, { status: 403 });
    }

    // Mock deletion - in production, soft delete team and handle cleanup
    console.log(`Deleting team ${teamId} by user ${session.user.id}`);

    return Response.json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    console.error('Team deletion error:', error);
    return Response.json({ error: 'Failed to delete team' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId } = params;
    const { action, ...data } = await request.json();

    switch (action) {
      case 'invite':
        return await inviteTeamMember(session.user.id, teamId, data);
      case 'remove-member':
        return await removeTeamMember(session.user.id, teamId, data.userId);
      case 'update-role':
        return await updateMemberRole(session.user.id, teamId, data.userId, data.role);
      case 'transfer-ownership':
        return await transferOwnership(session.user.id, teamId, data.newOwnerId);
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Team action error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getTeamOverview(teamId: string, userId: string): Promise<Response> {
  try {
    const team = await prisma.team.findFirst({
      where: { id: teamId },
      include: {
        _count: {
          select: {
            members: true,
            projects: true
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get user's role in the team
    const userRole = await getUserTeamRole(userId, teamId);

    // Calculate storage usage (mock for now - would integrate with file storage service)
    const storageUsed = Math.random() * 5; // GB
    const planLimits = {
      free: 1,
      pro: 10,
      enterprise: 100
    };

    const teamData: Team = {
      id: team.id,
      name: team.name,
      description: team.description || undefined,
      plan: team.plan as 'free' | 'pro' | 'enterprise',
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
      settings: {
        visibility: (team.settings as any)?.visibility || 'private',
        allowInvites: (team.settings as any)?.allowPublicProjects || true,
        requireApproval: (team.settings as any)?.requireApprovalForJoining || false,
        defaultRole: (team.settings as any)?.defaultMemberRole || 'member',
      },
      stats: {
        memberCount: team._count.members,
        projectCount: team._count.projects,
        storageUsed: Number(storageUsed.toFixed(2)),
        storageLimit: planLimits[team.plan as keyof typeof planLimits],
      },
    };

    return Response.json({ 
      team: teamData,
      userRole,
      owner: team.owner
    });

  } catch (error) {
    console.error('Error fetching team overview:', error);
    return Response.json({ error: 'Failed to fetch team overview' }, { status: 500 });
  }
}

async function getTeamMembers(teamId: string, userId: string): Promise<Response> {
  try {
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar_url: true,
            last_login_at: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // owners first, then admins, members, viewers
        { joinedAt: 'asc' }
      ]
    });

    const teamMembers: TeamMember[] = members.map(member => {
      const permissions = getPermissionsByRole(member.role);
      
      return {
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name || member.user.email,
        avatar: member.user.avatar_url || undefined,
        role: member.role as 'owner' | 'admin' | 'member' | 'viewer',
        status: 'active', // All current members are active
        joinedAt: member.joinedAt.toISOString(),
        lastActivity: member.user.last_login_at?.toISOString(),
        permissions
      };
    });

    return Response.json({ members: teamMembers });

  } catch (error) {
    console.error('Error fetching team members:', error);
    return Response.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

function getPermissionsByRole(role: string): string[] {
  switch (role) {
    case 'owner':
      return ['all'];
    case 'admin':
      return ['manage_members', 'manage_projects', 'manage_settings', 'read_projects', 'write_projects'];
    case 'member':
      return ['read_projects', 'write_projects', 'create_projects'];
    case 'viewer':
      return ['read_projects'];
    default:
      return [];
  }
}

async function getTeamInvites(teamId: string, userId: string): Promise<Response> {
  try {
    const invites = await prisma.teamInvite.findMany({
      where: { 
        teamId,
        expiresAt: {
          gt: new Date() // Only non-expired invites
        }
      },
      include: {
        inviter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const teamInvites: TeamInvite[] = invites.map(invite => ({
      id: invite.id,
      email: invite.email,
      role: invite.role as 'admin' | 'member' | 'viewer',
      invitedBy: invite.inviter.name || invite.inviter.email,
      invitedAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      status: 'pending' // All non-expired invites are pending
    }));

    return Response.json({ invites: teamInvites });

  } catch (error) {
    console.error('Error fetching team invites:', error);
    return Response.json({ error: 'Failed to fetch team invites' }, { status: 500 });
  }
}

async function getTeamSettings(teamId: string, userId: string): Promise<Response> {
  try {
    const team = await prisma.team.findFirst({
      where: { id: teamId },
      include: {
        _count: {
          select: { members: true }
        },
        subscription: {
          select: {
            plan: true,
            seats: true,
            status: true,
            currentPeriodEnd: true
          }
        }
      }
    });

    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get integrations count (mock for now - would query integrations table)
    const integrations = {
      github: { enabled: false, repos: 0 },
      slack: { enabled: false },
      discord: { enabled: false, webhookCount: 0 },
    };

    const settings = {
      visibility: (team.settings as any)?.visibility || 'private',
      allowInvites: (team.settings as any)?.allowPublicProjects !== false,
      requireApproval: (team.settings as any)?.requireApprovalForJoining || false,
      defaultRole: (team.settings as any)?.defaultMemberRole || 'member',
      integrations,
      billing: {
        plan: team.plan,
        seats: team.subscription?.seats || 5,
        seatsUsed: team._count.members,
        nextBilling: team.subscription?.currentPeriodEnd?.toISOString() || null,
        status: team.subscription?.status || 'active'
      },
    };

    return Response.json({ settings });

  } catch (error) {
    console.error('Error fetching team settings:', error);
    return Response.json({ error: 'Failed to fetch team settings' }, { status: 500 });
  }
}

async function inviteTeamMember(inviterId: string, teamId: string, data: any): Promise<Response> {
  try {
    const validatedData = inviteMemberSchema.parse(data);
    const { email, role } = validatedData;

    // Verify inviter has permission
    const inviterRole = await getUserTeamRole(inviterId, teamId);
    if (!inviterRole || !['owner', 'admin'].includes(inviterRole)) {
      return Response.json({ error: 'Insufficient permissions to invite members' }, { status: 403 });
    }

    // Check if user is already a member
    const existingMember = await prisma.user.findFirst({
      where: { email },
      include: {
        teamMemberships: {
          where: { teamId }
        }
      }
    });

    if (existingMember?.teamMemberships.length > 0) {
      return Response.json({ error: 'User is already a member of this team' }, { status: 409 });
    }

    // Check if invitation already exists
    const existingInvite = await prisma.teamInvite.findFirst({
      where: {
        teamId,
        email,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (existingInvite) {
      return Response.json({ error: 'Invitation already sent to this email' }, { status: 409 });
    }

    // Generate invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation
    const invitation = await prisma.teamInvite.create({
      data: {
        teamId,
        email,
        role,
        invitedBy: inviterId,
        token: inviteToken,
        expiresAt
      }
    });

    // Log the invitation
    await prisma.auditLog.create({
      data: {
        userId: inviterId,
        action: 'team_member_invited',
        platform: 'web',
        success: true,
        metadata: {
          teamId,
          inviteId: invitation.id,
          email,
          role
        }
      }
    });

    // TODO: Send invitation email
    console.log(`Invitation created for ${email} to join team ${teamId} as ${role}`);

    return Response.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        inviteUrl: `/teams/join/${inviteToken}`
      },
      message: 'Invitation sent successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid invitation data', details: error.errors }, { status: 400 });
    }

    console.error('Error inviting team member:', error);
    return Response.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}

async function removeTeamMember(requesterId: string, teamId: string, userId: string): Promise<Response> {
  // Verify requester has permission
  const requesterRole = await getUserTeamRole(requesterId, teamId);
  if (!requesterRole || !['owner', 'admin'].includes(requesterRole)) {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Don't allow removing the owner
  const targetRole = await getUserTeamRole(userId, teamId);
  if (targetRole === 'owner') {
    return Response.json({ error: 'Cannot remove team owner' }, { status: 400 });
  }

  // Mock removal - in production, update database
  console.log(`Removing user ${userId} from team ${teamId}`);

  return Response.json({
    success: true,
    message: 'Member removed successfully'
  });
}

async function updateMemberRole(requesterId: string, teamId: string, userId: string, newRole: string): Promise<Response> {
  // Verify requester has permission
  const requesterRole = await getUserTeamRole(requesterId, teamId);
  if (requesterRole !== 'owner') {
    return Response.json({ error: 'Only team owners can update member roles' }, { status: 403 });
  }

  if (!['admin', 'member', 'viewer'].includes(newRole)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Mock update - in production, update database
  console.log(`Updating user ${userId} role to ${newRole} in team ${teamId}`);

  return Response.json({
    success: true,
    message: 'Member role updated successfully'
  });
}

async function transferOwnership(currentOwnerId: string, teamId: string, newOwnerId: string): Promise<Response> {
  // Verify current owner
  const currentRole = await getUserTeamRole(currentOwnerId, teamId);
  if (currentRole !== 'owner') {
    return Response.json({ error: 'Only team owners can transfer ownership' }, { status: 403 });
  }

  // Verify new owner is team member
  const newOwnerRole = await getUserTeamRole(newOwnerId, teamId);
  if (!newOwnerRole) {
    return Response.json({ error: 'New owner must be a team member' }, { status: 400 });
  }

  // Mock transfer - in production, update database with transaction
  console.log(`Transferring ownership of team ${teamId} from ${currentOwnerId} to ${newOwnerId}`);

  return Response.json({
    success: true,
    message: 'Ownership transferred successfully'
  });
}

async function verifyTeamAccess(userId: string, teamId: string): Promise<boolean> {
  try {
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId
      }
    });
    return !!membership;
  } catch (error) {
    console.error('Error verifying team access:', error);
    return false;
  }
}

async function getUserTeamRole(userId: string, teamId: string): Promise<string | null> {
  try {
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId
      },
      select: { role: true }
    });
    return membership?.role || null;
  } catch (error) {
    console.error('Error getting user team role:', error);
    return null;
  }
}