/**
 * Replit Agent runtime connector descriptor. Registered as a `kind:'runtime'` A2A
 * dispatch target (Replit cloud agent surface).
 */
import type { RuntimeConnectorDescriptor } from './runtime-connector.js';

export const replitRuntimeConnector: RuntimeConnectorDescriptor = {
  runtimeId: 'replit',
  displayName: 'Replit Agent',
  capabilities: ['code.edit', 'code.plan', 'cloud.deploy'],
  url: 'https://replit.com',
};
