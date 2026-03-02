import crypto from 'crypto';
import { prisma } from '../prisma';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Audit Logging Service
 * Tracks all important user actions and system events
 */

export interface AuditLogData {
  userId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  success?: boolean;
  statusCode?: number;
  errorMessage?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
}

export class AuditService {
  /**
   * Log an audit event
   */
  static async log(data: AuditLogData): Promise<void> {
    try {
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId: data.userId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          metadata: {
            ...data.metadata,
            success: data.success !== undefined ? data.success : true,
            statusCode: data.statusCode,
            errorMessage: data.errorMessage,
            method: data.method,
            path: data.path,
          },
          ipAddress: data.ipAddress,
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logging shouldn't break the app
      logger.error('Failed to create audit log', { error: String(error) });
    }
  }

  /**
   * Extract request metadata
   */
  static getRequestMetadata(request: NextRequest): {
    ipAddress: string;
    userAgent: string;
    method: string;
    path: string;
  } {
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded
      ? forwarded.split(',')[0]
      : request.headers.get('x-real-ip') || 'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const method = request.method;
    const path = new URL(request.url).pathname;

    return { ipAddress, userAgent, method, path };
  }

  /**
   * Log authentication event
   */
  static async logAuth(
    userId: string,
    action: 'login' | 'logout' | 'register' | 'password_change' | 'email_change' | '2fa_enabled' | '2fa_disabled',
    request: NextRequest,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action,
      resource: 'authentication',
      success,
      metadata,
      ...requestMeta,
    });
  }

  /**
   * Log API key event
   */
  static async logApiKey(
    userId: string,
    action: 'create' | 'revoke' | 'rotate' | 'access',
    keyId: string,
    request: NextRequest,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action: `api_key_${action}`,
      resource: 'api_key',
      resourceId: keyId,
      success,
      metadata,
      ...requestMeta,
    });
  }

  /**
   * Log subscription event
   */
  static async logSubscription(
    userId: string,
    action: 'create' | 'update' | 'cancel' | 'renew' | 'upgrade' | 'downgrade',
    subscriptionId: string,
    request: NextRequest,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action: `subscription_${action}`,
      resource: 'subscription',
      resourceId: subscriptionId,
      success,
      metadata,
      ...requestMeta,
    });
  }

  /**
   * Log payment event
   */
  static async logPayment(
    userId: string,
    action: 'success' | 'failure' | 'refund',
    paymentId: string,
    amount: number,
    request: NextRequest,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action: `payment_${action}`,
      resource: 'payment',
      resourceId: paymentId,
      success,
      metadata: {
        ...metadata,
        amount,
      },
      ...requestMeta,
    });
  }

  /**
   * Log data access/export event
   */
  static async logDataAccess(
    userId: string,
    action: 'view' | 'export' | 'delete',
    resource: string,
    resourceId: string,
    request: NextRequest,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      success,
      metadata,
      ...requestMeta,
    });
  }

  /**
   * Log security event
   */
  static async logSecurity(
    userId: string,
    action: 'login_failed' | 'password_reset' | '2fa_failed' | 'suspicious_activity' | 'account_locked',
    request: NextRequest,
    metadata?: any
  ): Promise<void> {
    const requestMeta = this.getRequestMetadata(request);

    await this.log({
      userId,
      action: `security_${action}`,
      resource: 'security',
      success: false,
      metadata,
      ...requestMeta,
    });
  }

  /**
   * Get audit logs for user
   */
  static async getUserLogs(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      action?: string;
    }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const where: any = { userId };

    if (options?.startDate || options?.endDate) {
      where.timestamp = {};
      if (options.startDate) where.timestamp.gte = options.startDate;
      if (options.endDate) where.timestamp.lte = options.endDate;
    }

    if (options?.action) {
      where.action = options.action;
    }

    const logs = await prisma.audit_logs.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        timestamp: true,
        ipAddress: true,
        metadata: true,
      },
    });

    const total = await prisma.audit_logs.count({ where });

    return {
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Get security events for user
   */
  static async getSecurityEvents(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await prisma.audit_logs.findMany({
      where: {
        userId,
        resource: 'security',
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  }

  /**
   * Check for suspicious activity
   */
  static async checkSuspiciousActivity(userId: string): Promise<{
    suspicious: boolean;
    reason?: string;
    events?: any[];
  }> {
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    // Check failed login attempts
    const failedLogins = await prisma.audit_logs.count({
      where: {
        userId,
        action: 'security_login_failed',
        timestamp: {
          gte: last24Hours,
        },
      },
    });

    if (failedLogins >= 5) {
      return {
        suspicious: true,
        reason: 'Multiple failed login attempts',
      };
    }

    // Check logins from multiple IPs
    const recentLogins = await prisma.audit_logs.findMany({
      where: {
        userId,
        action: 'login',
        timestamp: {
          gte: last24Hours,
        },
      },
      select: {
        ipAddress: true,
      },
    });

    const uniqueIPs = new Set(recentLogins.map(log => log.ipAddress)).size;
    if (uniqueIPs >= 5) {
      return {
        suspicious: true,
        reason: 'Logins from multiple IP addresses',
        events: recentLogins,
      };
    }

    return { suspicious: false };
  }
}
