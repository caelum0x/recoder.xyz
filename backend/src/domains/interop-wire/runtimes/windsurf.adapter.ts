/**
 * Windsurf runtime connector descriptor. Registered as a `kind:'runtime'` A2A
 * dispatch target (Windsurf Cascade agent surface).
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const windsurfRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'windsurf',
  displayName: 'Windsurf',
  capabilities: ['code.edit', 'code.plan', 'editor.native'],
  url: 'https://windsurf.com',
};
