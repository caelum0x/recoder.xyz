/**
 * Code-graph routes — flag-gated (RECODER_CODE_GRAPH_ENABLED), INTERNAL_SERVICE_KEY
 * guarded surface over the RecoderGitService index lifecycle.
 *
 * SAFETY CONTRACT (binding — .claude/rules/production.md):
 * - ADDITIVE. Mounted as a sub-router on the existing internal agent-os router
 *   (worker-to-backend, INTERNAL_SERVICE_KEY guarded). No server.ts edits, no
 *   change to existing routes/behavior.
 * - FLAG-GATED. When RECODER_CODE_GRAPH_ENABLED is off every endpoint returns
 *   `{ success:true, data:{ enabled:false } }` (no engine process spawned).
 * - FAIL-SAFE. The service degrades to 'unavailable' / 'not_indexed' / empty map
 *   instead of throwing, so these handlers never 500 from an absent/broken engine.
 */

import { Router } from 'express';
import { agentOsContainer } from '../service-container';

export function createCodeGraphRouter(): Router {
  const router = Router();

  router.get('/status/:repoId', async (req, res) => {
    const { codeGraph } = agentOsContainer;
    if (!codeGraph.isEnabled()) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const result = await codeGraph.status(req.params.repoId);
    res.json({ success: true, data: result });
  });

  router.get('/domain-map/:repoId', async (req, res) => {
    const { codeGraph } = agentOsContainer;
    if (!codeGraph.isEnabled()) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const result = await codeGraph.domainMap(req.params.repoId);
    res.json({ success: true, data: result });
  });

  router.post('/index', async (req, res) => {
    const { codeGraph } = agentOsContainer;
    if (!codeGraph.isEnabled()) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const repoRoot = typeof req.body?.repoRoot === 'string' ? req.body.repoRoot : '';
    const repoId = typeof req.body?.repoId === 'string' ? req.body.repoId : '';
    if (!repoRoot || !repoId) {
      res.status(400).json({ success: false, error: 'repoRoot and repoId are required' });
      return;
    }
    const ref = typeof req.body?.ref === 'string' ? req.body.ref : undefined;
    const result = await codeGraph.indexRepo({ repoRoot, repoId, ref });
    res.json({ success: true, data: result });
  });

  // Truthful supervision health for the recodergit `mcp --http` server. Brings
  // the process up best-effort (ensureServer is fail-safe) and reports
  // starting/ready/unavailable + base URL. Disabled flag -> { enabled:false }.
  router.get('/mcp-health', async (_req, res) => {
    const { codeGraph } = agentOsContainer;
    if (!codeGraph.isEnabled()) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const health = await codeGraph.ensureServer();
    res.json({ success: true, data: { enabled: true, ...health } });
  });

  router.post('/reindex', async (req, res) => {
    const { codeGraph } = agentOsContainer;
    if (!codeGraph.isEnabled()) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const repoId = typeof req.body?.repoId === 'string' ? req.body.repoId : '';
    if (!repoId) {
      res.status(400).json({ success: false, error: 'repoId is required' });
      return;
    }
    const changedFiles = Array.isArray(req.body?.changedFiles)
      ? req.body.changedFiles.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;
    const result = await codeGraph.reindexOnPush({ repoId, changedFiles });
    res.json({ success: true, data: result });
  });

  return router;
}
