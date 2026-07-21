/**
 * Social composition-root seams — the small, PURE pieces of the bootstrap →
 * social wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts} /
 * {@link ./conductor-seams.ts}):
 *
 *   - {@link createSocialTargetResolver} — the {@link SocialConductorTargetResolver}
 *     that turns an ADMITTED chat into a launch target through its explicit channel
 *     binding. Hostile-by-default: no binding / `allow:false` ⇒ `null` ⇒ a truthful
 *     "unbound chat" error. The social composite is late-bound (`socialRef = social`
 *     after it is built), so it is resolved LAZILY through the `socialRef` getter.
 *   - {@link createSocialConductorDispatch} — the {@link SocialConductorDispatchPort}
 *     over the Phase-5 conductor `createWorkspace` seam (gate + quota + substrate
 *     launch). A refused/faulted launch surfaces as `ok:false` — never a faked run.
 *   - {@link createSocialReplyInference} — the {@link ReplyInferencePort} over the
 *     Phase-6 inference gateway: one bounded completion through the delivery ladder.
 *     An unrouted ladder yields a truthful `ok:false` (never a fabricated reply).
 *
 * All three are constructed at the composition root and injected into
 * `createSocialComposer({ targetResolver, conductor, inference })`. None reads
 * `process.env` or owns state; each degrades truthfully.
 */
import type { Principal } from '../domains/identity/types.js';
import type { InferenceGatewayPort } from '../domains/inference/ports/inference-gateway.port.js';
import type {
  ConductorDispatchPort as SocialConductorDispatchPort,
  ConductorTargetResolver as SocialConductorTargetResolver,
} from '../domains/social/dispatch/conductor-dispatch.js';
import type { ReplyInferencePort } from '../domains/social/dispatch/reply-agent.js';
import type { SocialComposite } from '../domains/social/social-module.js';

/** Deps for the conductor launch-target resolver. */
export interface SocialTargetResolverDeps {
  /**
   * Lazily resolve the social composite (late-bound `socialRef = social` AFTER it
   * is built). A getter — not the value — so the late-bind is observed.
   */
  readonly socialRef: () => SocialComposite | null;
  /** The worktree parent an admitted chat's run runs in (the sanctioned repo root). */
  readonly repoRoot: string;
}

/**
 * Build the social conductor launch-target resolver. An ADMITTED chat resolves
 * through its explicit channel binding (hostile-by-default: no binding /
 * `allow:false` ⇒ `null` ⇒ a truthful "unbound chat" error). The binding's owner
 * is the launch principal.
 */
export function createSocialTargetResolver(
  deps: SocialTargetResolverDeps,
): SocialConductorTargetResolver {
  const { socialRef, repoRoot } = deps;
  return {
    async resolve(env) {
      const social = socialRef();
      if (!social) return null;
      const binding = await social.core().repository().getBinding(env.channel, env.chatRef);
      if (!binding?.allow) return null;
      const principal: Principal = {
        userId: binding.userId,
        scopes: ['internal', 'write'],
        kind: 'internal',
        isAnonymous: false,
        raw: null,
      };
      return {
        spaceId: binding.spaceId ?? 'space-default',
        projectId: `social-${env.channel}`,
        taskId: `social-${env.channel}-${env.providerMsgId}`,
        repoPath: repoRoot,
        runtimeId: binding.agentId ?? 'claude_code',
        principal,
      };
    },
  };
}

/**
 * The narrow conductor surface the social-dispatch seam consumes (structural — the
 * real `ConductorModuleSurface.createWorkspace` fits without a cross-domain import).
 */
export interface SocialConductorLauncher {
  createWorkspace(
    input: {
      readonly spaceId: string;
      readonly projectId: string;
      readonly taskId: string;
      readonly repoPath: string;
      readonly runtimeId: string;
      readonly prompt?: string;
    },
    principal: Principal,
  ): Promise<{
    readonly ok: boolean;
    readonly reason?: string;
    readonly value?: { readonly workspaceId: string; readonly runId?: string } | null;
  }>;
}

/**
 * Build the social → conductor `/run` dispatch seam: the REAL governed
 * `createWorkspace` path (gate + quota + substrate launch). A refused/faulted
 * launch surfaces as `ok:false` with the conductor's reason — never a faked run.
 */
export function createSocialConductorDispatch(
  conductor: SocialConductorLauncher,
): SocialConductorDispatchPort {
  return {
    async createWorkspace(req) {
      const res = await conductor.createWorkspace(
        {
          spaceId: req.spaceId,
          projectId: req.projectId,
          taskId: req.taskId,
          repoPath: req.repoPath,
          runtimeId: req.runtimeId,
          prompt: req.prompt,
        },
        req.principal as Principal,
      );
      if (!res.ok || !res.value) {
        return { ok: false, ...(res.reason ? { reason: res.reason } : {}) };
      }
      return {
        ok: true,
        workspaceId: res.value.workspaceId,
        ...(res.value.runId ? { runId: res.value.runId } : {}),
      };
    },
  };
}

/** The narrow inference-gateway completion surface the reply seam consumes. */
export type SocialReplyGateway = Pick<InferenceGatewayPort, 'complete'>;

/** Deps for the reply-inference seam. */
export interface SocialReplyInferenceDeps {
  readonly gateway: SocialReplyGateway;
  /** The default model the bounded reply routes through (folded from config). */
  readonly defaultModel: string;
}

/**
 * Build the social reply seam: one bounded completion through the inference
 * delivery ladder. An unrouted ladder (or empty content) yields a truthful
 * `ok:false` — never a fabricated reply.
 */
export function createSocialReplyInference(
  deps: SocialReplyInferenceDeps,
): ReplyInferencePort {
  const { gateway, defaultModel } = deps;
  return {
    async reply(input) {
      const result = await gateway.complete({
        model: defaultModel,
        messages: [
          {
            role: 'system',
            content:
              'You are Recoder answering a message in a chat channel. Reply briefly and helpfully.',
          },
          { role: 'user', content: input.text },
        ],
        maxTokens: 512,
      });
      if (!result.routed || !result.content) {
        return { ok: false, reason: result.reason ?? 'inference ladder could not route the reply' };
      }
      return { ok: true, text: result.content };
    },
  };
}
