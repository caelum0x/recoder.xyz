import type { NormalizedToolCall, NormalizedToolResult } from '../../types/tool-call';

export type PairedToolCall = {
  call: NormalizedToolCall;
  result?: NormalizedToolResult;
};

/**
 * Pair tool-call frames with their results across a stream so downstream consumers see
 * complete call/result spans. Immutable observers return new trackers; lookups are O(1).
 */
export class ToolCallTracker {
  private constructor(private readonly calls: ReadonlyMap<string, PairedToolCall>) {}

  static empty(): ToolCallTracker {
    return new ToolCallTracker(new Map());
  }

  observeCall(call: NormalizedToolCall): ToolCallTracker {
    const next = new Map(this.calls);
    next.set(call.toolCallId, { call });
    return new ToolCallTracker(next);
  }

  observeResult(result: NormalizedToolResult): ToolCallTracker {
    const existing = this.calls.get(result.toolCallId);
    const next = new Map(this.calls);
    next.set(result.toolCallId, {
      call: existing?.call ?? syntheticCall(result),
      result,
    });
    return new ToolCallTracker(next);
  }

  get(toolCallId: string): PairedToolCall | undefined {
    return this.calls.get(toolCallId);
  }

  /** Calls that have no result yet (unresolved at terminal state). */
  unresolved(): readonly PairedToolCall[] {
    return [...this.calls.values()].filter((entry) => entry.result === undefined);
  }

  all(): readonly PairedToolCall[] {
    return [...this.calls.values()];
  }
}

function syntheticCall(result: NormalizedToolResult): NormalizedToolCall {
  return { toolCallId: result.toolCallId, toolName: result.toolName, modes: [] };
}
