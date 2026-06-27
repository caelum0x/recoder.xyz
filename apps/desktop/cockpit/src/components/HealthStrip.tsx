/**
 * HealthStrip — runtimes + substrates availability, polled live from
 * GET /runtimes and GET /substrates. Truthful: shows exactly which agent CLIs
 * are installed and which execution substrates are registered/available.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 10_000;

export function HealthStrip() {
  const runtimes = usePoll(() => api.runtimes(), POLL_MS);
  const substrates = usePoll(() => api.substrates(), POLL_MS);

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
    </div>
  );
}
