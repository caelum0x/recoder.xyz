import { Router, type NextFunction, type Request, type Response } from 'express';
import { markOutboxFailed } from '@recoder/agent-events';
import { agentOsContainer } from '../service-container';
import { drainAgentOsOutbox } from '../outbox-drain.service';
import { createNatsOutboxPublisher } from '../nats-outbox-publisher';
import { createCodeGraphRouter } from './code-graph.routes';

function requireInternalServiceKey(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.INTERNAL_SERVICE_KEY;
  const provided = req.header('x-internal-service-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!configured || provided !== configured) {
    res.status(403).json({ success: false, error: 'internal service key required' });
    return;
  }
  next();
}

export function createInternalAgentOsRouter(): Router {
  const router = Router();
  router.use(requireInternalServiceKey);

  router.post('/outbox/drain', async (req, res) => {
    const limit = readPositiveInteger(req.body?.limit, 100);
    const now = typeof req.body?.now === 'string' ? req.body.now : new Date().toISOString();
    const markAsFailed = req.body?.status === 'failed' || req.body?.fail === true;
    const failureReason = typeof req.body?.error === 'string' ? req.body.error : 'outbox drain failed by request';

    if (markAsFailed) {
      const pending = (await agentOsContainer.repository.listOutbox())
        .filter((record) => record.status === 'pending')
        .slice(0, limit);

      const records = await Promise.all(pending.map(async (record) => {
        const updated = markOutboxFailed(record, failureReason, now);
        return await agentOsContainer.repository.upsertOutbox(updated);
      }));

      res.json({
        success: true,
        data: {
          status: 'marked_failed',
          operation: 'outbox.drain',
          processed: records.length,
          remainingPending: (await agentOsContainer.repository.listOutbox()).filter((record) => record.status === 'pending').length,
          records,
        },
      });
      return;
    }

    let natsHandle: Awaited<ReturnType<typeof createNatsOutboxPublisher>> | null = null;
    try {
      natsHandle = await createNatsOutboxPublisher();
      const result = await drainAgentOsOutbox(agentOsContainer.repository, natsHandle.publisher, { limit, now });
      res.json({
        success: true,
        data: {
          status: result.failed > 0 ? 'partial_failure' : 'drained',
          ...result,
          processed: result.attempted,
        },
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: error instanceof Error ? error.message : 'outbox drain unavailable',
      });
    } finally {
      await natsHandle?.close().catch(() => undefined);
    }
  });

  // Flag-gated (RECODER_BRAIN_ENABLED) read-only assemble. When the flag is off
  // the BrainService returns null, which we surface as disabled (no-op).
  router.post('/brain/assemble', async (req, res) => {
    const { brain } = agentOsContainer;
    if (!brain.isEnabled()) {
      res.json({ success: true, data: { enabled: false, context: null } });
      return;
    }

    const task = typeof req.body?.task === 'string' ? req.body.task : '';
    const repoRoot = typeof req.body?.repoRoot === 'string' ? req.body.repoRoot : '';
    if (!task || !repoRoot) {
      res.status(400).json({ success: false, error: 'task and repoRoot are required' });
      return;
    }

    const focusFiles = Array.isArray(req.body?.focusFiles)
      ? req.body.focusFiles.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;
    const limit = readPositiveInteger(req.body?.limit, 8);

    const context = await brain.assembleForTask({ task, repoRoot, focusFiles, limit });
    res.json({ success: true, data: { enabled: true, context } });
  });

  // Flag-gated (RECODER_CODE_GRAPH_ENABLED) code-graph index lifecycle. Mounted
  // additively under the same INTERNAL_SERVICE_KEY guard; no-op when the flag is off.
  router.use('/code-graph', createCodeGraphRouter());

  router.post('/runs/tick', (_req, res) => {
    res.json({ success: true, data: { status: 'queued', operation: 'runs.tick' } });
  });

  router.post('/verify', (_req, res) => {
    res.json({ success: true, data: { status: 'queued', operation: 'verify' } });
  });

  router.post('/memory/review', (_req, res) => {
    res.json({ success: true, data: { status: 'queued', operation: 'memory.review' } });
  });

  return router;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return fallback;
}
