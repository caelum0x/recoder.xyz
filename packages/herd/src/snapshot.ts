/**
 * One herd snapshot: the workspace list plus, for each still-working workspace,
 * whether its agent is blocked on an interactive prompt (derived from the run
 * log's needs_input/log ordering). Events are fetched only for working-state
 * workspaces — review/terminal rows can't be input-blocked — keeping a 2s poll
 * cheap on a busy board.
 */
import type { Workspace } from '@recoder/agent-os';
import { fetchWorkspaceEvents, fetchWorkspaces } from './client.js';
import { herdStatus } from './classify.js';
import { waitingPrompt } from './waits.js';
import type { WaitMap } from './render.js';

export interface HerdSnapshot {
  workspaces: Workspace[];
  waits: WaitMap;
}

export async function fetchHerdSnapshot(backend: string, token?: string): Promise<HerdSnapshot> {
  const workspaces = await fetchWorkspaces(backend, token);
  const working = workspaces.filter((w) => herdStatus(w.state) === 'working');
  const waits: WaitMap = {};
  await Promise.all(
    working.map(async (w) => {
      const prompt = waitingPrompt(await fetchWorkspaceEvents(backend, w.workspaceId, token));
      if (prompt) waits[w.workspaceId] = prompt;
    }),
  );
  return { workspaces, waits };
}
