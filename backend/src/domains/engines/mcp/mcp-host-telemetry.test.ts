/**
 * BE-7.3 — the gated MCP host telemetry seam. When bootstrap late-binds the
 * frozen MetricsPort (+ TracerPort) via `InteropHostBundle.setTelemetry`, EVERY
 * `host.call()` — the ONE `authorize → risk → execute → audit` chokepoint —
 * records the RED pair (`mcp_tool_calls_total{server,tool,status}` +
 * `mcp_tool_call_duration_seconds`) and opens a child span with server/tool/
 * status attributes (`recordError` on any non-completed outcome).
 *
 * Truthfulness laws under test:
 *  - unwired telemetry ⇒ the call path is untouched (no fabricated series),
 *  - a metrics/tracer fault NEVER alters a call outcome,
 *  - a failed execution is recorded as `status:'failed'` — never masked green.
 */
import { describe, it, expect } from 'vitest';
import { McpToolRouter, notifyMcpServer } from '@recoder/agent-mcp';
import { InteropHostBundle } from './mcp-host.js';
import type {
  McpServerRegistration,
  McpToolCallInput,
} from '../ports/mcp-host.port.js';
import type {
  MetricLabels,
  MetricsPort,
} from '../../observability/ports/metrics.port.js';
import type { Span, TracerPort } from '../../observability/ports/tracer.port.js';

/** A recorded counter increment / histogram observation. */
interface Recorded {
  readonly kind: 'inc' | 'observe';
  readonly name: string;
  readonly labels?: MetricLabels;
  readonly value?: number;
}

/** A FAKE frozen MetricsPort recording counter incs + histogram observations. */
function fakeMetrics(): { recorded: Recorded[]; port: MetricsPort } {
  const recorded: Recorded[] = [];
  const port: MetricsPort = {
    counter: spec => ({
      inc: (labels?: MetricLabels, value?: number) =>
        void recorded.push({
          kind: 'inc',
          name: spec.name,
          ...(labels ? { labels } : {}),
          ...(value !== undefined ? { value } : {}),
        }),
    }),
    gauge: () => ({ set: () => {}, inc: () => {}, dec: () => {} }),
    histogram: spec => ({
      observe: (labels: MetricLabels | undefined, value: number) =>
        void recorded.push({
          kind: 'observe',
          name: spec.name,
          ...(labels ? { labels } : {}),
          value,
        }),
    }),
    startTimer: () => ({ stop: () => 0 }),
  };
  return { recorded, port };
}

/** One captured span (attributes + error + end state). */
interface CapturedSpan {
  readonly name: string;
  readonly attributes: Record<string, string | number | boolean>;
  errors: string[];
  ended: boolean;
}

/** A FAKE TracerPort capturing every opened span. */
function fakeTracer(): { spans: CapturedSpan[]; port: TracerPort } {
  const spans: CapturedSpan[] = [];
  const open = (name: string, attributes: Record<string, string | number | boolean>): Span => {
    const captured: CapturedSpan = { name, attributes: { ...attributes }, errors: [], ended: false };
    spans.push(captured);
    return {
      traceId: 'trace_test',
      spanId: `span_${spans.length}`,
      setAttribute: (key, value) => {
        captured.attributes[key] = value;
      },
      recordError: reason => {
        captured.errors.push(reason);
      },
      end: () => {
        captured.ended = true;
      },
    };
  };
  const port: TracerPort = {
    startSpan: (name, options) => open(name, { ...(options?.attributes ?? {}) }),
    withSpan: async (name, fn, options) => fn(open(name, { ...(options?.attributes ?? {}) })),
    inject: () => {},
    extract: () => null,
    currentTraceId: () => null,
  };
  return { spans, port };
}

/** A minimal permissive call input (mirrors the sibling host suites). */
function gatedCall(
  server: McpServerRegistration,
  toolName: string,
  args: Record<string, unknown>,
): McpToolCallInput {
  return {
    server,
    toolName,
    actor: { agentId: 'agent_test', permissions: { toolRules: [] } },
    args,
  } as unknown as McpToolCallInput;
}

/** Bind a real handler for `notify.send` (optionally a throwing one). */
function notifyBinder(mode: 'ok' | 'throw'): (router: McpToolRouter) => void {
  return router => {
    router.register(notifyMcpServer, 'notify.send', async () => {
      if (mode === 'throw') throw new Error('webhook down');
      return { content: { sent: true } };
    });
  };
}

describe('engines MCP host — BE-7.3 telemetry at the gated chokepoint', () => {
  it('unwired telemetry: the call path is untouched (no series, no spans)', async () => {
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder('ok')],
      onWiringWarning: () => undefined,
    });

    const outcome = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));
    expect(outcome.status).toBe('completed');
  });

  it('records the RED pair + an ended child span on a completed call', async () => {
    const { recorded, port } = fakeMetrics();
    const { spans, port: tracer } = fakeTracer();
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder('ok')],
      onWiringWarning: () => undefined,
    });
    host.setTelemetry({ metrics: port, tracer });

    const outcome = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));

    expect(outcome.status).toBe('completed');
    const labels = { server: 'recoder.notify', tool: 'notify.send', status: 'completed' };
    expect(recorded).toContainEqual(
      expect.objectContaining({ kind: 'inc', name: 'mcp_tool_calls_total', labels }),
    );
    const duration = recorded.find(
      entry => entry.kind === 'observe' && entry.name === 'mcp_tool_call_duration_seconds',
    );
    expect(duration).toBeDefined();
    expect(duration?.labels).toEqual(labels);
    expect(typeof duration?.value).toBe('number');
    expect(duration!.value!).toBeGreaterThanOrEqual(0);
    // The child span carries server/tool/status attrs, no error, and is ended.
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('mcp.tool_call');
    expect(spans[0]?.attributes).toEqual({
      'mcp.server': 'recoder.notify',
      'mcp.tool': 'notify.send',
      'mcp.status': 'completed',
    });
    expect(spans[0]?.errors).toHaveLength(0);
    expect(spans[0]?.ended).toBe(true);
  });

  it('records status:"failed" + recordError when the executor faults (never masked green)', async () => {
    const { recorded, port } = fakeMetrics();
    const { spans, port: tracer } = fakeTracer();
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder('throw')],
      onWiringWarning: () => undefined,
    });
    host.setTelemetry({ metrics: port, tracer });

    const outcome = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));

    expect(outcome.status).toBe('failed');
    expect(recorded).toContainEqual(
      expect.objectContaining({
        kind: 'inc',
        name: 'mcp_tool_calls_total',
        labels: { server: 'recoder.notify', tool: 'notify.send', status: 'failed' },
      }),
    );
    expect(spans[0]?.attributes['mcp.status']).toBe('failed');
    expect(spans[0]?.errors.join(' ')).toContain('webhook down');
    expect(spans[0]?.ended).toBe(true);
  });

  it('works metrics-only (tracer absent): the RED pair records, no span is required', async () => {
    const { recorded, port } = fakeMetrics();
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder('ok')],
      onWiringWarning: () => undefined,
    });
    host.setTelemetry({ metrics: port });

    const outcome = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));

    expect(outcome.status).toBe('completed');
    expect(recorded.some(entry => entry.name === 'mcp_tool_calls_total')).toBe(true);
  });

  it('degrade-safe: a throwing metrics registry never alters the call outcome', async () => {
    const throwingMetrics: MetricsPort = {
      counter: () => {
        throw new Error('registry exploded');
      },
      gauge: () => ({ set: () => {}, inc: () => {}, dec: () => {} }),
      histogram: () => ({ observe: () => {} }),
      startTimer: () => ({ stop: () => 0 }),
    };
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder('ok')],
      onWiringWarning: () => undefined,
    });
    host.setTelemetry({ metrics: throwingMetrics });

    const outcome = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));
    expect(outcome.status).toBe('completed');
  });
});
