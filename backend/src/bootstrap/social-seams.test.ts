/**
 * Composition-root seam tests for the bootstrap → social wiring
 * (`social-seams.ts`): the conductor launch-target resolver, the conductor `/run`
 * dispatch, and the reply-inference seam. Each must be DEGRADE-TRUTHFUL — an
 * unbound chat, a refusing conductor, an unrouted inference ladder each surface
 * truthfully, never a fabricated target/run/reply.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SocialComposite } from '../domains/social/social-module.js';
import type { InboundEnvelope } from '../domains/social/types.js';
import {
  createSocialTargetResolver,
  createSocialConductorDispatch,
  createSocialReplyInference,
  type SocialConductorLauncher,
  type SocialReplyGateway,
} from './social-seams.js';

/** A minimal inbound envelope for the resolver. */
const ENV = {
  channel: 'telegram',
  chatRef: 'chat-1',
  senderId: 'sender-1',
  providerMsgId: 'msg-9',
  text: 'ship it',
} as unknown as InboundEnvelope;

/** A fake social composite whose repository returns the given binding. */
function fakeSocial(binding: unknown): SocialComposite {
  return {
    core: () => ({
      repository: () => ({
        getBinding: async () => binding,
      }),
    }),
  } as unknown as SocialComposite;
}

describe('createSocialTargetResolver (conductor launch target)', () => {
  it('returns null when the social composite is not yet wired', async () => {
    const resolver = createSocialTargetResolver({
      socialRef: () => null,
      repoRoot: '/repo',
    });
    expect(await resolver.resolve(ENV, {} as never)).toBeNull();
  });

  it('returns null for an absent or disallowed binding (hostile-by-default)', async () => {
    const noBinding = createSocialTargetResolver({
      socialRef: () => fakeSocial(null),
      repoRoot: '/repo',
    });
    expect(await noBinding.resolve(ENV, {} as never)).toBeNull();

    const disallowed = createSocialTargetResolver({
      socialRef: () => fakeSocial({ allow: false, userId: 'u1' }),
      repoRoot: '/repo',
    });
    expect(await disallowed.resolve(ENV, {} as never)).toBeNull();
  });

  it('resolves an internal-principal target for an allowed binding', async () => {
    const resolver = createSocialTargetResolver({
      socialRef: () =>
        fakeSocial({ allow: true, userId: 'owner-1', spaceId: 'space-x', agentId: 'codex' }),
      repoRoot: '/repo',
    });

    const target = await resolver.resolve(ENV, {} as never);
    expect(target).toEqual({
      spaceId: 'space-x',
      projectId: 'social-telegram',
      taskId: 'social-telegram-msg-9',
      repoPath: '/repo',
      runtimeId: 'codex',
      principal: {
        userId: 'owner-1',
        scopes: ['internal', 'write'],
        kind: 'internal',
        isAnonymous: false,
        raw: null,
      },
    });
  });

  it('observes the late-bind through the lazy socialRef getter', async () => {
    let social: SocialComposite | null = null;
    const resolver = createSocialTargetResolver({
      socialRef: () => social,
      repoRoot: '/repo',
    });
    expect(await resolver.resolve(ENV, {} as never)).toBeNull();
    social = fakeSocial({ allow: true, userId: 'u1' }); // the late-bind (`socialRef = social`)
    expect(await resolver.resolve(ENV, {} as never)).not.toBeNull();
  });

  it('defaults space + runtime when the binding omits them', async () => {
    const resolver = createSocialTargetResolver({
      socialRef: () => fakeSocial({ allow: true, userId: 'u1' }),
      repoRoot: '/repo',
    });
    const target = await resolver.resolve(ENV, {} as never);
    expect(target?.spaceId).toBe('space-default');
    expect(target?.runtimeId).toBe('claude_code');
  });
});

describe('createSocialConductorDispatch (governed createWorkspace)', () => {
  const req = {
    spaceId: 'space-1',
    projectId: 'social-telegram',
    taskId: 'social-telegram-msg-9',
    repoPath: '/repo',
    runtimeId: 'claude_code',
    prompt: 'ship it',
    principal: { userId: 'u1' },
  };

  it('returns ok:true with workspace + run id on a launched workspace', async () => {
    const createWorkspace = vi.fn(async () => ({
      ok: true as const,
      value: { workspaceId: 'ws-1', runId: 'run-1' },
    }));
    const dispatch = createSocialConductorDispatch({ createWorkspace } as SocialConductorLauncher);

    expect(await dispatch.createWorkspace(req)).toEqual({
      ok: true,
      workspaceId: 'ws-1',
      runId: 'run-1',
    });
    expect(createWorkspace).toHaveBeenCalledWith(
      {
        spaceId: 'space-1',
        projectId: 'social-telegram',
        taskId: 'social-telegram-msg-9',
        repoPath: '/repo',
        runtimeId: 'claude_code',
        prompt: 'ship it',
      },
      req.principal,
    );
  });

  it('returns ok:false with the conductor reason on a refused launch', async () => {
    const dispatch = createSocialConductorDispatch({
      createWorkspace: async () => ({ ok: false as const, reason: 'over quota' }),
    } as SocialConductorLauncher);
    expect(await dispatch.createWorkspace(req)).toEqual({ ok: false, reason: 'over quota' });
  });
});

describe('createSocialReplyInference (bounded reply completion)', () => {
  it('returns ok:true with the routed reply text', async () => {
    const complete = vi.fn(async () => ({ routed: true, content: 'hello back' }));
    const port = createSocialReplyInference({
      gateway: { complete } as unknown as SocialReplyGateway,
      defaultModel: 'openai/gpt-4o-mini',
    });

    expect(
      await port.reply({ channel: 'telegram', chatRef: 'c', senderId: 's', text: 'hi' }),
    ).toEqual({ ok: true, text: 'hello back' });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'openai/gpt-4o-mini', maxTokens: 512 }),
    );
  });

  it('returns ok:false when the ladder does not route the reply', async () => {
    const port = createSocialReplyInference({
      gateway: {
        complete: async () => ({ routed: false, content: null, reason: 'no tier' }),
      } as unknown as SocialReplyGateway,
      defaultModel: 'openai/gpt-4o-mini',
    });
    expect(
      await port.reply({ channel: 'telegram', chatRef: 'c', senderId: 's', text: 'hi' }),
    ).toEqual({ ok: false, reason: 'no tier' });
  });
});
