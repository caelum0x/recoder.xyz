/**
 * SECURITY: the identity MCP tools must derive their target subject from the
 * host-authorized {@link McpToolCaller}, NOT from free-form `args`. These fields
 * (`identity_resolve.userId`, `identity_link.authUserId`/`legacyUsersId`) are NOT
 * edge-bound, so an unbound handler lets any authenticated caller:
 *   - read a VICTIM's unified identity (email / name / legacy CLI linkage), or
 *   - graft an arbitrary legacy CLI `users.id` onto an arbitrary canonical
 *     `user.id` (identity-graph hijack) — the SAME op the HTTP route gates behind
 *     `requireInternal`.
 * These tests pin the caller-bound resolution and prove the victim id never
 * reaches the `resolveIdentity` / `linkLegacyUser` data seam.
 */
import { describe, it, expect } from 'vitest';
import { buildIdentityMcpTools } from './identity-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { IdentityModule } from '../index.js';
import type { IdentityReadModel } from '../repositories/identity.repository.js';
import type { Identity } from '../types.js';

/** A fake read model that records which id each seam was asked about. */
function fakeModule(): {
  module: IdentityModule;
  resolved: string[];
  linked: Array<{ authUserId: string; legacyUsersId: string }>;
} {
  const resolved: string[] = [];
  const linked: Array<{ authUserId: string; legacyUsersId: string }> = [];
  const identity: Identity = {
    userId: 'u1',
    email: 'u1@example.com',
    emailVerified: true,
    createdAt: new Date(0),
  };
  const repo: Pick<IdentityReadModel, 'isAvailable' | 'resolveIdentity' | 'linkLegacyUser'> = {
    isAvailable: () => true,
    async resolveIdentity(id: string): Promise<Identity | null> {
      resolved.push(id);
      return identity;
    },
    async linkLegacyUser(authUserId: string, legacyUsersId: string): Promise<Identity | null> {
      linked.push({ authUserId, legacyUsersId });
      return identity;
    },
  };
  const module = {
    identityRepository: () => repo as IdentityReadModel,
  } as unknown as IdentityModule;
  return { module, resolved, linked };
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller = (over: Partial<McpToolCaller>): McpToolCaller => ({ userId: 'u1', ...over });

describe('identity MCP tools — caller-bound subject resolution', () => {
  describe('identity_resolve', () => {
    it('rejects a foreign args.userId; the victim id never reaches resolveIdentity', async () => {
      const { module, resolved } = fakeModule();
      const resolve = tool(buildIdentityMcpTools(module), 'identity_resolve');
      await expect(
        resolve.handler({ userId: 'victim-user' }, caller({ userId: 'u1' })),
      ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
      expect(resolved).toHaveLength(0);
    });

    it("defaults to the caller's own id when no id is named", async () => {
      const { module, resolved } = fakeModule();
      const resolve = tool(buildIdentityMcpTools(module), 'identity_resolve');
      await resolve.handler({}, caller({ userId: 'u1' }));
      expect(resolved).toEqual(['u1']);
    });

    it('allows a caller to resolve its OWN named id', async () => {
      const { module, resolved } = fakeModule();
      const resolve = tool(buildIdentityMcpTools(module), 'identity_resolve');
      await resolve.handler({ userId: 'u1' }, caller({ userId: 'u1' }));
      expect(resolved).toEqual(['u1']);
    });

    it('lets a privileged (admin) caller resolve an arbitrary id', async () => {
      const { module, resolved } = fakeModule();
      const resolve = tool(buildIdentityMcpTools(module), 'identity_resolve');
      await resolve.handler({ userId: 'victim-user' }, caller({ userId: 'svc', scopes: ['admin'] }));
      expect(resolved).toEqual(['victim-user']);
    });

    it('refuses when there is no authorized caller (never guesses an identity)', async () => {
      const { module, resolved } = fakeModule();
      const resolve = tool(buildIdentityMcpTools(module), 'identity_resolve');
      await expect(resolve.handler({ userId: 'u1' }, undefined)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
      expect(resolved).toHaveLength(0);
    });
  });

  describe('identity_link', () => {
    it('denies a non-privileged caller; no link reaches linkLegacyUser', async () => {
      const { module, linked } = fakeModule();
      const link = tool(buildIdentityMcpTools(module), 'identity_link');
      // ATTACK: an authenticated agent tries to graft a victim CLI account onto its own.
      await expect(
        link.handler(
          { authUserId: 'attacker', legacyUsersId: 'victim-cli' },
          caller({ userId: 'attacker' }),
        ),
      ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
      expect(linked).toHaveLength(0);
    });

    it('refuses when there is no authorized caller', async () => {
      const { module, linked } = fakeModule();
      const link = tool(buildIdentityMcpTools(module), 'identity_link');
      await expect(
        link.handler({ authUserId: 'a', legacyUsersId: 'b' }, undefined),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
      expect(linked).toHaveLength(0);
    });

    it('allows an internal caller to link on behalf of a tenant', async () => {
      const { module, linked } = fakeModule();
      const link = tool(buildIdentityMcpTools(module), 'identity_link');
      const out = (await link.handler(
        { authUserId: 'canonical-1', legacyUsersId: 'legacy-1' },
        caller({ userId: 'svc', scopes: ['internal'] }),
      )) as { linked: boolean };
      expect(out.linked).toBe(true);
      expect(linked).toEqual([{ authUserId: 'canonical-1', legacyUsersId: 'legacy-1' }]);
    });
  });
});
