import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

const DANGEROUS_COMMAND_PATTERNS = [
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bcurl\b.*\|\s*(bash|sh)\b/,
  /\bwget\b.*\|\s*(bash|sh)\b/,
  /\bchmod\s+777\b/,
  /\bkillall\b/,
] as const;

const DESTRUCTIVE_RM_REASON = 'destructive recursive rm on a dangerous target';

export function evaluateCommandRisk(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'command.run' || !input.target.command) {
    return null;
  }

  const command = input.target.command;

  if (isDestructiveRm(command)) {
    return decision(
      input,
      'needs_approval',
      `Command matches high-risk pattern and requires approval: ${DESTRUCTIVE_RM_REASON}`,
    );
  }

  const matched = DANGEROUS_COMMAND_PATTERNS.find((pattern) => pattern.test(command));
  if (!matched) {
    return null;
  }

  return decision(
    input,
    'needs_approval',
    `Command matches high-risk pattern and requires approval: ${matched.source}`,
  );
}

/**
 * Detect a destructive recursive+force `rm` against a dangerous target. Parses
 * flags rather than matching a single literal so it is robust to flag reordering
 * (`-rf`/`-fr`/`-Rf`), long-form flags (`--recursive`/`--force`),
 * `--no-preserve-root`, and dangerous targets (`/`, `~`, `*`).
 */
function isDestructiveRm(command: string): boolean {
  // Consider each `rm` invocation up to the next shell separator so a compound
  // command like `rm -rf / && echo done` is still inspected.
  const rmInvocation = /\brm\b([^\n;|&]*)/g;
  let match: RegExpExecArray | null;
  while ((match = rmInvocation.exec(command)) !== null) {
    const tokens = match[1].trim().split(/\s+/).filter(Boolean);
    let recursive = false;
    let force = false;
    const targets: string[] = [];

    for (const token of tokens) {
      if (token === '--recursive') {
        recursive = true;
      } else if (token === '--force') {
        force = true;
      } else if (/^--/.test(token)) {
        // Other long-form flags (e.g. --no-preserve-root) are not targets.
        continue;
      } else if (/^-[a-zA-Z]+$/.test(token)) {
        // Short flag cluster, e.g. -rf, -fr, -Rf.
        if (/[rR]/.test(token)) recursive = true;
        if (/f/.test(token)) force = true;
      } else {
        targets.push(token);
      }
    }

    if (recursive && force && targets.some(isDangerousTarget)) {
      return true;
    }
  }
  return false;
}

function isDangerousTarget(target: string): boolean {
  return target.startsWith('/') || target.startsWith('~') || target.startsWith('*');
}
