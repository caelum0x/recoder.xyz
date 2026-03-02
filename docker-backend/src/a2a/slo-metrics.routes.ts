import { Router, type Request, type Response } from 'express';
import { getA2ASloMetrics } from './slo-metrics';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { TaskStateEnum } from '@recoder/shared/a2a';

export const a2aSloMetricsRouter = Router();

a2aSloMetricsRouter.get('/metrics', (_req: Request, res: Response) => {
  const summary = getA2ASloMetrics().getSummary();

  // Compute cost/token/retry/queue metrics from the task store
  const taskService = getTaskLifecycleService();
  const allTasks = taskService.listTasks({ limit: 10_000 });
  const tasks = allTasks.ok ? allTasks.data : [];

  let totalTokensUsed = 0;
  let totalEstimatedCostUsd = 0;
  let totalRetries = 0;
  let completedWithTokens = 0;
  let queueDepth = 0;

  for (const task of tasks) {
    if (task.tokensUsed != null && task.tokensUsed > 0) {
      totalTokensUsed += task.tokensUsed;
      completedWithTokens++;
    }
    if (task.estimatedCostUsd != null) {
      totalEstimatedCostUsd += task.estimatedCostUsd;
    }
    if (task.retryCount != null) {
      totalRetries += task.retryCount;
    }
    // Also count retry metadata from retried tasks
    const metaRetryCount = task.metadata?.retryCount;
    if (typeof metaRetryCount === 'number' && task.retryCount == null) {
      totalRetries += metaRetryCount;
    }
    if (task.state === TaskStateEnum.Submitted) {
      queueDepth++;
    }
  }

  const averageTokensPerTask = completedWithTokens > 0
    ? Math.round(totalTokensUsed / completedWithTokens)
    : 0;

  res.status(200).json({
    success: true,
    data: {
      ...summary,
      totalTokensUsed,
      totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 100) / 100,
      averageTokensPerTask,
      totalRetries,
      queueDepth,
    },
  });
});

a2aSloMetricsRouter.get('/metrics/prometheus', (_req: Request, res: Response) => {
  const text = getA2ASloMetrics().getPrometheusFormat();
  res.status(200);
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(text);
});

a2aSloMetricsRouter.get('/adapters', (_req: Request, res: Response) => {
  const adapterMetrics = getA2ASloMetrics().getAdapterMetrics();
  res.status(200).json({
    success: true,
    data: adapterMetrics,
  });
});

