/**
 * FUSION of `packages/pi-coding-agent/src/modes/rpc/rpc-client.ts`.
 *
 * Speaks pi's JSONL `RpcCommand`/`RpcResponse` protocol over a spawned `pi --mode rpc`
 * child. Steering (`steer`/`abort`/`compact`) is the whole point of the rpc variant. This
 * port reuses `drivers/shared` jsonl + process plumbing instead of re-implementing the
 * spawn/framing logic the original client carried inline.
 */

import { writeJsonLine } from '../shared/jsonl-writer';
import { attachJsonlObjectReader } from '../shared/jsonl-reader';
import type { SpawnedProcess } from '../shared/process-driver';
import {
  isRpcResponse,
  type PiAgentSessionEvent,
  type PiRpcCommand,
  type PiRpcCommandBody,
  type PiRpcResponse,
} from './pi-wire-types';

type PendingRequest = {
  resolve: (response: PiRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type PiRpcEventListener = (event: PiAgentSessionEvent) => void;

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * A typed client over an already-spawned `pi --mode rpc` process. Lifecycle (spawn/kill)
 * stays with the driver; this client owns only the request/response correlation + event fan-out.
 */
export class PiRpcClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners: PiRpcEventListener[] = [];
  private detachStdout: (() => void) | null = null;
  private requestSeq = 0;
  private closedError: Error | null = null;

  constructor(private readonly spawned: SpawnedProcess) {
    this.detachStdout = attachJsonlObjectReader<PiRpcResponse | PiAgentSessionEvent>(
      spawned.stdout,
      (line) => this.handleLine(line),
    );
  }

  onEvent(listener: PiRpcEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  async prompt(message: string): Promise<void> {
    await this.send({ type: 'prompt', message });
  }

  async steer(message: string): Promise<void> {
    await this.send({ type: 'steer', message });
  }

  async followUp(message: string): Promise<void> {
    await this.send({ type: 'follow_up', message });
  }

  async abort(): Promise<void> {
    await this.send({ type: 'abort' });
  }

  async compact(customInstructions?: string): Promise<void> {
    await this.send({ type: 'compact', customInstructions });
  }

  /** Reject all in-flight requests and stop reading. Called by the driver on teardown. */
  dispose(reason?: Error): void {
    this.closedError = reason ?? this.closedError;
    this.detachStdout?.();
    this.detachStdout = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason ?? new Error('pi rpc client disposed'));
    }
    this.pending.clear();
  }

  private async send(body: PiRpcCommandBody): Promise<PiRpcResponse> {
    const stdin = this.spawned.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      throw this.closedError ?? new Error('pi rpc stdin is not writable');
    }
    if (this.closedError) throw this.closedError;

    const id = `req_${++this.requestSeq}`;
    const command: PiRpcCommand = { ...body, id };

    return new Promise<PiRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for pi rpc response to "${body.type}".`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      writeJsonLine(stdin, command).catch((error: unknown) => {
        const entry = this.pending.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(id);
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private handleLine(line: PiRpcResponse | PiAgentSessionEvent): void {
    if (isRpcResponse(line) && line.id && this.pending.has(line.id)) {
      const pending = this.pending.get(line.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(line.id);
        pending.resolve(line);
      }
      return;
    }
    if (isRpcResponse(line)) {
      // Unsolicited response without a matching id — ignore (matches original client).
      return;
    }
    for (const listener of this.listeners) {
      listener(line);
    }
  }
}
