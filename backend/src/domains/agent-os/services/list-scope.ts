/**
 * `list-scope` — tenant-scope THEN paginate an aggregate list read
 * (recoder-ctoj: cross-tenant read IDOR on the agent-os list surface).
 *
 * The agent-os list edges previously paged straight out of the repository with
 * no owner filter, so any authenticated caller could page another tenant's
 * tasks/runs/artifacts/events/etc. The fix mirrors the already-shipped `/spaces`
 * list edge: filter to the caller's own rows FIRST, then slice — a repo-side
 * page over unfiltered rows would leak filtered-out holes (wrong totals, gaps).
 *
 * Ownership is resolved per aggregate via `spaceIdOf`: directly for records that
 * carry a `spaceId` (task/run), or indirectly for records that carry only a
 * `taskId` (artifact/approval/instruction/memory/policy/event) by mapping
 * `taskId -> task.spaceId`. A record whose owning space cannot be resolved
 * (undefined id, or a space the caller does not own) is dropped for a
 * non-privileged caller — no existence oracle. Operator/solo callers (`seeAll`)
 * skip filtering entirely.
 */
import type { ListPage, PageQuery } from '../ports/agent-os-repository.port.js';

export function scopeAndPage<T>(
  items: readonly T[],
  spaceIdOf: (item: T) => string | undefined,
  seeAll: boolean,
  ownedSpaceIds: ReadonlySet<string>,
  page: PageQuery,
): ListPage<T> {
  const visible = seeAll
    ? [...items]
    : items.filter((item) => {
        const spaceId = spaceIdOf(item);
        return spaceId !== undefined && ownedSpaceIds.has(spaceId);
      });
  return {
    items: visible.slice(page.offset, page.offset + page.limit),
    total: visible.length,
    limit: page.limit,
    offset: page.offset,
  };
}
