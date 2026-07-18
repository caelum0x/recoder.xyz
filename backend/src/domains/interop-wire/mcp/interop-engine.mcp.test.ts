/**
 * interop-wire READ MCP tools — SECURITY: proves the cross-tenant subject-binding.
 *
 * The A2A agent registry, task projection + message log, and task context bundle
 * are OWNER-scoped tenant data. The `userId` subject-selector is NOT edge-bound, so
 * a non-privileged caller that names a FOREIGN `args.userId` must be refused with
 * `AUTHZ_PROJECT_ACCESS_DENIED` and the victim id must NEVER reach the data seam
 * (registry.list / tasks.get / contextBridge.build). A privileged (admin/internal)
 * caller may target an arbitrary subject; an absent (trusted in-proc) caller
 * resolves against the service identity (`ownerId`).
 */
import { describe, it, expect } from 'vitest';
import { buildInteropMcpTools, type InteropEngineDeps } from './interop-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';

const OWNER = 'svc-owner';
const CALLER = 'user-attacker';
const VICTIM = 'user-victim';

/** A recording seam: captures every `userId` the tools resolve and forward. */
function build() {
  const seen: string[] = [];
  const record = <T>(value: T) => (userId: string): Promise<T> => {
    seen.push(userId);
    return Promise.resolve(value);
  };
  const deps = {
    registry: { list: record<readonly unknown[]>([]) },
    heartbeat: { liveness: async () => 'unknown' },
    tasks: {
      get: (_id: string, userId: string) => record<null>(null)(userId),
      messages: async () => [],
    },
    contextBridge: {
      build: (input: { taskId: string; userId: string }) => {
        seen.push(input.userId);
        return Promise.resolve({ taskId: input.taskId, task: null, messages: [], truncated: false, notes: [] });
      },
    },
    jsonRpc: { methods: () => ['message/send'] },
    ownerId: OWNER,
  } as unknown as InteropEngineDeps;

  const tools = buildInteropMcpTools(deps);
  const byName = new Map(tools.map((t) => [t.name, t] as const));
  const call = <T = unknown>(name: string, input: unknown, caller?: McpToolCaller): Promise<T> =>
    Promise.resolve(byName.get(name)!.handler(input, caller) as T);
  return { tools, seen, call };
}

const nonPriv = (userId: string): McpToolCaller => ({ userId });
const admin = (userId: string): McpToolCaller => ({ userId, scopes: ['read', 'admin'] });

const SUBJECT_TOOLS: readonly { name: string; input: (userId?: string) => unknown }[] = [
  { name: 'interop_list_agents', input: (userId) => (userId ? { userId } : {}) },
  { name: 'interop_get_task', input: (userId) => ({ taskId: 't-1', ...(userId ? { userId } : {}) }) },
  { name: 'interop_task_context', input: (userId) => ({ taskId: 't-1', ...(userId ? { userId } : {}) }) },
];

describe('interop-wire read MCP tools — subject binding', () => {
  it('advertises the five read tools by name', () => {
    const { tools } = build();
    const names = tools.map((t: McpToolRegistration) => t.name).sort();
    expect(names).toEqual([
      'interop_agent_liveness',
      'interop_get_task',
      'interop_list_agents',
      'interop_methods',
      'interop_task_context',
    ]);
  });

  for (const { name, input } of SUBJECT_TOOLS) {
    it(`${name}: a non-privileged caller naming a FOREIGN userId is refused (403), victim never hits the seam`, async () => {
      const { call, seen } = build();
      await expect(call(name, input(VICTIM), nonPriv(CALLER))).rejects.toMatchObject({
        code: 'AUTHZ_PROJECT_ACCESS_DENIED',
      });
      expect(seen).not.toContain(VICTIM);
      expect(seen).toHaveLength(0);
    });

    it(`${name}: a non-privileged caller is scoped to its OWN id (no args.userId)`, async () => {
      const { call, seen } = build();
      await call(name, input(), nonPriv(CALLER));
      expect(seen).toEqual([CALLER]);
    });

    it(`${name}: a non-privileged caller naming its OWN id is allowed`, async () => {
      const { call, seen } = build();
      await call(name, input(CALLER), nonPriv(CALLER));
      expect(seen).toEqual([CALLER]);
    });

    it(`${name}: an admin caller MAY target an arbitrary subject`, async () => {
      const { call, seen } = build();
      await call(name, input(VICTIM), admin('user-admin'));
      expect(seen).toEqual([VICTIM]);
    });

    it(`${name}: an absent caller (trusted in-proc) resolves to the service identity`, async () => {
      const { call, seen } = build();
      await call(name, input());
      expect(seen).toEqual([OWNER]);
    });
  }
});
