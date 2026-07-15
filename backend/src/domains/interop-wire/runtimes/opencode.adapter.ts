/**
 * opencode runtime connector descriptor. Mirrors the `opencode` adapter in
 * `@recoder/agent-runtimes`; registered as a `kind:'runtime'` A2A dispatch target.
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const opencodeRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'opencode',
  displayName: 'opencode',
  capabilities: ['code.edit', 'code.plan', 'tools.shell'],
  url: 'https://opencode.ai',
};
