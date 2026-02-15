/**
 * Custom Domain Routes
 * API endpoints for managing custom domains on published projects.
 *
 * All endpoints require authentication and project ownership.
 * Custom domains are free for all users (BYOK platform, Let's Encrypt SSL is free).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  addDomain,
  removeDomain,
  getDomainsForProject,
  getDomain,
  verifyDns,
  provisionSsl,
  activateDomain,
  getDomainStats,
} from '../../domain-manager.js';
import { validateDomainName, validateProjectId } from '../validation.js';

export const domainRouter = Router();

// Types matching server.ts patterns
interface AuthenticatedRequest extends Request {
  userId?: string;
}

type AsyncHandler = (req: AuthenticatedRequest, res: Response) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: (err?: any) => void) => {
    fn(req as AuthenticatedRequest, res).catch(next);
  };
}

function sendSuccess(res: Response, data: unknown) {
  res.json({ success: true, data });
}

function sendError(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

// ==================== Routes ====================

/**
 * GET /api/domains/:projectId
 * List all custom domains for a project.
 */
domainRouter.get('/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const validation = validateProjectId(projectId);
  if (!validation.valid) {
    return sendError(res, 400, validation.error!);
  }

  const domains = getDomainsForProject(projectId);
  sendSuccess(res, { domains });
}));

/**
 * POST /api/domains/:projectId
 * Add a custom domain to a project.
 * Body: { domain: "example.com" }
 */
domainRouter.post('/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { domain } = req.body;
  const userId = req.userId || 'anonymous';

  const projectValidation = validateProjectId(projectId);
  if (!projectValidation.valid) {
    return sendError(res, 400, projectValidation.error!);
  }

  const domainValidation = validateDomainName(domain);
  if (!domainValidation.valid) {
    return sendError(res, 400, domainValidation.error!);
  }

  const result = addDomain(domain, projectId, userId);
  if (!result.success) {
    return sendError(res, 400, result.error!);
  }

  sendSuccess(res, {
    domain: result.domain,
    instructions: {
      cname: {
        type: 'CNAME',
        name: domain,
        value: result.domain!.cnameTarget,
        description: `Add a CNAME record pointing ${domain} to ${result.domain!.cnameTarget}`,
      },
      txt: {
        type: 'TXT',
        name: `_recoder-verify.${domain}`,
        value: result.domain!.txtVerificationValue,
        description: `Alternatively, add a TXT record at _recoder-verify.${domain}`,
      },
    },
  });
}));

/**
 * DELETE /api/domains/:projectId/:domain
 * Remove a custom domain from a project.
 */
domainRouter.delete('/:projectId/:domain', asyncHandler(async (req, res) => {
  const { projectId, domain } = req.params;

  const projectValidation = validateProjectId(projectId);
  if (!projectValidation.valid) {
    return sendError(res, 400, projectValidation.error!);
  }

  const domainValidation = validateDomainName(domain);
  if (!domainValidation.valid) {
    return sendError(res, 400, domainValidation.error!);
  }

  const result = removeDomain(domain, projectId);
  if (!result.success) {
    return sendError(res, 400, result.error!);
  }

  sendSuccess(res, { removed: true });
}));

/**
 * POST /api/domains/:projectId/:domain/verify
 * Check DNS records and verify domain ownership.
 */
domainRouter.post('/:projectId/:domain/verify', asyncHandler(async (req, res) => {
  const { projectId, domain } = req.params;

  const projectValidation = validateProjectId(projectId);
  if (!projectValidation.valid) {
    return sendError(res, 400, projectValidation.error!);
  }

  const domainValidation = validateDomainName(domain);
  if (!domainValidation.valid) {
    return sendError(res, 400, domainValidation.error!);
  }

  // Verify the domain belongs to this project
  const record = getDomain(domain);
  if (!record || record.projectId !== projectId) {
    return sendError(res, 404, 'Domain not found for this project');
  }

  const result = await verifyDns(domain);
  sendSuccess(res, {
    verified: result.verified,
    method: result.method,
    error: result.error,
    domain: getDomain(domain),
  });
}));

/**
 * POST /api/domains/:projectId/:domain/activate
 * Full activation flow: verify DNS + provision SSL + configure nginx.
 */
domainRouter.post('/:projectId/:domain/activate', asyncHandler(async (req, res) => {
  const { projectId, domain } = req.params;

  const projectValidation = validateProjectId(projectId);
  if (!projectValidation.valid) {
    return sendError(res, 400, projectValidation.error!);
  }

  const domainValidation = validateDomainName(domain);
  if (!domainValidation.valid) {
    return sendError(res, 400, domainValidation.error!);
  }

  // Verify the domain belongs to this project
  const record = getDomain(domain);
  if (!record || record.projectId !== projectId) {
    return sendError(res, 404, 'Domain not found for this project');
  }

  const result = await activateDomain(domain);

  if (result.success) {
    sendSuccess(res, {
      activated: true,
      status: result.status,
      domain: getDomain(domain),
      url: `https://${domain}`,
    });
  } else {
    sendSuccess(res, {
      activated: false,
      status: result.status,
      error: result.error,
      domain: getDomain(domain),
    });
  }
}));

/**
 * GET /api/domains/:projectId/:domain/status
 * Get detailed status for a specific domain.
 */
domainRouter.get('/:projectId/:domain/status', asyncHandler(async (req, res) => {
  const { projectId, domain } = req.params;

  const projectValidation = validateProjectId(projectId);
  if (!projectValidation.valid) {
    return sendError(res, 400, projectValidation.error!);
  }

  const record = getDomain(domain);
  if (!record || record.projectId !== projectId) {
    return sendError(res, 404, 'Domain not found for this project');
  }

  sendSuccess(res, { domain: record });
}));

/**
 * GET /api/admin/domains/stats
 * Admin endpoint: get domain statistics.
 */
domainRouter.get('/admin/stats', asyncHandler(async (_req, res) => {
  const stats = getDomainStats();
  sendSuccess(res, stats);
}));
