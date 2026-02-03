/**
 * Custom Domain Management API
 * Handles custom domain operations for project deployments
 *
 * POST /api/domains - Set custom domain
 * PUT /api/domains - Verify custom domain
 * DELETE /api/domains - Remove custom domain
 * GET /api/domains - Get domain status
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { neon } from '@neondatabase/serverless';

// Domain validation regex - supports standard domain formats
const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Premium plans that allow custom domains
const PREMIUM_PLANS = ['pro', 'premium', 'enterprise'];

interface DomainRequest {
  projectId: string;
  customDomain?: string;
}

interface DomainStatus {
  customDomain: string | null;
  status: 'pending' | 'verified' | 'active' | 'failed' | null;
  verifiedAt: string | null;
  sslStatus: 'pending' | 'pending_validation' | 'active' | 'failed' | null;
  ownershipVerification?: {
    type: string;
    name: string;
    value: string;
  } | null;
}

/**
 * Check if user has premium subscription for custom domains
 */
function hasPremiumAccess(subscriptionPlan?: string): boolean {
  return PREMIUM_PLANS.includes(subscriptionPlan?.toLowerCase() || '');
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return DOMAIN_REGEX.test(domain);
}

/**
 * Generate mock ownership verification (in production, this would come from Cloudflare)
 */
function generateOwnershipVerification(domain: string): { type: string; name: string; value: string } {
  const verificationToken = `recoder-verify-${crypto.randomUUID().slice(0, 8)}`;
  return {
    type: 'TXT',
    name: `_recoder.${domain}`,
    value: verificationToken,
  };
}

/**
 * GET /api/domains - Get domain status
 * Query: ?projectId=xxx
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get project with domain info
    const projects = await sql`
      SELECT id, name, "userId", "customDomain", "customDomainStatus",
             "customDomainVerifiedAt", "sslStatus", "ownershipVerification"
      FROM projects
      WHERE id = ${projectId} AND "userId" = ${session.user.id}
    ` as any[];

    if (!projects || projects.length === 0) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    const project = projects[0];

    // Parse ownership verification if exists
    let ownershipVerification = null;
    if (project.ownershipVerification) {
      try {
        ownershipVerification = JSON.parse(project.ownershipVerification);
      } catch {
        // Ignore parse errors
      }
    }

    const domainStatus: DomainStatus = {
      customDomain: project.customDomain,
      status: project.customDomainStatus,
      verifiedAt: project.customDomainVerifiedAt,
      sslStatus: project.sslStatus,
      ownershipVerification,
    };

    return json({
      success: true,
      domain: domainStatus,
      isPremium: hasPremiumAccess(session.user.subscriptionPlan),
    });
  } catch (error) {
    console.error('[Domains] Get status error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get domain status',
    }, { status: 500 });
  }
}

/**
 * POST /api/domains - Set custom domain
 * PUT /api/domains - Verify custom domain
 * DELETE /api/domains - Remove custom domain
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const env = context?.cloudflare?.env || process.env || {};
  const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    return json({ success: false, error: 'Database not configured' }, { status: 500 });
  }

  const sql = neon(databaseUrl);
  const body = await request.json() as DomainRequest;
  const { projectId, customDomain } = body;

  if (!projectId) {
    return json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  // Verify project ownership
  const projects = await sql`
    SELECT id, name, "userId", "customDomain", "customDomainStatus"
    FROM projects
    WHERE id = ${projectId} AND "userId" = ${session.user.id}
  ` as any[];

  if (!projects || projects.length === 0) {
    return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
  }

  const project = projects[0];

  try {
    // POST - Set custom domain
    if (request.method === 'POST') {
      // Check premium access
      if (!hasPremiumAccess(session.user.subscriptionPlan)) {
        return json({
          success: false,
          error: 'Premium subscription required for custom domains',
          code: 'PREMIUM_REQUIRED',
        }, { status: 403 });
      }

      if (!customDomain) {
        return json({ success: false, error: 'Domain name is required' }, { status: 400 });
      }

      // Validate domain format
      if (!isValidDomain(customDomain)) {
        return json({ success: false, error: 'Invalid domain name format' }, { status: 400 });
      }

      // Check if domain is already in use
      const existingDomain = await sql`
        SELECT id FROM projects
        WHERE "customDomain" = ${customDomain} AND id != ${projectId}
      ` as any[];

      if (existingDomain && existingDomain.length > 0) {
        return json({
          success: false,
          error: 'This domain is already in use by another project',
        }, { status: 409 });
      }

      // Generate ownership verification
      const ownershipVerification = generateOwnershipVerification(customDomain);

      // Update project with domain and verification info
      await sql`
        UPDATE projects
        SET "customDomain" = ${customDomain},
            "customDomainStatus" = 'pending',
            "customDomainVerifiedAt" = NULL,
            "ownershipVerification" = ${JSON.stringify(ownershipVerification)},
            "sslStatus" = 'pending',
            "updatedAt" = NOW()
        WHERE id = ${projectId}
      `;

      console.log(`[Domains] Custom domain set for project ${projectId}: ${customDomain}`);

      return json({
        success: true,
        message: 'Custom domain created successfully. Please add the TXT record to verify ownership.',
        domain: customDomain,
        status: 'pending',
        ownershipVerification,
      });
    }

    // PUT - Verify custom domain
    if (request.method === 'PUT') {
      if (!project.customDomain) {
        return json({ success: false, error: 'No custom domain configured' }, { status: 400 });
      }

      // In production, this would call Cloudflare API to check verification status
      // For now, simulate verification check
      const isVerified = await simulateDomainVerification(project.customDomain);

      if (!isVerified) {
        return json({
          success: false,
          error: 'Domain verification is still pending. Please ensure the TXT record is correctly configured.',
        }, { status: 400 });
      }

      // Update verification status
      await sql`
        UPDATE projects
        SET "customDomainStatus" = 'verified',
            "customDomainVerifiedAt" = NOW(),
            "sslStatus" = 'pending_validation',
            "updatedAt" = NOW()
        WHERE id = ${projectId}
      `;

      console.log(`[Domains] Custom domain verified for project ${projectId}: ${project.customDomain}`);

      return json({
        success: true,
        message: 'Domain ownership verified successfully. SSL certificate validation is in progress.',
        domain: project.customDomain,
        status: 'verified',
        sslStatus: 'pending_validation',
      });
    }

    // DELETE - Remove custom domain
    if (request.method === 'DELETE') {
      if (!project.customDomain) {
        return json({ success: false, error: 'No custom domain to remove' }, { status: 400 });
      }

      // Remove domain configuration
      await sql`
        UPDATE projects
        SET "customDomain" = NULL,
            "customDomainStatus" = NULL,
            "customDomainVerifiedAt" = NULL,
            "ownershipVerification" = NULL,
            "sslStatus" = NULL,
            "updatedAt" = NOW()
        WHERE id = ${projectId}
      `;

      console.log(`[Domains] Custom domain removed for project ${projectId}`);

      return json({
        success: true,
        message: 'Custom domain removed successfully',
      });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[Domains] Action error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Domain operation failed',
    }, { status: 500 });
  }
}

/**
 * Simulate domain verification (in production, call Cloudflare API)
 */
async function simulateDomainVerification(domain: string): Promise<boolean> {
  // In production, this would:
  // 1. Query Cloudflare Custom Hostnames API
  // 2. Check if the TXT record is properly configured
  // 3. Return actual verification status

  // For demo purposes, simulate a 50% chance of verification
  // This allows testing both success and pending flows
  return Math.random() > 0.3;
}
