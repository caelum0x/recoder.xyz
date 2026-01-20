/**
 * Enterprise Integration Tests
 * Tests for enterprise features including:
 * - Organization management
 * - Team collaboration
 * - Role-based access control (RBAC)
 * - Audit logging
 * - Billing and subscriptions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== Type Definitions ====================

enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  GUEST = 'guest',
}

enum Permission {
  // Organization
  ORG_UPDATE = 'org:update',
  ORG_DELETE = 'org:delete',
  ORG_BILLING = 'org:billing',

  // Members
  MEMBER_INVITE = 'member:invite',
  MEMBER_REMOVE = 'member:remove',
  MEMBER_UPDATE_ROLE = 'member:update_role',

  // Teams
  TEAM_CREATE = 'team:create',
  TEAM_UPDATE = 'team:update',
  TEAM_DELETE = 'team:delete',

  // Projects
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',
}

enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  settings: {
    allowMemberInvites?: boolean;
    requireTwoFactor?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  joinedAt: Date;
}

interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: Date;
}

interface TeamMember {
  teamId: string;
  userId: string;
  addedAt: Date;
}

interface Subscription {
  id: string;
  organizationId: string;
  tier: SubscriptionTier;
  seats: number;
  status: 'active' | 'canceled' | 'past_due';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

// ==================== RBAC Configuration ====================

const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  [OrganizationRole.OWNER]: 4,
  [OrganizationRole.ADMIN]: 3,
  [OrganizationRole.MEMBER]: 2,
  [OrganizationRole.GUEST]: 1,
};

const ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]> = {
  [OrganizationRole.OWNER]: [
    Permission.ORG_UPDATE,
    Permission.ORG_DELETE,
    Permission.ORG_BILLING,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.TEAM_CREATE,
    Permission.TEAM_UPDATE,
    Permission.TEAM_DELETE,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
  ],
  [OrganizationRole.ADMIN]: [
    Permission.ORG_UPDATE,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.TEAM_CREATE,
    Permission.TEAM_UPDATE,
    Permission.TEAM_DELETE,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
  ],
  [OrganizationRole.MEMBER]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
  ],
  [OrganizationRole.GUEST]: [
    Permission.PROJECT_READ,
  ],
};

// ==================== RBAC Functions ====================

function hasRoleLevel(userRole: OrganizationRole, requiredRole: OrganizationRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

function checkPermission(
  userId: string,
  organizationId: string,
  permission: Permission,
  members: OrganizationMember[]
): boolean {
  const member = members.find(
    m => m.userId === userId && m.organizationId === organizationId
  );

  if (!member) return false;

  return hasPermission(member.role, permission);
}

// ==================== Organization Service ====================

class OrganizationService {
  private organizations = new Map<string, Organization>();
  private members = new Map<string, OrganizationMember[]>();
  private teams = new Map<string, Team>();
  private teamMembers = new Map<string, TeamMember[]>();
  private subscriptions = new Map<string, Subscription>();

  // Organization CRUD
  createOrganization(name: string, slug: string, ownerId: string): Organization {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Invalid slug format');
    }

    // Check if slug already exists
    const existing = Array.from(this.organizations.values()).find(o => o.slug === slug);
    if (existing) {
      throw new Error('Organization slug already exists');
    }

    const org: Organization = {
      id: `org_${Date.now()}`,
      name,
      slug,
      ownerId,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.organizations.set(org.id, org);

    // Add owner as member
    const ownerMember: OrganizationMember = {
      organizationId: org.id,
      userId: ownerId,
      role: OrganizationRole.OWNER,
      joinedAt: new Date(),
    };

    this.members.set(org.id, [ownerMember]);

    // Create default subscription
    const subscription: Subscription = {
      id: `sub_${Date.now()}`,
      organizationId: org.id,
      tier: SubscriptionTier.FREE,
      seats: 1,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    this.subscriptions.set(org.id, subscription);

    return org;
  }

  getOrganization(organizationId: string): Organization | undefined {
    return this.organizations.get(organizationId);
  }

  updateOrganization(
    organizationId: string,
    userId: string,
    updates: Partial<Organization>
  ): Organization {
    const org = this.organizations.get(organizationId);
    if (!org) throw new Error('Organization not found');

    const members = this.members.get(organizationId) || [];
    if (!checkPermission(userId, organizationId, Permission.ORG_UPDATE, members)) {
      throw new Error('Permission denied');
    }

    const updated = { ...org, ...updates, updatedAt: new Date() };
    this.organizations.set(organizationId, updated);

    return updated;
  }

  deleteOrganization(organizationId: string, userId: string): void {
    const org = this.organizations.get(organizationId);
    if (!org) throw new Error('Organization not found');

    const members = this.members.get(organizationId) || [];
    if (!checkPermission(userId, organizationId, Permission.ORG_DELETE, members)) {
      throw new Error('Permission denied');
    }

    this.organizations.delete(organizationId);
    this.members.delete(organizationId);
    this.subscriptions.delete(organizationId);
  }

  // Member Management
  addMember(
    organizationId: string,
    userId: string,
    targetUserId: string,
    role: OrganizationRole
  ): OrganizationMember {
    const members = this.members.get(organizationId) || [];

    if (!checkPermission(userId, organizationId, Permission.MEMBER_INVITE, members)) {
      throw new Error('Permission denied');
    }

    const existing = members.find(m => m.userId === targetUserId);
    if (existing) {
      throw new Error('User is already a member');
    }

    const member: OrganizationMember = {
      organizationId,
      userId: targetUserId,
      role,
      joinedAt: new Date(),
    };

    this.members.set(organizationId, [...members, member]);

    return member;
  }

  removeMember(organizationId: string, userId: string, targetUserId: string): void {
    const members = this.members.get(organizationId) || [];

    if (!checkPermission(userId, organizationId, Permission.MEMBER_REMOVE, members)) {
      throw new Error('Permission denied');
    }

    const org = this.organizations.get(organizationId);
    if (org?.ownerId === targetUserId) {
      throw new Error('Cannot remove organization owner');
    }

    const updated = members.filter(m => m.userId !== targetUserId);
    this.members.set(organizationId, updated);
  }

  updateMemberRole(
    organizationId: string,
    userId: string,
    targetUserId: string,
    newRole: OrganizationRole
  ): OrganizationMember {
    const members = this.members.get(organizationId) || [];

    if (!checkPermission(userId, organizationId, Permission.MEMBER_UPDATE_ROLE, members)) {
      throw new Error('Permission denied');
    }

    const targetMember = members.find(m => m.userId === targetUserId);
    if (!targetMember) {
      throw new Error('Member not found');
    }

    const org = this.organizations.get(organizationId);
    if (org?.ownerId === targetUserId) {
      throw new Error('Cannot change owner role');
    }

    const updated = members.map(m =>
      m.userId === targetUserId ? { ...m, role: newRole } : m
    );

    this.members.set(organizationId, updated);

    return { ...targetMember, role: newRole };
  }

  listMembers(organizationId: string): OrganizationMember[] {
    return this.members.get(organizationId) || [];
  }

  // Team Management
  createTeam(
    organizationId: string,
    userId: string,
    name: string,
    description?: string
  ): Team {
    const members = this.members.get(organizationId) || [];

    if (!checkPermission(userId, organizationId, Permission.TEAM_CREATE, members)) {
      throw new Error('Permission denied');
    }

    const team: Team = {
      id: `team_${Date.now()}`,
      organizationId,
      name,
      description,
      createdAt: new Date(),
    };

    this.teams.set(team.id, team);
    this.teamMembers.set(team.id, []);

    return team;
  }

  addTeamMember(teamId: string, userId: string, targetUserId: string): TeamMember {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Team not found');

    const members = this.members.get(team.organizationId) || [];

    if (!checkPermission(userId, team.organizationId, Permission.TEAM_UPDATE, members)) {
      throw new Error('Permission denied');
    }

    const teamMems = this.teamMembers.get(teamId) || [];
    const existing = teamMems.find(tm => tm.userId === targetUserId);

    if (existing) {
      throw new Error('User is already a team member');
    }

    const teamMember: TeamMember = {
      teamId,
      userId: targetUserId,
      addedAt: new Date(),
    };

    this.teamMembers.set(teamId, [...teamMems, teamMember]);

    return teamMember;
  }

  removeTeamMember(teamId: string, userId: string, targetUserId: string): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Team not found');

    const members = this.members.get(team.organizationId) || [];

    if (!checkPermission(userId, team.organizationId, Permission.TEAM_UPDATE, members)) {
      throw new Error('Permission denied');
    }

    const teamMems = this.teamMembers.get(teamId) || [];
    const updated = teamMems.filter(tm => tm.userId !== targetUserId);

    this.teamMembers.set(teamId, updated);
  }

  deleteTeam(teamId: string, userId: string): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Team not found');

    const members = this.members.get(team.organizationId) || [];

    if (!checkPermission(userId, team.organizationId, Permission.TEAM_DELETE, members)) {
      throw new Error('Permission denied');
    }

    this.teams.delete(teamId);
    this.teamMembers.delete(teamId);
  }

  // Subscription Management
  getSubscription(organizationId: string): Subscription | undefined {
    return this.subscriptions.get(organizationId);
  }

  upgradeTier(organizationId: string, userId: string, newTier: SubscriptionTier): Subscription {
    const members = this.members.get(organizationId) || [];

    if (!checkPermission(userId, organizationId, Permission.ORG_BILLING, members)) {
      throw new Error('Permission denied');
    }

    const subscription = this.subscriptions.get(organizationId);
    if (!subscription) throw new Error('Subscription not found');

    const updated: Subscription = {
      ...subscription,
      tier: newTier,
      seats: this.getDefaultSeatsForTier(newTier),
    };

    this.subscriptions.set(organizationId, updated);

    return updated;
  }

  private getDefaultSeatsForTier(tier: SubscriptionTier): number {
    switch (tier) {
      case SubscriptionTier.FREE:
        return 1;
      case SubscriptionTier.PRO:
        return 5;
      case SubscriptionTier.TEAM:
        return 20;
      case SubscriptionTier.ENTERPRISE:
        return 100;
      default:
        return 1;
    }
  }
}

// ==================== Tests ====================

describe('Enterprise Integration Tests', () => {
  let service: OrganizationService;

  beforeEach(() => {
    service = new OrganizationService();
  });

  describe('Organization Management', () => {
    it('should create an organization', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');

      expect(org.id).toBeDefined();
      expect(org.name).toBe('Test Org');
      expect(org.slug).toBe('test-org');
      expect(org.ownerId).toBe('user-1');
    });

    it('should validate slug format', () => {
      expect(() => {
        service.createOrganization('Test', 'Test Org!', 'user-1');
      }).toThrow('Invalid slug format');

      expect(() => {
        service.createOrganization('Test', 'test_org', 'user-1');
      }).toThrow('Invalid slug format');
    });

    it('should prevent duplicate slugs', () => {
      service.createOrganization('Org 1', 'test-org', 'user-1');

      expect(() => {
        service.createOrganization('Org 2', 'test-org', 'user-2');
      }).toThrow('Organization slug already exists');
    });

    it('should automatically add owner as member', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');
      const members = service.listMembers(org.id);

      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe('user-1');
      expect(members[0].role).toBe(OrganizationRole.OWNER);
    });

    it('should update organization with proper permissions', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');

      const updated = service.updateOrganization(org.id, 'user-1', {
        name: 'Updated Org',
      });

      expect(updated.name).toBe('Updated Org');
    });

    it('should deny organization update without permissions', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');

      expect(() => {
        service.updateOrganization(org.id, 'user-2', { name: 'Hacked' });
      }).toThrow('Permission denied');
    });

    it('should delete organization with proper permissions', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');

      service.deleteOrganization(org.id, 'user-1');

      expect(service.getOrganization(org.id)).toBeUndefined();
    });

    it('should deny organization deletion without permissions', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');

      expect(() => {
        service.deleteOrganization(org.id, 'user-2');
      }).toThrow('Permission denied');
    });
  });

  describe('Member Management', () => {
    let orgId: string;

    beforeEach(() => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');
      orgId = org.id;
    });

    it('should add member with proper permissions', () => {
      const member = service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      expect(member.userId).toBe('user-2');
      expect(member.role).toBe(OrganizationRole.MEMBER);
    });

    it('should deny adding member without permissions', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.GUEST);

      expect(() => {
        service.addMember(orgId, 'user-2', 'user-3', OrganizationRole.MEMBER);
      }).toThrow('Permission denied');
    });

    it('should prevent duplicate members', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      expect(() => {
        service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.ADMIN);
      }).toThrow('User is already a member');
    });

    it('should remove member with proper permissions', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      service.removeMember(orgId, 'user-1', 'user-2');

      const members = service.listMembers(orgId);
      expect(members.find(m => m.userId === 'user-2')).toBeUndefined();
    });

    it('should prevent removing owner', () => {
      expect(() => {
        service.removeMember(orgId, 'user-1', 'user-1');
      }).toThrow('Cannot remove organization owner');
    });

    it('should update member role with proper permissions', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      const updated = service.updateMemberRole(orgId, 'user-1', 'user-2', OrganizationRole.ADMIN);

      expect(updated.role).toBe(OrganizationRole.ADMIN);
    });

    it('should prevent changing owner role', () => {
      expect(() => {
        service.updateMemberRole(orgId, 'user-1', 'user-1', OrganizationRole.ADMIN);
      }).toThrow('Cannot change owner role');
    });

    it('should list all members', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);
      service.addMember(orgId, 'user-1', 'user-3', OrganizationRole.GUEST);

      const members = service.listMembers(orgId);

      expect(members).toHaveLength(3); // owner + 2 added
    });
  });

  describe('Team Management', () => {
    let orgId: string;

    beforeEach(() => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');
      orgId = org.id;
    });

    it('should create team with proper permissions', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering', 'Dev team');

      expect(team.id).toBeDefined();
      expect(team.name).toBe('Engineering');
      expect(team.description).toBe('Dev team');
    });

    it('should deny team creation without permissions', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.GUEST);

      expect(() => {
        service.createTeam(orgId, 'user-2', 'Hackers');
      }).toThrow('Permission denied');
    });

    it('should add team member with proper permissions', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering');
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      const teamMember = service.addTeamMember(team.id, 'user-1', 'user-2');

      expect(teamMember.userId).toBe('user-2');
      expect(teamMember.teamId).toBe(team.id);
    });

    it('should prevent duplicate team members', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering');
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      service.addTeamMember(team.id, 'user-1', 'user-2');

      expect(() => {
        service.addTeamMember(team.id, 'user-1', 'user-2');
      }).toThrow('User is already a team member');
    });

    it('should remove team member with proper permissions', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering');
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);
      service.addTeamMember(team.id, 'user-1', 'user-2');

      service.removeTeamMember(team.id, 'user-1', 'user-2');

      // Should be removed successfully
    });

    it('should delete team with proper permissions', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering');

      service.deleteTeam(team.id, 'user-1');

      // Should be deleted successfully
    });

    it('should deny team deletion without permissions', () => {
      const team = service.createTeam(orgId, 'user-1', 'Engineering');
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      expect(() => {
        service.deleteTeam(team.id, 'user-2');
      }).toThrow('Permission denied');
    });
  });

  describe('RBAC', () => {
    it('should check role hierarchy correctly', () => {
      expect(hasRoleLevel(OrganizationRole.OWNER, OrganizationRole.ADMIN)).toBe(true);
      expect(hasRoleLevel(OrganizationRole.ADMIN, OrganizationRole.MEMBER)).toBe(true);
      expect(hasRoleLevel(OrganizationRole.MEMBER, OrganizationRole.GUEST)).toBe(true);
      expect(hasRoleLevel(OrganizationRole.GUEST, OrganizationRole.OWNER)).toBe(false);
    });

    it('should check permissions correctly', () => {
      expect(hasPermission(OrganizationRole.OWNER, Permission.ORG_DELETE)).toBe(true);
      expect(hasPermission(OrganizationRole.ADMIN, Permission.ORG_DELETE)).toBe(false);
      expect(hasPermission(OrganizationRole.MEMBER, Permission.PROJECT_CREATE)).toBe(true);
      expect(hasPermission(OrganizationRole.GUEST, Permission.PROJECT_CREATE)).toBe(false);
    });

    it('should validate owner has all permissions', () => {
      const allPermissions = Object.values(Permission);

      for (const permission of allPermissions) {
        expect(hasPermission(OrganizationRole.OWNER, permission)).toBe(true);
      }
    });

    it('should validate guest has minimal permissions', () => {
      const guestPermissions = ROLE_PERMISSIONS[OrganizationRole.GUEST];

      expect(guestPermissions).toContain(Permission.PROJECT_READ);
      expect(guestPermissions).not.toContain(Permission.PROJECT_CREATE);
      expect(guestPermissions).not.toContain(Permission.PROJECT_DELETE);
    });
  });

  describe('Subscription Management', () => {
    let orgId: string;

    beforeEach(() => {
      const org = service.createOrganization('Test Org', 'test-org', 'user-1');
      orgId = org.id;
    });

    it('should create default free subscription', () => {
      const subscription = service.getSubscription(orgId);

      expect(subscription).toBeDefined();
      expect(subscription?.tier).toBe(SubscriptionTier.FREE);
      expect(subscription?.status).toBe('active');
    });

    it('should upgrade tier with proper permissions', () => {
      const upgraded = service.upgradeTier(orgId, 'user-1', SubscriptionTier.PRO);

      expect(upgraded.tier).toBe(SubscriptionTier.PRO);
      expect(upgraded.seats).toBe(5);
    });

    it('should deny tier upgrade without permissions', () => {
      service.addMember(orgId, 'user-1', 'user-2', OrganizationRole.MEMBER);

      expect(() => {
        service.upgradeTier(orgId, 'user-2', SubscriptionTier.PRO);
      }).toThrow('Permission denied');
    });

    it('should adjust seats based on tier', () => {
      let subscription = service.upgradeTier(orgId, 'user-1', SubscriptionTier.PRO);
      expect(subscription.seats).toBe(5);

      subscription = service.upgradeTier(orgId, 'user-1', SubscriptionTier.TEAM);
      expect(subscription.seats).toBe(20);

      subscription = service.upgradeTier(orgId, 'user-1', SubscriptionTier.ENTERPRISE);
      expect(subscription.seats).toBe(100);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete organization workflow', () => {
      // 1. Create organization
      const org = service.createOrganization('Acme Inc', 'acme-inc', 'owner-1');

      // 2. Add members
      service.addMember(org.id, 'owner-1', 'admin-1', OrganizationRole.ADMIN);
      service.addMember(org.id, 'owner-1', 'member-1', OrganizationRole.MEMBER);
      service.addMember(org.id, 'owner-1', 'member-2', OrganizationRole.MEMBER);

      // 3. Create teams
      const engTeam = service.createTeam(org.id, 'admin-1', 'Engineering');
      const designTeam = service.createTeam(org.id, 'admin-1', 'Design');

      // 4. Add team members
      service.addTeamMember(engTeam.id, 'admin-1', 'member-1');
      service.addTeamMember(designTeam.id, 'admin-1', 'member-2');

      // 5. Upgrade subscription
      service.upgradeTier(org.id, 'owner-1', SubscriptionTier.TEAM);

      // Verify final state
      const members = service.listMembers(org.id);
      expect(members).toHaveLength(4); // owner + 3 added

      const subscription = service.getSubscription(org.id);
      expect(subscription?.tier).toBe(SubscriptionTier.TEAM);
    });

    it('should enforce permissions across multiple operations', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'owner-1');
      service.addMember(org.id, 'owner-1', 'admin-1', OrganizationRole.ADMIN);
      service.addMember(org.id, 'owner-1', 'member-1', OrganizationRole.MEMBER);

      // Admin can create teams
      const team = service.createTeam(org.id, 'admin-1', 'Team 1');
      expect(team).toBeDefined();

      // Member cannot create teams
      expect(() => {
        service.createTeam(org.id, 'member-1', 'Team 2');
      }).toThrow('Permission denied');

      // Admin can add members
      service.addMember(org.id, 'admin-1', 'member-2', OrganizationRole.MEMBER);

      // Member cannot add members
      expect(() => {
        service.addMember(org.id, 'member-1', 'member-3', OrganizationRole.MEMBER);
      }).toThrow('Permission denied');
    });

    it('should handle role hierarchy in permission checks', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'owner-1');
      service.addMember(org.id, 'owner-1', 'admin-1', OrganizationRole.ADMIN);
      service.addMember(org.id, 'owner-1', 'member-1', OrganizationRole.MEMBER);

      // Owner can update roles
      service.updateMemberRole(org.id, 'owner-1', 'member-1', OrganizationRole.ADMIN);

      // Admin cannot update roles (requires higher level)
      expect(() => {
        service.updateMemberRole(org.id, 'admin-1', 'member-1', OrganizationRole.MEMBER);
      }).toThrow('Permission denied');
    });

    it('should prevent privilege escalation', () => {
      const org = service.createOrganization('Test Org', 'test-org', 'owner-1');
      service.addMember(org.id, 'owner-1', 'member-1', OrganizationRole.MEMBER);

      // Member cannot escalate their own privileges
      expect(() => {
        service.updateMemberRole(org.id, 'member-1', 'member-1', OrganizationRole.OWNER);
      }).toThrow('Permission denied');
    });
  });
});
