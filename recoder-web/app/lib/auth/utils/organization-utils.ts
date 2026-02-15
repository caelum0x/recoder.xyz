/**
 * Organization Utilities
 * Helper functions for organization management
 */

import { getAuthEnv } from '../env';
import type { Organization, OrganizationMember, AuthUser } from '../types';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('OrganizationUtils');

/**
 * Generate a unique ID (simplified cuid-like)
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 9);
  return `${timestamp}${randomPart}`;
}

/**
 * Get user's active organization
 * Creates a default organization if none exists
 */
export async function getActiveOrganization(
  userId: string
): Promise<{ id: string; stripeCustomerId?: string | null } | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/users/${userId}/organization`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const org = (await response.json()) as Organization;
      return { id: org.id, stripeCustomerId: org.stripeCustomerId };
    }

    // If no organization, try to create one
    if (response.status === 404) {
      return await createDefaultOrganization(userId);
    }

    return null;
  } catch (error) {
    logger.error('[Organization] Error fetching organization:', error);
    return null;
  }
}

/**
 * Create a default organization for a user
 */
export async function createDefaultOrganization(
  userId: string
): Promise<{ id: string; stripeCustomerId?: string | null } | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        name: 'My Organization',
        slug: `${userId}-org`,
      }),
    });

    if (!response.ok) {
      logger.error('[Organization] Failed to create default organization');
      return null;
    }

    const org = (await response.json()) as Organization;
    return { id: org.id, stripeCustomerId: org.stripeCustomerId };
  } catch (error) {
    logger.error('[Organization] Error creating organization:', error);
    return null;
  }
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(organizationId: string): Promise<Organization | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/organizations/${organizationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Organization;
  } catch (error) {
    logger.error('[Organization] Error fetching organization:', error);
    return null;
  }
}

/**
 * Get organization members
 */
export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/organizations/${organizationId}/members`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { members?: OrganizationMember[] };
    return data.members || [];
  } catch (error) {
    logger.error('[Organization] Error fetching members:', error);
    return [];
  }
}

/**
 * Get organization owner
 */
export async function getOrganizationOwner(
  organizationId: string
): Promise<OrganizationMember | null> {
  const members = await getOrganizationMembers(organizationId);
  return members.find((m) => m.role === 'owner') || members[0] || null;
}

/**
 * Check if user is organization member
 */
export async function isOrganizationMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/organizations/${organizationId}/members/${userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('[Organization] Error checking membership:', error);
    return false;
  }
}

/**
 * Check if user is organization owner
 */
export async function isOrganizationOwner(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/organizations/${organizationId}/members/${userId}/role`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { role?: string };
    return data.role === 'owner';
  } catch (error) {
    logger.error('[Organization] Error checking ownership:', error);
    return false;
  }
}

/**
 * Add member to organization
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'admin' | 'member' = 'member'
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/organizations/${organizationId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        role,
      }),
    });

    return response.ok;
  } catch (error) {
    logger.error('[Organization] Error adding member:', error);
    return false;
  }
}

/**
 * Remove member from organization
 */
export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/organizations/${organizationId}/members/${userId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('[Organization] Error removing member:', error);
    return false;
  }
}

/**
 * Update member role
 */
export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/organizations/${organizationId}/members/${userId}/role`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('[Organization] Error updating role:', error);
    return false;
  }
}

/**
 * Get all user's organizations
 */
export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/users/${userId}/organizations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { organizations?: Organization[] };
    return data.organizations || [];
  } catch (error) {
    logger.error('[Organization] Error fetching user organizations:', error);
    return [];
  }
}

/**
 * Generate organization slug from name
 */
export function generateOrganizationSlug(name: string, userId: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${baseSlug}-${userId.substring(0, 6)}`;
}
