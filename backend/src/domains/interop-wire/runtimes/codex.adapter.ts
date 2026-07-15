/**
 * OpenAI Codex CLI runtime connector descriptor. Mirrors the `codex` adapter in
 * `@recoder/agent-runtimes`; registered as a `kind:'runtime'` A2A dispatch target.
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const codexRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'codex',
  displayName: 'Codex',
  capabilities: ['code.edit', 'code.review', 'tools.shell'],
  url: 'https://openai.com/codex',
};
