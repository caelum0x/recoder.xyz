import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSecureWorkspaceSecrets } from './workspace-secrets';

describe('createSecureWorkspaceSecrets', () => {
  beforeEach(() => {
    delete process.env.VAULT_MASTER_KEY;
  });

  it('throws in production when VAULT_MASTER_KEY is missing', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(() => createSecureWorkspaceSecrets('workspace-prod-missing-key')).toThrow(
      'VAULT_MASTER_KEY is required in production for secure workspace secrets'
    );

    process.env.NODE_ENV = prevNodeEnv;
  });

  it('falls back to noop vault in development when VAULT_MASTER_KEY is missing', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const secrets = createSecureWorkspaceSecrets('workspace-dev-noop');
    await secrets.setSecret('API_KEY', 'dev-secret');
    const value = await secrets.getSecret('API_KEY');

    expect(value).toBe('dev-secret');
    process.env.NODE_ENV = prevNodeEnv;
  });
});
