/**
 * SECURITY: `social_list_bindings` must derive its owner from the host-authorized
 * {@link McpToolCaller}, NOT from free-form `args`. A chat binding
 * (`chat_ref → space/agent`) is tenant-owned data keyed by `user_id`, so a
 * non-privileged caller naming a victim's `args.userId` must be REJECTED
 * (cross-tenant binding disclosure) — the victim id must NEVER reach the
 * repository (data seam). These tests pin that binding. The connector + channel
 * tools expose only global, non-tenant data and stay caller-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { buildSocialMcpTools, type SocialEngineDeps } from '../mcp/social-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { SocialConfig } from '../config.js';

/** A fake repository that records every `user_id` reaching the bindings seam. */
function fakeDeps(): { deps: SocialEngineDeps; seen: string[] } {
  const seen: string[] = [];
  const repository = {
    async listBindings(userId: string) {
      seen.push(userId);
      return [];
    },
    async listConnectors() {
      return [];
    },
  } as unknown as SocialRepository;
  const channels = {
    async statuses() {
      return [];
    },
  } as unknown as ChannelAdapterRegistry;
  const config = { channels: {} } as unknown as SocialConfig;
  return { deps: { repository, channels, config }, seen };
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller = (over: Partial<McpToolCaller>): McpToolCaller => ({ userId: 'u1', ...over });

describe('social MCP tools — caller-bound binding owner', () => {
  it('rejects a foreign args.userId for a non-privileged caller (no victim id at the seam)', async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    // ATTACK: caller u1 asks for victim's chat bindings via args.userId.
    await expect(
      list.handler({ userId: 'victim' }, caller({ userId: 'u1' })),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    // The repository was NEVER queried for the victim owner.
    expect(seen).toHaveLength(0);
  });

  it("defaults to the caller's own userId when no owner is named", async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    await list.handler({}, caller({ userId: 'u1' }));
    expect(seen).toEqual(['u1']);
  });

  it('allows a caller to name its OWN userId', async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    await list.handler({ userId: 'u1' }, caller({ userId: 'u1' }));
    expect(seen).toEqual(['u1']);
  });

  it('lets a privileged (admin) caller name an arbitrary owner on behalf of a tenant', async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    await list.handler({ userId: 'victim' }, caller({ userId: 'svc', scopes: ['admin'] }));
    expect(seen).toEqual(['victim']);
  });

  it('lets an internal-scoped caller name an arbitrary owner', async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    await list.handler({ userId: 'victim' }, caller({ userId: 'svc', scopes: ['internal'] }));
    expect(seen).toEqual(['victim']);
  });

  it('refuses when there is no authorized caller (never guesses an identity)', async () => {
    const { deps, seen } = fakeDeps();
    const list = tool(buildSocialMcpTools(deps), 'social_list_bindings');
    await expect(list.handler({ userId: 'u1' }, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(seen).toHaveLength(0);
  });

  it('leaves the global connector + channel-health tools caller-agnostic', async () => {
    const { deps } = fakeDeps();
    const tools = buildSocialMcpTools(deps);
    // No caller supplied: global reads must still succeed (non-tenant data).
    await expect(tool(tools, 'social_list_connectors').handler({})).resolves.toMatchObject({
      count: 0,
    });
    await expect(tool(tools, 'social_channel_health').handler({})).resolves.toMatchObject({
      channels: [],
    });
  });
});
