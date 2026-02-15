/**
 * Project Context Cache
 *
 * Eliminates redundant Docker API calls for project context.
 * Every message previously triggered 50+ HTTP requests to fetch file list + contents,
 * even when no files changed. This singleton caches the result and invalidates
 * via file watcher events dispatched on `window`.
 *
 * Listened events (mark cache dirty):
 *   - recoder:file-changed
 *   - recoder:refresh-files
 *   - recoder:file-resync
 */

import { loadProjectContext, type ProjectContext } from './code-context';

class ProjectContextCache {
  private cachedContext: ProjectContext | null = null;
  private dirty = true;
  private lastProjectId = '';
  private fetchPromise: Promise<ProjectContext | null> | null = null;
  private listeners: Array<{ event: string; handler: () => void }> = [];

  /** Subscribe to file-change window events so we know when to invalidate. */
  init(): void {
    // Avoid double-init
    if (this.listeners.length > 0) return;

    const events = ['recoder:file-changed', 'recoder:refresh-files', 'recoder:file-resync'];

    for (const event of events) {
      const handler = () => {
        this.dirty = true;
      };
      window.addEventListener(event, handler);
      this.listeners.push({ event, handler });
    }
  }

  /** Remove all event listeners. */
  destroy(): void {
    for (const { event, handler } of this.listeners) {
      window.removeEventListener(event, handler);
    }
    this.listeners = [];
  }

  /**
   * Return cached context if nothing changed, otherwise fetch fresh.
   * Concurrent callers share the same in-flight promise (dedup).
   */
  async getContext(projectId: string): Promise<ProjectContext | null> {
    // Project changed — full reset
    if (projectId !== this.lastProjectId) {
      this.cachedContext = null;
      this.dirty = true;
      this.fetchPromise = null;
      this.lastProjectId = projectId;
    }

    // Cache hit
    if (!this.dirty && this.cachedContext) {
      return this.cachedContext;
    }

    // Dedup: if a fetch is already in-flight, piggy-back on it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch fresh context
    this.fetchPromise = loadProjectContext(projectId)
      .then((ctx) => {
        this.cachedContext = ctx;
        this.dirty = false;
        this.fetchPromise = null;
        return ctx;
      })
      .catch((err) => {
        this.fetchPromise = null;
        throw err;
      });

    return this.fetchPromise;
  }

  /** Mark the cache as stale so the next getContext() re-fetches. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Synchronous read of the last cached value (may be null). */
  getCachedContext(): ProjectContext | null {
    return this.cachedContext;
  }
}

/** App-wide singleton */
export const projectContextCache = new ProjectContextCache();
