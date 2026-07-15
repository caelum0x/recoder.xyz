/**
 * Cursor runtime connector descriptor. Registered as a `kind:'runtime'` A2A
 * dispatch target (Cursor Agent / CLI surface).
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const cursorRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'cursor',
  displayName: 'Cursor',
  capabilities: ['code.edit', 'code.plan', 'editor.native'],
  url: 'https://cursor.com',
};
