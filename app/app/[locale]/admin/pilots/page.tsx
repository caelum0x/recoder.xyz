'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import styles from './pilots.module.css';

type PilotStatus = 'started' | 'completed' | 'verified' | 'cancelled';
type MetricDirection = 'increase' | 'decrease' | 'exact';
type LoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable';

interface LeadRef { id: string; createdAt: string }
interface PilotRecord {
  id: string;
  designPartnerLeadId: string;
  metricName: string;
  metricUnit: string;
  metricDirection: MetricDirection;
  baselineValue: number;
  targetValue: number;
  outcomeValue: number | null;
  proofUrl: string | null;
  status: PilotStatus;
  updatedAt: string;
  revision: number;
  lastEvidence?: { action: string; eventHash: string; createdAt: string };
}
interface Records { leadRefs: LeadRef[]; pilots: PilotRecord[] }
interface Notice { kind: 'idle' | 'busy' | 'success' | 'error'; action: string; message: string }
interface PendingKey { body: string; key: string }

const EMPTY_NOTICE: Notice = { kind: 'idle', action: '', message: '' };

export default function PilotOperationsPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadMessage, setLoadMessage] = useState('Loading pilot records.');
  const [records, setRecords] = useState<Records>({ leadRefs: [], pilots: [] });
  const [notice, setNotice] = useState<Notice>(EMPTY_NOTICE);
  const pendingKeys = useRef(new Map<string, PendingKey>());

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const response = await fetch('/api/admin/pilots', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json().catch(() => null) as unknown;
      if (response.status === 401 || response.status === 403) {
        setLoadState('unauthorized');
        setLoadMessage(readError(body) || 'An administrator session is required.');
        return false;
      }
      if (!response.ok || !isRecordsResponse(body)) {
        setLoadState('unavailable');
        setLoadMessage(readError(body) || 'Pilot records are unavailable.');
        return false;
      }
      setRecords({ leadRefs: body.leadRefs, pilots: body.pilots });
      setLoadState('ready');
      setLoadMessage(`${body.leadRefs.length} intakes and ${body.pilots.length} pilots loaded.`);
      return true;
    } catch {
      setLoadState('unavailable');
      setLoadMessage('The pilot API could not be reached.');
      return false;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(action: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>, success: string) {
    const body = JSON.stringify(payload);
    const pending = pendingKeys.current.get(action);
    const idempotencyKey = pending?.body === body ? pending.key : crypto.randomUUID();
    pendingKeys.current.set(action, { body, key: idempotencyKey });
    setNotice({ kind: 'busy', action, message: 'Saving to the pilot ledger.' });

    let response: Response;
    try {
      response = await fetch('/api/admin/pilots', {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body,
      });
    } catch {
      setNotice({ kind: 'error', action, message: 'The result is unknown. Retry this action to reuse the same idempotency key.' });
      return false;
    }

    const result = await response.json().catch(() => null) as unknown;
    if (!response.ok || !isMutationResponse(result)) {
      if (response.status < 500) pendingKeys.current.delete(action);
      setNotice({ kind: 'error', action, message: readError(result) || 'The pilot record was not saved.' });
      if (response.status === 401 || response.status === 403) {
        setLoadState('unauthorized');
        setLoadMessage(readError(result) || 'An administrator session is required.');
      }
      return false;
    }

    pendingKeys.current.delete(action);
    setNotice({ kind: 'success', action, message: result.replayed ? `${success} The prior result was replayed safely.` : success });
    await load();
    return true;
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate('create', 'POST', {
      designPartnerLeadId: form.get('designPartnerLeadId'),
      metricName: form.get('metricName'),
      metricUnit: form.get('metricUnit'),
      metricDirection: form.get('metricDirection'),
      baselineValue: Number(form.get('baselineValue')),
      targetValue: Number(form.get('targetValue')),
    }, 'Pilot started.');
    if (saved) formElement.reset();
  }

  async function complete(event: FormEvent<HTMLFormElement>, pilot: PilotRecord) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`complete:${pilot.id}`, 'PATCH', {
      pilotId: pilot.id,
      expectedRevision: pilot.revision,
      status: 'completed',
      outcomeValue: Number(form.get('outcomeValue')),
      proofUrl: form.get('proofUrl'),
    }, 'Pilot completed and queued for verification.');
  }

  async function transition(pilot: PilotRecord, status: 'verified' | 'cancelled') {
    const message = status === 'verified'
      ? `Verify revision ${pilot.revision} of pilot ${pilot.id}? Verification is terminal.`
      : `Cancel revision ${pilot.revision} of pilot ${pilot.id}? Cancellation is terminal.`;
    if (!window.confirm(message)) return;
    await mutate(`${status}:${pilot.id}`, 'PATCH', {
      pilotId: pilot.id,
      expectedRevision: pilot.revision,
      status,
    }, `Pilot moved to ${status}.`);
  }

  const counts = records.pilots.reduce<Record<PilotStatus, number>>((total, pilot) => {
    total[pilot.status] += 1;
    return total;
  }, { started: 0, completed: 0, verified: 0, cancelled: 0 });
  const busy = notice.kind === 'busy';

  if (loadState !== 'ready') {
    return (
      <main className={styles.page}>
        <section className={styles.state} aria-busy={loadState === 'loading'}>
          <p>{loadState === 'loading' ? 'Loading' : loadState === 'unauthorized' ? 'Access denied' : 'Unavailable'}</p>
          <h1>Pilot evidence</h1>
          <div role={loadState === 'loading' ? 'status' : 'alert'}>{loadMessage}</div>
          {loadState === 'unauthorized' && <Link href="/auth/signin?redirect=/admin/pilots">Sign in</Link>}
          {loadState === 'unavailable' && <button type="button" onClick={() => void load()}>Retry</button>}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heading}>
        <div><p>Measured delivery records</p><h1>Pilot evidence</h1></div>
        <div className={styles.loaded} role="status">{loadMessage}<button type="button" onClick={() => void load()}>Refresh</button></div>
      </section>

      <section className={styles.statusRail} aria-label="Pilot status counts">
        <div><span>Intakes</span><strong>{records.leadRefs.length}</strong></div>
        <div><span>Started</span><strong>{counts.started}</strong></div>
        <div><span>Completed</span><strong>{counts.completed}</strong></div>
        <div><span>Verified</span><strong>{counts.verified}</strong></div>
        <div><span>Cancelled</span><strong>{counts.cancelled}</strong></div>
      </section>

      <section className={styles.newPilot}>
        <div>
          <h2>Start from an intake</h2>
          <p>Only persisted design-partner submissions appear here. The email and fit answers remain outside this response.</p>
        </div>
        <form onSubmit={create}>
          <label>Intake<select name="designPartnerLeadId" required defaultValue="" disabled={busy || records.leadRefs.length === 0}><option value="" disabled>Select an intake</option>{records.leadRefs.map((lead) => <option key={lead.id} value={lead.id}>{lead.id} · {formatDate(lead.createdAt)}</option>)}</select></label>
          <label>Measure<input name="metricName" required maxLength={120} disabled={busy} /></label>
          <label>Unit<input name="metricUnit" required maxLength={40} disabled={busy} /></label>
          <label>Direction<select name="metricDirection" defaultValue="decrease" disabled={busy}><option value="decrease">Lower is better</option><option value="increase">Higher is better</option><option value="exact">Exact target</option></select></label>
          <label>Baseline<input name="baselineValue" type="number" step="any" required disabled={busy} /></label>
          <label>Target<input name="targetValue" type="number" step="any" required disabled={busy} /></label>
          <button type="submit" disabled={busy || records.leadRefs.length === 0}>{notice.action === 'create' && busy ? 'Saving' : 'Start pilot'}</button>
        </form>
        {records.leadRefs.length === 0 && <p className={styles.empty}>No persisted intakes are available. Submit the design-partner form or import approved legacy records before starting a pilot.</p>}
      </section>

      {notice.kind !== 'idle' && <p className={styles.notice} data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}

      <section className={styles.ledger}>
        <div className={styles.ledgerTitle}><h2>Evidence ledger</h2><p>{records.pilots.length} current records</p></div>
        {records.pilots.length === 0 ? <p className={styles.empty}>No pilots have been started.</p> : records.pilots.map((pilot, index) => (
          <article className={styles.card} key={pilot.id} style={{ '--tilt': `${index % 2 === 0 ? -1 : 1}deg` } as CSSProperties}>
            <header><code>{pilot.id}</code><strong data-status={pilot.status}>{pilot.status}</strong></header>
            <div className={styles.trace}><span>{pilot.designPartnerLeadId}</span><b>revision {pilot.revision}</b><span>{pilot.lastEvidence?.eventHash ? pilot.lastEvidence.eventHash.slice(0, 16) : 'evidence pending'}</span></div>
            <div className={styles.measure}>
              <div><span>Measure</span><strong>{pilot.metricName}</strong><small>{pilot.metricDirection}</small></div>
              <div><span>Baseline</span><strong>{pilot.baselineValue}</strong><small>{pilot.metricUnit}</small></div>
              <div><span>Target</span><strong>{pilot.targetValue}</strong><small>{pilot.metricUnit}</small></div>
              <div><span>Outcome</span><strong>{pilot.outcomeValue ?? '—'}</strong><small>{pilot.outcomeValue === null ? 'not recorded' : pilot.metricUnit}</small></div>
            </div>
            {pilot.proofUrl && <p className={styles.proof}><a href={pilot.proofUrl} target="_blank" rel="noopener noreferrer">Open public proof</a></p>}
            {pilot.status === 'started' && <form className={styles.complete} onSubmit={(event) => complete(event, pilot)}><label>Outcome<input name="outcomeValue" type="number" step="any" required disabled={busy} /></label><label>Public proof URL<input name="proofUrl" type="url" maxLength={2048} disabled={busy} /></label><button type="submit" disabled={busy}>{notice.action === `complete:${pilot.id}` && busy ? 'Saving' : 'Complete'}</button></form>}
            <div className={styles.actions}>
              {pilot.status === 'completed' && <button type="button" onClick={() => void transition(pilot, 'verified')} disabled={busy}>Verify</button>}
              {(pilot.status === 'started' || pilot.status === 'completed') && <button type="button" onClick={() => void transition(pilot, 'cancelled')} disabled={busy}>Cancel</button>}
            </div>
            <footer>Updated {formatDate(pilot.updatedAt)}</footer>
          </article>
        ))}
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
}

function readError(value: unknown): string {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : '';
}

function isMutationResponse(value: unknown): value is { success: true; replayed: boolean } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.success === true && typeof record.replayed === 'boolean';
}

function isRecordsResponse(value: unknown): value is { success: true; leadRefs: LeadRef[]; pilots: PilotRecord[] } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.success === true && Array.isArray(record.leadRefs) && record.leadRefs.every(isLeadRef) && Array.isArray(record.pilots) && record.pilots.every(isPilot);
}

function isLeadRef(value: unknown): value is LeadRef {
  if (typeof value !== 'object' || value === null) return false;
  const lead = value as Partial<LeadRef>;
  return typeof lead.id === 'string' && typeof lead.createdAt === 'string';
}

function isPilot(value: unknown): value is PilotRecord {
  if (typeof value !== 'object' || value === null) return false;
  const pilot = value as Partial<PilotRecord>;
  return typeof pilot.id === 'string' && typeof pilot.designPartnerLeadId === 'string' && typeof pilot.metricName === 'string' && typeof pilot.metricUnit === 'string' &&
    ['increase', 'decrease', 'exact'].includes(pilot.metricDirection ?? '') && Number.isFinite(pilot.baselineValue) && Number.isFinite(pilot.targetValue) &&
    (pilot.outcomeValue === null || Number.isFinite(pilot.outcomeValue)) && (pilot.proofUrl === null || typeof pilot.proofUrl === 'string') &&
    ['started', 'completed', 'verified', 'cancelled'].includes(pilot.status ?? '') && typeof pilot.updatedAt === 'string' && Number.isInteger(pilot.revision);
}
