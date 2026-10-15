/**
 * Plain, Promise/callback-shaped types for the recoder-session Wave block.
 *
 * These mirror a narrow slice of `@t3tools/contracts`' orchestration-v2 wire
 * schemas (thread shells, conversation messages, the full-thread-diff result)
 * but deliberately do NOT re-export Effect `Schema` types: the Wave block is a
 * plain React + jotai app and should never need to pull in `effect`'s runtime
 * to render a thread list or a diff. `effect-client.ts` is the only file in
 * this package that touches the real Effect-based wire client; everything
 * downstream (the fake client, the Wave ViewModel, its tests) talks to the
 * interfaces declared here.
 */

/** A row in the thread sidebar. Mirrors `OrchestrationV2ThreadShell` (contracts/orchestrationV2.ts). */
export interface SessionThreadSummary {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly branch: string | null;
  readonly activeRunId: string | null;
  readonly updatedAt: string;
}

/** Mirrors `OrchestrationV2ConversationMessage` (contracts/orchestrationV2.ts). */
export interface SessionMessage {
  readonly id: string;
  readonly threadId: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly text: string;
  readonly streaming: boolean;
  readonly createdAt: string;
}

/** One frame of `subscribeThread` (ORCHESTRATION_V2_WS_METHODS.subscribeThread). */
export type SessionThreadStreamItem =
  | { readonly kind: 'snapshot'; readonly snapshotSequence: number; readonly messages: readonly SessionMessage[] }
  | { readonly kind: 'message'; readonly sequence: number; readonly message: SessionMessage }
  | { readonly kind: 'synchronized' };

/** Mirrors `OrchestrationGetFullThreadDiffResult` (contracts/checkpointDiff.ts): `{threadId, diff}` plus the turn range it covers. */
export interface SessionDiffResult {
  readonly threadId: string;
  readonly fromTurnCount: number;
  readonly toTurnCount: number;
  /** A unified diff (`diff --git a/... b/...` / `@@ ... @@` hunks), same shape @pierre/diffs parses. */
  readonly diff: string;
}

export interface SendMessageInput {
  readonly threadId: string;
  readonly text: string;
}

export type ThreadEventHandler = (item: SessionThreadStreamItem) => void;

/**
 * The RPC surface the recoder-session Wave block depends on. Implemented by
 * `EffectRecoderSessionRpcClient` (real, wraps `@t3tools/client-runtime`) in
 * production and by `FakeRecoderSessionRpcClient` (in-memory, no socket) in
 * tests — callers never need a live `recoder` server process to exercise the
 * ViewModel.
 */
export interface RecoderSessionRpcClient {
  /** Opens the WebSocket session to the local `recoder` environment server. Idempotent. */
  connect(): Promise<void>;
  /** Closes the session and releases any subscriptions. Idempotent. */
  disconnect(): Promise<void>;
  /** The thread sidebar list (archived-shell snapshot, newest first). */
  listThreads(): Promise<readonly SessionThreadSummary[]>;
  /**
   * Subscribes to one thread's message stream (`orchestration.subscribeThread`).
   * Returns an unsubscribe function. The first call delivers a `snapshot` item.
   */
  subscribeThread(threadId: string, onEvent: ThreadEventHandler): () => void;
  /** Sends a composer message (`orchestration.dispatchCommand` / `message.dispatch`). */
  sendMessage(input: SendMessageInput): Promise<void>;
  /** Fetches the full-thread unified diff for review (`orchestration.getFullThreadDiff`). */
  getFullThreadDiff(threadId: string): Promise<SessionDiffResult>;
}
