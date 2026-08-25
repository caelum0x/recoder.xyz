'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import styles from './design-partners.module.css';

const AGENTS = [
  ['claude code', 'Claude Code'],
  ['codex', 'Codex'],
  ['cursor', 'Cursor'],
  ['opencode', 'opencode'],
  ['other', 'Other'],
] as const;
const PAINS = [
  ['compare', 'Comparing agent output'],
  ['merge', 'Merging contested changes'],
  ['governance', 'Approval and audit evidence'],
  ['privacy', 'Keeping code private'],
  ['cost', 'Controlling model cost'],
  ['reliability', 'Knowing whether the result works'],
] as const;

type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export default function DesignPartnersPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const pending = useRef<{ body: string; key: string } | null>(null);

  function toggleAgent(value: string) {
    setAgents((current) => current.includes(value) ? current.filter((agent) => agent !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (agents.length === 0) {
      setState('error');
      setMessage('Select at least one coding agent.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({
      email: form.get('email'),
      teamSize: form.get('teamSize'),
      currentAgents: agents,
      deployment: form.get('deployment'),
      primaryPain: form.get('primaryPain'),
      weeklyRuns: form.get('weeklyRuns'),
      evidenceRequired: form.get('evidenceRequired') === 'on',
      pilotTiming: form.get('pilotTiming'),
      interviewConsent: form.get('interviewConsent') === 'on',
      website: form.get('website'),
    });
    const idempotencyKey = pending.current?.body === body ? pending.current.key : crypto.randomUUID();
    pending.current = { body, key: idempotencyKey };
    setState('submitting');
    setMessage('Recording your intake.');
    try {
      const response = await fetch('/api/pilot-intake', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body,
      });
      const result = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isSuccess(result)) {
        if (response.status < 500) pending.current = null;
        setState('error');
        setMessage(readError(result) || 'The intake was not recorded.');
        return;
      }
      pending.current = null;
      setState('done');
      setMessage(result.replayed ? 'Your previously recorded intake was confirmed.' : 'Your intake was recorded.');
    } catch {
      setState('error');
      setMessage('The result is unknown. Retry without changing the form to safely reuse the same submission key.');
    }
  }

  return (
    <main className={styles.page}>
      <header><Link href="/">Recoder</Link><span>Design-partner intake</span></header>
      <section className={styles.hero}>
        <p>For teams running repeated coding-agent work</p>
        <h1>Measure the work before scaling it.</h1>
        <div className={styles.trace}>Intake → baseline → target → outcome → verification</div>
      </section>
      <section className={styles.contract}>
        <h2>What a pilot records</h2>
        <ol>
          <li><b>1</b><span>A real intake tied to your team’s current workflow.</span></li>
          <li><b>2</b><span>One named measure with a baseline and target.</span></li>
          <li><b>3</b><span>An outcome and public proof link when the work completes.</span></li>
          <li><b>4</b><span>Administrator verification before inclusion in aggregate proof.</span></li>
        </ol>
      </section>
      <section className={styles.intake}>
        <div className={styles.intro}>
          <h2>Apply with the workflow you use now.</h2>
          <p>Recoder stores your email and selected operational answers in its private pilot database for intake review and pilot planning. Submitting this form does not start a pilot.</p>
        </div>
        {state === 'done' ? (
          <div className={styles.done} role="status"><h3>{message}</h3><p>If the workflow fits the current program, the team will follow up from founders@recoder.xyz.</p><Link href="/">Return to Recoder</Link></div>
        ) : (
          <form onSubmit={submit} aria-busy={state === 'submitting'}>
            <input name="website" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label>Engineering team size<select name="teamSize" required defaultValue=""><option value="" disabled>Select</option><option value="1">1</option><option value="2-10">2–10</option><option value="11-50">11–50</option><option value="51-200">51–200</option><option value="201+">201+</option></select></label>
            <fieldset className={styles.full}><legend>Coding agents in active use</legend><div className={styles.agentChoices}>{AGENTS.map(([value, label]) => <label key={value}><input type="checkbox" checked={agents.includes(value)} onChange={() => toggleAgent(value)} /><span>{label}</span></label>)}</div></fieldset>
            <label>Where agents run<select name="deployment" required defaultValue=""><option value="" disabled>Select</option><option value="local">Local or self-hosted</option><option value="cloud">Cloud</option><option value="both">Both</option></select></label>
            <label>Agent runs per week<select name="weeklyRuns" required defaultValue=""><option value="" disabled>Select</option><option value="0-5">0–5</option><option value="6-20">6–20</option><option value="21-100">21–100</option><option value="101+">101+</option></select></label>
            <fieldset className={styles.full}><legend>Primary bottleneck</legend><div className={styles.pains}>{PAINS.map(([value, label]) => <label key={value}><input type="radio" name="primaryPain" value={value} required /><span>{label}</span></label>)}</div></fieldset>
            <label>Pilot timing<select name="pilotTiming" required defaultValue=""><option value="" disabled>Select</option><option value="now">Ready now</option><option value="30-days">Within 30 days</option><option value="quarter">This quarter</option><option value="research">Research only</option></select></label>
            <div className={styles.checks}><label><input name="evidenceRequired" type="checkbox" />We require audit or compliance evidence.</label><label><input name="interviewConsent" type="checkbox" />I can join a 30-minute product interview.</label></div>
            {state === 'error' && <p className={styles.error} role="alert">{message}</p>}
            <button className={styles.submit} type="submit" disabled={state === 'submitting'}>{state === 'submitting' ? 'Submitting' : 'Submit intake'}</button>
            <p className={styles.privacy}>Read the <Link href="/legal/privacy">Privacy Policy</Link> before submitting.</p>
          </form>
        )}
      </section>
    </main>
  );
}

function isSuccess(value: unknown): value is { success: true; replayed: boolean } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.success === true && typeof record.replayed === 'boolean';
}

function readError(value: unknown): string {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : '';
}
