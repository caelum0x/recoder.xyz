/**
 * LiveEventsView — a standalone live RunEvent stream for a selected workspace.
 *
 * Real fetches only:
 *   GET /api/conductor/workspaces            → the selectable workspace list
 *   GET /api/conductor/workspaces/:id/events → the live RunEvent stream (polled)
 *
 * The events route is the conductor's live-events surface. This polls it (~2s
 * for live workspaces, slower for terminal ones) — a real, truthful stream. No
 * WS endpoint is exposed for this route today, so a poll is used; this is noted
 * in the panel copy rather than implying a socket that does not exist.
 *
 * Truthful empty/error states: an unreachable backend, an auth failure, or an
 * empty event log each render their real condition (via EventLog), never a faked
 * "live" feed.
 */
import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog } from './EventLog';
import { isLive, stateLabel, stateTone } from '../lib/workspace-state';
import type { Workspace } from '../types';

const WORKSPACES_POLL_MS = 5000;

export function LiveEventsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const board = usePoll(() => api.listWorkspaces(), WORKSPACES_POLL_MS);
  const workspaces = board.data || [];

  // Auto-select the first workspace once the list arrives (and keep a valid
  // selection if the current one disappears), so the operator sees a real stream
  // immediately without an extra click.
  useEffect(() => {
    if (workspaces.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !workspaces.some((w) => w.workspaceId === selectedId)) {
      setSelectedId(workspaces[0].workspaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.data]);

  const selected: Workspace | null =
    workspaces.find((w) => w.workspaceId === selectedId) || null;
  const live = selected ? isLive(selected.state) : false;

  const events = usePoll(
    () => (selectedId ? api.listEvents(selectedId) : Promise.resolve(null)),
    live ? 2000 : 15_000,
    [selectedId],
  );

  return (
    <div class="live-events-view">
      <div class="panel-head">
        <h2 class="panel-title">Live Events</h2>
        <div class="panel-head-actions">
          <span class="panel-head-note">polling GET /workspaces/:id/events</span>
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              board.refresh();
              events.refresh();
            }}
            disabled={board.loading || events.loading}
          >
            {events.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {board.error ? (
        <div class="banner banner-warn">
          <strong>Workspace list unavailable:</strong> {board.error.message}
        </div>
      ) : null}

      <div class="live-events-body">
        <aside class="live-events-list">
          {board.loading && !board.data ? (
            <div class="panel-empty">Loading workspaces…</div>
          ) : workspaces.length === 0 ? (
            <div class="panel-empty">
              <p>No workspaces.</p>
              <p class="panel-empty-sub">Create a workspace to see its live event stream.</p>
            </div>
          ) : (
            workspaces.map((w) => (
              <button
                key={w.workspaceId}
                class={`live-events-item ${w.workspaceId === selectedId ? 'live-events-item-active' : ''}`}
                onClick={() => setSelectedId(w.workspaceId)}
                title={w.workspaceId}
              >
                <span class="live-events-item-branch">{w.branch}</span>
                <span class={`badge tone-${stateTone(w.state)}`}>{stateLabel(w.state)}</span>
              </button>
            ))
          )}
        </aside>

        <section class="live-events-stream">
          {selected ? (
            <>
              <div class="live-events-stream-head">
                <span class={`badge tone-${stateTone(selected.state)}`}>{stateLabel(selected.state)}</span>
                <span class="live-events-stream-branch">{selected.branch}</span>
                <span class="live-events-stream-meta">
                  {selected.runtimeId} · {selected.substrate} ·{' '}
                  {live ? 'live (2s)' : 'terminal (15s)'}
                </span>
              </div>
              <EventLog events={events.data} error={events.error} loading={events.loading} />
            </>
          ) : (
            <div class="log-empty">Select a workspace to stream its events.</div>
          )}
        </section>
      </div>
    </div>
  );
}
