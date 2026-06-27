import type { DriverFrame } from '../../contracts/driver-frame';
import type { OpenCodeJsonEvent } from './opencode-event-stream';
import { mapOpenCodeEvent } from './opencode-event-stream';
import {
  classifyToolModes,
  type OpenCodeToolPart,
} from './opencode-tool-mapper';

/**
 * ADAPT of `ts/oh-my-openagent/src/create-hooks.ts`.
 *
 * Upstream `createHooks` wires opencode plugin lifecycle hooks (core / continuation / skill)
 * that run INSIDE the opencode process. The runtime cannot register in-process plugin hooks
 * on a child CLI; instead it observes the CLI's JSON event stream and translates the same
 * lifecycle moments into `DriverFrame`s + approval requests. This bridge is the runtime-side
 * analog: a pure, stateless event→frame hook chain.
 *
 * It additionally surfaces a runtime concern the in-process plugin handled implicitly:
 * write-bearing / shell tool calls become `approval` frames when the policy requires a gate,
 * so the engine pauses BEFORE the child writes (the runtime owns the gate, not the agent).
 */
export type OpenCodeHookOptions = {
  /** When true, write/execute tool calls raise an `approval` frame before proceeding. */
  approveBeforeWrite: boolean;
  /** Counter source for deterministic approval ids (injected for tests). */
  nextApprovalId: () => string;
};

export function bridgeOpenCodeEvent(
  event: OpenCodeJsonEvent,
  options: OpenCodeHookOptions,
): DriverFrame[] {
  const frames = mapOpenCodeEvent(event);
  if (!options.approveBeforeWrite) return frames;

  const out: DriverFrame[] = [];
  for (const frame of frames) {
    if (frame.kind === 'tool_call') {
      const modes = frame.toolCall.modes;
      const gated = modes.includes('write') || modes.includes('execute');
      if (gated) {
        out.push(approvalFrameFor(event, options.nextApprovalId(), modes.includes('write')));
      }
    }
    out.push(frame);
  }
  return out;
}

function approvalFrameFor(
  event: OpenCodeJsonEvent,
  approvalId: string,
  isWrite: boolean,
): DriverFrame {
  const part = event.part as OpenCodeToolPart | undefined;
  const toolName = part?.tool;
  const requiredAt = isWrite ? ('before_write' as const) : ('before_execution' as const);
  return {
    kind: 'approval',
    approvalId,
    reason: `opencode requested ${requiredAt.replace('before_', '')} for tool "${toolName ?? 'unknown'}"`,
    requiredAt,
    target: toolName ? { toolName } : undefined,
  };
}

/** Re-export so the descriptor/driver can advertise which tools it gates. */
export { classifyToolModes };
