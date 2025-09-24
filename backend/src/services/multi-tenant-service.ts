/**
 * Multi-Tenant Architecture Service
 * Handles tenant isolation, white-label solutions, and enterprise features
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  customDomain?: string;
  plan: 'starter' | 'professional' | 'enterprise';
  settings: TenantSettings;
  branding: TenantBranding;
  limits: TenantLimits;
  status: 'active' | 'suspended' | 'trial';
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  allowUserRegistration: boolean;
  requireEmailVerification: boolean;
  sessionTimeout: number;
  maxUsersPerTeam: number;
  enableAuditLogging: boolean;
  enableAPIAccess: boolean;
  customAuthProvider?: {
    type: 'saml' | 'oauth' | 'ldap';
    config: Record<string, any>;
  };
}

export interface TenantBranding {
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  customCSS?: string;
  companyName: string;
  supportEmail: string;
  termsUrl?: string;
  privacyUrl?: string;
}

export interface TenantLimits {
  maxUsers: number;
  maxProjects: number;
  maxAPICallsPerMonth: number;
  maxStorageGB: number;
  maxBandwidthGB: number;
  enabledFeatures: string[];
}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  permissions: string[];
  status: 'active' | 'inactive' | 'invited';
  lastLoginAt?: Date;
  createdAt: Date;
}

class MultiTenantService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Tenant Management
  async createTenant(data: {
    name: string;
    slug: string;
    adminEmail: string;
    plan: 'starter' | 'professional' | 'enterprise';
    domain?: string;
  }): Promise<Tenant> {
    const tenantId = crypto.randomUUID();
    
    // Default settings based on plan
    const settings: TenantSettings = {
      allowUserRegistration: data.plan !== 'enterprise',
      requireEmailVerification: true,
      sessionTimeout: 7 * 24 * 60 * 60, // 7 days
      maxUsersPerTeam: data.plan === 'starter' ? 5 : data.plan === 'professional' ? 25 : 100,
      enableAuditLogging: data.plan === 'enterprise',
      enableAPIAccess: data.plan !== 'starter'
    };

    const branding: TenantBranding = {
      primaryColor: '#4ECDC4',
      secondaryColor: '#45B7B8',
      fontFamily: 'Inter',
      companyName: data.name,
      supportEmail: data.adminEmail
    };

    const limits: TenantLimits = this.getPlanLimits(data.plan);

    // Create tenant in database
    const tenant = await this.prisma.tenant.create({
      data: {
        id: tenantId,
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        plan: data.plan,
        settings: JSON.stringify(settings),
        branding: JSON.stringify(branding),
        limits: JSON.stringify(limits),
        status: 'trial'
      }
    });

    // Create admin user
    await this.createTenantUser({
      tenantId,
      email: data.adminEmail,
      role: 'admin',
      permissions: ['*'] // Full access
    });

    return this.mapTenantFromDB(tenant);
  }

  async getTenant(identifier: string): Promise<Tenant | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { id: identifier },
          { slug: identifier },
          { domain: identifier },
          { customDomain: identifier }
        ]
      }
    });

    return tenant ? this.mapTenantFromDB(tenant) : null;
  }

  async updateTenant(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.domain) updateData.domain = updates.domain;
    if (updates.customDomain) updateData.customDomain = updates.customDomain;
    if (updates.plan) updateData.plan = updates.plan;
    if (updates.status) updateData.status = updates.status;
    if (updates.settings) updateData.settings = JSON.stringify(updates.settings);
    if (updates.branding) updateData.branding = JSON.stringify(updates.branding);
    if (updates.limits) updateData.limits = JSON.stringify(updates.limits);

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { ...updateData, updatedAt: new Date() }
    });

    return this.mapTenantFromDB(tenant);
  }

  async deleteTenant(tenantId: string): Promise<void> {
    // Soft delete - mark as suspended
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended' }
    });

    // In a full implementation, you'd also:
    // - Archive all tenant data
    // - Revoke all API keys
    // - Cancel subscriptions
    // - Send notifications
  }

  // User Management within Tenants
  async createTenantUser(data: {
    tenantId: string;
    email: string;
    role: 'admin' | 'developer' | 'viewer';
    permissions?: string[];
  }): Promise<TenantUser> {
    const permissions = data.permissions || this.getDefaultPermissions(data.role);
    
    const user = await this.prisma.tenantUser.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: data.tenantId,
        email: data.email,
        role: data.role,
        permissions: JSON.stringify(permissions),
        status: 'invited'
      }
    });

    return this.mapTenantUserFromDB(user);
  }

  async getTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const users = await this.prisma.tenantUser.findMany({
      where: { tenantId, status: { not: 'inactive' } }
    });

    return users.map(this.mapTenantUserFromDB);
  }

  async updateTenantUser(userId: string, updates: Partial<TenantUser>): Promise<TenantUser> {
    const updateData: any = {};
    
    if (updates.role) updateData.role = updates.role;
    if (updates.permissions) updateData.permissions = JSON.stringify(updates.permissions);
    if (updates.status) updateData.status = updates.status;
    if (updates.lastLoginAt) updateData.lastLoginAt = updates.lastLoginAt;

    const user = await this.prisma.tenantUser.update({
      where: { id: userId },
      data: updateData
    });

    return this.mapTenantUserFromDB(user);
  }

  // Middleware for tenant isolation
  tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let tenantIdentifier: string | undefined;

      // Try to get tenant from various sources
      if (req.headers['x-tenant-id']) {
        tenantIdentifier = req.headers['x-tenant-id'] as string;
      } else if (req.subdomains.length > 0) {
        tenantIdentifier = req.subdomains[0];
      } else if (req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
        tenantIdentifier = req.hostname;
      } else if (req.body?.tenantId) {
        tenantIdentifier = req.body.tenantId;
      } else if (req.query.tenant) {
        tenantIdentifier = req.query.tenant as string;
      }

      if (!tenantIdentifier) {
        res.status(400).json({ error: 'Tenant identifier required' });
        return;
      }

      const tenant = await this.getTenant(tenantIdentifier);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }

      if (tenant.status !== 'active') {
        res.status(403).json({ error: 'Tenant access suspended' });
        return;
      }

      // Add tenant to request context
      (req as any).tenant = tenant;
      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(500).json({ error: 'Tenant resolution failed' });
    }
  };

  // Permission checking
  async checkPermission(userId: string, tenantId: string, permission: string): Promise<boolean> {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id: userId, tenantId, status: 'active' }
    });

    if (!user) return false;

    const permissions = JSON.parse(user.permissions as string) as string[];
    return permissions.includes('*') || permissions.includes(permission);
  }

  // White-label customization
  async getWhiteLabelConfig(tenantId: string): Promise<{
    branding: TenantBranding;
    customDomain?: string;
    customCSS?: string;
  }> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    return {
      branding: tenant.branding,
      customDomain: tenant.customDomain,
      customCSS: tenant.branding.customCSS
    };
  }

  // Usage tracking and limits
  async trackUsage(tenantId: string, metric: string, amount: number = 1): Promise<void> {
    await this.prisma.tenantUsage.upsert({
      where: {
        tenantId_metric_date: {
          tenantId,
          metric,
          date: new Date().toISOString().split('T')[0]
        }
      },
      update: {
        value: { increment: amount }
      },
      create: {
        tenantId,
        metric,
        date: new Date().toISOString().split('T')[0],
        value: amount
      }
    });
  }

  async checkUsageLimit(tenantId: string, metric: string): Promise<{ allowed: boolean; usage: number; limit: number }> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const limits = tenant.limits;
    const limit = this.getLimitForMetric(limits, metric);

    const usage = await this.prisma.tenantUsage.aggregate({
      where: {
        tenantId,
        metric,
        date: { gte: this.getStartOfMonth().toISOString().split('T')[0] }
      },
      _sum: { value: true }
    });

    const currentUsage = usage._sum.value || 0;

    return {
      allowed: currentUsage < limit,
      usage: currentUsage,
      limit
    };
  }

  // Helper methods
  private getPlanLimits(plan: string): TenantLimits {
    const limits = {
      starter: {
        maxUsers: 5,
        maxProjects: 10,
        maxAPICallsPerMonth: 10000,
        maxStorageGB: 5,
        maxBandwidthGB: 50,
        enabledFeatures: ['basic_ai', 'templates', 'projects']
      },
      professional: {
        maxUsers: 25,
        maxProjects: 50,
        maxAPICallsPerMonth: 100000,
        maxStorageGB: 50,
        maxBandwidthGB: 500,
        enabledFeatures: ['advanced_ai', 'templates', 'projects', 'analytics', 'api_access']
      },
      enterprise: {
        maxUsers: 100,
        maxProjects: 500,
        maxAPICallsPerMonth: 1000000,
        maxStorageGB: 500,
        maxBandwidthGB: 5000,
        enabledFeatures: ['all']
      }
    };

    return limits[plan as keyof typeof limits] || limits.starter;
  }

  private getDefaultPermissions(role: string): string[] {
    const permissions = {
      admin: ['*'],
      developer: ['projects.create', 'projects.read', 'projects.update', 'ai.generate', 'templates.use'],
      viewer: ['projects.read', 'templates.view']
    };

    return permissions[role as keyof typeof permissions] || permissions.viewer;
  }

  private getLimitForMetric(limits: TenantLimits, metric: string): number {
    const metricMap: { [key: string]: keyof TenantLimits } = {
      'api_calls': 'maxAPICallsPerMonth',
      'storage': 'maxStorageGB',
      'bandwidth': 'maxBandwidthGB',
      'users': 'maxUsers',
      'projects': 'maxProjects'
    };

    const limitKey = metricMap[metric];
    return limitKey ? (limits[limitKey] as number) : 0;
  }

  private getStartOfMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private mapTenantFromDB(tenant: any): Tenant {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      customDomain: tenant.customDomain,
      plan: tenant.plan,
      settings: JSON.parse(tenant.settings || '{}'),
      branding: JSON.parse(tenant.branding || '{}'),
      limits: JSON.parse(tenant.limits || '{}'),
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt
    };
  }

  private mapTenantUserFromDB(user: any): TenantUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      permissions: JSON.parse(user.permissions || '[]'),
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    };
  }
}

export default MultiTenantService;