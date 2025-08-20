/**
 * Team Collaboration Service for Recoder.ai DaaS Platform
 * Handles teams, workspaces, real-time collaboration, and project sharing
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { projectService, DeveloperProject } from './project-service';

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  slug: string; // URL-friendly identifier
  
  // Team settings
  visibility: 'public' | 'private';
  memberLimit: number;
  settings: {
    allowProjectSharing: boolean;
    requireApprovalForJoining: boolean;
    allowGuestAccess: boolean;
    defaultProjectVisibility: 'public' | 'private' | 'team';
  };
  
  // Subscription/billing
  subscriptionTier: 'free' | 'pro' | 'business' | 'enterprise';
  billingEmail?: string;
  
  // Members
  members: Array<{
    userId: string;
    role: 'owner' | 'admin' | 'editor' | 'viewer';
    permissions: string[];
    joinedAt: Date;
    invitedBy: string;
    status: 'active' | 'pending' | 'suspended';
    lastActiveAt?: Date;
  }>;
  
  // Team projects
  projects: string[]; // projectIds
  sharedProjects: string[]; // projectIds shared with team
  
  // Analytics
  stats: {
    totalProjects: number;
    totalMembers: number;
    activeMembers: number;
    projectsThisMonth: number;
    collaborationScore: number;
  };
  
  // Social features
  avatar?: string;
  website?: string;
  socialLinks: {
    github?: string;
    twitter?: string;
    linkedin?: string;
    discord?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  inviterUserId: string;
  inviteeEmail: string;
  inviteeUserId?: string;
  role: 'admin' | 'editor' | 'viewer';
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

export interface CollaborationSession {
  id: string;
  projectId: string;
  teamId?: string;
  participants: Array<{
    userId: string;
    username: string;
    role: 'owner' | 'editor' | 'viewer';
    cursor?: { line: number; column: number; file: string };
    status: 'active' | 'idle' | 'away';
    joinedAt: Date;
    lastSeenAt: Date;
  }>;
  
  // Real-time changes
  activeFile?: string;
  changes: Array<{
    id: string;
    userId: string;
    type: 'edit' | 'add' | 'delete' | 'rename' | 'comment';
    file: string;
    content: any;
    timestamp: Date;
  }>;
  
  // Communication
  chat: Array<{
    id: string;
    userId: string;
    message: string;
    type: 'text' | 'file' | 'code' | 'system';
    timestamp: Date;
    reactions?: Array<{
      userId: string;
      emoji: string;
    }>;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamWorkspace {
  id: string;
  teamId: string;
  name: string;
  description: string;
  
  // Workspace content
  projects: string[];
  templates: string[];
  resources: Array<{
    id: string;
    name: string;
    type: 'document' | 'link' | 'file';
    url: string;
    description?: string;
    addedBy: string;
    addedAt: Date;
  }>;
  
  // Collaboration tools
  channels: Array<{
    id: string;
    name: string;
    type: 'general' | 'projects' | 'random' | 'announcements';
    description?: string;
    members: string[];
    isPrivate: boolean;
    createdBy: string;
    createdAt: Date;
  }>;
  
  // Settings
  settings: {
    allowExternalSharing: boolean;
    requireProjectApproval: boolean;
    autoArchiveInactive: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export class TeamCollaborationService {
  private teams: Map<string, Team> = new Map();
  private invitations: Map<string, TeamInvitation> = new Map();
  private collaborationSessions: Map<string, CollaborationSession> = new Map();
  private workspaces: Map<string, TeamWorkspace> = new Map();
  private userTeams: Map<string, string[]> = new Map(); // userId -> teamIds
  private teamSlugs: Map<string, string> = new Map(); // slug -> teamId

  constructor() {
    this.initializeCollaborationService();
  }

  private initializeCollaborationService(): void {
    logger.info('👥 Initializing Team Collaboration Service...');
    
    // Load existing data
    this.loadCollaborationData();
    
    // Initialize demo teams
    this.initializeDemoTeams();
    
    logger.info('✅ Team Collaboration Service initialized');
  }

  private loadCollaborationData(): void {
    // In production, load from database
    logger.info('📊 Loading team collaboration data...');
  }

  /**
   * Create a new team
   */
  async createTeam(
    ownerId: string,
    teamData: {
      name: string;
      description: string;
      slug: string;
      visibility: 'public' | 'private';
      subscriptionTier?: 'free' | 'pro' | 'business' | 'enterprise';
    }
  ): Promise<{ success: boolean; team?: Team; error?: string }> {
    try {
      // Validate owner
      const owner = userService.getUserProfile(ownerId);
      if (!owner) {
        return { success: false, error: 'Owner not found' };
      }

      // Check slug availability
      if (this.teamSlugs.has(teamData.slug)) {
        return { success: false, error: 'Team slug already exists' };
      }

      // Generate team ID
      const teamId = this.generateTeamId();

      // Determine member limit based on tier
      const memberLimits = {
        free: 3,
        pro: 10,
        business: 50,
        enterprise: 500
      };

      // Create team
      const team: Team = {
        id: teamId,
        name: teamData.name,
        description: teamData.description,
        ownerId,
        slug: teamData.slug,
        visibility: teamData.visibility,
        memberLimit: memberLimits[teamData.subscriptionTier || 'free'],
        settings: {
          allowProjectSharing: true,
          requireApprovalForJoining: teamData.visibility === 'private',
          allowGuestAccess: teamData.visibility === 'public',
          defaultProjectVisibility: 'team'
        },
        subscriptionTier: teamData.subscriptionTier || 'free',
        members: [
          {
            userId: ownerId,
            role: 'owner',
            permissions: ['all'],
            joinedAt: new Date(),
            invitedBy: ownerId,
            status: 'active'
          }
        ],
        projects: [],
        sharedProjects: [],
        stats: {
          totalProjects: 0,
          totalMembers: 1,
          activeMembers: 1,
          projectsThisMonth: 0,
          collaborationScore: 0
        },
        socialLinks: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store team
      this.teams.set(teamId, team);
      this.teamSlugs.set(teamData.slug, teamId);
      
      // Add to user's teams
      if (!this.userTeams.has(ownerId)) {
        this.userTeams.set(ownerId, []);
      }
      this.userTeams.get(ownerId)!.push(teamId);

      // Create default workspace
      await this.createWorkspace(teamId, {
        name: 'Main Workspace',
        description: `Primary workspace for ${teamData.name}`,
        isDefault: true
      });

      logger.info(`👥 Team created: ${team.name} by ${owner.username}`);

      return { success: true, team };

    } catch (error: any) {
      logger.error('Team creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team by ID or slug
   */
  getTeam(teamIdOrSlug: string): Team | null {
    // Try by ID first
    let team = this.teams.get(teamIdOrSlug);
    
    // Try by slug if not found by ID
    if (!team) {
      const teamId = this.teamSlugs.get(teamIdOrSlug);
      if (teamId) {
        team = this.teams.get(teamId);
      }
    }
    
    return team || null;
  }

  /**
   * Get user's teams
   */
  getUserTeams(userId: string): Team[] {
    const teamIds = this.userTeams.get(userId) || [];
    return teamIds
      .map(id => this.teams.get(id))
      .filter(Boolean) as Team[];
  }

  /**
   * Invite user to team
   */
  async inviteToTeam(
    teamId: string,
    inviterUserId: string,
    inviteeEmail: string,
    role: 'admin' | 'editor' | 'viewer',
    message?: string
  ): Promise<{ success: boolean; invitation?: TeamInvitation; error?: string }> {
    try {
      const team = this.teams.get(teamId);
      if (!team) {
        return { success: false, error: 'Team not found' };
      }

      // Check if inviter has permission
      const inviterMember = team.members.find(m => m.userId === inviterUserId);
      if (!inviterMember || !['owner', 'admin'].includes(inviterMember.role)) {
        return { success: false, error: 'Insufficient permissions to invite' };
      }

      // Check member limit
      if (team.members.length >= team.memberLimit) {
        return { success: false, error: 'Team member limit reached' };
      }

      // Check if already invited or member
      const existingInvite = Array.from(this.invitations.values())
        .find(inv => inv.teamId === teamId && inv.inviteeEmail === inviteeEmail && inv.status === 'pending');
      
      if (existingInvite) {
        return { success: false, error: 'User already invited' };
      }

      const existingMember = team.members.find(m => {
        const user = userService.getUserProfile(m.userId);
        return user?.email === inviteeEmail;
      });

      if (existingMember) {
        return { success: false, error: 'User already a team member' };
      }

      // Create invitation
      const invitationId = this.generateInvitationId();
      const invitation: TeamInvitation = {
        id: invitationId,
        teamId,
        inviterUserId,
        inviteeEmail,
        role,
        message,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdAt: new Date()
      };

      this.invitations.set(invitationId, invitation);

      logger.info(`📧 Team invitation sent: ${inviteeEmail} to ${team.name}`);

      return { success: true, invitation };

    } catch (error: any) {
      logger.error('Team invitation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Accept team invitation
   */
  async acceptInvitation(
    invitationId: string,
    userId: string
  ): Promise<{ success: boolean; team?: Team; error?: string }> {
    try {
      const invitation = this.invitations.get(invitationId);
      if (!invitation) {
        return { success: false, error: 'Invitation not found' };
      }

      if (invitation.status !== 'pending') {
        return { success: false, error: 'Invitation already processed' };
      }

      if (new Date() > invitation.expiresAt) {
        invitation.status = 'expired';
        return { success: false, error: 'Invitation expired' };
      }

      // Verify user email matches invitation
      const user = userService.getUserProfile(userId);
      if (!user || user.email !== invitation.inviteeEmail) {
        return { success: false, error: 'Invalid invitation for this user' };
      }

      const team = this.teams.get(invitation.teamId);
      if (!team) {
        return { success: false, error: 'Team not found' };
      }

      // Add user to team
      team.members.push({
        userId,
        role: invitation.role,
        permissions: this.getRolePermissions(invitation.role),
        joinedAt: new Date(),
        invitedBy: invitation.inviterUserId,
        status: 'active'
      });

      // Update stats
      team.stats.totalMembers += 1;
      team.stats.activeMembers += 1;
      team.updatedAt = new Date();

      // Add to user's teams
      if (!this.userTeams.has(userId)) {
        this.userTeams.set(userId, []);
      }
      this.userTeams.get(userId)!.push(team.id);

      // Mark invitation as accepted
      invitation.status = 'accepted';
      invitation.inviteeUserId = userId;

      logger.info(`✅ Team invitation accepted: ${user.username} joined ${team.name}`);

      return { success: true, team };

    } catch (error: any) {
      logger.error('Accept invitation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create team workspace
   */
  async createWorkspace(
    teamId: string,
    workspaceData: {
      name: string;
      description: string;
      isDefault?: boolean;
    }
  ): Promise<{ success: boolean; workspace?: TeamWorkspace; error?: string }> {
    try {
      const team = this.teams.get(teamId);
      if (!team) {
        return { success: false, error: 'Team not found' };
      }

      const workspaceId = this.generateWorkspaceId();
      
      const workspace: TeamWorkspace = {
        id: workspaceId,
        teamId,
        name: workspaceData.name,
        description: workspaceData.description,
        projects: [],
        templates: [],
        resources: [],
        channels: [
          {
            id: this.generateChannelId(),
            name: 'general',
            type: 'general',
            description: 'General discussion',
            members: team.members.map(m => m.userId),
            isPrivate: false,
            createdBy: team.ownerId,
            createdAt: new Date()
          },
          {
            id: this.generateChannelId(),
            name: 'projects',
            type: 'projects',
            description: 'Project discussions',
            members: team.members.map(m => m.userId),
            isPrivate: false,
            createdBy: team.ownerId,
            createdAt: new Date()
          }
        ],
        settings: {
          allowExternalSharing: team.visibility === 'public',
          requireProjectApproval: team.settings.requireApprovalForJoining,
          autoArchiveInactive: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.workspaces.set(workspaceId, workspace);

      logger.info(`🏢 Workspace created: ${workspace.name} for team ${team.name}`);

      return { success: true, workspace };

    } catch (error: any) {
      logger.error('Workspace creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Share project with team
   */
  async shareProjectWithTeam(
    projectId: string,
    teamId: string,
    userId: string,
    permissions: {
      canEdit: boolean;
      canFork: boolean;
      canComment: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const team = this.teams.get(teamId);
      if (!team) {
        return { success: false, error: 'Team not found' };
      }

      // Check if user is team member
      const member = team.members.find(m => m.userId === userId);
      if (!member) {
        return { success: false, error: 'User not a team member' };
      }

      // Get project
      const userProjects = projectService.getUserProjects(userId);
      const project = userProjects.projects.find(p => p.id === projectId);
      if (!project) {
        return { success: false, error: 'Project not found or access denied' };
      }

      // Add project to team's shared projects
      if (!team.sharedProjects.includes(projectId)) {
        team.sharedProjects.push(projectId);
        team.updatedAt = new Date();
      }

      // Add team collaboration to project
      const teamMember = {
        userId: teamId,
        role: 'editor' as const,
        invitedAt: new Date(),
        acceptedAt: new Date()
      };

      if (!project.collaborators.some(c => c.userId === teamId)) {
        project.collaborators.push(teamMember);
      }

      logger.info(`🔄 Project shared: ${project.name} with team ${team.name}`);

      return { success: true };

    } catch (error: any) {
      logger.error('Share project failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start collaboration session
   */
  async startCollaborationSession(
    projectId: string,
    userId: string,
    teamId?: string
  ): Promise<{ success: boolean; session?: CollaborationSession; error?: string }> {
    try {
      // Check if session already exists
      const existingSession = Array.from(this.collaborationSessions.values())
        .find(s => s.projectId === projectId && s.teamId === teamId);

      if (existingSession) {
        // Add user to existing session
        const participant = {
          userId,
          username: userService.getUserProfile(userId)?.username || 'Unknown',
          role: 'editor' as const,
          status: 'active' as const,
          joinedAt: new Date(),
          lastSeenAt: new Date()
        };

        if (!existingSession.participants.some(p => p.userId === userId)) {
          existingSession.participants.push(participant);
          existingSession.updatedAt = new Date();
        }

        return { success: true, session: existingSession };
      }

      // Create new session
      const sessionId = this.generateSessionId();
      const user = userService.getUserProfile(userId);
      
      const session: CollaborationSession = {
        id: sessionId,
        projectId,
        teamId,
        participants: [
          {
            userId,
            username: user?.username || 'Unknown',
            role: 'owner',
            status: 'active',
            joinedAt: new Date(),
            lastSeenAt: new Date()
          }
        ],
        changes: [],
        chat: [
          {
            id: this.generateChatId(),
            userId: 'system',
            message: `${user?.username || 'User'} started a collaboration session`,
            type: 'system',
            timestamp: new Date()
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.collaborationSessions.set(sessionId, session);

      logger.info(`🤝 Collaboration session started: ${projectId} by ${user?.username}`);

      return { success: true, session };

    } catch (error: any) {
      logger.error('Start collaboration session failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team analytics
   */
  getTeamAnalytics(teamId: string): {
    overview: {
      totalMembers: number;
      activeMembers: number;
      totalProjects: number;
      sharedProjects: number;
      collaborationSessions: number;
    };
    activity: Array<{
      date: string;
      projects: number;
      collaborations: number;
      members: number;
    }>;
    topContributors: Array<{
      userId: string;
      username: string;
      projectsCreated: number;
      collaborations: number;
      lastActive: Date;
    }>;
    projectTypes: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
  } {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Get team projects
    const teamProjects = team.projects
      .map(id => {
        const userProjects = projectService.getUserProjects(team.ownerId);
        return userProjects.projects.find(p => p.id === id);
      })
      .filter(Boolean) as DeveloperProject[];

    // Calculate analytics
    const overview = {
      totalMembers: team.stats.totalMembers,
      activeMembers: team.stats.activeMembers,
      totalProjects: teamProjects.length,
      sharedProjects: team.sharedProjects.length,
      collaborationSessions: Array.from(this.collaborationSessions.values())
        .filter(s => s.teamId === teamId).length
    };

    // Generate activity data (last 7 days)
    const activity = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      activity.push({
        date: date.toISOString().split('T')[0],
        projects: Math.floor(Math.random() * 5),
        collaborations: Math.floor(Math.random() * 8),
        members: team.stats.activeMembers
      });
    }

    // Top contributors
    const topContributors = team.members.slice(0, 5).map(member => {
      const user = userService.getUserProfile(member.userId);
      return {
        userId: member.userId,
        username: user?.username || 'Unknown',
        projectsCreated: Math.floor(Math.random() * 10),
        collaborations: Math.floor(Math.random() * 15),
        lastActive: member.lastActiveAt || member.joinedAt
      };
    });

    // Project types distribution
    const projectTypes = Object.entries(
      teamProjects.reduce((acc, project) => {
        acc[project.type] = (acc[project.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / teamProjects.length) * 100) || 0
    }));

    return {
      overview,
      activity,
      topContributors,
      projectTypes
    };
  }

  private getRolePermissions(role: string): string[] {
    const permissions = {
      owner: ['all'],
      admin: ['manage_team', 'invite_members', 'manage_projects', 'edit_projects', 'view_projects'],
      editor: ['edit_projects', 'view_projects', 'comment'],
      viewer: ['view_projects', 'comment']
    };
    
    return permissions[role as keyof typeof permissions] || ['view_projects'];
  }

  private initializeDemoTeams(): void {
    // Create demo teams for showcase
    const demoTeams = [
      {
        name: 'Startup Accelerator',
        description: 'Building the next generation of SaaS applications',
        slug: 'startup-accelerator',
        visibility: 'public' as const,
        subscriptionTier: 'business' as const
      },
      {
        name: 'Open Source Collective',
        description: 'Contributing to open source projects worldwide',
        slug: 'oss-collective',
        visibility: 'public' as const,
        subscriptionTier: 'pro' as const
      }
    ];

    // Create demo user if not exists
    const demoUserId = 'demo-user-teams';
    
    demoTeams.forEach(async (teamData) => {
      await this.createTeam(demoUserId, teamData);
    });
  }

  private generateTeamId(): string {
    return 'team_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private generateInvitationId(): string {
    return 'inv_' + Math.random().toString(36).substring(2, 11);
  }

  private generateWorkspaceId(): string {
    return 'ws_' + Math.random().toString(36).substring(2, 11);
  }

  private generateChannelId(): string {
    return 'ch_' + Math.random().toString(36).substring(2, 11);
  }

  private generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substring(2, 11);
  }

  private generateChatId(): string {
    return 'chat_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const teamCollaborationService = new TeamCollaborationService();