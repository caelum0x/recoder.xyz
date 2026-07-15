/**
 * social domain — public factory + the ONE public interface (Phase 7b slice).
 *
 * `createSocialModule(deps)` composes the trust boundary (mention gate + webhook
 * ingress verification) and the Recoder-owned repository (connectors + bindings +
 * inbound audit) behind the `SocialModule` seam. The engine binding (openclaw
 * gateways), dispatch (conductor + reply agent), zrok tunnel, routes, and MCP
 * tools land in later 7b groups; bootstrap integrates this composer serially.
 *
 * Hostile-by-default + degrade-safe: an empty allowlist admits nothing; a missing
 * webhook secret refuses (401, never a faked 200); an absent executor ⇒ the
 * repository is truthfully in-memory-only.
 */
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { MentionGate } from './ports/mention-gate.port.js';
import type { SocialRepository } from './ports/social-repository.port.js';
import type { SocialConfig, SocialConfigOverrides } from './config.js';
import type { BindingCheck, SignedVouch } from './adapters/mention-gate.adapter.js';
import type { InboundEnvelope } from './types.js';

/** Dependencies injected by bootstrap. */
export interface SocialModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor; absent ⇒ degrade-safe in-memory repository. */
  readonly executor?: QueryExecutor;
  /** Not-yet-in-AppConfig social values (per-channel enable, secrets, zrok). */
  readonly overrides?: SocialConfigOverrides;
  /** Optional signed connector-ingress vouch (degrade-safe; absent ⇒ skipped). */
  readonly signedVouch?: SignedVouch;
}

/** The public surface bootstrap + later 7b groups consume. */
export interface SocialModule {
  readonly name: 'social';
  /** The resolved typed config slice. */
  config(): SocialConfig;
  /** The hostile-by-default trust-boundary gate. */
  mentionGate(): MentionGate;
  /** The Recoder-owned connectors/bindings/inbound repository. */
  repository(): SocialRepository;
  /** Truthful per-channel health. */
  health(): ComponentHealth;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { sliceSocialConfig } from './config.js';
import { buildSocialHealth } from './health.js';
import { createHostileMentionGate } from './adapters/mention-gate.adapter.js';
import { createSocialRepository } from './adapters/social-repository.adapter.js';

/** A degrade-safe no-op executor for when persistence is absent on disk. */
function inertExecutor(): QueryExecutor {
  const unavailable = async (): Promise<never> => {
    throw new Error('social: persistence executor unavailable');
  };
  return {
    execute: unavailable as QueryExecutor['execute'],
    one: unavailable as QueryExecutor['one'],
    read: unavailable as QueryExecutor['read'],
    mutate: unavailable as QueryExecutor['mutate'],
    withTransaction: unavailable as QueryExecutor['withTransaction'],
    isAvailable: () => false,
  };
}

/** Build the social module. Pure factory; no singletons. */
export function createSocialModule(deps: SocialModuleDeps): SocialModule {
  const cfg = sliceSocialConfig(deps.config, deps.overrides);
  const executor = deps.executor ?? inertExecutor();
  const repository = createSocialRepository({ executor });

  // The binding-backed allow check lets an explicit chat_ref opt-in satisfy the
  // allowlist step even when the static allowlist is empty (hostile-by-default
  // otherwise). Degrade-safe: a repository fault resolves to `false` (drop).
  const bindingCheck: BindingCheck = {
    async isChatAllowed(env: InboundEnvelope): Promise<boolean> {
      const binding = await repository.getBinding(env.channel, env.chatRef);
      return Boolean(binding?.allow);
    },
  };

  const mentionGate = createHostileMentionGate({
    config: { allowlist: cfg.allowlist, requireMention: cfg.requireMention },
    signedVouch: deps.signedVouch,
    bindingCheck,
  });

  return {
    name: 'social',
    config: () => cfg,
    mentionGate: () => mentionGate,
    repository: () => repository,
    health: () => buildSocialHealth(cfg),
  };
}
