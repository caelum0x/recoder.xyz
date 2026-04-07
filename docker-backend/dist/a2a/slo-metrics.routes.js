"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2aSloMetricsRouter = void 0;
const express_1 = require("express");
const slo_metrics_1 = require("./slo-metrics");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const a2a_1 = require("@recoder/shared/a2a");
exports.a2aSloMetricsRouter = (0, express_1.Router)();
exports.a2aSloMetricsRouter.get('/metrics', (_req, res) => {
    const summary = (0, slo_metrics_1.getA2ASloMetrics)().getSummary();
    // Compute cost/token/retry/queue metrics from the task store
    const taskService = (0, task_lifecycle_service_1.getTaskLifecycleService)();
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
        if (task.state === a2a_1.TaskStateEnum.Submitted) {
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
exports.a2aSloMetricsRouter.get('/metrics/prometheus', (_req, res) => {
    const text = (0, slo_metrics_1.getA2ASloMetrics)().getPrometheusFormat();
    res.status(200);
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(text);
});
exports.a2aSloMetricsRouter.get('/adapters', (_req, res) => {
    const adapterMetrics = (0, slo_metrics_1.getA2ASloMetrics)().getAdapterMetrics();
    res.status(200).json({
        success: true,
        data: adapterMetrics,
    });
});
