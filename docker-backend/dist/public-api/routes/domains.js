"use strict";
/**
 * Custom Domain Routes
 * API endpoints for managing custom domains on published projects.
 *
 * All endpoints require authentication and project ownership.
 * Custom domains are free for all users (BYOK platform, Let's Encrypt SSL is free).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainRouter = void 0;
const express_1 = require("express");
const domain_manager_js_1 = require("../../domain-manager.js");
const validation_js_1 = require("../validation.js");
exports.domainRouter = (0, express_1.Router)();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res).catch(next);
    };
}
function sendSuccess(res, data) {
    res.json({ success: true, data });
}
function sendError(res, status, error) {
    res.status(status).json({ success: false, error });
}
// ==================== Routes ====================
/**
 * GET /api/domains/:projectId
 * List all custom domains for a project.
 */
exports.domainRouter.get('/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const validation = (0, validation_js_1.validateProjectId)(projectId);
    if (!validation.valid) {
        return sendError(res, 400, validation.error);
    }
    const domains = (0, domain_manager_js_1.getDomainsForProject)(projectId);
    sendSuccess(res, { domains });
}));
/**
 * POST /api/domains/:projectId
 * Add a custom domain to a project.
 * Body: { domain: "example.com" }
 */
exports.domainRouter.post('/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { domain } = req.body;
    const userId = req.userId || 'anonymous';
    const projectValidation = (0, validation_js_1.validateProjectId)(projectId);
    if (!projectValidation.valid) {
        return sendError(res, 400, projectValidation.error);
    }
    const domainValidation = (0, validation_js_1.validateDomainName)(domain);
    if (!domainValidation.valid) {
        return sendError(res, 400, domainValidation.error);
    }
    const result = (0, domain_manager_js_1.addDomain)(domain, projectId, userId);
    if (!result.success) {
        return sendError(res, 400, result.error);
    }
    sendSuccess(res, {
        domain: result.domain,
        instructions: {
            cname: {
                type: 'CNAME',
                name: domain,
                value: result.domain.cnameTarget,
                description: `Add a CNAME record pointing ${domain} to ${result.domain.cnameTarget}`,
            },
            txt: {
                type: 'TXT',
                name: `_recoder-verify.${domain}`,
                value: result.domain.txtVerificationValue,
                description: `Alternatively, add a TXT record at _recoder-verify.${domain}`,
            },
        },
    });
}));
/**
 * DELETE /api/domains/:projectId/:domain
 * Remove a custom domain from a project.
 */
exports.domainRouter.delete('/:projectId/:domain', asyncHandler(async (req, res) => {
    const { projectId, domain } = req.params;
    const projectValidation = (0, validation_js_1.validateProjectId)(projectId);
    if (!projectValidation.valid) {
        return sendError(res, 400, projectValidation.error);
    }
    const domainValidation = (0, validation_js_1.validateDomainName)(domain);
    if (!domainValidation.valid) {
        return sendError(res, 400, domainValidation.error);
    }
    const result = (0, domain_manager_js_1.removeDomain)(domain, projectId);
    if (!result.success) {
        return sendError(res, 400, result.error);
    }
    sendSuccess(res, { removed: true });
}));
/**
 * POST /api/domains/:projectId/:domain/verify
 * Check DNS records and verify domain ownership.
 */
exports.domainRouter.post('/:projectId/:domain/verify', asyncHandler(async (req, res) => {
    const { projectId, domain } = req.params;
    const projectValidation = (0, validation_js_1.validateProjectId)(projectId);
    if (!projectValidation.valid) {
        return sendError(res, 400, projectValidation.error);
    }
    const domainValidation = (0, validation_js_1.validateDomainName)(domain);
    if (!domainValidation.valid) {
        return sendError(res, 400, domainValidation.error);
    }
    // Verify the domain belongs to this project
    const record = (0, domain_manager_js_1.getDomain)(domain);
    if (!record || record.projectId !== projectId) {
        return sendError(res, 404, 'Domain not found for this project');
    }
    const result = await (0, domain_manager_js_1.verifyDns)(domain);
    sendSuccess(res, {
        verified: result.verified,
        method: result.method,
        error: result.error,
        domain: (0, domain_manager_js_1.getDomain)(domain),
    });
}));
/**
 * POST /api/domains/:projectId/:domain/activate
 * Full activation flow: verify DNS + provision SSL + configure nginx.
 */
exports.domainRouter.post('/:projectId/:domain/activate', asyncHandler(async (req, res) => {
    const { projectId, domain } = req.params;
    const projectValidation = (0, validation_js_1.validateProjectId)(projectId);
    if (!projectValidation.valid) {
        return sendError(res, 400, projectValidation.error);
    }
    const domainValidation = (0, validation_js_1.validateDomainName)(domain);
    if (!domainValidation.valid) {
        return sendError(res, 400, domainValidation.error);
    }
    // Verify the domain belongs to this project
    const record = (0, domain_manager_js_1.getDomain)(domain);
    if (!record || record.projectId !== projectId) {
        return sendError(res, 404, 'Domain not found for this project');
    }
    const result = await (0, domain_manager_js_1.activateDomain)(domain);
    if (result.success) {
        sendSuccess(res, {
            activated: true,
            status: result.status,
            domain: (0, domain_manager_js_1.getDomain)(domain),
            url: `https://${domain}`,
        });
    }
    else {
        sendSuccess(res, {
            activated: false,
            status: result.status,
            error: result.error,
            domain: (0, domain_manager_js_1.getDomain)(domain),
        });
    }
}));
/**
 * GET /api/domains/:projectId/:domain/status
 * Get detailed status for a specific domain.
 */
exports.domainRouter.get('/:projectId/:domain/status', asyncHandler(async (req, res) => {
    const { projectId, domain } = req.params;
    const projectValidation = (0, validation_js_1.validateProjectId)(projectId);
    if (!projectValidation.valid) {
        return sendError(res, 400, projectValidation.error);
    }
    const record = (0, domain_manager_js_1.getDomain)(domain);
    if (!record || record.projectId !== projectId) {
        return sendError(res, 404, 'Domain not found for this project');
    }
    sendSuccess(res, { domain: record });
}));
/**
 * GET /api/admin/domains/stats
 * Admin endpoint: get domain statistics.
 */
exports.domainRouter.get('/admin/stats', asyncHandler(async (_req, res) => {
    const stats = (0, domain_manager_js_1.getDomainStats)();
    sendSuccess(res, stats);
}));
