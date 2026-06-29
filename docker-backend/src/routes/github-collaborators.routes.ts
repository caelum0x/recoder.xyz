/**
 * GitHub Collaborators + Pull Requests Routes (Sprint 14)
 *
 * Uses the GitHub REST API to manage repository collaborators and pending
 * invitations, and to make pull requests first-class run artifacts (open a PR
 * from the project's branch, list PRs, read PR review + CI check state). The
 * token is sent from the frontend (same token used for push/pull).
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helper, sanitizer,
 * auth/ownership middleware) are injected via the factory; module collaborators
 * (gitOperations, task lifecycle, A2A event bus) are imported here.
 */

import express, { Router } from 'express';
import { gitOperations } from '../git-operations.js';
import { getTaskLifecycleService, getA2AEventBus, A2AEventType } from '../a2a/index.js';
import type { TaskArtifact } from '@recoder/shared/a2a';
import type { ContainerEntry } from '../daytona-file-ops.js';
import {
  ErrorCode,
  createError,
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

export interface GitHubCollaboratorsRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  sanitizeProjectId: (projectId: string) => string;
  getOrRecoverContainer: (projectId: string) => Promise<ContainerEntry | undefined>;
}

/**
 * Parse a GitHub remote URL into owner/repo.
 * Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git
 */
function parseGitHubRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

/**
 * Helper: Call GitHub API with token auth
 */
async function githubApi(
  method: string,
  path: string,
  token: string,
  body?: object
): Promise<{ status: number; data: any }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

export function createGitHubCollaboratorsRouter(deps: GitHubCollaboratorsRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    sanitizeProjectId,
    getOrRecoverContainer,
  } = deps;
  const router = Router();

  // Get GitHub repo info from a project's remote URL
  router.get('/api/git/:projectId/github-repo', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendSuccess(res, { github: null, message: 'No origin remote' });

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendSuccess(res, { github: null, message: 'Origin is not a GitHub URL' });

      sendSuccess(res, { github: parsed });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // List collaborators for a GitHub repo
  router.get('/api/git/:projectId/collaborators', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/collaborators`, token);
      if (status !== 200) {
        return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'GitHub API error'));
      }

      const collaborators = (data || []).map((c: any) => ({
        id: c.id,
        login: c.login,
        avatarUrl: c.avatar_url,
        role: c.role_name || (c.permissions?.admin ? 'admin' : c.permissions?.push ? 'write' : 'read'),
        permissions: c.permissions,
      }));

      sendSuccess(res, { collaborators, repo: parsed });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // Invite a collaborator
  router.post('/api/git/:projectId/collaborators', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { token, username, permission } = req.body;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));
      if (!username) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Username required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      // Validate permission level
      const validPerms = ['pull', 'push', 'admin', 'maintain', 'triage'];
      const perm = validPerms.includes(permission) ? permission : 'push';

      const { status, data } = await githubApi(
        'PUT',
        `/repos/${parsed.owner}/${parsed.repo}/collaborators/${encodeURIComponent(username)}`,
        token,
        { permission: perm }
      );

      if (status === 201) {
        sendSuccess(res, { invited: true, invitation: data });
      } else if (status === 204) {
        sendSuccess(res, { invited: true, alreadyCollaborator: true });
      } else {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to invite collaborator'));
      }
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // Remove a collaborator
  router.delete('/api/git/:projectId/collaborators/:username', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const username = req.params.username;
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data } = await githubApi(
        'DELETE',
        `/repos/${parsed.owner}/${parsed.repo}/collaborators/${encodeURIComponent(username)}`,
        token
      );

      if (status === 204) {
        sendSuccess(res, { removed: true });
      } else {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to remove collaborator'));
      }
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // List pending invitations
  router.get('/api/git/:projectId/invitations', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/invitations`, token);
      if (status !== 200) {
        return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'GitHub API error'));
      }

      const invitations = (data || []).map((inv: any) => ({
        id: inv.id,
        login: inv.invitee?.login,
        avatarUrl: inv.invitee?.avatar_url,
        permission: inv.permissions,
        createdAt: inv.created_at,
      }));

      sendSuccess(res, { invitations, repo: parsed });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // Cancel a pending invitation
  router.delete('/api/git/:projectId/invitations/:invitationId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const invitationId = req.params.invitationId;
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data } = await githubApi(
        'DELETE',
        `/repos/${parsed.owner}/${parsed.repo}/invitations/${encodeURIComponent(invitationId)}`,
        token
      );

      if (status === 204) {
        sendSuccess(res, { cancelled: true });
      } else {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to cancel invitation'));
      }
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // ==================== GITHUB PULL REQUESTS (first-class PR artifacts) ====================
  // Make PRs first-class run artifacts: open a PR from the project's branch, list PRs,
  // and read PR review + CI check state. Reuses the same token used for push/pull.

  // POST /api/git/:projectId/pull-request - Open a GitHub PR for the project's branch
  router.post('/api/git/:projectId/pull-request', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const token = (req.body?.token || req.query.token) as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      if (!title) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'PR title required'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));
      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      // Default head to the current branch; base defaults to 'main'.
      const gitStatus = await gitOperations.getStatus(entry.id);
      const head = (typeof req.body?.head === 'string' && req.body.head.trim()) || gitStatus.branch;
      if (!head) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Could not determine head branch'));
      const base = (typeof req.body?.base === 'string' && req.body.base.trim()) || 'main';
      const prBody = typeof req.body?.body === 'string' ? req.body.body : '';
      const draft = req.body?.draft === true;

      const { status, data } = await githubApi('POST', `/repos/${parsed.owner}/${parsed.repo}/pulls`, token, {
        title, head, base, body: prBody, draft,
      });
      if (status !== 201) {
        const msg = data?.message || data?.errors?.[0]?.message || 'Failed to create pull request';
        return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, msg));
      }

      const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
      let taskAttachment: { attached: boolean; taskId?: string; error?: string } = { attached: false };
      if (taskId) {
        const lifecycle = getTaskLifecycleService();
        const taskResult = lifecycle.getTask(taskId);
        if (!taskResult.ok) {
          taskAttachment = { attached: false, taskId, error: taskResult.error.message };
        } else {
          const createdBy = typeof req.body?.createdBy === 'string' && req.body.createdBy.trim()
            ? req.body.createdBy.trim()
            : req.userId;
          const prArtifact: TaskArtifact = {
            key: `github-pr-${data.number}`,
            artifact_type: 'custom',
            mime_type: 'application/json',
            content: JSON.stringify({
              type: 'github_pull_request',
              number: data.number,
              url: data.html_url,
              state: data.state,
              title: data.title,
              head: data.head?.ref,
              base: data.base?.ref,
              draft: data.draft,
              repo: parsed,
            }),
            path: `.recoder/artifacts/github-pr-${data.number}.json`,
            metadata: {
              type: 'github_pull_request',
              projectId,
              prUrl: data.html_url,
              prNumber: data.number,
              state: data.state,
              head: data.head?.ref,
              base: data.base?.ref,
              repo: `${parsed.owner}/${parsed.repo}`,
            },
          };

          const artifactUpdate = lifecycle.appendTaskArtifacts(taskId, {
            artifacts: [prArtifact],
            triggeredBy: createdBy,
            reason: 'GitHub pull request artifact attached',
          });
          const metadataUpdate = artifactUpdate.ok
            ? lifecycle.updateTaskMetadata(taskId, {
                metadataPatch: {
                  githubPullRequest: {
                    projectId,
                    repo: `${parsed.owner}/${parsed.repo}`,
                    prUrl: data.html_url,
                    prNumber: data.number,
                    state: data.state,
                    title: data.title,
                    head: data.head?.ref,
                    base: data.base?.ref,
                    draft: data.draft,
                  },
                },
                triggeredBy: createdBy,
                reason: 'GitHub pull request registered',
              })
            : artifactUpdate;

          if (!metadataUpdate.ok) {
            taskAttachment = { attached: false, taskId, error: metadataUpdate.error.message };
          } else {
            taskAttachment = { attached: true, taskId };
            getA2AEventBus().publish({
              id: `evt_${Date.now()}_github_pr_${taskId}_${data.number}`,
              type: A2AEventType.ArtifactAttached,
              timestamp: new Date().toISOString(),
              taskId,
              workspaceId: taskResult.data.workspace_id,
              data: {
                taskId,
                projectId,
                prUrl: data.html_url,
                prNumber: data.number,
                repo: `${parsed.owner}/${parsed.repo}`,
                triggeredBy: createdBy,
              },
            });
          }
        }
      }

      sendSuccess(res, {
        pullRequest: {
          number: data.number,
          url: data.html_url,
          state: data.state,
          title: data.title,
          head: data.head?.ref,
          base: data.base?.ref,
          draft: data.draft,
          createdAt: data.created_at,
        },
        repo: parsed,
        taskAttachment,
      });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // GET /api/git/:projectId/pull-requests - List PRs for the project repo
  router.get('/api/git/:projectId/pull-requests', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));
      const state = (['open', 'closed', 'all'].includes(req.query.state as string) ? req.query.state : 'open') as string;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));
      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));
      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/pulls?state=${state}&per_page=30`, token);
      if (status !== 200) {
        return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'GitHub API error'));
      }
      const pullRequests = (data || []).map((pr: any) => ({
        number: pr.number,
        url: pr.html_url,
        state: pr.state,
        title: pr.title,
        head: pr.head?.ref,
        base: pr.base?.ref,
        draft: pr.draft,
        author: pr.user?.login,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }));
      sendSuccess(res, { pullRequests, repo: parsed });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  // GET /api/git/:projectId/pull-request/:number - PR detail with review + CI check state
  router.get('/api/git/:projectId/pull-request/:number', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const token = req.query.token as string;
      if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));
      const number = parseInt(req.params.number, 10);
      if (!Number.isInteger(number) || number <= 0) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid PR number'));

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));
      const remotes = await gitOperations.getRemotes(entry.id);
      const origin = remotes.find((r: any) => r.name === 'origin');
      if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));
      const parsed = parseGitHubRemoteUrl(origin.url);
      if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

      const { status, data: pr } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/pulls/${number}`, token);
      if (status !== 200) {
        return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, pr?.message || 'Pull request not found'));
      }

      // Review + CI check state (best-effort: don't fail the whole request if these error)
      const headSha = pr.head?.sha;
      const [reviewsRes, checksRes] = await Promise.all([
        githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/pulls/${number}/reviews`, token).catch(() => ({ status: 0, data: null })),
        headSha
          ? githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/commits/${headSha}/check-runs`, token).catch(() => ({ status: 0, data: null }))
          : Promise.resolve({ status: 0, data: null }),
      ]);
      const reviews = (reviewsRes.status === 200 && Array.isArray(reviewsRes.data) ? reviewsRes.data : []).map((r: any) => ({
        user: r.user?.login,
        state: r.state,
        submittedAt: r.submitted_at,
      }));
      const checks = (checksRes.status === 200 && checksRes.data?.check_runs ? checksRes.data.check_runs : []).map((c: any) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      }));

      sendSuccess(res, {
        pullRequest: {
          number: pr.number,
          url: pr.html_url,
          state: pr.state,
          title: pr.title,
          body: pr.body,
          head: pr.head?.ref,
          base: pr.base?.ref,
          draft: pr.draft,
          merged: pr.merged,
          mergeable: pr.mergeable,
          mergeableState: pr.mergeable_state,
          author: pr.user?.login,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
        },
        reviews,
        checks,
        repo: parsed,
      });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
    }
  });

  return router;
}
