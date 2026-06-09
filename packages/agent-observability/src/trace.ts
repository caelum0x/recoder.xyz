export type AgentTraceSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  taskId?: string;
  runId?: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, string | number | boolean>;
};

export function createTraceSpan(input: Omit<AgentTraceSpan, 'startedAt'> & { startedAt?: string }): AgentTraceSpan {
  return {
    ...input,
    startedAt: input.startedAt ?? new Date().toISOString(),
  };
}
