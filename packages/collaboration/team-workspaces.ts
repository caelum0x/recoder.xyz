interface TeamWorkspace {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  ownerId: string;
  members: Map<string, TeamMember>;
  projects: Map<string, WorkspaceProject>;
  settings: WorkspaceSettings;
  resources: WorkspaceResources;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastActivity: Date;
    isArchived: boolean;
    visibility: 'private' | 'internal' | 'public';
    memberCount: number;
    projectCount: number;
  };
}

interface TeamMember {
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  permissions: MemberPermissions;
  joinedAt: Date;
  lastActive: Date;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  invitedBy?: string;
  customizations: {
    notifications: NotificationSettings;
    preferences: UserPreferences;
  };
}

interface WorkspaceProject {
  id: string;
  name: string;
  description?: string;
  repository?: {
    url: string;
    branch: string;
    provider: 'github' | 'gitlab' | 'bitbucket' | 'azure';
    credentials?: string;
  };
  environment: {
    language: string;
    framework?: string;
    dependencies: Record<string, string>;
    buildCommand?: string;
    testCommand?: string;
    startCommand?: string;
  };
  collaborators: string[];
  status: 'active' | 'archived' | 'suspended';
  visibility: 'workspace' | 'members' | 'public';
  createdAt: Date;
  lastCommit?: Date;
  tags: string[];
}

interface WorkspaceSettings {
  general: {
    timezone: string;
    workingHours: {
      start: string;
      end: string;
      days: number[];
    };
    defaultPermissions: MemberPermissions;
  };
  collaboration: {
    allowExternalCollaborators: boolean;
    requireApprovalForJoining: boolean;
    enableRealTimeSync: boolean;
    autoSaveInterval: number;
    conflictResolution: 'merge' | 'overwrite' | 'manual';
  };
  ai: {
    enabledModels: string[];
    costBudget: {
      monthly: number;
      currency: string;
      alerts: number[];
    };
    restrictions: {
      maxRequestsPerUser: number;
      allowedCategories: string[];
      blockedPrompts: string[];
    };
  };
  security: {
    requireMFA: boolean;
    allowedDomains: string[];
    sessionTimeout: number;
    auditLogging: boolean;
    encryptionLevel: 'standard' | 'enhanced';
  };
}

interface WorkspaceResources {
  storage: {
    used: number;
    limit: number;
    fileCount: number;
  };
  compute: {
    cpuUsage: number;
    memoryUsage: number;
    activeContainers: number;
    maxContainers: number;
  };
  ai: {
    tokensUsed: number;
    tokensLimit: number;
    requestsThisMonth: number;
    costThisMonth: number;
  };
  bandwidth: {
    used: number;
    limit: number;
  };
}

interface MemberPermissions {
  canCreateProjects: boolean;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canAccessBilling: boolean;
  canModifySettings: boolean;
  canDeleteWorkspace: boolean;
  canExportData: boolean;
  canUseAI: boolean;
  maxAIRequests: number;
  allowedAIModels: string[];
}

interface NotificationSettings {
  projectUpdates: boolean;
  memberActivities: boolean;
  billingAlerts: boolean;
  securityAlerts: boolean;
  weeklyDigest: boolean;
  channels: ('email' | 'in-app' | 'slack' | 'discord')[];
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  editor: {
    fontSize: number;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
  };
  ai: {
    defaultModel: string;
    suggestionsEnabled: boolean;
    autoComplete: boolean;
  };
}

interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: TeamMember['role'];
  permissions: MemberPermissions;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
}

interface WorkspaceAnalytics {
  overview: {
    totalMembers: number;
    activeMembers: number;
    totalProjects: number;
    activeProjects: number;
    storageUsed: number;
    aiUsage: number;
  };
  activity: {
    period: string;
    collaborationEvents: number;
    aiRequests: number;
    fileEdits: number;
    commits: number;
  }[];
  members: Array<{
    userId: string;
    name: string;
    contributionScore: number;
    aiUsage: number;
    lastActive: Date;
  }>;
  projects: Array<{
    projectId: string;
    name: string;
    collaborators: number;
    commits: number;
    aiUsage: number;
    lastActivity: Date;
  }>;
}

export class TeamWorkspaceManager {
  private workspaces: Map<string, TeamWorkspace> = new Map();
  private invitations: Map<string, WorkspaceInvitation> = new Map();
  private userMemberships: Map<string, Set<string>> = new Map();
  private resourceMonitor: ResourceMonitor;

  constructor() {
    this.resourceMonitor = new ResourceMonitor();
    this.loadWorkspaces();
  }

  createWorkspace(config: {
    name: string;
    description?: string;
    ownerId: string;
    organizationId?: string;
    initialSettings?: Partial<WorkspaceSettings>;
  }): TeamWorkspace {
    const workspaceId = this.generateWorkspaceId();
    
    const owner: TeamMember = {
      userId: config.ownerId,
      email: '', // Would be fetched from user service
      name: '', // Would be fetched from user service
      role: 'owner',
      permissions: this.getOwnerPermissions(),
      joinedAt: new Date(),
      lastActive: new Date(),
      status: 'active',
      customizations: {
        notifications: this.getDefaultNotificationSettings(),
        preferences: this.getDefaultUserPreferences()
      }
    };

    const workspace: TeamWorkspace = {
      id: workspaceId,
      name: config.name,
      description: config.description,
      organizationId: config.organizationId,
      ownerId: config.ownerId,
      members: new Map([[config.ownerId, owner]]),
      projects: new Map(),
      settings: this.mergeWithDefaultSettings(config.initialSettings),
      resources: this.getInitialResources(),
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivity: new Date(),
        isArchived: false,
        visibility: 'private',
        memberCount: 1,
        projectCount: 0
      }
    };

    this.workspaces.set(workspaceId, workspace);
    
    // Track user membership
    const userWorkspaces = this.userMemberships.get(config.ownerId) || new Set();
    userWorkspaces.add(workspaceId);
    this.userMemberships.set(config.ownerId, userWorkspaces);

    return workspace;
  }

  inviteMember(workspaceId: string, invitation: {
    email: string;
    role: TeamMember['role'];
    permissions?: Partial<MemberPermissions>;
    invitedBy: string;
    message?: string;
  }): WorkspaceInvitation {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check inviter permissions
    const inviter = workspace.members.get(invitation.invitedBy);
    if (!inviter || !inviter.permissions.canInviteMembers) {
      throw new Error('Insufficient permissions to invite members');
    }

    // Check if user is already a member
    const existingMember = Array.from(workspace.members.values())
      .find(member => member.email === invitation.email);
    if (existingMember) {
      throw new Error('User is already a member of this workspace');
    }

    // Check for existing pending invitation
    const existingInvitation = Array.from(this.invitations.values())
      .find(inv => inv.workspaceId === workspaceId && inv.email === invitation.email && inv.status === 'pending');
    if (existingInvitation) {
      throw new Error('Invitation already sent to this email');
    }

    const workspaceInvitation: WorkspaceInvitation = {
      id: this.generateInvitationId(),
      workspaceId,
      email: invitation.email,
      role: invitation.role,
      permissions: this.mergeWithDefaultPermissions(invitation.permissions, invitation.role),
      invitedBy: invitation.invitedBy,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      status: 'pending',
      message: invitation.message
    };

    this.invitations.set(workspaceInvitation.id, workspaceInvitation);
    
    // Send invitation email (would integrate with email service)
    this.sendInvitationEmail(workspaceInvitation, workspace);

    return workspaceInvitation;
  }

  acceptInvitation(invitationId: string, userId: string, userInfo: {
    email: string;
    name: string;
    avatar?: string;
  }): TeamMember {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      throw new Error('Invitation has expired');
    }

    if (invitation.email !== userInfo.email) {
      throw new Error('Email does not match invitation');
    }

    const workspace = this.workspaces.get(invitation.workspaceId);
    if (!workspace) {
      throw new Error('Workspace no longer exists');
    }

    const member: TeamMember = {
      userId,
      email: userInfo.email,
      name: userInfo.name,
      avatar: userInfo.avatar,
      role: invitation.role,
      permissions: invitation.permissions,
      joinedAt: new Date(),
      lastActive: new Date(),
      status: 'active',
      invitedBy: invitation.invitedBy,
      customizations: {
        notifications: this.getDefaultNotificationSettings(),
        preferences: this.getDefaultUserPreferences()
      }
    };

    workspace.members.set(userId, member);
    workspace.metadata.memberCount = workspace.members.size;
    workspace.metadata.updatedAt = new Date();

    // Update invitation status
    invitation.status = 'accepted';

    // Track user membership
    const userWorkspaces = this.userMemberships.get(userId) || new Set();
    userWorkspaces.add(invitation.workspaceId);
    this.userMemberships.set(userId, userWorkspaces);

    return member;
  }

  removeMember(workspaceId: string, targetUserId: string, removedBy: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check permissions
    const remover = workspace.members.get(removedBy);
    if (!remover || !remover.permissions.canManageMembers) {
      throw new Error('Insufficient permissions to remove members');
    }

    // Cannot remove workspace owner
    if (targetUserId === workspace.ownerId) {
      throw new Error('Cannot remove workspace owner');
    }

    const removed = workspace.members.delete(targetUserId);
    if (removed) {
      workspace.metadata.memberCount = workspace.members.size;
      workspace.metadata.updatedAt = new Date();

      // Update user memberships
      const userWorkspaces = this.userMemberships.get(targetUserId);
      if (userWorkspaces) {
        userWorkspaces.delete(workspaceId);
        if (userWorkspaces.size === 0) {
          this.userMemberships.delete(targetUserId);
        }
      }
    }

    return removed;
  }

  createProject(workspaceId: string, project: {
    name: string;
    description?: string;
    repository?: WorkspaceProject['repository'];
    environment: WorkspaceProject['environment'];
    visibility?: WorkspaceProject['visibility'];
    tags?: string[];
    createdBy: string;
  }): WorkspaceProject {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check permissions
    const creator = workspace.members.get(project.createdBy);
    if (!creator || !creator.permissions.canCreateProjects) {
      throw new Error('Insufficient permissions to create projects');
    }

    const workspaceProject: WorkspaceProject = {
      id: this.generateProjectId(),
      name: project.name,
      description: project.description,
      repository: project.repository,
      environment: project.environment,
      collaborators: [project.createdBy],
      status: 'active',
      visibility: project.visibility || 'workspace',
      createdAt: new Date(),
      tags: project.tags || []
    };

    workspace.projects.set(workspaceProject.id, workspaceProject);
    workspace.metadata.projectCount = workspace.projects.size;
    workspace.metadata.updatedAt = new Date();

    return workspaceProject;
  }

  addProjectCollaborator(workspaceId: string, projectId: string, userId: string, addedBy: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const project = workspace.projects.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Check if user is workspace member
    if (!workspace.members.has(userId)) {
      throw new Error('User is not a member of this workspace');
    }

    // Check permissions
    const adder = workspace.members.get(addedBy);
    if (!adder || (!adder.permissions.canManageMembers && !project.collaborators.includes(addedBy))) {
      throw new Error('Insufficient permissions to add collaborators');
    }

    if (project.collaborators.includes(userId)) {
      return false; // Already a collaborator
    }

    project.collaborators.push(userId);
    return true;
  }

  updateWorkspaceSettings(workspaceId: string, settings: Partial<WorkspaceSettings>, updatedBy: string): WorkspaceSettings {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check permissions
    const updater = workspace.members.get(updatedBy);
    if (!updater || !updater.permissions.canModifySettings) {
      throw new Error('Insufficient permissions to modify settings');
    }

    workspace.settings = this.deepMerge(workspace.settings, settings);
    workspace.metadata.updatedAt = new Date();

    return workspace.settings;
  }

  getWorkspaceAnalytics(workspaceId: string, period: 'day' | 'week' | 'month' = 'week'): WorkspaceAnalytics {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const overview = {
      totalMembers: workspace.members.size,
      activeMembers: Array.from(workspace.members.values()).filter(member => {
        const daysSinceActive = (Date.now() - member.lastActive.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceActive <= 7; // Active in last 7 days
      }).length,
      totalProjects: workspace.projects.size,
      activeProjects: Array.from(workspace.projects.values()).filter(project => project.status === 'active').length,
      storageUsed: workspace.resources.storage.used,
      aiUsage: workspace.resources.ai.tokensUsed
    };

    // Mock activity data - in production, this would come from analytics service
    const activity = this.generateActivityData(workspaceId, period);

    const members = Array.from(workspace.members.values()).map(member => ({
      userId: member.userId,
      name: member.name,
      contributionScore: this.calculateContributionScore(member),
      aiUsage: this.getUserAIUsage(workspaceId, member.userId),
      lastActive: member.lastActive
    }));

    const projects = Array.from(workspace.projects.values()).map(project => ({
      projectId: project.id,
      name: project.name,
      collaborators: project.collaborators.length,
      commits: this.getProjectCommits(project.id),
      aiUsage: this.getProjectAIUsage(project.id),
      lastActivity: project.lastCommit || project.createdAt
    }));

    return {
      overview,
      activity,
      members,
      projects
    };
  }

  getUserWorkspaces(userId: string): TeamWorkspace[] {
    const workspaceIds = this.userMemberships.get(userId) || new Set();
    return Array.from(workspaceIds)
      .map(id => this.workspaces.get(id))
      .filter((workspace): workspace is TeamWorkspace => workspace !== undefined)
      .filter(workspace => !workspace.metadata.isArchived);
  }

  getWorkspaceProjects(workspaceId: string, userId: string): WorkspaceProject[] {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const member = workspace.members.get(userId);
    if (!member) {
      throw new Error('User is not a member of this workspace');
    }

    return Array.from(workspace.projects.values()).filter(project => {
      switch (project.visibility) {
        case 'public':
          return true;
        case 'members':
          return true; // User is already verified as member
        case 'workspace':
          return project.collaborators.includes(userId) || member.role === 'admin' || member.role === 'owner';
        default:
          return false;
      }
    });
  }

  monitorResources(workspaceId: string): WorkspaceResources {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Update resource usage
    workspace.resources = this.resourceMonitor.getCurrentUsage(workspaceId);
    
    // Check for resource limits and send alerts if needed
    this.checkResourceLimits(workspace);

    return workspace.resources;
  }

  transferOwnership(workspaceId: string, newOwnerId: string, currentOwnerId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (workspace.ownerId !== currentOwnerId) {
      throw new Error('Only the current owner can transfer ownership');
    }

    const newOwner = workspace.members.get(newOwnerId);
    if (!newOwner) {
      throw new Error('New owner must be a member of the workspace');
    }

    // Update ownership
    workspace.ownerId = newOwnerId;
    
    // Update roles
    newOwner.role = 'owner';
    newOwner.permissions = this.getOwnerPermissions();
    
    const previousOwner = workspace.members.get(currentOwnerId);
    if (previousOwner) {
      previousOwner.role = 'admin';
      previousOwner.permissions = this.getAdminPermissions();
    }

    workspace.metadata.updatedAt = new Date();
    return true;
  }

  private generateActivityData(workspaceId: string, period: string): WorkspaceAnalytics['activity'] {
    // Mock data - in production, this would query actual analytics
    const periods = period === 'day' ? 7 : period === 'week' ? 4 : 12;
    return Array.from({ length: periods }, (_, i) => ({
      period: `Period ${i + 1}`,
      collaborationEvents: Math.floor(Math.random() * 100),
      aiRequests: Math.floor(Math.random() * 50),
      fileEdits: Math.floor(Math.random() * 200),
      commits: Math.floor(Math.random() * 30)
    }));
  }

  private calculateContributionScore(member: TeamMember): number {
    // Mock calculation - in production, this would analyze actual contributions
    const baseScore = 50;
    const roleMultiplier = { owner: 1.5, admin: 1.3, member: 1.0, guest: 0.8 }[member.role];
    const activityBonus = member.status === 'active' ? 20 : 0;
    return Math.floor(baseScore * roleMultiplier + activityBonus);
  }

  private getUserAIUsage(workspaceId: string, userId: string): number {
    // Mock data - in production, this would query actual usage
    return Math.floor(Math.random() * 1000);
  }

  private getProjectCommits(projectId: string): number {
    // Mock data - in production, this would query git history
    return Math.floor(Math.random() * 100);
  }

  private getProjectAIUsage(projectId: string): number {
    // Mock data - in production, this would query actual usage
    return Math.floor(Math.random() * 500);
  }

  private checkResourceLimits(workspace: TeamWorkspace): void {
    const { resources, settings } = workspace;
    
    // Check storage limit
    if (resources.storage.used > resources.storage.limit * 0.9) {
      this.sendResourceAlert(workspace, 'storage', 'warning');
    }

    // Check AI budget
    if (resources.ai.costThisMonth > settings.ai.costBudget.monthly * 0.8) {
      this.sendResourceAlert(workspace, 'ai-budget', 'warning');
    }
  }

  private sendResourceAlert(workspace: TeamWorkspace, type: string, severity: string): void {
    // Implementation would send alerts to workspace admins
    console.log(`Resource alert for workspace ${workspace.id}: ${type} - ${severity}`);
  }

  private sendInvitationEmail(invitation: WorkspaceInvitation, workspace: TeamWorkspace): void {
    // Implementation would send email invitation
    console.log(`Invitation sent to ${invitation.email} for workspace ${workspace.name}`);
  }

  private getOwnerPermissions(): MemberPermissions {
    return {
      canCreateProjects: true,
      canInviteMembers: true,
      canManageMembers: true,
      canAccessBilling: true,
      canModifySettings: true,
      canDeleteWorkspace: true,
      canExportData: true,
      canUseAI: true,
      maxAIRequests: -1, // Unlimited
      allowedAIModels: ['*'] // All models
    };
  }

  private getAdminPermissions(): MemberPermissions {
    return {
      canCreateProjects: true,
      canInviteMembers: true,
      canManageMembers: true,
      canAccessBilling: false,
      canModifySettings: true,
      canDeleteWorkspace: false,
      canExportData: true,
      canUseAI: true,
      maxAIRequests: 1000,
      allowedAIModels: ['gpt-4', 'claude-3', 'gpt-3.5-turbo']
    };
  }

  private mergeWithDefaultPermissions(permissions: Partial<MemberPermissions> | undefined, role: TeamMember['role']): MemberPermissions {
    const defaultPermissions = {
      owner: this.getOwnerPermissions(),
      admin: this.getAdminPermissions(),
      member: {
        canCreateProjects: true,
        canInviteMembers: false,
        canManageMembers: false,
        canAccessBilling: false,
        canModifySettings: false,
        canDeleteWorkspace: false,
        canExportData: false,
        canUseAI: true,
        maxAIRequests: 500,
        allowedAIModels: ['gpt-3.5-turbo', 'claude-3']
      },
      guest: {
        canCreateProjects: false,
        canInviteMembers: false,
        canManageMembers: false,
        canAccessBilling: false,
        canModifySettings: false,
        canDeleteWorkspace: false,
        canExportData: false,
        canUseAI: false,
        maxAIRequests: 0,
        allowedAIModels: []
      }
    }[role] as MemberPermissions;

    return { ...defaultPermissions, ...permissions };
  }

  private mergeWithDefaultSettings(settings?: Partial<WorkspaceSettings>): WorkspaceSettings {
    const defaultSettings: WorkspaceSettings = {
      general: {
        timezone: 'UTC',
        workingHours: {
          start: '09:00',
          end: '17:00',
          days: [1, 2, 3, 4, 5] // Monday to Friday
        },
        defaultPermissions: {
          canCreateProjects: true,
          canInviteMembers: false,
          canManageMembers: false,
          canAccessBilling: false,
          canModifySettings: false,
          canDeleteWorkspace: false,
          canExportData: false,
          canUseAI: true,
          maxAIRequests: 500,
          allowedAIModels: ['gpt-3.5-turbo']
        }
      },
      collaboration: {
        allowExternalCollaborators: false,
        requireApprovalForJoining: true,
        enableRealTimeSync: true,
        autoSaveInterval: 30000,
        conflictResolution: 'merge'
      },
      ai: {
        enabledModels: ['gpt-3.5-turbo', 'gpt-4', 'claude-3'],
        costBudget: {
          monthly: 100,
          currency: 'USD',
          alerts: [50, 80, 95]
        },
        restrictions: {
          maxRequestsPerUser: 500,
          allowedCategories: ['coding', 'documentation', 'analysis'],
          blockedPrompts: []
        }
      },
      security: {
        requireMFA: false,
        allowedDomains: [],
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        auditLogging: true,
        encryptionLevel: 'standard'
      }
    };

    return this.deepMerge(defaultSettings, settings || {});
  }

  private getInitialResources(): WorkspaceResources {
    return {
      storage: {
        used: 0,
        limit: 10 * 1024 * 1024 * 1024, // 10GB
        fileCount: 0
      },
      compute: {
        cpuUsage: 0,
        memoryUsage: 0,
        activeContainers: 0,
        maxContainers: 5
      },
      ai: {
        tokensUsed: 0,
        tokensLimit: 1000000, // 1M tokens
        requestsThisMonth: 0,
        costThisMonth: 0
      },
      bandwidth: {
        used: 0,
        limit: 100 * 1024 * 1024 * 1024 // 100GB
      }
    };
  }

  private getDefaultNotificationSettings(): NotificationSettings {
    return {
      projectUpdates: true,
      memberActivities: true,
      billingAlerts: true,
      securityAlerts: true,
      weeklyDigest: true,
      channels: ['email', 'in-app']
    };
  }

  private getDefaultUserPreferences(): UserPreferences {
    return {
      theme: 'auto',
      language: 'en',
      editor: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: true,
        minimap: true
      },
      ai: {
        defaultModel: 'gpt-3.5-turbo',
        suggestionsEnabled: true,
        autoComplete: true
      }
    };
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private loadWorkspaces(): void {
    // Load workspaces from persistent storage
  }

  private generateWorkspaceId(): string {
    return `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInvitationId(): string {
    return `invitation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateProjectId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class ResourceMonitor {
  getCurrentUsage(workspaceId: string): WorkspaceResources {
    // Mock implementation - in production, this would query actual resource usage
    return {
      storage: {
        used: Math.floor(Math.random() * 1024 * 1024 * 1024), // Random usage up to 1GB
        limit: 10 * 1024 * 1024 * 1024, // 10GB limit
        fileCount: Math.floor(Math.random() * 1000)
      },
      compute: {
        cpuUsage: Math.random() * 100, // CPU percentage
        memoryUsage: Math.random() * 100, // Memory percentage
        activeContainers: Math.floor(Math.random() * 3),
        maxContainers: 5
      },
      ai: {
        tokensUsed: Math.floor(Math.random() * 100000),
        tokensLimit: 1000000,
        requestsThisMonth: Math.floor(Math.random() * 500),
        costThisMonth: Math.random() * 50
      },
      bandwidth: {
        used: Math.floor(Math.random() * 1024 * 1024 * 1024), // Random usage up to 1GB
        limit: 100 * 1024 * 1024 * 1024 // 100GB limit
      }
    };
  }
}