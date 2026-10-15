/**
 * The real `RecoderSessionRpcClient` — the only file in this package that
 * touches `@t3tools/contracts` directly (see this package's own doc comment
 * in package.json, and docs/T3CODE-FORK.md section 3/4). It talks to the
 * local `recoder` environment server (forked t3 `apps/server`,
 * docs/RECODER-T3CODE-COMPOSITION.md section 6) over the same `orchestration.*`
 * WebSocket RPC group (`WsRpcGroup`, `ORCHESTRATION_V2_WS_METHODS`) the forked
 * `apps/web` uses.
 *
 * Deliberately NOT wired through `@t3tools/client-runtime`'s
 * `EnvironmentSupervisor`/`ConnectionDriver` stack: that stack is the
 * multi-route (LAN/relay/tailnet/SSH), registry-backed, platform-source-aware
 * application runtime behind the full t3 clients (desktop/web/mobile), and
 * most of its connect path (`RpcSessionFactory`, `rpc/session.ts`) is not part
 * of `@t3tools/client-runtime`'s exported surface — only `connection/layer.ts`'s
 * fully-assembled `Connection.layer` is, and that needs a registry, a
 * `PlatformConnectionSource`, relay discovery, and auth, none of which make
 * sense for a Wave block whose only route is the `recoder` CLI process the
 * desktop app itself spawned on localhost. Building the one-route case
 * directly on `effect/rpc` + `effect/socket` (both part of the `effect`
 * package itself, not t3code-internal) against the real `WsRpcGroup` schema
 * is a smaller, honest surface: it gets the "versioned RPC schema" value the
 * composition doc names (docs/RECODER-T3CODE-COMPOSITION.md section 4) without
 * reaching into `client-runtime` internals that the package's own `exports`
 * map does not expose. See this task's report for the explicit call-out.
 */
import {
  ORCHESTRATION_V2_WS_METHODS,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
  ThreadId,
  CommandId,
  MessageId,
  WsRpcGroup,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadStreamItem,
  type OrchestrationV2ConversationMessage,
} from '@t3tools/contracts';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import * as Socket from 'effect/socket/Socket';
import * as Stream from 'effect/Stream';
import { RpcClient } from 'effect/rpc';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';

import type {
  RecoderSessionRpcClient,
  SendMessageInput,
  SessionDiffResult,
  SessionMessage,
  SessionThreadStreamItem,
  SessionThreadSummary,
  ThreadEventHandler,
} from './types.js';

export interface EffectRecoderSessionRpcClientOptions {
  /** e.g. `ws://127.0.0.1:3773/ws` — the local `recoder` server's RPC socket. */
  readonly socketUrl: string;
  readonly openTimeoutSeconds?: number;
}

/**
 * The `recoder` server's own default port (`third_party/t3code/apps/server/src/config.ts`'s
 * `DEFAULT_PORT`) and RPC upgrade path (the path every `socketUrl` in
 * `@t3tools/client-runtime`'s own tests uses, e.g. `ws://127.0.0.1:3777/ws`).
 */
export function defaultRecoderSessionSocketUrl(host = '127.0.0.1', port = 3773): string {
  const url = new URL(`ws://${host}:${port}/ws`);
  url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, String(ORCHESTRATION_PROTOCOL_VERSION));
  return url.toString();
}

const makeWsRpcClient = RpcClient.make(WsRpcGroup);
type WsRpcClient = Effect.Success<typeof makeWsRpcClient>;

/**
 * Identifies "the connected `WsRpcClient` for this instance" in its own
 * private `ManagedRuntime`. `effect@4.0.1` dropped the old `Context.GenericTag`
 * constructor in favor of `Context.Service` classes (the same pattern
 * `@t3tools/client-runtime` itself uses throughout, e.g. `RpcSessionFactory`
 * in `packages/client-runtime/src/rpc/session.ts`) — a class is both the
 * value's type and its own Context tag.
 */
class WsRpcClientTag extends Context.Service<WsRpcClientTag, WsRpcClient>()(
  '@recoder/t3-session-bridge/WsRpcClient',
) {}

function toSessionMessage(message: OrchestrationV2ConversationMessage): SessionMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    text: message.text,
    streaming: message.streaming,
    createdAt: formatDateTime(message.createdAt),
  };
}

// `effect/Schema`'s `DateTimeUtc` decodes to an `effect/DateTime` value, not a
// JS Date. Its `toString()` is already ISO-8601 (`effect/DateTime` formats
// that way); this keeps this module from needing a second `effect/DateTime`
// import purely for `formatIso`.
function formatDateTime(value: unknown): string {
  return String(value);
}

function projectionToMessages(projection: OrchestrationV2ThreadProjection): SessionMessage[] {
  return projection.messages.map(toSessionMessage);
}

function mapStreamItem(item: OrchestrationV2ThreadStreamItem): SessionThreadStreamItem | null {
  if (item.kind === 'snapshot') {
    return {
      kind: 'snapshot',
      snapshotSequence: item.snapshotSequence,
      messages: projectionToMessages(item.projection),
    };
  }
  if (item.kind === 'synchronized') return { kind: 'synchronized' };
  if (item.kind === 'event' && item.event.type === 'message.updated') {
    return { kind: 'message', sequence: item.sequence, message: toSessionMessage(item.event.payload) };
  }
  // Other domain events (run/turn-item/node/etc. updates) don't map to a
  // chat message in this first version of the block — a deferred item, see
  // the task report that shipped it.
  return null;
}

/** Live subscriptions, keyed by threadId, so `disconnect()` can interrupt every open stream. */
interface ThreadSubscription {
  readonly handler: ThreadEventHandler;
  readonly fiber: Fiber.Fiber<void, unknown>;
}

export class EffectRecoderSessionRpcClient implements RecoderSessionRpcClient {
  readonly #socketUrl: string;
  readonly #openTimeoutSeconds: number;
  #runtime: ManagedRuntime.ManagedRuntime<WsRpcClientTag, never> | null = null;
  #subscriptions = new Map<string, Set<ThreadSubscription>>();

  constructor(options: EffectRecoderSessionRpcClientOptions) {
    this.#socketUrl = options.socketUrl;
    this.#openTimeoutSeconds = options.openTimeoutSeconds ?? 15;
  }

  async connect(): Promise<void> {
    if (this.#runtime !== null) return;
    const layerSocket = Socket.layerWebSocket(this.#socketUrl, {
      openTimeout: `${this.#openTimeoutSeconds} seconds`,
    }).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));
    const layerProtocol = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket({ retryTransientErrors: false }),
    ).pipe(Layer.provide(Layer.mergeAll(layerSocket, RpcSerialization.layerJson)));
    const layerClient = Layer.effect(WsRpcClientTag, makeWsRpcClient).pipe(Layer.provide(layerProtocol));
    const runtime = ManagedRuntime.make(layerClient);
    // Forces the layer (and so the socket connect) to resolve now, rather
    // than lazily on the first `#client()` call, so `connect()` truthfully
    // reports a dead server instead of succeeding and failing later.
    await runtime.runPromise(WsRpcClientTag);
    this.#runtime = runtime;
  }

  async disconnect(): Promise<void> {
    const runtime = this.#runtime;
    if (runtime === null) return;
    for (const subs of this.#subscriptions.values()) {
      for (const sub of subs) await runtime.runPromise(Fiber.interrupt(sub.fiber)).catch(() => {});
    }
    this.#subscriptions.clear();
    this.#runtime = null;
    await runtime.dispose();
  }

  #requireRuntime(): ManagedRuntime.ManagedRuntime<WsRpcClientTag, never> {
    if (this.#runtime === null) {
      throw new Error('EffectRecoderSessionRpcClient: connect() must resolve before use.');
    }
    return this.#runtime;
  }

  async listThreads(): Promise<readonly SessionThreadSummary[]> {
    const runtime = this.#requireRuntime();
    const items = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* WsRpcClientTag;
        return yield* client[ORCHESTRATION_V2_WS_METHODS.subscribeArchivedShell]({}).pipe(
          Stream.take(1),
          Stream.runCollect,
        );
      }),
    );
    const [first] = Array.from(items);
    if (first === undefined || first.kind !== 'snapshot') return [];
    return first.snapshot.threads.map(
      (thread): SessionThreadSummary => ({
        id: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        status: thread.status,
        branch: thread.branch,
        activeRunId: thread.activeRunId,
        updatedAt: formatDateTime(thread.latestRunCompletedAt ?? thread.createdAt),
      }),
    );
  }

  subscribeThread(threadId: string, onEvent: ThreadEventHandler): () => void {
    const runtime = this.#requireRuntime();
    const decodedThreadId = Schema.decodeUnknownSync(ThreadId)(threadId);
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const client = yield* WsRpcClientTag;
        yield* client[ORCHESTRATION_V2_WS_METHODS.subscribeThread]({ threadId: decodedThreadId }).pipe(
          Stream.runForEach((item) =>
            Effect.sync(() => {
              const mapped = mapStreamItem(item);
              if (mapped !== null) onEvent(mapped);
            }),
          ),
        );
      }).pipe(Effect.catch(() => Effect.void)),
    );
    const entry: ThreadSubscription = { handler: onEvent, fiber };
    const set = this.#subscriptions.get(threadId) ?? new Set();
    set.add(entry);
    this.#subscriptions.set(threadId, set);
    return () => {
      this.#subscriptions.get(threadId)?.delete(entry);
      runtime.runFork(Fiber.interrupt(fiber));
    };
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    const runtime = this.#requireRuntime();
    const threadId = Schema.decodeUnknownSync(ThreadId)(input.threadId);
    const commandId = Schema.decodeUnknownSync(CommandId)(crypto.randomUUID());
    const messageId = Schema.decodeUnknownSync(MessageId)(crypto.randomUUID());
    await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* WsRpcClientTag;
        yield* client[ORCHESTRATION_V2_WS_METHODS.dispatchCommand]({
          type: 'message.dispatch',
          createdBy: 'user',
          creationSource: 'web',
          commandId,
          threadId,
          messageId,
          text: input.text,
          attachments: [],
          dispatchMode: { type: 'queue_after_active' },
        });
      }),
    );
  }

  async getFullThreadDiff(threadId: string): Promise<SessionDiffResult> {
    const runtime = this.#requireRuntime();
    const decodedThreadId = Schema.decodeUnknownSync(ThreadId)(threadId);
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* WsRpcClientTag;
        // `toTurnCount` means "up through this checkpoint ordinal"
        // (apps/server/src/checkpointing/CheckpointDiffQuery.ts resolves it
        // against checkpoint scopes, not an arbitrary ceiling) — the only
        // honest value is the thread's own latest `appRunOrdinal`, read off
        // its projection. `0` is a real, server-handled case (no checkpoints
        // yet => empty diff), never a sentinel for "give me everything".
        const projection = yield* client[ORCHESTRATION_V2_WS_METHODS.getThreadProjection]({
          threadId: decodedThreadId,
        });
        const toTurnCount = projection.checkpoints.reduce(
          (max, checkpoint) =>
            checkpoint.appRunOrdinal !== null && checkpoint.appRunOrdinal > max ? checkpoint.appRunOrdinal : max,
          0,
        );
        return yield* client[ORCHESTRATION_V2_WS_METHODS.getFullThreadDiff]({
          threadId: decodedThreadId,
          toTurnCount,
        });
      }),
    );
    return {
      threadId: result.threadId,
      fromTurnCount: result.fromTurnCount,
      toTurnCount: result.toTurnCount,
      diff: result.diff,
    };
  }
}
