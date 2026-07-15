/**
 * interop-wire domain — public factory + the ONE public interface.
 *
 * `createInteropWireModule(deps)` composes the A2A WIRE surface (envelope
 * build/seal/validate, agent-card, signed-ingress gate, JSON-RPC dispatcher) and
 * the registry/task-projection repositories (over the persistence executor, or a
 * degrade-safe in-memory store when the DB is absent).
 *
 * This is the Phase-7a WIRE slice; the runtimes (claude/codex/openfang) land in
 * Phase 6, and dispatch/registry/bridge SERVICES + routes + MCP land in later
 * 7a groups. Bootstrap integrates this composer serially (never edited here).
 *
 * Fail-closed by construction: production requiring signatures with no secret ⇒
 * every ingress denies (never a faked admit); an absent executor ⇒ the projection
 * is truthfully in-memory-only (health reports `degraded`).
 */
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { A2ATransport } from './ports/a2a-transport.port.js';
import type { AgentRegistryRepo } from './ports/agent-registry.repo.js';
import type { TaskStoreRepo } from './ports/task-store.repo.js';
import type { EnvelopeService } from './wire/a2a-envelope.service.js';
import type { AgentCardService, RemoteCardFetcher } from './wire/agent-card.service.js';
import type { SignedIngressGate } from './wire/signed-ingress.gate.js';
import type { A2AJsonRpcServer } from './wire/a2a-jsonrpc-server.js';
import type { InteropWireConfig, InteropWireConfigOverrides } from './config.js';
import type { A2AEnvelope, AgentCard, EgressEnvelope, IngressResult } from './types.js';

/** Dependencies injected by bootstrap. */
export interface InteropWireModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor; absent ⇒ degrade-safe in-memory projection. */
  readonly executor?: QueryExecutor;
  /** Not-yet-in-AppConfig wire values (signing secret, card identity, windows). */
  readonly overrides?: InteropWireConfigOverrides;
  /** Optional remote agent-card fetcher; absent ⇒ remote cards resolve `null`. */
  readonly remoteCardFetcher?: RemoteCardFetcher | null;
}

/** The public surface bootstrap + later 7a groups consume. */
export interface InteropWireModule {
  readonly name: 'interop-wire';
  /** The resolved typed config slice. */
  config(): InteropWireConfig;
  /** The A2A envelope build/seal/parse/validate surface. */
  envelope(): EnvelopeService;
  /** The local + remote agent-card surface. */
  agentCard(): AgentCardService;
  /** The hostile-by-default signed-ingress gate (fail-closed). */
  signedIngress(): SignedIngressGate;
  /** The A2A JSON-RPC dispatcher (methods registered by later groups). */
  jsonRpc(): A2AJsonRpcServer;
  /** The `A2ATransport` seam other domains (social/conductor) bind to. */
  transport(): A2ATransport;
  /** The registered-agents + heartbeat repository. */
  agents(): AgentRegistryRepo;
  /** The A2A task/message/scratchpad projection repository. */
  tasks(): TaskStoreRepo;
  /** Truthful component health. */
  health(): ComponentHealth;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { sliceInteropWireConfig } from './config.js';
import { interopWireHealth } from './health.js';
import { createEnvelopeService } from './wire/a2a-envelope.service.js';
import { createAgentCardService } from './wire/agent-card.service.js';
import { createSignedIngressGate } from './wire/signed-ingress.gate.js';
import { createA2AJsonRpcServer } from './wire/a2a-jsonrpc-server.js';
import { createAgentRegistryRepo } from './repositories/agent-registry.repository.js';
import { createTaskStoreRepo } from './repositories/task-store.repository.js';

/** A degrade-safe no-op executor for when persistence is absent on disk. */
function inertExecutor(): QueryExecutor {
  const unavailable = async (): Promise<never> => {
    throw new Error('interop-wire: persistence executor unavailable');
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

/** Build the interop-wire module. Pure factory; no singletons. */
export function createInteropWireModule(deps: InteropWireModuleDeps): InteropWireModule {
  const cfg = sliceInteropWireConfig(deps.config, deps.overrides);
  const executor = deps.executor ?? inertExecutor();

  const envelope = createEnvelopeService({
    hmacSecret: cfg.hmacSecret,
    keyId: cfg.signingKeyId,
    requireSignature: cfg.requireSignedIngress,
    maxFutureSkewMs: cfg.maxFutureSkewMs,
  });
  const agentCard = createAgentCardService(cfg.localCard, {
    fetcher: deps.remoteCardFetcher ?? null,
  });
  const signedIngress = createSignedIngressGate(envelope, {
    requireSigned: cfg.requireSignedIngress,
    hmacSecret: cfg.hmacSecret,
    allowInsecure: cfg.allowInsecureIngress,
    maxFutureSkewMs: cfg.maxFutureSkewMs,
  });
  const jsonRpc = createA2AJsonRpcServer();
  const agents = createAgentRegistryRepo({ executor });
  const tasks = createTaskStoreRepo({ executor });

  const transport: A2ATransport = {
    async ingressEnvelope<TPayload = unknown>(value: unknown): Promise<IngressResult<TPayload>> {
      return signedIngress.admit<TPayload>(value);
    },
    async egressEnvelope<TPayload = unknown>(env: A2AEnvelope<TPayload>): Promise<EgressEnvelope<TPayload>> {
      const sealed = envelope.sealEnvelope(env);
      return {
        envelope: env,
        signature: sealed.signature.signature || undefined,
        keyId: sealed.signature.key_id,
      };
    },
    async agentCard(): Promise<AgentCard> {
      return agentCard.getLocalAgentCard();
    },
    async resolveRemoteCard(ref: string): Promise<AgentCard | null> {
      return agentCard.resolveRemoteCard(ref);
    },
  };

  return {
    name: 'interop-wire',
    config: () => cfg,
    envelope: () => envelope,
    agentCard: () => agentCard,
    signedIngress: () => signedIngress,
    jsonRpc: () => jsonRpc,
    transport: () => transport,
    agents: () => agents,
    tasks: () => tasks,
    health: () => interopWireHealth({ config: cfg, persistenceAvailable: executor.isAvailable() }),
  };
}
