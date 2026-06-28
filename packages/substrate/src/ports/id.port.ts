/**
 * IdPort — the identifier-generation seam.
 *
 * Injecting id generation keeps record/event ids deterministic under test while
 * the backend injects a `randomUUID`-backed adapter. Interface only.
 */
export interface IdPort {
  /** A fresh unique id (backend: crypto.randomUUID()). */
  newId(): string;
}
