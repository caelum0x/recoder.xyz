import { Router, type NextFunction, type Request, type Response } from 'express';
import { markOutboxFailed, markOutboxPublished } from '@recoder/agent-events';
import { agentOsContainer } from '../service-container';

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

  router.post('/outbox/drain', (req, res) => {
    const limit = readPositiveInteger(req.body?.limit, 100);
    const now = typeof req.body?.now === 'string' ? req.body.now : new Date().toISOString();
    const markAsFailed = req.body?.status === 'failed' || req.body?.fail === true;
    const failureReason = typeof req.body?.error === 'string' ? req.body.error : 'outbox drain failed by request';
    const pending = agentOsContainer.repository
      .listOutbox()
      .filter((record) => record.status === 'pending')
      .slice(0, limit);

    const records = pending.map((record) => {
      const updated = markAsFailed
        ? markOutboxFailed(record, failureReason, now)
        : markOutboxPublished(record, now);
      return agentOsContainer.repository.upsertOutbox(updated);
    });

    res.json({
      success: true,
      data: {
        status: 'drained',
        operation: 'outbox.drain',
        processed: records.length,
        remainingPending: agentOsContainer.repository.listOutbox().filter((record) => record.status === 'pending').length,
        records,
      },
    });
  });

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
