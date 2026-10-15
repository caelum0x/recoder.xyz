import type {
  RecoderSessionRpcClient,
  SendMessageInput,
  SessionDiffResult,
  SessionMessage,
  SessionThreadStreamItem,
  SessionThreadSummary,
  ThreadEventHandler,
} from './types.js';

export interface FakeRecoderSessionRpcClientSeed {
  readonly threads?: readonly SessionThreadSummary[];
  readonly messagesByThread?: Readonly<Record<string, readonly SessionMessage[]>>;
  readonly diffsByThread?: Readonly<Record<string, SessionDiffResult>>;
}

/**
 * An in-memory `RecoderSessionRpcClient` for tests (and local Storybook-style
 * dev) that never opens a socket and never requires a live `recoder` server
 * process. Deliberately deterministic: `sendMessage` appends a message and
 * replays it to every live subscriber synchronously, so tests don't need
 * fake timers to observe the round trip.
 */
export class FakeRecoderSessionRpcClient implements RecoderSessionRpcClient {
  #connected = false;
  #threads: SessionThreadSummary[];
  #messagesByThread: Map<string, SessionMessage[]>;
  #diffsByThread: Map<string, SessionDiffResult>;
  #subscribers = new Map<string, Set<ThreadEventHandler>>();
  #sequenceByThread = new Map<string, number>();
  #nextMessageId = 1;

  /** Calls recorded for assertions (`sendMessage` inputs, in order). */
  readonly sentMessages: SendMessageInput[] = [];

  constructor(seed: FakeRecoderSessionRpcClientSeed = {}) {
    this.#threads = [...(seed.threads ?? [])];
    this.#messagesByThread = new Map(
      Object.entries(seed.messagesByThread ?? {}).map(([threadId, messages]) => [threadId, [...messages]]),
    );
    this.#diffsByThread = new Map(Object.entries(seed.diffsByThread ?? {}));
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
    this.#subscribers.clear();
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  async listThreads(): Promise<readonly SessionThreadSummary[]> {
    return [...this.#threads];
  }

  subscribeThread(threadId: string, onEvent: ThreadEventHandler): () => void {
    const set = this.#subscribers.get(threadId) ?? new Set<ThreadEventHandler>();
    set.add(onEvent);
    this.#subscribers.set(threadId, set);
    const sequence = this.#sequenceByThread.get(threadId) ?? 0;
    const messages = this.#messagesByThread.get(threadId) ?? [];
    const snapshot: SessionThreadStreamItem = {
      kind: 'snapshot',
      snapshotSequence: sequence,
      messages: [...messages],
    };
    // Deliver asynchronously (microtask) so a caller that subscribes and then
    // synchronously reads the model's "loading" state sees it at least once —
    // matching a real socket's inherent one-tick-minimum latency.
    queueMicrotask(() => {
      if (this.#subscribers.get(threadId)?.has(onEvent)) onEvent(snapshot);
    });
    return () => {
      this.#subscribers.get(threadId)?.delete(onEvent);
    };
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    this.sentMessages.push(input);
    const message: SessionMessage = {
      id: `fake-message-${this.#nextMessageId++}`,
      threadId: input.threadId,
      role: 'user',
      text: input.text,
      streaming: false,
      createdAt: new Date().toISOString(),
    };
    const list = this.#messagesByThread.get(input.threadId) ?? [];
    list.push(message);
    this.#messagesByThread.set(input.threadId, list);
    const sequence = (this.#sequenceByThread.get(input.threadId) ?? 0) + 1;
    this.#sequenceByThread.set(input.threadId, sequence);
    const event: SessionThreadStreamItem = { kind: 'message', sequence, message };
    for (const handler of this.#subscribers.get(input.threadId) ?? []) handler(event);
  }

  async getFullThreadDiff(threadId: string): Promise<SessionDiffResult> {
    const diff = this.#diffsByThread.get(threadId);
    if (diff !== undefined) return diff;
    return { threadId, fromTurnCount: 0, toTurnCount: 0, diff: '' };
  }

  /** Test helper: pushes an assistant reply onto a thread as if the agent had answered. */
  pushAssistantMessage(threadId: string, text: string): void {
    const message: SessionMessage = {
      id: `fake-message-${this.#nextMessageId++}`,
      threadId,
      role: 'assistant',
      text,
      streaming: false,
      createdAt: new Date().toISOString(),
    };
    const list = this.#messagesByThread.get(threadId) ?? [];
    list.push(message);
    this.#messagesByThread.set(threadId, list);
    const sequence = (this.#sequenceByThread.get(threadId) ?? 0) + 1;
    this.#sequenceByThread.set(threadId, sequence);
    const event: SessionThreadStreamItem = { kind: 'message', sequence, message };
    for (const handler of this.#subscribers.get(threadId) ?? []) handler(event);
  }
}
