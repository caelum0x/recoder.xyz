/**
 * Claude Code runtime connector descriptor. Mirrors the `claude_code` adapter in
 * `@recoder/agent-runtimes`; registered as a `kind:'runtime'` A2A dispatch target.
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const claudeRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'claude_code',
  displayName: 'Claude Code',
  capabilities: ['code.edit', 'code.plan', 'tools.mcp', 'tasks/resubscribe'],
  url: 'https://claude.com/claude-code',
};
