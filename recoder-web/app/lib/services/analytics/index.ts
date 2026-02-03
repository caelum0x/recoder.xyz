/**
 * Analytics Service
 * Provides usage tracking, analytics, and metrics for organizations and users
 * Adapted from Libra's analytics system for Recoder
 */

import { atom, map } from 'nanostores';

// ==================== Types ====================

/**
 * Analytics event types
 */
export type AnalyticsEventType =
  // User events
  | 'user.signup'
  | 'user.login'
  | 'user.logout'
  | 'user.profile_update'
  // Project events
  | 'project.create'
  | 'project.open'
  | 'project.save'
  | 'project.delete'
  | 'project.deploy'
  | 'project.preview'
  | 'project.share'
  // AI events
  | 'ai.message'
  | 'ai.code_generation'
  | 'ai.code_edit'
  | 'ai.error_fix'
  // Editor events
  | 'editor.file_open'
  | 'editor.file_save'
  | 'editor.file_create'
  | 'editor.file_delete'
  // Container events
  | 'container.start'
  | 'container.stop'
  | 'container.restart'
  | 'container.terminal_command'
  // Subscription events
  | 'subscription.upgrade'
  | 'subscription.downgrade'
  | 'subscription.cancel'
  // Team events
  | 'team.member_invite'
  | 'team.member_join'
  | 'team.member_remove';

/**
 * Analytics event
 */
export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
  timestamp: Date;
  properties: Record<string, unknown>;
  metadata?: {
    userAgent?: string;
    ip?: string;
    region?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
  };
}

/**
 * Usage metric aggregation
 */
export interface UsageMetrics {
  period: {
    start: Date;
    end: Date;
  };
  counts: {
    totalEvents: number;
    uniqueUsers: number;
    projectsCreated: number;
    deploymentsCompleted: number;
    aiMessagesProcessed: number;
    filesEdited: number;
  };
  averages: {
    eventsPerUser: number;
    projectsPerUser: number;
    sessionDuration: number; // in minutes
  };
  topEvents: { type: AnalyticsEventType; count: number }[];
}

/**
 * User activity summary
 */
export interface UserActivitySummary {
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalEvents: number;
  totalSessions: number;
  projectsActive: string[];
  lastActiveAt?: Date;
  eventBreakdown: Record<AnalyticsEventType, number>;
}

/**
 * Project analytics
 */
export interface ProjectAnalytics {
  projectId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalViews: number;
  uniqueViewers: number;
  deployments: number;
  aiInteractions: number;
  filesCreated: number;
  filesEdited: number;
  previewSessions: number;
  sharesCount: number;
}

/**
 * Daily stats
 */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  events: number;
  uniqueUsers: number;
  newUsers: number;
  projectsCreated: number;
  deployments: number;
  aiMessages: number;
}

// ==================== In-Memory Storage ====================

class AnalyticsStore {
  private events: AnalyticsEvent[] = [];
  private eventsByUser = new Map<string, AnalyticsEvent[]>();
  private eventsByOrg = new Map<string, AnalyticsEvent[]>();
  private eventsByProject = new Map<string, AnalyticsEvent[]>();
  private dailyStats = new Map<string, DailyStats>();

  /**
   * Track an event
   */
  track(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): AnalyticsEvent {
    const fullEvent: AnalyticsEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    this.events.push(fullEvent);

    // Index by user
    const userEvents = this.eventsByUser.get(event.userId) || [];
    userEvents.push(fullEvent);
    this.eventsByUser.set(event.userId, userEvents);

    // Index by organization
    if (event.organizationId) {
      const orgEvents = this.eventsByOrg.get(event.organizationId) || [];
      orgEvents.push(fullEvent);
      this.eventsByOrg.set(event.organizationId, orgEvents);
    }

    // Index by project
    if (event.projectId) {
      const projectEvents = this.eventsByProject.get(event.projectId) || [];
      projectEvents.push(fullEvent);
      this.eventsByProject.set(event.projectId, projectEvents);
    }

    // Update daily stats
    this.updateDailyStats(fullEvent);

    return fullEvent;
  }

  /**
   * Update daily statistics
   */
  private updateDailyStats(event: AnalyticsEvent): void {
    const dateKey = event.timestamp.toISOString().split('T')[0];
    const stats = this.dailyStats.get(dateKey) || {
      date: dateKey,
      events: 0,
      uniqueUsers: 0,
      newUsers: 0,
      projectsCreated: 0,
      deployments: 0,
      aiMessages: 0,
    };

    stats.events++;

    if (event.type === 'project.create') {
      stats.projectsCreated++;
    }
    if (event.type === 'project.deploy') {
      stats.deployments++;
    }
    if (event.type === 'ai.message') {
      stats.aiMessages++;
    }
    if (event.type === 'user.signup') {
      stats.newUsers++;
    }

    this.dailyStats.set(dateKey, stats);
  }

  /**
   * Get events for a user
   */
  getUserEvents(userId: string, limit?: number): AnalyticsEvent[] {
    const events = this.eventsByUser.get(userId) || [];
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get events for an organization
   */
  getOrgEvents(orgId: string, limit?: number): AnalyticsEvent[] {
    const events = this.eventsByOrg.get(orgId) || [];
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get events for a project
   */
  getProjectEvents(projectId: string, limit?: number): AnalyticsEvent[] {
    const events = this.eventsByProject.get(projectId) || [];
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get daily stats for a date range
   */
  getDailyStats(startDate: Date, endDate: Date): DailyStats[] {
    const stats: DailyStats[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateKey = current.toISOString().split('T')[0];
      stats.push(
        this.dailyStats.get(dateKey) || {
          date: dateKey,
          events: 0,
          uniqueUsers: 0,
          newUsers: 0,
          projectsCreated: 0,
          deployments: 0,
          aiMessages: 0,
        }
      );
      current.setDate(current.getDate() + 1);
    }

    return stats;
  }

  /**
   * Query events with filters
   */
  queryEvents(filters: {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    types?: AnalyticsEventType[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AnalyticsEvent[] {
    let results = [...this.events];

    if (filters.userId) {
      results = results.filter((e) => e.userId === filters.userId);
    }
    if (filters.organizationId) {
      results = results.filter((e) => e.organizationId === filters.organizationId);
    }
    if (filters.projectId) {
      results = results.filter((e) => e.projectId === filters.projectId);
    }
    if (filters.types && filters.types.length > 0) {
      results = results.filter((e) => filters.types!.includes(e.type));
    }
    if (filters.startDate) {
      results = results.filter((e) => e.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter((e) => e.timestamp <= filters.endDate!);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * Calculate usage metrics for a period
   */
  calculateMetrics(orgId: string, startDate: Date, endDate: Date): UsageMetrics {
    const events = this.queryEvents({
      organizationId: orgId,
      startDate,
      endDate,
    });

    const uniqueUsers = new Set(events.map((e) => e.userId));
    const eventCounts = events.reduce(
      (acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const topEvents = Object.entries(eventCounts)
      .map(([type, count]) => ({ type: type as AnalyticsEventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      period: { start: startDate, end: endDate },
      counts: {
        totalEvents: events.length,
        uniqueUsers: uniqueUsers.size,
        projectsCreated: eventCounts['project.create'] || 0,
        deploymentsCompleted: eventCounts['project.deploy'] || 0,
        aiMessagesProcessed: eventCounts['ai.message'] || 0,
        filesEdited: eventCounts['editor.file_save'] || 0,
      },
      averages: {
        eventsPerUser: uniqueUsers.size > 0 ? events.length / uniqueUsers.size : 0,
        projectsPerUser: uniqueUsers.size > 0 ? (eventCounts['project.create'] || 0) / uniqueUsers.size : 0,
        sessionDuration: 0, // Would need session tracking
      },
      topEvents,
    };
  }

  /**
   * Get user activity summary
   */
  getUserActivitySummary(userId: string, startDate: Date, endDate: Date): UserActivitySummary {
    const events = this.queryEvents({ userId, startDate, endDate });

    const projectsActive = new Set<string>();
    const eventBreakdown: Record<string, number> = {};

    for (const event of events) {
      if (event.projectId) {
        projectsActive.add(event.projectId);
      }
      eventBreakdown[event.type] = (eventBreakdown[event.type] || 0) + 1;
    }

    const lastActiveAt = events.length > 0 ? events[0].timestamp : undefined;

    return {
      userId,
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      totalSessions: new Set(events.map((e) => e.sessionId).filter(Boolean)).size,
      projectsActive: Array.from(projectsActive),
      lastActiveAt,
      eventBreakdown: eventBreakdown as Record<AnalyticsEventType, number>,
    };
  }

  /**
   * Get project analytics
   */
  getProjectAnalytics(projectId: string, startDate: Date, endDate: Date): ProjectAnalytics {
    const events = this.queryEvents({ projectId, startDate, endDate });

    const uniqueViewers = new Set(events.filter((e) => e.type === 'project.open').map((e) => e.userId));

    return {
      projectId,
      period: { start: startDate, end: endDate },
      totalViews: events.filter((e) => e.type === 'project.open').length,
      uniqueViewers: uniqueViewers.size,
      deployments: events.filter((e) => e.type === 'project.deploy').length,
      aiInteractions: events.filter((e) => e.type.startsWith('ai.')).length,
      filesCreated: events.filter((e) => e.type === 'editor.file_create').length,
      filesEdited: events.filter((e) => e.type === 'editor.file_save').length,
      previewSessions: events.filter((e) => e.type === 'project.preview').length,
      sharesCount: events.filter((e) => e.type === 'project.share').length,
    };
  }

  /**
   * Clear old events (for memory management)
   */
  clearOldEvents(olderThan: Date): number {
    const initialCount = this.events.length;
    this.events = this.events.filter((e) => e.timestamp > olderThan);
    return initialCount - this.events.length;
  }
}

// ==================== Analytics Service ====================

export const analyticsStore = new AnalyticsStore();

/**
 * Track an analytics event
 */
export function trackEvent(
  type: AnalyticsEventType,
  userId: string,
  properties: Record<string, unknown> = {},
  options?: {
    organizationId?: string;
    projectId?: string;
    sessionId?: string;
    metadata?: AnalyticsEvent['metadata'];
  }
): AnalyticsEvent {
  return analyticsStore.track({
    type,
    userId,
    properties,
    organizationId: options?.organizationId,
    projectId: options?.projectId,
    sessionId: options?.sessionId,
    metadata: options?.metadata,
  });
}

/**
 * Track user signup
 */
export function trackSignup(userId: string, properties?: { method?: string; referrer?: string }): void {
  trackEvent('user.signup', userId, properties || {});
}

/**
 * Track user login
 */
export function trackLogin(userId: string, properties?: { method?: string }): void {
  trackEvent('user.login', userId, properties || {});
}

/**
 * Track project creation
 */
export function trackProjectCreate(
  userId: string,
  projectId: string,
  properties?: { template?: string; name?: string }
): void {
  trackEvent('project.create', userId, properties || {}, { projectId });
}

/**
 * Track project deployment
 */
export function trackDeployment(
  userId: string,
  projectId: string,
  properties?: { status?: 'success' | 'failed'; environment?: string }
): void {
  trackEvent('project.deploy', userId, properties || {}, { projectId });
}

/**
 * Track AI message
 */
export function trackAIMessage(
  userId: string,
  properties: { projectId?: string; tokenCount?: number; model?: string }
): void {
  trackEvent('ai.message', userId, properties, { projectId: properties.projectId });
}

/**
 * Track file edit
 */
export function trackFileEdit(
  userId: string,
  projectId: string,
  properties?: { filePath?: string; action?: 'save' | 'create' | 'delete' }
): void {
  const action = properties?.action || 'save';
  const eventType =
    action === 'create' ? 'editor.file_create' : action === 'delete' ? 'editor.file_delete' : 'editor.file_save';
  trackEvent(eventType, userId, properties || {}, { projectId });
}

// ==================== Nanostores for Real-time Analytics ====================

/**
 * Real-time event count store
 */
export const $realtimeEventCount = atom(0);

/**
 * Real-time active users store
 */
export const $realtimeActiveUsers = map<Record<string, number>>({});

/**
 * Update real-time stats
 */
export function updateRealtimeStats(event: AnalyticsEvent): void {
  $realtimeEventCount.set($realtimeEventCount.get() + 1);

  const activeUsers = $realtimeActiveUsers.get();
  activeUsers[event.userId] = Date.now();
  $realtimeActiveUsers.set({ ...activeUsers });

  // Clean up inactive users (older than 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const filtered = Object.fromEntries(Object.entries(activeUsers).filter(([, lastSeen]) => lastSeen > fiveMinutesAgo));
  $realtimeActiveUsers.set(filtered);
}

// ==================== Export ====================

export default {
  track: trackEvent,
  trackSignup,
  trackLogin,
  trackProjectCreate,
  trackDeployment,
  trackAIMessage,
  trackFileEdit,
  store: analyticsStore,
  getDailyStats: (start: Date, end: Date) => analyticsStore.getDailyStats(start, end),
  getMetrics: (orgId: string, start: Date, end: Date) => analyticsStore.calculateMetrics(orgId, start, end),
  getUserActivity: (userId: string, start: Date, end: Date) => analyticsStore.getUserActivitySummary(userId, start, end),
  getProjectAnalytics: (projectId: string, start: Date, end: Date) =>
    analyticsStore.getProjectAnalytics(projectId, start, end),
};
