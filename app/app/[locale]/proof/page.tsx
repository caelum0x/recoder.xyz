import Link from 'next/link';
import { readPilotProofAggregate } from '@/lib/pilot-operations/proof';
import styles from './proof.module.css';

export const revalidate = 300;

export const metadata = {
  title: 'Pilot proof | Recoder',
  description: 'Aggregate, cohort-protected results from measured Recoder design-partner pilots.',
};

export default async function PilotProofPage() {
  let aggregate: Awaited<ReturnType<typeof readPilotProofAggregate>> | null = null;
  try {
    aggregate = await readPilotProofAggregate();
  } catch {
    // Render an honest unavailable state; never substitute static success data.
  }

  return (
    <main className={styles.page}>
      <header><Link href="/">Recoder</Link><span>Pilot proof</span></header>
      <section className={styles.hero}>
        <p>Measured design-partner outcomes</p>
        <h1>Proof without exposing teams.</h1>
        <Link href="/design-partners">Apply for a pilot</Link>
      </section>
      {!aggregate ? (
        <section className={styles.unavailable}><h2>Proof is unavailable.</h2><p>The production aggregate could not be read. No fallback counts are shown.</p></section>
      ) : (
        <>
          <section className={styles.counts} aria-label="Pilot totals">
            <div><span>Design-partner intakes</span><strong>{aggregate.designPartnerIntakes}</strong></div>
            <div><span>Pilots started</span><strong>{aggregate.startedPilots}</strong></div>
            <div><span>Active pilots</span><strong>{aggregate.activePilots}</strong></div>
            <div><span>Completed pilots</span><strong>{aggregate.completedPilots}</strong></div>
            <div><span>Verified outcomes</span><strong>{aggregate.verifiedOutcomes}</strong></div>
          </section>
          <section className={styles.outcomes}>
            <div><h2>Target results</h2><p>Individual teams, intake references, metrics, and proof links are never returned by this aggregate.</p></div>
            {aggregate.targetMetRatePercent === null ? (
              <div className={styles.threshold}><strong>Withheld</strong><p>Target performance appears after {aggregate.minimumOutcomeCohort} verified outcomes. Current verified cohort: {aggregate.verifiedOutcomes}.</p></div>
            ) : (
              <div className={styles.rate}><strong>{aggregate.targetMetRatePercent}%</strong><p>{aggregate.targetMet} met target · {aggregate.targetMissed} missed target</p></div>
            )}
          </section>
          <footer>Schema v{aggregate.schemaVersion} · Generated {formatUtc(aggregate.generatedAt)}</footer>
        </>
      )}
    </main>
  );
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
}
