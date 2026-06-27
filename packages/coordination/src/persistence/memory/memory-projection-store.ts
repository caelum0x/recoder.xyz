/**
 * MemoryProjectionStore — in-memory `RunProjectionPort` + `SquadMemberViewPort`
 * (the optional liveness projections the coherence snapshot loader reads but the
 * core store ports do not expose). Holds live-run facts and squad-member belief
 * views for tests and single-process runtimes. The Postgres adapter (wave-2)
 * derives these from the agent-os TaskRun + multica squad-assignment tables.
 */

import type { LiveRun, SquadMemberView } from '../../coherence/snapshot';
import type { RunProjectionPort, SquadMemberViewPort } from '../../coherence/snapshot-loader';

export class MemoryProjectionStore implements RunProjectionPort, SquadMemberViewPort {
  private readonly runs = new Map<string, LiveRun>();
  private readonly views: SquadMemberView[] = [];

  /** Seed/replace a live-run projection. */
  upsertRun(run: LiveRun): void {
    this.runs.set(run.runId, { ...run });
  }

  /** Seed/replace a squad-member belief view. */
  setMemberView(view: SquadMemberView): void {
    const index = this.views.findIndex(
      (existing) => existing.squadId === view.squadId && existing.memberId === view.memberId,
    );
    if (index >= 0) {
      this.views[index] = { ...view };
    } else {
      this.views.push({ ...view });
    }
  }

  async liveRuns(spaceIds?: string[]): Promise<LiveRun[]> {
    const wanted = spaceIds && spaceIds.length > 0 ? new Set(spaceIds) : undefined;
    const out: LiveRun[] = [];
    for (const run of this.runs.values()) {
      if (!wanted || wanted.has(run.spaceId)) {
        out.push({ ...run });
      }
    }
    return out;
  }

  /** `SquadMemberViewPort.memberViews`. */
  async memberViews(): Promise<SquadMemberView[]> {
    return this.views.map((view) => ({ ...view }));
  }
}
