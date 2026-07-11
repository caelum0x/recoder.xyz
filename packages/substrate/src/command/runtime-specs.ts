/**
 * RUNTIME_SPECS — the real headless invocation per coding-agent CLI.
 *
 * Promoted VERBATIM from docker-backend/src/conductor/runtime-commands.ts. These
 * are production invocations of the actual installed agent CLIs (no stubs):
 * Claude Code, Codex, opencode, Recoder Code, pi, Gemini CLI, Qwen Code, crush.
 *
 * Each runs non-interactively so it executes the task and exits, which the
 * runtime driver detects (tmux session ends / sandbox exit marker) to mark the
 * run complete. Permission/auto-approve flags are set so the agent can edit files
 * in its isolated worktree without prompting; isolation comes from the
 * per-workspace git worktree, not from refusing edits.
 */
import type { ConductorRuntimeId } from '../types/runtime-id.js';
import type { RuntimeSpec } from '../types/command.js';
import { shellQuote } from './shell-quote.js';
import { modelFlag } from './model-flag.js';
import { extraArgs } from './extra-args.js';

export const RUNTIME_SPECS: Record<ConductorRuntimeId, RuntimeSpec> = {
  claude_code: {
    bin: 'claude',
    build: (o) =>
      `claude -p ${shellQuote(o.prompt)} --permission-mode acceptEdits${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  codex: {
    // `codex exec` defaults to a read-only sandbox, which blocks the agent from
    // writing files even inside its own worktree. `--sandbox workspace-write`
    // allows edits under the cwd (the isolated worktree) while staying sandboxed.
    bin: 'codex',
    build: (o) =>
      `codex exec ${shellQuote(o.prompt)} --sandbox workspace-write${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  opencode: {
    bin: 'opencode',
    build: (o) => `opencode run ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  recoder_code: {
    bin: 'recoder-code',
    build: (o) => `recoder-code --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  pi: {
    // pi is the Recoder-owned coding-agent (@recoder/pi-coding-agent). `--print`
    // runs it HEADLESSLY (execute the task and exit) instead of opening the
    // interactive TUI — required so the tmux run ends and the tailer can detect
    // completion. `-ne` skips extensions for a clean non-interactive run.
    bin: 'pi',
    build: (o) =>
      `pi --print ${shellQuote(o.prompt)} -ne${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  gemini_cli: {
    bin: 'gemini',
    build: (o) => `gemini --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  qwen_code: {
    bin: 'qwen',
    build: (o) => `qwen --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
  crush: {
    // crush is the Charm coding agent; runs in print mode (-p).
    bin: 'crush',
    build: (o) => `crush -p ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${extraArgs(o)}`,
  },
};
