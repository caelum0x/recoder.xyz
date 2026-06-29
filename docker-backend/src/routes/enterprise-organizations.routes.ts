/**
 * Enterprise Organization API Routes
 *
 * Organizations, teams, members, invitations, audit logs, and billing for the
 * enterprise control plane.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `buildAuditActor` helper that previously lived alongside these routes in
 * server.ts is moved into this module since it is only used here. The auth
 * middleware closure that previously lived in server.ts is injected via the
 * factory.
 */

import express, { Router } from 'express';
import {
  // Organization
  OrganizationRole,
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listUserOrganizations,
  transferOwnership,
  // Teams
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeams,
  addTeamMember,
  removeTeamMember,
  // Members
  listMembers,
  getMember,
  updateMemberRole,
  removeMember,
  // Invitations
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
  resendInvitation,
  // Audit
  queryAuditLogs,
  getAuditStats,
  exportAuditLogs,
  calculateChanges,
  AuditAction,
  AuditResourceType,
  logOrganizationAction,
  logMemberAction,
  logTeamAction,
  logInvitationAction,
  // Billing
  getSubscription,
  getUsageSnapshot,
  updateSeats,
  upgradeTier,
  downgradeTier,
  cancelSubscription,
  reactivateSubscription,
  getInvoices,
  getInvoice,
  getUsageHistory,
  UsageMetric,
  SubscriptionTier,
  BillingCycle,
  enforceMemberLimit,
  type OrganizationSettings,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type CreateInvitationInput,
  type AuditLogQuery,
  type SeatChangeRequest,
} from '../enterprise/index.js';
import {
  ErrorCode,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface EnterpriseOrganizationsRouterDeps {
  authenticateRequest: Middleware;
}

export function createEnterpriseOrganizationsRouter(deps: EnterpriseOrganizationsRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  /**
   * Helper to build audit actor from request
   */
  function buildAuditActor(req: AuthenticatedRequest): { id: string; type: 'user'; email?: string; ipAddress?: string; userAgent?: string } {
    return {
      id: req.userId || 'anonymous',
      type: 'user' as const,
      ipAddress: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
  }

  // List organizations for current user
  router.get('/api/organizations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const organizations = listUserOrganizations(userId);
    sendSuccess(res, { organizations });
  }));

  // Create organization
  router.post('/api/organizations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { name, slug, settings } = req.body as CreateOrganizationInput;

    const organization = createOrganization({
      name,
      slug,
      ownerId: userId,
      settings,
    });

    // Log audit event
    logOrganizationAction(
      organization.id,
      AuditAction.ORG_CREATED,
      buildAuditActor(req),
      organization.name
    );

    sendSuccess(res, { organization }, { statusCode: 201 });
  }));

  // Get organization by ID
  router.get('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const organization = getOrganization(orgId, userId);

    sendSuccess(res, { organization });
  }));

  // Update organization
  router.put('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const input = req.body as UpdateOrganizationInput;

    const oldOrg = getOrganization(orgId, userId);
    const organization = updateOrganization(orgId, userId, input);

    // Log audit event
    logOrganizationAction(
      organization.id,
      AuditAction.ORG_UPDATED,
      buildAuditActor(req),
      organization.name,
      [
        ...(input.name && input.name !== oldOrg.name ? [{ field: 'name', oldValue: oldOrg.name, newValue: input.name }] : []),
        ...(input.slug && input.slug !== oldOrg.slug ? [{ field: 'slug', oldValue: oldOrg.slug, newValue: input.slug }] : []),
      ]
    );

    sendSuccess(res, { organization });
  }));

  // Delete organization
  router.delete('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const org = getOrganization(orgId, userId);

    deleteOrganization(orgId, userId);

    // Log audit event
    logOrganizationAction(
      orgId,
      AuditAction.ORG_DELETED,
      buildAuditActor(req),
      org.name
    );

    sendSuccess(res, { message: 'Organization deleted' });
  }));

  // Transfer organization ownership
  router.post('/api/organizations/:orgId/transfer', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { newOwnerId } = req.body as { newOwnerId: string };

    if (!newOwnerId) {
      return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'newOwnerId is required' });
    }

    transferOwnership(orgId, userId, newOwnerId);

    // Log audit event
    logOrganizationAction(
      orgId,
      AuditAction.ORG_OWNERSHIP_TRANSFERRED,
      buildAuditActor(req),
      undefined,
      [{ field: 'ownerId', oldValue: userId, newValue: newOwnerId }]
    );

    sendSuccess(res, { message: 'Ownership transferred successfully' });
  }));

  // Get organization settings
  router.get('/api/organizations/:orgId/settings', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const organization = getOrganization(orgId, userId);

    sendSuccess(res, { settings: organization.settings });
  }));

  // Update organization settings
  router.put('/api/organizations/:orgId/settings', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const newSettings = req.body as Partial<OrganizationSettings>;

    const oldOrg = getOrganization(orgId, userId);
    const organization = updateOrganization(orgId, userId, { settings: newSettings });

    // Log audit event for settings change
    logOrganizationAction(
      organization.id,
      AuditAction.ORG_SETTINGS_UPDATED,
      buildAuditActor(req),
      organization.name,
      calculateChanges(oldOrg.settings as Record<string, unknown>, organization.settings as Record<string, unknown>)
    );

    sendSuccess(res, { settings: organization.settings });
  }));

  // Get organization activity log
  router.get('/api/organizations/:orgId/activity', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { limit, offset, actions, actorIds, startDate, endDate } = req.query;

    // Parse query parameters
    const query: Omit<AuditLogQuery, 'orgId'> = {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      sortOrder: 'desc',
    };

    if (actions) {
      query.actions = (actions as string).split(',') as AuditAction[];
    }
    if (actorIds) {
      query.actorIds = (actorIds as string).split(',');
    }
    if (startDate) {
      query.startDate = new Date(startDate as string);
    }
    if (endDate) {
      query.endDate = new Date(endDate as string);
    }

    const result = queryAuditLogs(orgId, userId, query);

    sendSuccess(res, {
      activity: result.entries,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    });
  }));

  // ==================== Teams API ====================

  // List teams in organization
  router.get('/api/organizations/:orgId/teams', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const teams = listTeams(orgId, userId);

    sendSuccess(res, { teams });
  }));

  // Create team
  router.post('/api/organizations/:orgId/teams', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const input = req.body as CreateTeamInput;

    const team = createTeam(orgId, userId, input);

    // Log audit event
    logTeamAction(
      orgId,
      AuditAction.TEAM_CREATED,
      buildAuditActor(req),
      team.id,
      team.name
    );

    sendSuccess(res, { team }, { statusCode: 201 });
  }));

  // Get team
  router.get('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { teamId } = req.params;
    const team = getTeam(teamId, userId);

    sendSuccess(res, { team });
  }));

  // Update team
  router.put('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, teamId } = req.params;
    const input = req.body as UpdateTeamInput;

    const oldTeam = getTeam(teamId, userId);
    const team = updateTeam(teamId, userId, input);

    // Log audit event
    logTeamAction(
      orgId,
      AuditAction.TEAM_UPDATED,
      buildAuditActor(req),
      team.id,
      team.name,
      [
        ...(input.name && input.name !== oldTeam.name ? [{ field: 'name', oldValue: oldTeam.name, newValue: input.name }] : []),
        ...(input.description !== undefined && input.description !== oldTeam.description ? [{ field: 'description', oldValue: oldTeam.description, newValue: input.description }] : []),
      ]
    );

    sendSuccess(res, { team });
  }));

  // Delete team
  router.delete('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, teamId } = req.params;
    const team = getTeam(teamId, userId);

    deleteTeam(teamId, userId);

    // Log audit event
    logTeamAction(
      orgId,
      AuditAction.TEAM_DELETED,
      buildAuditActor(req),
      teamId,
      team.name
    );

    sendSuccess(res, { message: 'Team deleted' });
  }));

  // Add member to team
  router.post('/api/organizations/:orgId/teams/:teamId/members', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, teamId } = req.params;
    const { targetUserId, role } = req.body as { targetUserId: string; role?: 'lead' | 'member' };

    if (!targetUserId) {
      return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'targetUserId is required' });
    }

    const team = addTeamMember(teamId, userId, targetUserId, role);

    // Log audit event
    logTeamAction(
      orgId,
      AuditAction.TEAM_MEMBER_ADDED,
      buildAuditActor(req),
      teamId,
      team.name,
      undefined,
      { targetUserId, role: role || 'member' }
    );

    sendSuccess(res, { team });
  }));

  // Remove member from team
  router.delete('/api/organizations/:orgId/teams/:teamId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, teamId, targetUserId } = req.params;
    const team = removeTeamMember(teamId, userId, targetUserId);

    // Log audit event
    logTeamAction(
      orgId,
      AuditAction.TEAM_MEMBER_REMOVED,
      buildAuditActor(req),
      teamId,
      team.name,
      undefined,
      { targetUserId }
    );

    sendSuccess(res, { team });
  }));

  // ==================== Members API ====================

  // List organization members
  router.get('/api/organizations/:orgId/members', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const members = listMembers(orgId, userId);

    sendSuccess(res, { members });
  }));

  // Get specific member
  router.get('/api/organizations/:orgId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, targetUserId } = req.params;
    const member = getMember(orgId, userId, targetUserId);

    sendSuccess(res, { member });
  }));

  // Update member role
  router.put('/api/organizations/:orgId/members/:targetUserId/role', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, targetUserId } = req.params;
    const { role } = req.body as { role: OrganizationRole };

    if (!role || !Object.values(OrganizationRole).includes(role)) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid role' });
    }

    const oldMember = getMember(orgId, userId, targetUserId);
    const member = updateMemberRole(orgId, userId, targetUserId, role);

    // Log audit event
    logMemberAction(
      orgId,
      AuditAction.MEMBER_ROLE_CHANGED,
      buildAuditActor(req),
      member.id,
      member.email,
      [{ field: 'role', oldValue: oldMember.role, newValue: role }]
    );

    sendSuccess(res, { member });
  }));

  // Remove member from organization
  router.delete('/api/organizations/:orgId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, targetUserId } = req.params;
    const member = getMember(orgId, userId, targetUserId);

    removeMember(orgId, userId, targetUserId);

    // Log audit event
    logMemberAction(
      orgId,
      AuditAction.MEMBER_REMOVED,
      buildAuditActor(req),
      member.id,
      member.email
    );

    sendSuccess(res, { message: 'Member removed' });
  }));

  // ==================== Invitations API ====================

  // List invitations
  router.get('/api/organizations/:orgId/invitations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { status } = req.query as { status?: 'pending' | 'accepted' | 'expired' | 'revoked' };

    const invitations = listInvitations(orgId, userId, status);

    sendSuccess(res, { invitations });
  }));

  // Create invitation
  router.post('/api/organizations/:orgId/invitations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const input = req.body as CreateInvitationInput;

    // Check member limits before creating invitation
    enforceMemberLimit(orgId, 1);

    const invitation = createInvitation(orgId, userId, input);

    // Log audit event
    logInvitationAction(
      orgId,
      AuditAction.INVITATION_CREATED,
      buildAuditActor(req),
      invitation.id,
      invitation.email,
      { role: input.role, teamIds: input.teamIds }
    );

    sendSuccess(res, { invitation }, { statusCode: 201 });
  }));

  // Accept invitation (public endpoint - uses token)
  router.post('/api/invitations/:token/accept', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { token } = req.params;
    const { email, displayName } = req.body as { email: string; displayName?: string };

    if (!email) {
      return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'email is required' });
    }

    const member = acceptInvitation(token, userId, email, displayName);

    // Log audit event
    logMemberAction(
      member.orgId,
      AuditAction.MEMBER_JOINED,
      buildAuditActor(req),
      member.id,
      member.email
    );

    sendSuccess(res, { member });
  }));

  // Revoke invitation
  router.delete('/api/organizations/:orgId/invitations/:invitationId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, invitationId } = req.params;

    revokeInvitation(orgId, userId, invitationId);

    // Log audit event
    logInvitationAction(
      orgId,
      AuditAction.INVITATION_REVOKED,
      buildAuditActor(req),
      invitationId
    );

    sendSuccess(res, { message: 'Invitation revoked' });
  }));

  // Resend invitation
  router.post('/api/organizations/:orgId/invitations/:invitationId/resend', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, invitationId } = req.params;

    const invitation = resendInvitation(orgId, userId, invitationId);

    // Log audit event
    logInvitationAction(
      orgId,
      AuditAction.INVITATION_RESENT,
      buildAuditActor(req),
      invitation.id,
      invitation.email
    );

    sendSuccess(res, { invitation });
  }));

  // ==================== Audit Log API ====================

  // Query audit logs
  router.get('/api/organizations/:orgId/audit-log', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const {
      startDate,
      endDate,
      actions,
      actorIds,
      resourceTypes,
      severity,
      success,
      searchText,
      limit,
      offset,
      sortOrder,
    } = req.query as Record<string, string | undefined>;

    const query: Omit<AuditLogQuery, 'orgId'> = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      actions: actions ? (actions.split(',') as AuditAction[]) : undefined,
      actorIds: actorIds ? actorIds.split(',') : undefined,
      resourceTypes: resourceTypes ? (resourceTypes.split(',') as AuditResourceType[]) : undefined,
      severity: severity ? (severity.split(',') as any[]) : undefined,
      success: success !== undefined ? success === 'true' : undefined,
      searchText,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    };

    const result = queryAuditLogs(orgId, userId, query);

    sendSuccess(res, result);
  }));

  // Get audit stats
  router.get('/api/organizations/:orgId/audit-log/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const stats = getAuditStats(
      orgId,
      userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    sendSuccess(res, { stats });
  }));

  // Export audit logs
  router.get('/api/organizations/:orgId/audit-log/export', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { startDate, endDate, format } = req.query as { startDate: string; endDate: string; format?: 'json' | 'csv' };

    if (!startDate || !endDate) {
      return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'startDate and endDate are required' });
    }

    const result = exportAuditLogs(
      orgId,
      userId,
      new Date(startDate),
      new Date(endDate),
      format || 'json'
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }));

  // ==================== Billing API ====================

  // Get subscription
  router.get('/api/organizations/:orgId/subscription', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const subscription = getSubscription(orgId, userId);

    sendSuccess(res, { subscription });
  }));

  // Get usage snapshot
  router.get('/api/organizations/:orgId/usage', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const usage = getUsageSnapshot(orgId, userId);

    sendSuccess(res, { usage });
  }));

  // Get usage history for a metric
  router.get('/api/organizations/:orgId/usage/history/:metric', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, metric } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    if (!Object.values(UsageMetric).includes(metric as UsageMetric)) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid metric' });
    }

    const history = getUsageHistory(
      orgId,
      userId,
      metric as UsageMetric,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    sendSuccess(res, { history });
  }));

  // Update seats
  router.post('/api/organizations/:orgId/subscription/seats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const seatChange = req.body as SeatChangeRequest;

    if (!seatChange.type || !['add', 'remove'].includes(seatChange.type)) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'type must be "add" or "remove"' });
    }
    if (!seatChange.count || seatChange.count < 1) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'count must be at least 1' });
    }

    const subscription = updateSeats(orgId, userId, seatChange);

    sendSuccess(res, { subscription });
  }));

  // Upgrade tier
  router.post('/api/organizations/:orgId/subscription/upgrade', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { tier, cycle } = req.body as { tier: SubscriptionTier; cycle?: BillingCycle };

    if (!tier || !Object.values(SubscriptionTier).includes(tier)) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid tier' });
    }

    const subscription = upgradeTier(orgId, userId, tier, cycle);

    sendSuccess(res, { subscription });
  }));

  // Downgrade tier
  router.post('/api/organizations/:orgId/subscription/downgrade', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { tier } = req.body as { tier: SubscriptionTier };

    if (!tier || !Object.values(SubscriptionTier).includes(tier)) {
      return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid tier' });
    }

    const subscription = downgradeTier(orgId, userId, tier);

    sendSuccess(res, { subscription });
  }));

  // Cancel subscription
  router.post('/api/organizations/:orgId/subscription/cancel', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { immediate } = req.body as { immediate?: boolean };

    const subscription = cancelSubscription(orgId, userId, immediate);

    sendSuccess(res, { subscription });
  }));

  // Reactivate subscription
  router.post('/api/organizations/:orgId/subscription/reactivate', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;

    const subscription = reactivateSubscription(orgId, userId);

    sendSuccess(res, { subscription });
  }));

  // List invoices
  router.get('/api/organizations/:orgId/invoices', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId } = req.params;
    const { status } = req.query as { status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' };

    const invoices = getInvoices(orgId, userId, status);

    sendSuccess(res, { invoices });
  }));

  // Get specific invoice
  router.get('/api/organizations/:orgId/invoices/:invoiceId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, ErrorCode.AUTH_REQUIRED);
    }

    const { orgId, invoiceId } = req.params;
    const invoice = getInvoice(orgId, userId, invoiceId);

    sendSuccess(res, { invoice });
  }));

  return router;
}
