// Team management API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';

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
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId } = params;
    const url = new URL(request.url);
    const section = url.searchParams.get('section') || 'overview';

    // Verify user has access to this team
    const hasAccess = await verifyTeamAccess(session.user.id, teamId);
    if (!hasAccess) {
      return Response.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    switch (section) {
      case 'overview':
        return await getTeamOverview(teamId);
      case 'members':
        return await getTeamMembers(teamId);
      case 'invites':
        return await getTeamInvites(teamId);
      case 'settings':
        return await getTeamSettings(teamId);
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

async function getTeamOverview(teamId: string): Promise<Response> {
  // Mock team data - in production, fetch from database
  const mockTeam: Team = {
    id: teamId,
    name: 'Development Team',
    description: 'Main development team for all projects',
    plan: 'pro',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-12-01T00:00:00Z',
    settings: {
      visibility: 'private',
      allowInvites: true,
      requireApproval: false,
      defaultRole: 'member',
    },
    stats: {
      memberCount: 5,
      projectCount: 12,
      storageUsed: 2.4, // GB
      storageLimit: 10, // GB
    },
  };

  return Response.json({ team: mockTeam });
}

async function getTeamMembers(teamId: string): Promise<Response> {
  // Mock members data - in production, fetch from database
  const mockMembers: TeamMember[] = [
    {
      id: '1',
      userId: 'user_1',
      email: 'john@example.com',
      name: 'John Doe',
      avatar: 'https://example.com/avatar1.jpg',
      role: 'owner',
      status: 'active',
      joinedAt: '2023-01-01T00:00:00Z',
      lastActivity: new Date().toISOString(),
      permissions: ['all'],
    },
    {
      id: '2',
      userId: 'user_2',
      email: 'jane@example.com',
      name: 'Jane Smith',
      role: 'admin',
      status: 'active',
      joinedAt: '2023-02-15T00:00:00Z',
      lastActivity: new Date(Date.now() - 3600000).toISOString(),
      permissions: ['manage_members', 'manage_projects'],
    },
    {
      id: '3',
      userId: 'user_3',
      email: 'bob@example.com',
      name: 'Bob Johnson',
      role: 'member',
      status: 'active',
      joinedAt: '2023-03-01T00:00:00Z',
      lastActivity: new Date(Date.now() - 86400000).toISOString(),
      permissions: ['read_projects', 'write_projects'],
    },
  ];

  return Response.json({ members: mockMembers });
}

async function getTeamInvites(teamId: string): Promise<Response> {
  // Mock invites data - in production, fetch from database
  const mockInvites: TeamInvite[] = [
    {
      id: '1',
      email: 'alice@example.com',
      role: 'member',
      invitedBy: 'user_1',
      invitedAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
  ];

  return Response.json({ invites: mockInvites });
}

async function getTeamSettings(teamId: string): Promise<Response> {
  const settings = {
    visibility: 'private',
    allowInvites: true,
    requireApproval: false,
    defaultRole: 'member',
    integrations: {
      github: { enabled: true, repos: 3 },
      slack: { enabled: false },
      discord: { enabled: true, webhookCount: 2 },
    },
    billing: {
      plan: 'pro',
      seats: 5,
      seatsUsed: 3,
      nextBilling: '2024-01-01T00:00:00Z',
    },
  };

  return Response.json({ settings });
}

async function inviteTeamMember(inviterId: string, teamId: string, data: any): Promise<Response> {
  const { email, role = 'member' } = data;

  if (!email) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  // Verify inviter has permission
  const inviterRole = await getUserTeamRole(inviterId, teamId);
  if (!inviterRole || !['owner', 'admin'].includes(inviterRole)) {
    return Response.json({ error: 'Insufficient permissions to invite members' }, { status: 403 });
  }

  // Mock invitation - in production, create invite record and send email
  console.log(`Inviting ${email} to team ${teamId} as ${role}`);

  return Response.json({
    success: true,
    message: 'Invitation sent successfully'
  });
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
  // Mock verification - in production, check database
  return true;
}

async function getUserTeamRole(userId: string, teamId: string): Promise<string | null> {
  // Mock role retrieval - in production, query database
  // Return mock role based on userId for testing
  if (userId.includes('owner') || teamId === 'team_1') {
    return 'owner';
  }
  return 'member';
}