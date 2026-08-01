/**
 * BE-6.3 — the OSS-components READ tools (`oss_components_list`, `oss_component_get`)
 * expose the deployment-level OSS registry mirror so agents can DISCOVER which OSS
 * engines the deployment binds. The registry is NOT tenant-owned (no `spaceId`), so
 * these tools are deliberately deployment-wide — but they MUST stay fail-closed on
 * identity: no authorized caller ⇒ `AUTH_REQUIRED`, and a missing `componentId` ⇒
 * `VALIDATION_ERROR`. These tests pin that posture plus the read semantics.
 */
import { describe, it, expect } from 'vitest';
import { buildOssComponentsMcpTools } from '../mcp/oss-components-engine.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { RecoderComponentDescriptor } from '@recoder/oss-registry';

function component(id: string, name: string): RecoderComponentDescriptor {
  return {
    id,
    name,
    origin: 'vendored-oss',
    location: { path: `engines/${id}` },
    contract: 'McpServer',
    healthCheck: { command: `${id} --health` },
    security: {
      requiresAuth: true,
      handlesSecrets: false,
      canExecuteCode: false,
      canTouchProduction: false,
    },
    status: 'active',
  };
}

function repo(components: RecoderComponentDescriptor[] = []): InMemoryAgentOsRepository {
  return new InMemoryAgentOsRepository({ ossComponents: components });
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller: McpToolCaller = { userId: 'user-a' };

describe('oss-components MCP read tools', () => {
  it('registers exactly the two read-only tools', () => {
    const tools = buildOssComponentsMcpTools(repo());
    expect(tools.map((t) => t.name).sort()).toEqual(['oss_component_get', 'oss_components_list']);
  });

  it('list returns every bound OSS component for an authorized caller', async () => {
    const tools = buildOssComponentsMcpTools(
      repo([component('beads', 'Beads'), component('mem0', 'Mem0')]),
    );
    const result = (await tool(tools, 'oss_components_list').handler({}, caller)) as
      RecoderComponentDescriptor[];
    expect(result.map((c) => c.id).sort()).toEqual(['beads', 'mem0']);
  });

  it('get returns the matching component by id', async () => {
    const tools = buildOssComponentsMcpTools(repo([component('beads', 'Beads')]));
    const result = (await tool(tools, 'oss_component_get').handler(
      { componentId: 'beads' },
      caller,
    )) as RecoderComponentDescriptor | null;
    expect(result?.name).toBe('Beads');
  });

  it('get returns null for an unknown component id (honest miss, no throw)', async () => {
    const tools = buildOssComponentsMcpTools(repo([component('beads', 'Beads')]));
    const result = await tool(tools, 'oss_component_get').handler({ componentId: 'nope' }, caller);
    expect(result).toBeNull();
  });

  it('list refuses (AUTH_REQUIRED) when no caller identity is threaded', async () => {
    const tools = buildOssComponentsMcpTools(repo([component('beads', 'Beads')]));
    await expect(tool(tools, 'oss_components_list').handler({}, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('get refuses (AUTH_REQUIRED) when no caller identity is threaded', async () => {
    const tools = buildOssComponentsMcpTools(repo([component('beads', 'Beads')]));
    await expect(
      tool(tools, 'oss_component_get').handler({ componentId: 'beads' }, undefined),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('get refuses (VALIDATION_ERROR) when componentId is missing/blank', async () => {
    const tools = buildOssComponentsMcpTools(repo([component('beads', 'Beads')]));
    await expect(
      tool(tools, 'oss_component_get').handler({ componentId: '   ' }, caller),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(tool(tools, 'oss_component_get').handler({}, caller)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
