/**
 * RetrievalPanel — RAG/vector-search surface (ColBERT + LanceDB).
 *
 * Surfaces:
 *   GET  /api/retrieval/health  — truthful capability health (no auth)
 *   POST /api/retrieval/search  — query -> ranked results (authenticated)
 *
 * DEGRADE-SAFE: when neither COLBERT_RERANK_URL nor LANCE_DB_PATH is
 * configured, the backend returns 503 and this panel shows a truthful
 * "unavailable — <reason>" banner. No mock results are ever rendered.
 *
 * BOUNDARY: this panel is READ-ONLY for the retrieval seam. Agent OS
 * owns memory and task state; this panel only surfaces search results.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { RetrievalHealth, RetrievalResult, RetrievalSearchResult } from '../types';

const HEALTH_POLL_MS = 30_000;

// ── Error helpers ─────────────────────────────────────────────────────────────

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Retrieval error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Health badge ──────────────────────────────────────────────────────────────

interface HealthBadgeProps {
  available: boolean;
  label: string;
}

function HealthBadge({ available, label }: HealthBadgeProps) {
  return (
    <span class={`badge tone-${available ? 'ok' : 'muted'}`}>{label}</span>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────

interface StatusRowProps {
  label: string;
  value: string | boolean | number | null | undefined;
}

function StatusRow({ label, value }: StatusRowProps) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'boolean'
        ? value ? 'yes' : 'no'
        : String(value);
  return (
    <div class="retrieval-row">
      <span class="retrieval-label">{label}</span>
      <span class="retrieval-value">{display}</span>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

interface ResultCardProps {
  result: RetrievalResult;
}

function ResultCard({ result }: ResultCardProps) {
  return (
    <div class="retrieval-card">
      <div class="retrieval-card-head">
        <span class="retrieval-card-rank">#{result.rank}</span>
        <span class="retrieval-card-score">
          score: {result.score.toFixed(4)}
          {result.rerankScore !== undefined && (
            <span class="retrieval-card-rerank"> (reranked: {result.rerankScore.toFixed(4)})</span>
          )}
        </span>
      </div>
      <p class="retrieval-card-text">{result.text}</p>
    </div>
  );
}

// ── Search form ───────────────────────────────────────────────────────────────

interface SearchFormProps {
  disabled: boolean;
  onSearch: (query: string, limit: number) => void;
}

function SearchForm({ disabled, onSearch }: SearchFormProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed, limit);
  }

  return (
    <form class="retrieval-form" onSubmit={handleSubmit}>
      <div class="retrieval-form-row">
        <input
          class="retrieval-input"
          type="text"
          placeholder="Search the knowledge base…"
          value={query}
          disabled={disabled}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <select
          class="retrieval-select"
          value={limit}
          disabled={disabled}
          onChange={(e) => setLimit(Number((e.target as HTMLSelectElement).value))}
        >
          <option value={5}>5 results</option>
          <option value={10}>10 results</option>
          <option value={20}>20 results</option>
          <option value={50}>50 results</option>
        </select>
        <button
          class="btn btn-primary btn-sm"
          type="submit"
          disabled={disabled || !query.trim()}
        >
          Search
        </button>
      </div>
    </form>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function RetrievalPanel() {
  const healthPoll = usePoll(() => api.retrievalHealth(), HEALTH_POLL_MS);

  const [searchResult, setSearchResult] = useState<RetrievalSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const healthData: RetrievalHealth | null = healthPoll.data;

  // Backend is completely unreachable (network error).
  const unreachable = healthPoll.error instanceof BackendUnreachableError;

  // Backend replied but retrieval is 503/unavailable.
  const retrievalUnavailable =
    !unreachable &&
    ((healthPoll.error instanceof ApiError && healthPoll.error.status === 503) ||
      healthData?.available === false);

  // A non-503 error (backend up, unexpected failure).
  const unexpectedError =
    !unreachable && !retrievalUnavailable ? healthPoll.error : null;

  const unavailableReason =
    healthData?.reason ??
    (healthPoll.error instanceof ApiError ? healthPoll.error.message : null) ??
    'Set COLBERT_RERANK_URL and/or LANCE_DB_PATH to enable RAG search.';

  const isAvailable = healthData?.available === true;
  const loading = healthPoll.loading;

  async function handleSearch(query: string, limit: number) {
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const result = await api.retrievalSearch({ query, limit });
      setSearchResult(result);
    } catch (err) {
      setSearchError(describeError(err));
    } finally {
      setSearching(false);
    }
  }

  const results: RetrievalResult[] = searchResult?.results ?? [];

  return (
    <section class="retrieval-panel">
      <div class="panel-head">
        <h2 class="panel-title">Retrieval</h2>
        <div class="panel-head-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => { healthPoll.refresh(); }}
            disabled={loading}
          >
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>Retrieval surface unavailable.</strong>{' '}
          Backend unreachable — cannot check RAG capability status.
        </div>
      )}

      {!unreachable && retrievalUnavailable && (
        <div class="banner banner-warn">
          <strong>Retrieval not configured.</strong> {unavailableReason}
          <p class="banner-hint">
            Set <code>COLBERT_RERANK_URL</code> to a running ColBERT rerank server and/or{' '}
            <code>LANCE_DB_PATH</code> to a LanceDB directory to enable RAG search.
          </p>
        </div>
      )}

      {unexpectedError && (
        <p class="action-error">Retrieval health error: {describeError(unexpectedError)}</p>
      )}

      {healthData && (
        <div class="retrieval-status-block">
          <div class="retrieval-status-row">
            <HealthBadge available={isAvailable} label={isAvailable ? 'available' : 'unavailable'} />
            {healthData.colbertConfigured && (
              <HealthBadge available label="colbert" />
            )}
            {healthData.lanceConfigured && (
              <HealthBadge available label="lance" />
            )}
          </div>
          <div class="retrieval-details">
            <StatusRow label="Service" value="retrieval" />
            <StatusRow label="ColBERT configured" value={healthData.colbertConfigured} />
            <StatusRow label="LanceDB configured" value={healthData.lanceConfigured} />
            {healthData.colbertUrl && (
              <StatusRow label="ColBERT URL" value={healthData.colbertUrl} />
            )}
            {healthData.lanceDbPath && (
              <StatusRow label="LanceDB path" value={healthData.lanceDbPath} />
            )}
            {!isAvailable && unavailableReason && (
              <StatusRow label="Reason" value={unavailableReason} />
            )}
          </div>
        </div>
      )}

      <div class="retrieval-search-block">
        <SearchForm
          disabled={!isAvailable || searching}
          onSearch={handleSearch}
        />

        {searching && (
          <div class="panel-empty">Searching…</div>
        )}

        {searchError && (
          <p class="action-error">Search failed: {searchError}</p>
        )}

        {searchResult && (
          <div class="retrieval-results">
            <div class="panel-section-head">
              <strong>Results for &ldquo;{searchResult.query}&rdquo;</strong>
              <span class="retrieval-count">
                {results.length} result{results.length !== 1 ? 's' : ''}
                {searchResult.rerankApplied ? ' (reranked)' : ''}
              </span>
            </div>

            {searchResult.reason && (
              <div class="banner banner-info">
                <strong>Note:</strong> {searchResult.reason}
              </div>
            )}

            {results.length === 0 && !searchResult.reason && (
              <div class="panel-empty">No results found.</div>
            )}

            {results.map((r) => (
              <ResultCard key={r.rank} result={r} />
            ))}
          </div>
        )}
      </div>

      {!healthData && !loading && !unreachable && !retrievalUnavailable && !unexpectedError && (
        <div class="panel-empty">No retrieval status available.</div>
      )}

      {loading && !healthData && (
        <div class="panel-empty">Checking retrieval capability…</div>
      )}
    </section>
  );
}
