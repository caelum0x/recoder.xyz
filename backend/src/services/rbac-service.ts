/**
 * Role-Based Access Control (RBAC) Service
 * Comprehensive permissions and roles management system
 */ 

import { prisma } from '../database/prisma';
import * as crypto from 'crypto';

export interface Role {
  id: string;
  name: string;
  description?: string;
  type: 'system' | 'tenant' | 'custom';
  permissions: Permission[];
  isActive: boolean;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
  description?: string;
}

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'contains' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte';
  value: any;
}

export interface UserRole {
  userId: string;
  roleId: string;
  tenantId?: string;
  expiresAt?: Date;
  assignedBy: string;
  assignedAt: Date;
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  conditions?: Record<string, any>;
}

class RBACService {
  // Predefined system roles
  private systemRoles = {
    SUPER_ADMIN: {
      name: 'Super Administrator',
      description: 'Full system access across all tenants',
      permissions: ['*']
    },
    TENANT_ADMIN: {
      name: 'Tenant Administrator',
      description: 'Full access within tenant scope',
      permissions: [
        'tenant.read', 'tenant.update',
        'users.create', 'users.read', 'users.update', 'users.delete',
        'projects.create', 'projects.read', 'projects.update', 'projects.delete',
        'billing.read', 'billing.update',
        'settings.read', 'settings.update',
        'analytics.read',
        'audit.read'
      ]
    },
    DEVELOPER: {
      name: 'Developer',
      description: 'Code generation and project management',
      permissions: [
        'projects.create', 'projects.read', 'projects.update',
        'code.generate', 'code.read', 'code.update',
        'templates.create', 'templates.read', 'templates.update',
        'ai.generate', 'ai.read',
        'integrations.read', 'integrations.use'
      ]
    },
    VIEWER: {
      name: 'Viewer',
      description: 'Read-only access to projects and code',
      permissions: [
        'projects.read',
        'code.read',
        'templates.read',
        'analytics.read'
      ]
    }
  };

  // Permission definitions with hierarchical structure
  private permissionHierarchy = {
    'tenant': ['read', 'update', 'delete', 'manage'],
    'users': ['create', 'read', 'update', 'delete', 'invite'],
    'projects': ['create', 'read', 'update', 'delete', 'share'],
    'code': ['generate', 'read', 'update', 'delete', 'export'],
    'templates': ['create', 'read', 'update', 'delete', 'publish'],
    'ai': ['generate', 'read', 'configure'],
    'billing': ['read', 'update', 'manage'],
    'settings': ['read', 'update'],
    'analytics': ['read', 'export'],
    'audit': ['read', 'export'],
    'integrations': ['create', 'read', 'update', 'delete', 'use'],
    'api': ['create', 'read', 'update', 'delete', 'use']
  };

  private async initializeSystemRoles() {
    try {
      for (const [key, roleData] of Object.entries(this.systemRoles)) {
        await prisma.role.upsert({
          where: { 
            name_tenantId: { 
              name: roleData.name, 
              tenantId: 'system' 
            } 
          },
          update: {
            description: roleData.description,
            permissions: JSON.stringify(roleData.permissions)
          },
          create: {
            id: crypto.randomUUID(),
            name: roleData.name,
            description: roleData.description,
            type: 'system',
            permissions: JSON.stringify(roleData.permissions),
            isActive: true
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize system roles:', error);
    }
  }

  // Role Management
  async createRole(data: {
    name: string;
    description?: string;
    type: 'system' | 'tenant' | 'custom';
    permissions: string[];
    tenantId?: string;
  }): Promise<Role> {
    const roleId = crypto.randomUUID();
    
    const role = await prisma.role.create({
      data: {
        id: roleId,
        name: data.name,
        description: data.description,
        type: data.type,
        permissions: JSON.stringify(data.permissions),
        tenantId: data.tenantId,
        isActive: true
      }
    });

    return this.mapRoleFromDB(role);
  }

  async getRole(roleId: string): Promise<Role | null> {
    const role = await prisma.role.findUnique({
      where: { id: roleId }
    });

    return role ? this.mapRoleFromDB(role) : null;
  }

  async getRoles(tenantId?: string): Promise<Role[]> {
    const roles = await prisma.role.findMany({
      where: {
        AND: [
          { isActive: true },
          tenantId ? { OR: [{ tenantId }, { type: 'system' }] } : { type: 'system' }
        ]
      },
      orderBy: { name: 'asc' }
    });

    return roles.map(this.mapRoleFromDB);
  }

  async updateRole(roleId: string, updates: Partial<Role>): Promise<Role> {
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.description) updateData.description = updates.description;
    if (updates.permissions) updateData.permissions = JSON.stringify(updates.permissions.map(p => typeof p === 'string' ? p : `${p.resource}.${p.action}`));
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    const role = await prisma.role.update({
      where: { id: roleId },
      data: { ...updateData, updatedAt: new Date() }
    });

    return this.mapRoleFromDB(role);
  }

  async deleteRole(roleId: string): Promise<void> {
    // Soft delete - deactivate role
    await prisma.role.update({
      where: { id: roleId },
      data: { isActive: false }
    });

    // Remove all user assignments for this role
    await prisma.userRole.deleteMany({
      where: { roleId }
    });
  }

  // User Role Assignment
  async assignRole(data: {
    userId: string;
    roleId: string;
    tenantId?: string;
    expiresAt?: Date;
    assignedBy: string;
  }): Promise<UserRole> {
    // Check if user already has this role
    const existing = await prisma.userRole.findUnique({
      where: {
        userId_roleId_tenantId: {
          userId: data.userId,
          roleId: data.roleId,
          tenantId: data.tenantId || ''
        }
      }
    });

    if (existing) {
      throw new Error('User already has this role');
    }

    const userRole = await prisma.userRole.create({
      data: {
        userId: data.userId,
        roleId: data.roleId,
        tenantId: data.tenantId,
        expiresAt: data.expiresAt,
        assignedBy: data.assignedBy,
        assignedAt: new Date()
      }
    });

    return this.mapUserRoleFromDB(userRole);
  }

  async removeRole(userId: string, roleId: string, tenantId?: string): Promise<void> {
    await prisma.userRole.delete({
      where: {
        userId_roleId_tenantId: {
          userId,
          roleId,
          tenantId: tenantId || ''
        }
      }
    });
  }

  async getUserRoles(userId: string, tenantId?: string): Promise<Role[]> {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        tenantId: tenantId || null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        role: true
      }
    });

    return userRoles
      .filter(ur => ur.role && ur.role.isActive)
      .map(ur => this.mapRoleFromDB(ur.role));
  }

  // Permission Checking
  async checkPermission(
    userId: string,
    resource: string,
    action: string,
    tenantId?: string,
    context?: Record<string, any>
  ): Promise<PermissionCheck> {
    // Get user's roles
    const roles = await this.getUserRoles(userId, tenantId);
    
    if (roles.length === 0) {
      return { allowed: false, reason: 'No roles assigned' };
    }

    // Check for super admin
    if (roles.some(role => role.permissions.some(p => typeof p === 'string' && p === '*'))) {
      return { allowed: true, reason: 'Super admin access' };
    }

    // Check specific permissions
    const permission = `${resource}.${action}`;
    
    for (const role of roles) {
      const hasPermission = this.roleHasPermission(role, permission);
      if (hasPermission) {
        // Check conditions if provided
        const conditionResult = await this.checkPermissionConditions(
          role.permissions.find(p => typeof p === 'object' && `${p.resource}.${p.action}` === permission) as Permission,
          context
        );
        
        if (conditionResult.allowed) {
          return conditionResult;
        }
      }
    }

    return { allowed: false, reason: `Missing permission: ${permission}` };
  }

  private roleHasPermission(role: Role, permission: string): boolean {
    return role.permissions.some(p => {
      if (typeof p === 'string') {
        return p === permission || p === '*';
      } else {
        return `${p.resource}.${p.action}` === permission;
      }
    });
  }

  private async checkPermissionConditions(
    permission?: Permission,
    context?: Record<string, any>
  ): Promise<PermissionCheck> {
    if (!permission?.conditions || permission.conditions.length === 0) {
      return { allowed: true };
    }

    if (!context) {
      return { allowed: false, reason: 'Context required for conditional permission' };
    }

    for (const condition of permission.conditions) {
      const contextValue = context[condition.field];
      const conditionMet = this.evaluateCondition(contextValue, condition);
      
      if (!conditionMet) {
        return {
          allowed: false,
          reason: `Condition not met: ${condition.field} ${condition.operator} ${condition.value}`
        };
      }
    }

    return { allowed: true, conditions: context };
  }

  private evaluateCondition(contextValue: any, condition: PermissionCondition): boolean {
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      case 'gt':
        return Number(contextValue) > Number(condition.value);
      case 'lt':
        return Number(contextValue) < Number(condition.value);
      case 'gte':
        return Number(contextValue) >= Number(condition.value);
      case 'lte':
        return Number(contextValue) <= Number(condition.value);
      default:
        return false;
    }
  }

  // Permission hierarchy and inheritance
  getAllPermissions(): Record<string, string[]> {
    return { ...this.permissionHierarchy };
  }

  getResourceActions(resource: string): string[] {
    return (this.permissionHierarchy as any)[resource] || [];
  }

  // Bulk operations
  async assignMultipleRoles(
    userId: string,
    roleIds: string[],
    tenantId?: string,
    assignedBy?: string
  ): Promise<void> {
    const assignments = roleIds.map(roleId => ({
      userId,
      roleId,
      tenantId,
      assignedBy: assignedBy || 'system',
      assignedAt: new Date()
    }));

    await prisma.userRole.createMany({
      data: assignments,
      skipDuplicates: true
    });
  }

  async removeAllUserRoles(userId: string, tenantId?: string): Promise<void> {
    await prisma.userRole.deleteMany({
      where: {
        userId,
        tenantId: tenantId || null
      }
    });
  }

  // Role templates for quick setup
  async createRoleTemplate(
    name: string,
    permissions: string[],
    tenantId?: string
  ): Promise<Role> {
    return this.createRole({
      name,
      description: `Template role: ${name}`,
      type: 'custom',
      permissions,
      tenantId
    });
  }

  // Audit and compliance
  async getUserPermissionHistory(userId: string, tenantId?: string): Promise<any[]> {
    return await prisma.userRole.findMany({
      where: { userId, tenantId },
      include: { role: true },
      orderBy: { assignedAt: 'desc' }
    });
  }

  async getRoleUsage(roleId: string): Promise<{
    activeUsers: number;
    totalAssignments: number;
    recentAssignments: any[];
  }> {
    const [activeCount, totalCount, recent] = await Promise.all([
      prisma.userRole.count({
        where: {
          roleId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      prisma.userRole.count({ where: { roleId } }),
      prisma.userRole.findMany({
        where: { roleId },
        orderBy: { assignedAt: 'desc' },
        take: 10,
        include: { user: { select: { id: true, email: true, name: true } } }
      })
    ]);

    return {
      activeUsers: activeCount,
      totalAssignments: totalCount,
      recentAssignments: recent
    };
  }

  // Helper methods
  private mapRoleFromDB(role: any): Role {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      type: role.type,
      permissions: JSON.parse(role.permissions || '[]'),
      isActive: role.isActive,
      tenantId: role.tenantId,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    };
  }

  private mapUserRoleFromDB(userRole: any): UserRole {
    return {
      userId: userRole.userId,
      roleId: userRole.roleId,
      tenantId: userRole.tenantId,
      expiresAt: userRole.expiresAt,
      assignedBy: userRole.assignedBy,
      assignedAt: userRole.assignedAt
    };
  }
}

export default RBACService;