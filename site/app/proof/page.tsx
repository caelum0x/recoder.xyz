import Link from "next/link";
import { readPublicProofSummary, type PublicProofSummary } from "../api/proof/summary";
import styles from "./proof.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProofPage() {
  let proof: PublicProofSummary;
  try {
    proof = await readPublicProofSummary();
  } catch {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <Link href="/">RECODER</Link>
          <span>PRODUCT EVIDENCE</span>
        </header>
        <section className={styles.unavailable}>
          <p>Evidence store status</p>
          <h1>Unavailable</h1>
          <p>Recoder could not read the intake or pilot records. The page does not replace missing evidence with zeros.</p>
          <Link href="/design-partners">Open design-partner intake</Link>
        </section>
      </main>
    );
  }

  const intakeMetrics = [
    ["Interview consents", proof.intakeSignals.interviewConsents],
    ["Needs audit evidence", proof.intakeSignals.evidenceRequired],
    ["Ready now", proof.intakeSignals.readyNow],
    ["21+ weekly agent runs", proof.intakeSignals.highFrequencyTeams],
  ] as const;
  const painRanking = Object.entries(proof.intakeSignals.primaryPains).sort((a, b) => b[1] - a[1]);
  const agentRanking = Object.entries(proof.intakeSignals.activeAgents).sort((a, b) => b[1] - a[1]);
  const hasVerifiedOutcomes = proof.funnel.verifiedOutcomes > 0;
  const hasPublishableOutcomeCohort = proof.outcomes.targetMetRatePercent !== null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">RECODER</Link>
        <span>PRODUCT EVIDENCE / LIVE AGGREGATES</span>
      </header>

      <section className={styles.hero}>
        <p>Design-partner validation records</p>
        <h1>Intake.<br />Pilots.<br />Outcomes.</h1>
        <div>
          <span>Updated</span>
          <strong>{new Date(proof.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</strong>
        </div>
      </section>

      <section className={styles.funnel} aria-label="Validation funnel">
        <article className={styles.intakeStage}>
          <span>01 / INTAKE</span>
          <strong>{proof.funnel.designPartnerIntakes}</strong>
          <h2>Design-partner requests</h2>
          <p>A submitted request records interest. It does not count as a started pilot.</p>
        </article>
        <article className={styles.pilotStage}>
          <span>02 / STARTED</span>
          <strong>{proof.funnel.startedPilots}</strong>
          <h2>Pilot records</h2>
          <p>{proof.funnel.activePilots} active. {proof.funnel.completedPilots} completed or verified.</p>
        </article>
        <article className={styles.outcomeStage}>
          <span>03 / VERIFIED</span>
          <strong>{proof.funnel.verifiedOutcomes}</strong>
          <h2>Outcome records</h2>
          <p>Completed pilots count here after review of a public HTTP(S) proof link.</p>
        </article>
      </section>

      <section className={styles.outcome} aria-labelledby="outcome-heading">
        <div>
          <p className={styles.eyebrow}>Verified outcome aggregate</p>
          <h2 id="outcome-heading">
            {hasPublishableOutcomeCohort
              ? `${proof.outcomes.targetMetRatePercent}% met the recorded target.`
              : hasVerifiedOutcomes
                ? "Outcome details remain private until the cohort reaches three."
                : "No verified outcomes yet."}
          </h2>
        </div>
        <div className={styles.outcomeNumbers}>
          <div><span>Target met</span><strong>{proof.outcomes.targetMet ?? "WITHHELD"}</strong></div>
          <div><span>Target missed</span><strong>{proof.outcomes.targetMissed ?? "WITHHELD"}</strong></div>
          <p>Recoder publishes target attainment after {proof.outcomes.minimumCohort} verified outcomes. It does not publish measures, values, company details, lead IDs, pilot IDs, or proof URLs.</p>
        </div>
      </section>

      <section className={styles.intakeSignals} aria-label="Intake signals">
        {intakeMetrics.map(([label, value], index) => (
          <article key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{value}</strong>
            <p>{label}</p>
          </article>
        ))}
      </section>

      <section className={styles.rankings}>
        <div>
          <p className={styles.eyebrow}>Primary bottlenecks from intake</p>
          {painRanking.length === 0 ? <p className={styles.empty}>No intake responses yet.</p> : painRanking.map(([label, count]) => (
            <div className={styles.row} key={label}><span>{label}</span><strong>{count}</strong></div>
          ))}
        </div>
        <div>
          <p className={styles.eyebrow}>Agents reported in intake</p>
          {agentRanking.length === 0 ? <p className={styles.empty}>No intake responses yet.</p> : agentRanking.map(([label, count]) => (
            <div className={styles.row} key={label}><span>{label}</span><strong>{count}</strong></div>
          ))}
        </div>
      </section>

      <section className={styles.method}>
        <div>
          <p className={styles.eyebrow}>Method</p>
          <h2>Each stage comes from a separate durable record.</h2>
        </div>
        <div>
          <p>Intake totals come from completed design-partner forms. Pilot totals come from admin-created records linked to those intakes.</p>
          <p>Zero means the readable stores contain no qualifying records. A read failure returns an unavailable state.</p>
          <a href="/api/proof">Inspect the JSON summary</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/design-partners">Join the design-partner intake</Link>
        <Link href="/">Back to product</Link>
      </footer>
    </main>
  );
}
