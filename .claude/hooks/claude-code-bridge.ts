/**
 * Bridges Recoder's internal Agent OS hook evaluators to Claude Code's hook-output
 * schema.
 *
 * The evaluators in packages/agent-hooks return an AgentHookDecision shaped like
 * `{ decision: 'allow' | 'block' | 'needs_approval', reason, memoryCandidates, ... }`.
 * Claude Code's hook protocol only accepts `decision: 'approve' | 'block'` (or no
 * output to allow), so emitting the raw internal shape is rejected with
 * "Hook JSON output validation failed — Invalid input" (notably on the Stop event).
 *
 * This translates the internal decision into valid Claude Code output:
 *   - block            -> { "decision": "block", "reason": ... }
 *   - needs_approval   -> PreToolUse ask (only meaningful pre-tool); else allow
 *   - allow            -> no output (Claude Code treats empty stdout + exit 0 as allow)
 *
 * A hook must never crash the session, so any failure degrades to "allow" (no output).
 */
import {
  evaluatePreToolUse,
  evaluatePostToolUse,
  evaluateStop,
  evaluateSubagentStop,
  evaluateBeforeCompact,
} from '../../packages/agent-hooks/src/index.ts';

type HookKind =
  | 'pre-tool-use'
  | 'post-tool-use'
  | 'stop'
  | 'subagent-stop'
  | 'before-compact';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

export async function emitClaudeCodeHook(kind: HookKind): Promise<void> {
  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};

    const decision =
      kind === 'pre-tool-use'
        ? evaluatePreToolUse(input)
        : kind === 'post-tool-use'
          ? evaluatePostToolUse(input)
          : kind === 'stop'
            ? evaluateStop(input)
            : kind === 'subagent-stop'
              ? evaluateSubagentStop(input)
              : evaluateBeforeCompact(input);

    if (decision.decision === 'block') {
      process.stdout.write(`${JSON.stringify({ decision: 'block', reason: decision.reason })}\n`);
    } else if (decision.decision === 'needs_approval' && kind === 'pre-tool-use') {
      process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: decision.reason,
        },
      })}\n`);
    }
    // 'allow' (and non-pre-tool 'needs_approval') -> emit nothing = allow.
    process.exitCode = 0;
  } catch {
    // Never block the session on a hook failure.
    process.exitCode = 0;
  }
}
