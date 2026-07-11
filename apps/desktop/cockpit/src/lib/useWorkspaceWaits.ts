/**
 * useWorkspaceWaits — poll RunEvents for the RUNNING workspaces and derive which
 * ones are blocked on operator input (needs_input). Returns a map of
 * workspaceId → prompt so the Board/sidebar can badge "needs input". Only
 * running workspaces are polled (review/terminal states can't be input-blocked),
 * keeping the poll cheap on a busy board.
 */
import { useEffect, useState } from 'preact/hooks';
import { api } from './api';
import { waitingPrompt } from './workspace-waits';
import type { Workspace } from '../types';

const WAITS_POLL_MS = 3000;

export function useWorkspaceWaits(workspaces: Workspace[]): Record<string, string> {
  const [waits, setWaits] = useState<Record<string, string>>({});
  const runningIds = workspaces
    .filter((w) => w.state === 'running')
    .map((w) => w.workspaceId)
    .sort()
    .join(',');

  useEffect(() => {
    if (!runningIds) {
      setWaits({});
      return;
    }
    let cancelled = false;
    const ids = runningIds.split(',');

    async function refresh() {
      const next: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const prompt = waitingPrompt(await api.listEvents(id));
            if (prompt) next[id] = prompt;
          } catch {
            /* degrade-safe: a failed events poll just omits the badge */
          }
        }),
      );
      if (!cancelled) setWaits(next);
    }

    void refresh();
    const timer = setInterval(() => void refresh(), WAITS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runningIds]);

  return waits;
}
