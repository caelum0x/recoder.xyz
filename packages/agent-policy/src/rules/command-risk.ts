import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+(\/|\*)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bcurl\b.*\|\s*(bash|sh)\b/,
  /\bwget\b.*\|\s*(bash|sh)\b/,
  /\bchmod\s+777\b/,
  /\bkillall\b/,
] as const;

export function evaluateCommandRisk(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'command.run' || !input.target.command) {
    return null;
  }

  const command = input.target.command;
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
