/**
 * Neon PostgreSQL Integration Routes
 *
 * Connect/disconnect Neon, manage projects/branches, link to Recoder projects,
 * and inject connection URIs into the container's .env.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The only
 * server-local closure (the `containers` Map) is injected via the factory; all other
 * collaborators are imported directly from their existing modules.
 */

import express, { Router } from 'express';
import Docker from 'dockerode';
import * as neonClient from '../integrations/neon-client.js';
import * as integrationStore from '../integrations/integration-store.js';
import {
  type ContainerEntry,
  isDaytonaSandbox,
  daytonaReadFile,
  daytonaWriteFile,
} from '../daytona-file-ops.js';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface NeonRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  containers: Map<string, ContainerEntry>;
}

export function createNeonRouter(deps: NeonRouterDeps): Router {
  const { authenticateRequest, verifyProjectOwnership, containers } = deps;
  const router = Router();

  // Connect Neon (store API key)
  router.post('/api/integrations/neon/connect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'apiKey is required'));
    }
    const valid = await neonClient.validateApiKey(apiKey);
    if (!valid) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid Neon API key'));
    }
    integrationStore.setUserCredentials(req.userId!, 'neon', { apiKey });
    const organizations = await neonClient.getOrganizations(apiKey);
    sendSuccess(res, { organizations });
  }));

  // Disconnect Neon
  router.delete('/api/integrations/neon/disconnect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    integrationStore.removeUserCredentials(req.userId!, 'neon');
    sendSuccess(res, { disconnected: true });
  }));

  // List Neon projects
  router.get('/api/integrations/neon/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const projects = await neonClient.listProjects(creds.neon.apiKey);
    sendSuccess(res, { projects });
  }));

  // Create Neon project
  router.post('/api/integrations/neon/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const { name, orgId } = req.body;
    if (!name || typeof name !== 'string') {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name is required'));
    }
    const result = await neonClient.createProject(creds.neon.apiKey, name, orgId);
    sendSuccess(res, result);
  }));

  // List Neon project branches
  router.get('/api/integrations/neon/projects/:neonProjectId/branches', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const branches = await neonClient.listBranches(creds.neon.apiKey, req.params.neonProjectId);
    sendSuccess(res, { branches });
  }));

  // Link Neon project to Recoder project
  router.post('/api/integrations/neon/:projectId/link', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { neonProjectId, developmentBranchId, previewBranchId } = req.body;
    if (!neonProjectId || !developmentBranchId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'neonProjectId and developmentBranchId are required'));
    }
    integrationStore.setProjectLink(req.params.projectId, 'neon', {
      projectId: neonProjectId,
      developmentBranchId,
      previewBranchId,
    });
    sendSuccess(res, { linked: true });
  }));

  // Unlink Neon project
  router.delete('/api/integrations/neon/:projectId/unlink', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    integrationStore.removeProjectLink(req.params.projectId, 'neon');
    sendSuccess(res, { unlinked: true });
  }));

  // Get Neon connection URI for linked project
  router.get('/api/integrations/neon/:projectId/connection-uri', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const links = integrationStore.getProjectLinks(req.params.projectId);
    if (!links.neon) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
    }
    const branchId = (req.query.branchId as string) || links.neon.developmentBranchId;
    const uri = await neonClient.getConnectionUri(creds.neon.apiKey, links.neon.projectId, branchId);
    sendSuccess(res, { uri });
  }));

  // Set POSTGRES_URL in container .env
  router.post('/api/integrations/neon/:projectId/set-env', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const links = integrationStore.getProjectLinks(req.params.projectId);
    if (!links.neon) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
    }

    const branchId = req.body.branchId || links.neon.developmentBranchId;
    const uri = await neonClient.getConnectionUri(creds.neon.apiKey, links.neon.projectId, branchId);

    // Write POSTGRES_URL to container's .env file
    const entry = containers.get(req.params.projectId);
    if (!entry) {
      return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found'));
    }

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — use Daytona helpers for file read/write
      const existingEnv = await daytonaReadFile(entry.id, '.env').catch(() => '');

      const lines = existingEnv.split('\n').filter(l => !l.startsWith('POSTGRES_URL=') && !l.startsWith('DATABASE_URL='));
      lines.push(`POSTGRES_URL=${uri}`);
      lines.push(`DATABASE_URL=${uri}`);
      const newEnv = lines.filter(Boolean).join('\n') + '\n';

      await daytonaWriteFile(entry.id, '.env', newEnv);
      return sendSuccess(res, { set: true, branchId });
    }

    const docker = new Docker();
    const container = docker.getContainer(entry.id);

    // Read existing .env, append/replace POSTGRES_URL
    const readExec = await container.exec({
      Cmd: ['sh', '-c', 'cat /app/.env 2>/dev/null || echo ""'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const readStream = await readExec.start({ Detach: false, Tty: false });
    const existingEnv = await new Promise<string>((resolve) => {
      let data = '';
      readStream.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      readStream.on('end', () => resolve(data.trim()));
    });

    // Replace or append POSTGRES_URL
    const lines = existingEnv.split('\n').filter(l => !l.startsWith('POSTGRES_URL=') && !l.startsWith('DATABASE_URL='));
    lines.push(`POSTGRES_URL=${uri}`);
    lines.push(`DATABASE_URL=${uri}`);
    const newEnv = lines.filter(Boolean).join('\n') + '\n';

    const writeExec = await container.exec({
      Cmd: ['sh', '-c', `cat > /app/.env << 'ENVEOF'\n${newEnv}ENVEOF`],
      AttachStdout: true,
      AttachStderr: true,
    });
    await writeExec.start({ Detach: false, Tty: false });

    sendSuccess(res, { set: true, branchId });
  }));

  // Create Neon branch
  router.post('/api/integrations/neon/:projectId/branches', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const links = integrationStore.getProjectLinks(req.params.projectId);
    if (!links.neon) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
    }
    const { name, parentBranchId } = req.body;
    if (!name || !parentBranchId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name and parentBranchId are required'));
    }
    const branch = await neonClient.createBranch(creds.neon.apiKey, links.neon.projectId, name, parentBranchId);
    sendSuccess(res, { branch });
  }));

  // Delete Neon branch
  router.delete('/api/integrations/neon/:projectId/branches/:branchId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const links = integrationStore.getProjectLinks(req.params.projectId);
    if (!links.neon) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
    }
    await neonClient.deleteBranch(creds.neon.apiKey, links.neon.projectId, req.params.branchId);
    sendSuccess(res, { deleted: true });
  }));

  // Restore Neon branch
  router.post('/api/integrations/neon/:projectId/branches/:branchId/restore', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const creds = integrationStore.getUserCredentials(req.userId!);
    if (!creds.neon?.apiKey) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
    }
    const links = integrationStore.getProjectLinks(req.params.projectId);
    if (!links.neon) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
    }
    const { timestamp } = req.body;
    if (!timestamp) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'timestamp is required'));
    }
    await neonClient.restoreBranch(creds.neon.apiKey, links.neon.projectId, req.params.branchId, timestamp);
    sendSuccess(res, { restored: true });
  }));

  return router;
}
