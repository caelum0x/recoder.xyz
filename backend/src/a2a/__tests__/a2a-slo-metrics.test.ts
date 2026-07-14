import { beforeEach, describe, expect, it } from 'vitest';
import { a2aSloMetricsRouter } from '../slo-metrics.routes';
import { getA2ASloMetrics, resetA2ASloMetrics } from '../slo-metrics';

function makeRes() {
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonData: null as any,
    body: '' as string,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
    send(content: string) {
      state.body = content;
      return res;
    },
  };

  return { res, state };
}

async function run(path: string, method: 'get', req: any, res: any) {
  const layer = (a2aSloMetricsRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`missing route ${method.toUpperCase()} ${path}`);
  await layer.route.stack[0].handle(req, res);
}

describe('A2A SLO metrics', () => {
  beforeEach(() => {
    resetA2ASloMetrics();
  });

  it('aggregates connector + approval metrics', () => {
    const metrics = getA2ASloMetrics();
    metrics.recordConnectorExecution({ connectorId: 'codex', success: true, durationMs: 100 });
    metrics.recordConnectorExecution({ connectorId: 'codex', success: true, durationMs: 200 });
    metrics.recordConnectorExecution({ connectorId: 'claude', success: false, durationMs: 300 });
    metrics.recordConnectorExecution({ connectorId: 'claude', success: true, durationMs: 400 });
    metrics.recordConnectorRestart();
    metrics.recordConnectorRestart();
    metrics.recordCircuitOpen();
    metrics.recordApprovalTurnaround(1000);
    metrics.recordApprovalTurnaround(3000);

    const summary = metrics.getSummary();
    expect(summary.connectors.executionsTotal).toBe(4);
    expect(summary.connectors.successes).toBe(3);
    expect(summary.connectors.failures).toBe(1);
    expect(summary.connectors.successRate).toBe(0.75);
    expect(summary.connectors.latencyMs.p50).toBe(200);
    expect(summary.connectors.latencyMs.p95).toBe(400);
    expect(summary.connectors.restartsTotal).toBe(2);
    expect(summary.connectors.retryRate).toBe(0.5);
    expect(summary.connectors.circuitOpenTotal).toBe(1);
    expect(summary.approvals.turnaroundCount).toBe(2);
    expect(summary.approvals.turnaroundMs.p50).toBe(1000);
    expect(summary.approvals.turnaroundMs.p95).toBe(3000);
  });

  it('serves json and prometheus routes', async () => {
    const metrics = getA2ASloMetrics();
    metrics.recordConnectorExecution({ connectorId: 'codex', success: true, durationMs: 123 });
    metrics.recordApprovalTurnaround(456);

    const jsonRes = makeRes();
    await run('/metrics', 'get', {}, jsonRes.res);
    expect(jsonRes.state.statusCode).toBe(200);
    expect(jsonRes.state.jsonData.success).toBe(true);
    expect(jsonRes.state.jsonData.data.connectors.executionsTotal).toBe(1);

    const promRes = makeRes();
    await run('/metrics/prometheus', 'get', {}, promRes.res);
    expect(promRes.state.statusCode).toBe(200);
    expect(promRes.state.headers['content-type']).toContain('text/plain');
    expect(promRes.state.body).toContain('recoder_a2a_connector_executions_total');
    expect(promRes.state.body).toContain('recoder_a2a_approval_turnaround_p95_ms');
  });
});

