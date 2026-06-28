/**
 * tail-registry — the active-tails map (design §4.7).
 *
 * Promoted from the module-level `Map` in
 * docker-backend/src/conductor/run-tailer.ts, hardened into an instance (not a
 * process global) so the engine, tests, and the backend can each own their
 * wiring. Idempotent per workspace: a second `register` for a live workspace
 * returns the existing handle, so a reconcile rebind while the original tail is
 * still running is harmless.
 */

export interface TailHandle {
  /** Stop the tail and remove it from the registry. Idempotent. */
  stop(): void;
}

export class TailRegistry {
  readonly #active = new Map<string, TailHandle>();

  /** The handle for a workspace's active tail, or undefined. */
  get(workspaceId: string): TailHandle | undefined {
    return this.#active.get(workspaceId);
  }

  /** Whether a tail is active for the workspace. */
  has(workspaceId: string): boolean {
    return this.#active.has(workspaceId);
  }

  /** Register a handle for a workspace (caller checks `has` first for idempotency). */
  set(workspaceId: string, handle: TailHandle): void {
    this.#active.set(workspaceId, handle);
  }

  /** Remove a workspace's handle (called by the handle's own stop()). */
  delete(workspaceId: string): void {
    this.#active.delete(workspaceId);
  }

  /** Stop a workspace's tail if one is active (no-op otherwise). */
  stop(workspaceId: string): void {
    this.#active.get(workspaceId)?.stop();
  }

  /** Number of active tails. */
  count(): number {
    return this.#active.size;
  }
}
