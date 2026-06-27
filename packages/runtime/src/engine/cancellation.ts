/**
 * AbortController registry keyed by runId with taskId aliases. Generalizes the
 * `controllers` map + `deleteControllerAliases` from generic-adapter.ts:284.
 */
export class CancellationRegistry {
  private readonly controllers = new Map<string, AbortController>();

  /** Register a controller under both the runId and an optional taskId alias. */
  register(runId: string, taskId?: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    if (taskId && taskId !== runId) {
      this.controllers.set(taskId, controller);
    }
    return controller;
  }

  /** Abort the run identified by runId or taskId alias. Returns whether one was found. */
  abort(idOrAlias: string): boolean {
    const controller = this.controllers.get(idOrAlias);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  get(idOrAlias: string): AbortController | undefined {
    return this.controllers.get(idOrAlias);
  }

  /** Remove a run's controller and its taskId alias. */
  release(runId: string, taskId?: string): void {
    this.controllers.delete(runId);
    if (taskId && taskId !== runId) {
      this.controllers.delete(taskId);
    }
  }

  get size(): number {
    return this.controllers.size;
  }
}
