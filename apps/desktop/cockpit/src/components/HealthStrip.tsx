/**
 * HealthStrip — the engine/health strip: runtimes + substrates + connectors,
 * polled live from GET /api/conductor/runtimes, /api/conductor/substrates, and
 * GET /api/connectors. Truthful: shows exactly which agent CLIs are installed,
 * which execution substrates are registered/available, and which chat-channel
 * connectors are configured/connected. No fabricated "all good" state — each
 * group surfaces its real error or empty state.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 10_000;

export function HealthStrip() {
  const runtimes = usePoll(() => api.runtimes(), POLL_MS);
  const substrates = usePoll(() => api.substrates(), POLL_MS);
  const connectors = usePoll(() => api.connectors(), POLL_MS);
  const connectorChannels = connectors.data?.channels ?? [];

  return (
    <div class="health-strip">
      <div class="health-group">
        <span class="health-group-label">Runtimes</span>
        {runtimes.error ? (
          <span class="health-error">unavailable: {runtimes.error.message}</span>
        ) : runtimes.data ? (
          runtimes.data.map((r) => (
            <span class={`pill ${r.available ? 'pill-good' : 'pill-bad'}`} key={r.runtimeId} title={r.path || r.bin}>
              <span class="pill-dot" /> {r.runtimeId}
            </span>
          ))
        ) : (
          <span class="health-loading">loading…</span>
        )}
      </div>

      <div class="health-group">
        <span class="health-group-label">Substrates</span>
        {substrates.error ? (
          <span class="health-error">unavailable: {substrates.error.message}</span>
        ) : substrates.data ? (
          substrates.data.length === 0 ? (
            <span class="health-loading">none registered</span>
          ) : (
            substrates.data.map((s) => (
              <span
                class={`pill ${s.available ? 'pill-good' : 'pill-bad'}`}
                key={s.id}
                title={s.reason || s.id}
              >
                <span class="pill-dot" /> {s.id}
              </span>
            ))
          )
        ) : (
          <span class="health-loading">loading…</span>
        )}
      </div>

      <div class="health-group">
        <span class="health-group-label">Connectors</span>
        {connectors.error ? (
          <span class="health-error">unavailable: {connectors.error.message}</span>
        ) : connectors.data ? (
          connectorChannels.length === 0 ? (
            <span class="health-loading">no channels configured</span>
          ) : (
            connectorChannels.map((c) => (
              <span
                class={`pill ${c.connected ? 'pill-good' : 'pill-bad'}`}
                key={`${c.channel}:${c.accountId}`}
                title={c.error || (c.connected ? 'connected' : c.configured ? 'configured (not connected)' : 'not configured')}
              >
                <span class="pill-dot" /> {c.channel}
              </span>
            ))
          )
        ) : (
          <span class="health-loading">loading…</span>
        )}
      </div>
    </div>
  );
}
