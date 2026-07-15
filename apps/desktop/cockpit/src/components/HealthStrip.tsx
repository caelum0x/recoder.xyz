/**
 * HealthStrip — one quiet overall indicator for the cockpit chrome.
 *
 * The cockpit is a terminal, not an infra dashboard: the engines run invisibly
 * behind the run flow, so the operator never sees an engine-by-engine grid. This
 * collapses the live signals (agent CLIs, execution substrates, chat channels)
 * into a SINGLE truthful dot — up / degraded / checking — with the detail only
 * in an accessible tooltip. No engine names, no chips, no expandable rails.
 *
 * Truthfulness is preserved: a real backend error degrades the dot; a fully
 * ready system reads good; the first poll reads "checking". Nothing is
 * fabricated into an "all good" state.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 10_000;

type Overall = 'good' | 'degraded' | 'partial' | 'checking';

const TONE_CLASS: Record<Overall, string> = {
  good: 'sumdot-good',
  degraded: 'sumdot-bad',
  partial: 'sumdot-warn',
  checking: 'sumdot-neutral',
};

const TONE_LABEL: Record<Overall, string> = {
  good: 'All systems operational',
  degraded: 'Degraded — a backend signal is unavailable',
  partial: 'Partially ready',
  checking: 'Checking…',
};

export function HealthStrip() {
  const runtimes = usePoll(() => api.runtimes(), POLL_MS);
  const substrates = usePoll(() => api.substrates(), POLL_MS);
  const connectors = usePoll(() => api.connectors(), POLL_MS);

  // Any real backend error degrades the overall dot — never rounded away.
  const anyError = Boolean(runtimes.error || substrates.error || connectors.error);
  const anyLoading =
    (!runtimes.data && !runtimes.error) ||
    (!substrates.data && !substrates.error) ||
    (!connectors.data && !connectors.error);

  const runtimesReady = (runtimes.data ?? []).some((r) => r.available);

  let overall: Overall;
  if (anyError) overall = 'degraded';
  else if (anyLoading) overall = 'checking';
  else if (!runtimesReady) overall = 'partial';
  else overall = 'good';

  const label = TONE_LABEL[overall];

  return (
    <div class="health-strip">
      <span class="health-one" title={label} aria-label={label} role="status">
        <span class={`health-sum-dot ${TONE_CLASS[overall]}`} />
      </span>
    </div>
  );
}
