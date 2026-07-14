/**
 * Git Operations API Routes
 *
 * Status, branches, checkout, commit history, diffs, staging, commit, discard,
 * init, auto-commit, revert, remotes, push/pull/fetch/clone, merge/rebase, and
 * force-push-with-lease for a project's container workspace.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helper, audit log,
 * sanitizer, logger) are injected via the factory; module collaborators
 * (gitOperations, validateBranchName, validateCommitMessage, validateCommitHash)
 * are imported here.
 */

import express, { Router } from 'express';
import { gitOperations } from '../git-operations.js';
import {
  validateBranchName,
  validateCommitMessage,
  validateCommitHash,
} from '../public-api/validation.js';
import type { ContainerEntry } from '../daytona-file-ops.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface GitOperationsRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  sanitizeProjectId: (projectId: string) => string;
  getOrRecoverContainer: (projectId: string) => Promise<ContainerEntry | undefined>;
  auditLog: (event: {
    userId?: string;
    action: string;
    projectId?: string;
    details?: Record<string, unknown>;
    ip?: string;
  }) => void;
  logger: {
    info: (obj: unknown, msg: string) => void;
    warn: (obj: unknown, msg: string) => void;
    error: (obj: unknown, msg: string) => void;
  };
}

export function createGitOperationsRouter(deps: GitOperationsRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    sanitizeProjectId,
    getOrRecoverContainer,
    auditLog,
    logger,
  } = deps;
  const router = Router();

  router.get('/api/git/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const status = await gitOperations.getStatus(entry.id);
      res.json(status);
    } catch (err: any) {
      logger.error({ err }, 'Git: status error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get branches
  router.get('/api/git/:projectId/branches', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const branches = await gitOperations.getBranches(entry.id);
      res.json({ branches });
    } catch (err: any) {
      logger.error({ err }, 'Git: branches error');
      res.status(500).json({ error: err.message });
    }
  });

  // Create branch
  router.post('/api/git/:projectId/branch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { name, checkout } = req.body;

      const branchValidation = validateBranchName(name, 'name');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_CREATE_BRANCH',
        projectId,
        details: { name },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.createBranch(entry.id, name, checkout !== false);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: create branch error');
      res.status(500).json({ error: err.message });
    }
  });

  // Checkout branch
  router.post('/api/git/:projectId/checkout', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { branch } = req.body;

      const branchValidation = validateBranchName(branch, 'branch');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_CHECKOUT',
        projectId,
        details: { branch },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.checkoutBranch(entry.id, branch);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: checkout error');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete branch
  router.delete('/api/git/:projectId/branch/:name', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const branchName = decodeURIComponent(req.params.name);
      const force = req.query.force === 'true';

      const branchValidation = validateBranchName(branchName, 'name');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_DELETE_BRANCH',
        projectId,
        details: { branch: branchName, force },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.deleteBranch(entry.id, branchName, force);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: delete branch error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get commit history
  router.get('/api/git/:projectId/log', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const branch = req.query.branch as string | undefined;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const commits = await gitOperations.getCommitHistory(entry.id, limit, branch);
      res.json({ commits });
    } catch (err: any) {
      logger.error({ err }, 'Git: log error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get file diff
  router.get('/api/git/:projectId/diff/:file(*)', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const filePath = decodeURIComponent(req.params.file);
      const staged = req.query.staged === 'true';

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const diff = await gitOperations.getFileDiff(entry.id, filePath, staged);
      res.json({ diff });
    } catch (err: any) {
      logger.error({ err }, 'Git: diff error');
      res.status(500).json({ error: err.message });
    }
  });

  // Stage files
  router.post('/api/git/:projectId/stage', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { files } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const result = await gitOperations.stageFiles(entry.id, files || []);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: stage error');
      res.status(500).json({ error: err.message });
    }
  });

  // Unstage files
  router.post('/api/git/:projectId/unstage', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { files } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const result = await gitOperations.unstageFiles(entry.id, files || []);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: unstage error');
      res.status(500).json({ error: err.message });
    }
  });

  // Commit
  router.post('/api/git/:projectId/commit', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { message } = req.body;

      const msgValidation = validateCommitMessage(message);
      if (!msgValidation.valid) {
        return res.status(400).json({ error: msgValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_COMMIT',
        projectId,
        details: { message: message.substring(0, 100) },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.commit(entry.id, message);
      if (result.success) {
        res.json({ success: true, hash: result.hash });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: commit error');
      res.status(500).json({ error: err.message });
    }
  });

  // Discard changes
  router.post('/api/git/:projectId/discard', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { files } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_DISCARD',
        projectId,
        details: { fileCount: files?.length || 'all' },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.discardChanges(entry.id, files || []);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: discard error');
      res.status(500).json({ error: err.message });
    }
  });

  // Initialize git repo
  router.post('/api/git/:projectId/init', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_INIT',
        projectId,
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.initRepo(entry.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: init error');
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-commit: init git + stage all + commit (used after AI generates files)
  router.post('/api/git/:projectId/auto-commit', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { message } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const result = await gitOperations.autoCommit(entry.id, message);

      if (result.error) {
        logger.error({ error: result.error }, 'Git: auto-commit error');
        return res.status(500).json({ error: result.error });
      }

      res.json(result);
    } catch (err: any) {
      logger.error({ err }, 'Git: auto-commit error');
      res.status(500).json({ error: err.message });
    }
  });

  // Revert to a specific commit (checkout all files from that commit)
  router.post('/api/git/:projectId/revert', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { commitHash } = req.body;

      const hashValidation = validateCommitHash(commitHash);
      if (!hashValidation.valid) {
        return res.status(400).json({ error: hashValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_REVERT',
        projectId,
        details: { commitHash: commitHash.substring(0, 40) },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.revertToCommit(entry.id, commitHash);

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (err: any) {
      logger.error({ err }, 'Git: revert error');
      res.status(500).json({ error: err.message });
    }
  });

  // ── Remote Git Operations ──

  // Get remotes
  router.get('/api/git/:projectId/remotes', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }
      entry.lastActive = Date.now();
      const remotes = await gitOperations.getRemotes(entry.id);
      res.json({ remotes });
    } catch (err: any) {
      logger.error({ err }, 'Git: remotes error');
      res.status(500).json({ error: err.message });
    }
  });

  // Set remote
  router.post('/api/git/:projectId/remote', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { name, url } = req.body;

      if (!name || !url) {
        return res.status(400).json({ error: 'name and url are required' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_SET_REMOTE',
        projectId,
        details: { name, url: url.replace(/ghp_[a-zA-Z0-9]+/, 'ghp_***') },
        ip: req.ip,
      });

      entry.lastActive = Date.now();
      const result = await gitOperations.setRemote(entry.id, name, url);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: set remote error');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete remote
  router.delete('/api/git/:projectId/remote/:name', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const name = decodeURIComponent(req.params.name);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_REMOVE_REMOTE',
        projectId,
        details: { name },
        ip: req.ip,
      });

      entry.lastActive = Date.now();
      const result = await gitOperations.removeRemote(entry.id, name);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: remove remote error');
      res.status(500).json({ error: err.message });
    }
  });

  // Push to remote
  router.post('/api/git/:projectId/push', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { remote, branch, force, setUpstream, token } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_PUSH',
        projectId,
        details: { remote: remote || 'origin', branch, force: !!force },
        ip: req.ip,
      });

      entry.lastActive = Date.now();
      const result = await gitOperations.push(entry.id, remote || 'origin', branch, {
        force,
        setUpstream,
        token,
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: push error');
      res.status(500).json({ error: err.message });
    }
  });

  // Pull from remote
  router.post('/api/git/:projectId/pull', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { remote, branch, rebase, token } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_PULL',
        projectId,
        details: { remote: remote || 'origin', branch, rebase: !!rebase },
        ip: req.ip,
      });

      entry.lastActive = Date.now();
      const result = await gitOperations.pull(entry.id, remote || 'origin', branch, {
        rebase,
        token,
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(result.conflicts ? 409 : 400).json({
          error: result.error,
          conflicts: result.conflicts,
        });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: pull error');
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch from remote (no merge)
  router.post('/api/git/:projectId/fetch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { remote, token } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();
      const result = await gitOperations.fetchRemote(entry.id, remote || 'origin', { token });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: fetch error');
      res.status(500).json({ error: err.message });
    }
  });

  // Clone a repository into the project's container
  router.post('/api/git/:projectId/clone', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { url, branch, token, depth } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'url is required' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_CLONE',
        projectId,
        details: { url: url.replace(/ghp_[a-zA-Z0-9]+/, 'ghp_***'), branch },
        ip: req.ip,
      });

      entry.lastActive = Date.now();
      const result = await gitOperations.cloneRepo(entry.id, url, { branch, token, depth });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: clone error');
      res.status(500).json({ error: err.message });
    }
  });

  // ── Enhanced Git Operations ──

  // Get git state (merging, rebasing, cherry-picking, or clean)
  router.get('/api/git/:projectId/state', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const state = await gitOperations.getGitState(entry.id);
      res.json(state);
    } catch (err: any) {
      logger.error({ err }, 'Git: state error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get conflict files
  router.get('/api/git/:projectId/conflicts', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const conflicts = await gitOperations.getConflicts(entry.id);
      res.json(conflicts);
    } catch (err: any) {
      logger.error({ err }, 'Git: conflicts error');
      res.status(500).json({ error: err.message });
    }
  });

  // Merge branch into current
  router.post('/api/git/:projectId/merge', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { branch, noFf, squash } = req.body;

      const branchValidation = validateBranchName(branch, 'branch');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_MERGE',
        projectId,
        details: { branch, noFf: !!noFf, squash: !!squash },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.merge(entry.id, branch, { noFf, squash });
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(result.conflicts ? 409 : 400).json({
          error: result.error,
          conflicts: result.conflicts,
        });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: merge error');
      res.status(500).json({ error: err.message });
    }
  });

  // Rebase current onto branch
  router.post('/api/git/:projectId/rebase', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { branch } = req.body;

      const branchValidation = validateBranchName(branch, 'branch');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_REBASE',
        projectId,
        details: { branch },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.rebase(entry.id, branch);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(result.conflicts ? 409 : 400).json({
          error: result.error,
          conflicts: result.conflicts,
        });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: rebase error');
      res.status(500).json({ error: err.message });
    }
  });

  // Abort rebase
  router.post('/api/git/:projectId/rebase-abort', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_REBASE_ABORT',
        projectId,
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.rebaseAbort(entry.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: rebase abort error');
      res.status(500).json({ error: err.message });
    }
  });

  // Continue rebase
  router.post('/api/git/:projectId/rebase-continue', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_REBASE_CONTINUE',
        projectId,
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.rebaseContinue(entry.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(result.conflicts ? 409 : 400).json({
          error: result.error,
          conflicts: result.conflicts,
        });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: rebase continue error');
      res.status(500).json({ error: err.message });
    }
  });

  // Rename branch
  router.post('/api/git/:projectId/branch-rename', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { oldName, newName } = req.body;

      const oldValidation = validateBranchName(oldName, 'oldName');
      if (!oldValidation.valid) {
        return res.status(400).json({ error: oldValidation.error });
      }

      const newValidation = validateBranchName(newName, 'newName');
      if (!newValidation.valid) {
        return res.status(400).json({ error: newValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_RENAME_BRANCH',
        projectId,
        details: { oldName, newName },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.renameBranch(entry.id, oldName, newName);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: branch rename error');
      res.status(500).json({ error: err.message });
    }
  });

  // Force push with lease (safe force push)
  router.post('/api/git/:projectId/force-push', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { remote, branch, token } = req.body;

      if (!remote || !branch) {
        return res.status(400).json({ error: 'remote and branch are required' });
      }

      const branchValidation = validateBranchName(branch, 'branch');
      if (!branchValidation.valid) {
        return res.status(400).json({ error: branchValidation.error });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'GIT_FORCE_PUSH',
        projectId,
        details: { remote, branch },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await gitOperations.pushForceWithLease(entry.id, remote, branch, token);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err: any) {
      logger.error({ err }, 'Git: force push error');
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
