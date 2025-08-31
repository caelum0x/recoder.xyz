import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import logger from '@/lib/logger';

interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  projects: string[];
  settings: TeamSettings;
  billing: TeamBilling;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  permissions: string[];
  joinedAt: string;
  lastActive: string;
  avatar?: string;
}

interface TeamSettings {
  allowExternalCollaborators: boolean;
  requireApprovalForDeployments: boolean;
  enforceCodeReviews: boolean;
  allowAIGeneration: boolean;
  maxProjectsPerMember: number;
  retentionDays: number;
}

interface TeamBilling {
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'trial' | 'suspended';
  seats: number;
  usedSeats: number;
  billingCycle: 'monthly' | 'annual';
  nextBilling: string;
  features: string[];
}

// In-memory teams storage (in production, use a database)
const teams = new Map<string, Team>();

export async function POST(request: NextRequest) {
  try {
    const { action, teamId, userId, data } = await request.json();

    switch (action) {
      case 'create':
        return await createTeam(data);
      case 'invite':
        return await inviteTeamMember(teamId, data);
      case 'remove_member':
        return await removeTeamMember(teamId, data.memberId);
      case 'update_role':
        return await updateMemberRole(teamId, data.memberId, data.role);
      case 'update_settings':
        return await updateTeamSettings(teamId, data.settings);
      case 'upgrade_plan':
        return await upgradeTeamPlan(teamId, data.plan);
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    logger.error('Error in enterprise API:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process request'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const userId = searchParams.get('userId');

    if (teamId) {
      const team = teams.get(teamId);
      if (!team) {
        return NextResponse.json({
          success: false,
          error: 'Team not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: team
      });
    }

    if (userId) {
      // Get all teams for a user
      const userTeams = Array.from(teams.values()).filter(team =>
        team.members.some(member => member.id === userId)
      );

      return NextResponse.json({
        success: true,
        data: userTeams
      });
    }

    return NextResponse.json({
      success: false,
      error: 'teamId or userId required'
    }, { status: 400 });

  } catch (error) {
    logger.error('Error fetching enterprise data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch data'
    }, { status: 500 });
  }
}

async function createTeam(data: any): Promise<NextResponse> {
  const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const team: Team = {
    id: teamId,
    name: data.name,
    description: data.description || '',
    members: [{
      id: data.ownerId,
      email: data.ownerEmail,
      name: data.ownerName,
      role: 'owner',
      permissions: ['all'],
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    }],
    projects: [],
    settings: {
      allowExternalCollaborators: true,
      requireApprovalForDeployments: false,
      enforceCodeReviews: false,
      allowAIGeneration: true,
      maxProjectsPerMember: 10,
      retentionDays: 90
    },
    billing: {
      plan: 'free',
      status: 'trial',
      seats: 5,
      usedSeats: 1,
      billingCycle: 'monthly',
      nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      features: ['basic_ai', 'collaboration', 'deployment']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  teams.set(teamId, team);

  logger.info(`Created team ${teamId} for user ${data.ownerId}`);

  return NextResponse.json({
    success: true,
    data: team
  });
}

async function inviteTeamMember(teamId: string, data: any): Promise<NextResponse> {
  const team = teams.get(teamId);
  if (!team) {
    return NextResponse.json({
      success: false,
      error: 'Team not found'
    }, { status: 404 });
  }

  // Check if user already exists
  if (team.members.some(member => member.email === data.email)) {
    return NextResponse.json({
      success: false,
      error: 'User already in team'
    }, { status: 400 });
  }

  // Check seat limits
  if (team.members.length >= team.billing.seats) {
    return NextResponse.json({
      success: false,
      error: 'Team has reached seat limit'
    }, { status: 400 });
  }

  const newMember: TeamMember = {
    id: data.userId || `user_${Date.now()}`,
    email: data.email,
    name: data.name,
    role: data.role || 'developer',
    permissions: getPermissionsForRole(data.role || 'developer'),
    joinedAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };

  team.members.push(newMember);
  team.billing.usedSeats = team.members.length;
  team.updatedAt = new Date().toISOString();

  teams.set(teamId, team);

  logger.info(`Invited ${data.email} to team ${teamId}`);

  return NextResponse.json({
    success: true,
    data: newMember
  });
}

async function removeTeamMember(teamId: string, memberId: string): Promise<NextResponse> {
  const team = teams.get(teamId);
  if (!team) {
    return NextResponse.json({
      success: false,
      error: 'Team not found'
    }, { status: 404 });
  }

  const memberIndex = team.members.findIndex(member => member.id === memberId);
  if (memberIndex === -1) {
    return NextResponse.json({
      success: false,
      error: 'Member not found'
    }, { status: 404 });
  }

  // Can't remove the owner
  if (team.members[memberIndex].role === 'owner') {
    return NextResponse.json({
      success: false,
      error: 'Cannot remove team owner'
    }, { status: 400 });
  }

  team.members.splice(memberIndex, 1);
  team.billing.usedSeats = team.members.length;
  team.updatedAt = new Date().toISOString();

  teams.set(teamId, team);

  return NextResponse.json({
    success: true,
    message: 'Member removed successfully'
  });
}

async function updateMemberRole(teamId: string, memberId: string, role: string): Promise<NextResponse> {
  const team = teams.get(teamId);
  if (!team) {
    return NextResponse.json({
      success: false,
      error: 'Team not found'
    }, { status: 404 });
  }

  const member = team.members.find(member => member.id === memberId);
  if (!member) {
    return NextResponse.json({
      success: false,
      error: 'Member not found'
    }, { status: 404 });
  }

  member.role = role as any;
  member.permissions = getPermissionsForRole(role);
  team.updatedAt = new Date().toISOString();

  teams.set(teamId, team);

  return NextResponse.json({
    success: true,
    data: member
  });
}

async function updateTeamSettings(teamId: string, settings: Partial<TeamSettings>): Promise<NextResponse> {
  const team = teams.get(teamId);
  if (!team) {
    return NextResponse.json({
      success: false,
      error: 'Team not found'
    }, { status: 404 });
  }

  team.settings = { ...team.settings, ...settings };
  team.updatedAt = new Date().toISOString();

  teams.set(teamId, team);

  return NextResponse.json({
    success: true,
    data: team.settings
  });
}

async function upgradeTeamPlan(teamId: string, plan: string): Promise<NextResponse> {
  const team = teams.get(teamId);
  if (!team) {
    return NextResponse.json({
      success: false,
      error: 'Team not found'
    }, { status: 404 });
  }

  const planFeatures = {
    free: ['basic_ai', 'collaboration'],
    pro: ['advanced_ai', 'collaboration', 'deployment', 'analytics'],
    enterprise: ['premium_ai', 'collaboration', 'deployment', 'analytics', 'sso', 'audit_logs']
  };

  const planSeats = {
    free: 5,
    pro: 25,
    enterprise: 100
  };

  team.billing.plan = plan as any;
  team.billing.features = planFeatures[plan as keyof typeof planFeatures] || [];
  team.billing.seats = planSeats[plan as keyof typeof planSeats] || 5;
  team.billing.status = 'active';
  team.updatedAt = new Date().toISOString();

  teams.set(teamId, team);

  return NextResponse.json({
    success: true,
    data: team.billing
  });
}

function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case 'owner':
      return ['all'];
    case 'admin':
      return ['create_project', 'delete_project', 'manage_members', 'deploy', 'view_analytics'];
    case 'developer':
      return ['create_project', 'edit_project', 'deploy', 'collaborate'];
    case 'viewer':
      return ['view_project', 'collaborate'];
    default:
      return ['view_project'];
  }
}
