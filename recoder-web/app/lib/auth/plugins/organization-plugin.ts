/**
 * Organization Plugin for better-auth
 * Provides organization management functionality with subscription-based permissions
 */

import type { AuthUser, Organization, OrganizationInvitationOptions } from '../types';
import { getAuthEnv } from '../env';
import { getSubscription } from '../utils/subscription-utils';
import { sendOrganizationInvitation } from '../utils/email-service';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OrganizationPlugin');

/**
 * Organization plugin configuration
 */
export interface OrganizationPluginConfig {
  /**
   * Whether organization creation is disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * Custom function to send invitation emails
   */
  sendInvitationEmail?: (data: InvitationEmailData) => Promise<void>;

  /**
   * Custom function to check if user can create organizations
   */
  allowUserToCreateOrganization?: (user: AuthUser) => Promise<boolean>;

  /**
   * Hook called before organization is created
   */
  beforeCreate?: (params: BeforeCreateParams) => Promise<BeforeCreateResult | void>;

  /**
   * Hook called after organization is created
   */
  afterCreate?: (params: AfterCreateParams) => Promise<void>;
}

export interface InvitationEmailData {
  id: string;
  email: string;
  inviter: {
    user: AuthUser;
  };
  organization: Organization;
}

export interface BeforeCreateParams {
  organization: Partial<Organization>;
  user: AuthUser;
  request?: Request;
}

export interface BeforeCreateResult {
  data?: Partial<Organization>;
}

export interface AfterCreateParams {
  organization: Organization;
  member: { userId: string; role: string };
  user: AuthUser;
  request?: Request;
}

/**
 * Default invitation email handler
 */
async function defaultSendInvitationEmail(data: InvitationEmailData): Promise<void> {
  const env = getAuthEnv();
  const appUrl = env.APP_URL || env.MAIN_SITE_URL || 'https://recoder.xyz';
  const inviteLink = `${appUrl}/accept-invitation/${data.id}`;

  await sendOrganizationInvitation({
    email: data.email,
    invitedByUsername: data.inviter.user.name || 'A team member',
    invitedByEmail: data.inviter.user.email,
    teamName: data.organization.name,
    inviteLink,
  });
}

/**
 * Default permission check for organization creation
 * Only paid users can create organizations
 */
async function defaultAllowUserToCreateOrganization(user: AuthUser): Promise<boolean> {
  const subscription = await getSubscription(user.id);
  // Allow organization creation for paid plans only
  return subscription.plan !== 'FREE' && subscription.plan !== 'recoder free';
}

/**
 * Create the organization plugin configuration
 */
export function createOrganizationPlugin(config: OrganizationPluginConfig = {}) {
  const {
    disabled = false,
    sendInvitationEmail = defaultSendInvitationEmail,
    allowUserToCreateOrganization = defaultAllowUserToCreateOrganization,
    beforeCreate,
    afterCreate,
  } = config;

  return {
    id: 'organization',
    disabled,

    /**
     * Send invitation email to a user
     */
    async sendInvitationEmail(data: InvitationEmailData): Promise<void> {
      try {
        await sendInvitationEmail(data);
        logger.info(`[Organization] Invitation email sent to ${data.email}`);
      } catch (error) {
        logger.error(`[Organization] Failed to send invitation email:`, error);
        throw error;
      }
    },

    /**
     * Organization creation configuration
     */
    organizationCreation: {
      disabled,

      /**
       * Hook called before organization creation
       */
      async beforeCreate(params: BeforeCreateParams): Promise<BeforeCreateResult | void> {
        if (beforeCreate) {
          return beforeCreate(params);
        }
        // Default: no modification
        return undefined;
      },

      /**
       * Hook called after organization creation
       */
      async afterCreate(params: AfterCreateParams): Promise<void> {
        if (afterCreate) {
          await afterCreate(params);
        }
        logger.info(
          `[Organization] Organization created: ${params.organization.id} by user ${params.user.id}`
        );
      },
    },

    /**
     * Check if user is allowed to create organizations
     */
    async allowUserToCreateOrganization(user: AuthUser): Promise<boolean> {
      return allowUserToCreateOrganization(user);
    },
  };
}

/**
 * Pre-configured organization plugin with default settings
 */
export const organizationPlugin = createOrganizationPlugin({
  disabled: false,
  sendInvitationEmail: defaultSendInvitationEmail,
  allowUserToCreateOrganization: defaultAllowUserToCreateOrganization,
});

/**
 * Helper to get organization by ID
 */
export async function getOrganizationById(
  organizationId: string,
  fetchFn: (url: string, options?: RequestInit) => Promise<Response>
): Promise<Organization | null> {
  try {
    const env = getAuthEnv();
    const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

    const response = await fetchFn(`${mainSiteUrl}/api/organizations/${organizationId}`, {
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
    logger.error(`[Organization] Failed to get organization:`, error);
    return null;
  }
}

/**
 * Helper to get user's organizations
 */
export async function getUserOrganizations(
  userId: string,
  fetchFn: (url: string, options?: RequestInit) => Promise<Response>
): Promise<Organization[]> {
  try {
    const env = getAuthEnv();
    const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

    const response = await fetchFn(`${mainSiteUrl}/api/users/${userId}/organizations`, {
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
    logger.error(`[Organization] Failed to get user organizations:`, error);
    return [];
  }
}
