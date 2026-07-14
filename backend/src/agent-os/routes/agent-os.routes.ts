import { Router } from 'express';
import {
  agentProfileSchema,
  approvalSchema,
  artifactSchema,
  instructionBundleSchema,
  memoryCandidateSchema,
  runEventSchema,
  taskSpecSchema,
  workLockSchema,
  workSignalSchema,
} from '@recoder/agent-schemas';
import { AgentOsController } from '../controllers/agent-os.controller';
import { agentOsContainer } from '../service-container';
import { validateBody } from '../middleware/schema-guard.middleware';
import { createCodeGraphUserRouter } from './code-graph-user.routes';
import { createPolicyEvaluateRouter } from './policy-evaluate.routes';
import { createMemoryCandidateRouter } from './memory-candidate.routes';
import { createBrainStatsRouter } from './brain-stats.routes';

export function createAgentOsRouter(): Router {
  const router = Router();
  const controller = new AgentOsController(
    agentOsContainer.repository,
    agentOsContainer.workLocks,
    agentOsContainer.repositoryDriver,
  );

  // User-facing, flag-gated (RECODER_CODE_GRAPH_ENABLED) on-demand GitHub repo
  // connect + code-graph reads. Owner-scoped to req.userId; token-safe; no-op
  // when the flag is off. Mounted additively under the same authenticateRequest
  // middleware the rest of this surface uses (see server.ts mount).
  router.use('/code-graph', createCodeGraphUserRouter());

  // Surface @recoder/agent-policy live engine directly on the control plane
  // (POST /api/agent-os/policy/evaluate -> real PolicyDecision). Additive; the
  // existing /policies CRUD routes below are unchanged.
  router.use('/policy', createPolicyEvaluateRouter(agentOsContainer.repository));

  // Surface @recoder/agent-memory reviewed-candidate lifecycle directly on the
  // control plane (GET/POST /api/agent-os/memory/lifecycle/candidates + review).
  // Durable memory is only ever materialized through an accepted review, never
  // written directly. Mounted under a distinct /memory/lifecycle prefix so it is
  // strictly additive and never shadows the existing /memory/candidates routes
  // registered below.
  router.use('/memory/lifecycle', createMemoryCandidateRouter(agentOsContainer.repository));

  // Surface the live @recoder/brain cache accounting + @recoder/governance audit
  // integrity (GET /api/agent-os/brain/stats). Read-only and degrade-safe; reads
  // the SAME shared Brain instance the conductor bundle assembles into so the
  // "tokens saved by the shared brain" metric is real, not a throwaway snapshot.
  router.use('/brain', createBrainStatsRouter());

  router.get('/health', controller.health);
  router.get('/summary', controller.summary);
  router.get('/agents', controller.agents);
  router.post('/agents', validateBody(agentProfileSchema), controller.upsertAgent);
  router.post('/agents/reconcile', controller.reconcileAgent);
  router.get('/spaces', controller.spaces);
  router.post('/spaces', controller.upsertSpace);
  router.post('/spaces/:spaceId/repositories/github', controller.connectGitHubRepository);
  router.get('/tasks', controller.tasks);
  router.post('/tasks', validateBody(taskSpecSchema), controller.upsertTask);
  router.post('/tasks/route', controller.routeTask);
  router.get('/tasks/:taskId/history', controller.taskHistory);
  router.get('/tasks/:taskId/context-pack', controller.taskContextPack);
  router.get('/runs', controller.runs);
  router.post('/runs', controller.upsertRun);
  router.get('/runs/:runId/history', controller.runHistory);
  router.post('/runs/:runId/claim', controller.claimRun);
  router.post('/runs/:runId/transition', controller.transitionRun);
  router.post('/runs/:runId/handoff', controller.handoffRun);
  router.post('/runs/:runId/verification-results', controller.createVerificationResult);
  router.get('/approvals', controller.approvals);
  router.post('/approvals', validateBody(approvalSchema), controller.upsertApproval);
  router.post('/approvals/:approvalId/approve', controller.approve);
  router.post('/approvals/:approvalId/reject', controller.reject);
  router.get('/artifacts', controller.artifacts);
  router.post('/artifacts', validateBody(artifactSchema), controller.upsertArtifact);
  router.get('/runtime-evidence', controller.runtimeEvidence);
  router.post('/runtime-evidence', controller.createRuntimeEvidence);
  router.post('/artifacts/pull-request', controller.createPullRequestArtifact);
  router.post('/artifacts/preview', controller.createPreviewArtifact);
  router.get('/github/delivery-links', controller.githubDeliveryLinks);
  router.post('/github/delivery-links', controller.createGitHubDeliveryLink);
  router.post('/github/delivery-links/:linkId/pull-request', controller.attachGitHubPullRequest);
  router.post('/github/delivery-links/:linkId/previews', controller.attachGitHubPreview);
  router.post('/github/delivery-links/:linkId/checks', controller.syncGitHubChecks);
  router.post('/github/delivery-links/:linkId/reviews', controller.syncGitHubReviews);
  router.post('/github/delivery-links/:linkId/issue', controller.linkGitHubIssue);
  router.get('/work-signals', controller.workSignals);
  router.post('/work-signals', validateBody(workSignalSchema), controller.upsertWorkSignal);
  router.patch('/work-signals/:signalId/status', controller.resolveWorkSignal);
  router.get('/memory', controller.memory);
  router.get('/memory/search', controller.memorySearch);
  router.post('/memory/candidates', validateBody(memoryCandidateSchema), controller.upsertMemoryCandidate);
  router.post('/memory/candidates/:candidateId/review', controller.reviewMemoryCandidate);
  router.post('/memory/items', controller.upsertMemoryItem);
  router.get('/instructions', controller.instructions);
  router.post('/instructions', validateBody(instructionBundleSchema), controller.upsertInstructionBundle);
  router.post('/instructions/compile', controller.compileInstructionBundle);
  router.get('/policies', controller.policies);
  router.post('/policies', controller.upsertPolicy);
  router.post('/policies/decisions', controller.upsertPolicyDecision);
  router.get('/work-locks', controller.workLocks);
  router.post('/work-locks', validateBody(workLockSchema), controller.upsertWorkLock);
  router.post('/work-locks/acquire', controller.acquireWorkLock);
  router.delete('/work-locks/:lockId', controller.releaseWorkLock);
  router.get('/events', controller.events);
  router.post('/events', validateBody(runEventSchema), controller.appendEvent);
  router.get('/outbox', controller.outbox);
  router.get('/oss', controller.oss);
  router.get('/oss/components/:componentId', controller.ossComponent);
  router.post('/oss/components', controller.upsertOssComponent);
  router.get('/workflows', controller.workflows);

  return router;
}
