import { Router } from 'express';
import { AgentOsController } from '../controllers/agent-os.controller';
import { agentOsContainer } from '../service-container';

export function createAgentOsRouter(): Router {
  const router = Router();
  const controller = new AgentOsController(
    agentOsContainer.repository,
    agentOsContainer.workLocks,
    agentOsContainer.repositoryDriver,
  );

  router.get('/health', controller.health);
  router.get('/summary', controller.summary);
  router.get('/agents', controller.agents);
  router.post('/agents', controller.upsertAgent);
  router.post('/agents/reconcile', controller.reconcileAgent);
  router.get('/spaces', controller.spaces);
  router.post('/spaces', controller.upsertSpace);
  router.post('/spaces/:spaceId/repositories/github', controller.connectGitHubRepository);
  router.get('/tasks', controller.tasks);
  router.post('/tasks', controller.upsertTask);
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
  router.post('/approvals', controller.upsertApproval);
  router.post('/approvals/:approvalId/approve', controller.approve);
  router.post('/approvals/:approvalId/reject', controller.reject);
  router.get('/artifacts', controller.artifacts);
  router.post('/artifacts', controller.upsertArtifact);
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
  router.post('/work-signals', controller.upsertWorkSignal);
  router.patch('/work-signals/:signalId/status', controller.resolveWorkSignal);
  router.get('/memory', controller.memory);
  router.get('/memory/search', controller.memorySearch);
  router.post('/memory/candidates', controller.upsertMemoryCandidate);
  router.post('/memory/candidates/:candidateId/review', controller.reviewMemoryCandidate);
  router.post('/memory/items', controller.upsertMemoryItem);
  router.get('/instructions', controller.instructions);
  router.post('/instructions', controller.upsertInstructionBundle);
  router.post('/instructions/compile', controller.compileInstructionBundle);
  router.get('/policies', controller.policies);
  router.post('/policies', controller.upsertPolicy);
  router.post('/policies/decisions', controller.upsertPolicyDecision);
  router.get('/work-locks', controller.workLocks);
  router.post('/work-locks', controller.upsertWorkLock);
  router.post('/work-locks/acquire', controller.acquireWorkLock);
  router.delete('/work-locks/:lockId', controller.releaseWorkLock);
  router.get('/events', controller.events);
  router.post('/events', controller.appendEvent);
  router.get('/outbox', controller.outbox);
  router.get('/oss', controller.oss);
  router.get('/oss/components/:componentId', controller.ossComponent);
  router.post('/oss/components', controller.upsertOssComponent);
  router.get('/workflows', controller.workflows);

  return router;
}
