/**
 * event-stream — the shared "one engine" for a workspace's RunEvent activity.
 *
 * Both cockpit surfaces that show agent progress observe the SAME conductor
 * session through this module:
 *   - WorkspaceCenter (the center-pane conversation)
 *   - ConversationView (the friendly skin of the detail panel's surface toggle)
 *
 * The full terminal (RecoderTerminal) attaches a PTY to the same tmux session;
 * the friendly views read that session's events here. There is never a second
 * source of truth — only two skins over `mergeEvents(listEvents, openStream)`.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RunEvent as ConductorRunEvent } from '@recoder/conductor-ui';
import { api } from './api';
import type { RunEvent } from '../types';

/** Cap retained streamed events so a long-running agent does not grow unbounded. */
const MAX_STREAMED = 200;

/**
 * Subscribe to the LIVE conductor event stream for a workspace via the shared
 * `@recoder/conductor-ui` ConductorClient (`api.openStream`). It upgrades to the
 * conductor WS endpoint when available and falls back to polling captured pane
 * output, surfacing lower-latency agent activity than the base `listEvents` poll.
 *
 * Returns the events streamed since mount (most-recent last). The hook is inert
 * for non-live workspaces (nothing to stream once the agent has stopped).
 */
export function useLiveStream(workspaceId: string, live: boolean): RunEvent[] {
  const [streamed, setStreamed] = useState<RunEvent[]>([]);
  const idRef = useRef(workspaceId);
  idRef.current = workspaceId;

  useEffect(() => {
    if (!live) {
      setStreamed([]);
      return;
    }
    setStreamed([]);
    const handle = api.openStream(workspaceId, (event: ConductorRunEvent) => {
      // The package RunEvent is shape-compatible with the cockpit RunEvent
      // (both mirror packages/agent-os event.ts), so this is a true reuse.
      setStreamed((prev) => {
        const next = [...prev, event as RunEvent];
        return next.length > MAX_STREAMED ? next.slice(next.length - MAX_STREAMED) : next;
      });
    });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, live]);

  return streamed;
}

/** Merge polled history with live-streamed events, de-duped by eventId, oldest-first. */
export function mergeEvents(polled: RunEvent[] | null, streamed: RunEvent[]): RunEvent[] {
  const byId = new Map<string, RunEvent>();
  for (const ev of polled ?? []) byId.set(ev.eventId, ev);
  for (const ev of streamed) byId.set(ev.eventId, ev);
  return [...byId.values()];
}
