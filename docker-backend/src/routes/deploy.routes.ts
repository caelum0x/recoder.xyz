/**
 * Deployment Routes (Vercel / Netlify / Cloudflare Workers)
 *
 * Token-validated deployment, listing, and rollback for external hosting
 * providers. Credentials are passed per-request via body or headers.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, and error helpers are unchanged. All collaborators
 * (lazy deployment module loaders) are imported directly from their existing modules.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';
import type { ProviderCredentials, DeploymentConfig } from '../deployment/types.js';

const getVercelDeploy = () => import('../deployment/vercel.js');
const getNetlifyDeploy = () => import('../deployment/netlify.js');
const getCloudflareDeploy = () => import('../deployment/cloudflare.js');

export function createDeployRouter(): Router {
  const router = Router();

  // Vercel deployment routes
  router.post('/api/deploy/vercel/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { token } = req.body;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token required'));
    const result = await (await getVercelDeploy()).validateToken(token);
    sendSuccess(res, result);
  }));

  router.get('/api/deploy/vercel/projects', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-vercel-token'] as string;
    const teamId = req.query.teamId as string | undefined;
    if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
    const projects = await (await getVercelDeploy()).listProjects({ provider: 'vercel', token, teamId });
    sendSuccess(res, { projects });
  }));

  router.post('/api/deploy/vercel', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { token, teamId, config, files } = req.body;
    if (!token || !config || !files) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, config, and files required'));
    const credentials: ProviderCredentials = { provider: 'vercel', token, teamId };
    const deployment = await (await getVercelDeploy()).deploy(credentials, config, files);
    sendSuccess(res, { deployment });
  }));

  router.get('/api/deploy/vercel/:deploymentId', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-vercel-token'] as string;
    const teamId = req.query.teamId as string | undefined;
    const { deploymentId } = req.params;
    const projectId = req.query.projectId as string || deploymentId;
    if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
    const deployment = await (await getVercelDeploy()).getDeployment({ provider: 'vercel', token, teamId }, deploymentId, projectId);
    sendSuccess(res, { deployment });
  }));

  router.get('/api/deploy/vercel/:projectId/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-vercel-token'] as string;
    const teamId = req.query.teamId as string | undefined;
    const { projectId } = req.params;
    if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
    const deployments = await (await getVercelDeploy()).listDeployments({ provider: 'vercel', token, teamId }, { projectId, limit: 20 });
    sendSuccess(res, { deployments });
  }));

  router.post('/api/deploy/vercel/:projectId/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-vercel-token'] as string;
    const teamId = req.query.teamId as string | undefined;
    const { projectId } = req.params;
    const { deploymentId } = req.body;
    if (!token || !deploymentId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token and deploymentId required'));
    const deployment = await (await getVercelDeploy()).rollback({ provider: 'vercel', token, teamId }, projectId, deploymentId);
    sendSuccess(res, { deployment });
  }));

  // Netlify deployment routes
  router.post('/api/deploy/netlify/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { token } = req.body;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token required'));
    const result = await (await getNetlifyDeploy()).validateToken(token);
    sendSuccess(res, result);
  }));

  router.get('/api/deploy/netlify/sites', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-netlify-token'] as string;
    if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
    const sites = await (await getNetlifyDeploy()).listSites({ provider: 'netlify', token });
    sendSuccess(res, { sites });
  }));

  router.post('/api/deploy/netlify', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { token, config, files } = req.body;
    if (!token || !config || !files) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, config, and files required'));
    const credentials: ProviderCredentials = { provider: 'netlify', token };
    const deployment = await (await getNetlifyDeploy()).deploy(credentials, config, files);
    sendSuccess(res, { deployment });
  }));

  router.get('/api/deploy/netlify/:siteId/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-netlify-token'] as string;
    const { siteId } = req.params;
    if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
    const deployments = await (await getNetlifyDeploy()).listDeployments({ provider: 'netlify', token }, siteId, { limit: 20 });
    sendSuccess(res, { deployments });
  }));

  router.post('/api/deploy/netlify/:siteId/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
    const token = req.headers['x-netlify-token'] as string;
    const { siteId } = req.params;
    const { deploymentId, projectId } = req.body;
    if (!token || !deploymentId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token and deploymentId required'));
    const deployment = await (await getNetlifyDeploy()).rollback({ provider: 'netlify', token }, siteId, deploymentId, projectId || siteId);
    sendSuccess(res, { deployment });
  }));

  // Cloudflare Workers deployment routes
  router.post('/api/deploy/cloudflare/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { apiToken, accountId } = req.body;
    if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token and account ID required'));
    const result = await (await getCloudflareDeploy()).validateToken(apiToken, accountId);
    sendSuccess(res, result);
  }));

  router.post('/api/deploy/cloudflare/deploy', asyncHandler(async (req: express.Request, res: express.Response) => {
    const { apiToken, accountId, projectId, workerName, config, files } = req.body;
    if (!apiToken || !accountId || !workerName || !files) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token, account ID, worker name, and files are required'));
    }
    const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
    const deployConfig: DeploymentConfig = {
      provider: 'cloudflare',
      projectName: workerName,
      projectId: projectId || workerName,
      providerProjectId: workerName,
      accountId,
      ...(config || {}),
    };
    const deployment = await (await getCloudflareDeploy()).deploy(credentials, deployConfig, files);
    sendSuccess(res, { success: true, url: deployment.url, workerId: deployment.id, deployment });
  }));

  router.get('/api/deploy/cloudflare/list', asyncHandler(async (req: express.Request, res: express.Response) => {
    const apiToken = req.query.apiToken as string || req.headers['x-cloudflare-token'] as string;
    const accountId = req.query.accountId as string;
    if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token and account ID required'));
    const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
    const workers = await (await getCloudflareDeploy()).listWorkers(credentials);
    sendSuccess(res, { workers });
  }));

  router.get('/api/deploy/cloudflare/:workerName/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
    const apiToken = req.headers['x-cloudflare-token'] as string;
    const accountId = req.query.accountId as string;
    const { workerName } = req.params;
    if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token and account ID required'));
    const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
    const deployments = await (await getCloudflareDeploy()).listDeployments(credentials, workerName);
    sendSuccess(res, { deployments });
  }));

  router.post('/api/deploy/cloudflare/:workerName/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
    const apiToken = req.headers['x-cloudflare-token'] as string;
    const accountId = req.query.accountId as string;
    const { workerName } = req.params;
    const { versionId, projectId } = req.body;
    if (!apiToken || !accountId || !versionId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, account ID, and versionId required'));
    }
    const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
    const deployment = await (await getCloudflareDeploy()).rollback(credentials, workerName, versionId, projectId || workerName);
    sendSuccess(res, { deployment });
  }));

  return router;
}
