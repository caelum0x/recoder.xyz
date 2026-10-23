import type { Metadata } from "next";
import { Nav, Footer, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import {
  SITE_URL,
  createMetadata,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo";
import { EvidenceSampleForm } from "./evidence-sample-form";

export const metadata: Metadata = createMetadata({
  title: "Free evidence sample — paste a diff, get signed compliance evidence",
  description:
    "Paste a real PR diff and test output, get back a signed, SOC 2 / EU AI Act / DORA-mapped evidence record — the same engine every governed Recoder merge produces.",
  path: "/evidence-sample",
  keywords: [
    "ai compliance evidence generator",
    "soc 2 evidence sample",
    "eu ai act evidence mapping",
    "dora ict change control evidence",
    "ai coding agent audit trail",
  ],
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: "Home", item: SITE_URL },
  { name: "Evidence sample", item: `${SITE_URL}/evidence-sample` },
]);

const faqJsonLd = buildFaqJsonLd([
  {
    q: "Is this a real certification?",
    a: "No. The sample is content-hashed and optionally Ed25519-signed, but it is generated from a public, anonymous paste — not a governed merge inside a running Recoder instance, and it carries no audit-chain seal. It demonstrates the same control-derivation engine, not a SOC 2 or ISO 27001 certificate.",
  },
  {
    q: "What do you do with the diff I paste?",
    a: "It is parsed in-memory for this one request (file list, line counts, a risk-tier heuristic) and is not stored. The verification output is parsed the same way for a pass/fail verdict.",
  },
  {
    q: "Why does my sample show PARTIAL or NOT EVIDENCED controls?",
    a: "Because the derivation is truthful: a control is only MET when its backing evidence is actually present. A public sample has no recorded human approval and no Merkle audit seal, so controls that depend on those are honestly PARTIAL or NOT EVIDENCED — exactly what a real unapproved high-risk merge would also show.",
  },
  {
    q: "What frameworks does the control mapping cover?",
    a: "SOC 2 (change management, change verification), EU AI Act (record-keeping, human oversight), DORA (ICT change control), and a Recoder-specific convergence-integrity control.",
  },
]);

export default function EvidenceSamplePage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Free evidence sample
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Paste a diff. Get signed compliance evidence back.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Every governed merge inside Recoder emits a content-hashed, framework-mapped
              ConvergenceEvidence record. Try the exact same engine on a real PR diff and test
              output, right now — no account, no upload, nothing stored.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <SecondaryButton href="/compliance" label="See our compliance posture" />
              <SecondaryButton href="/compare" label="Compare Recoder" />
            </div>
          </div>
        </section>

        <section className="py-16">
          <EvidenceSampleForm />
        </section>

        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-fg">
              Why this exists
            </h2>
            <div className="mt-4 space-y-4 text-muted">
              <p>
                Recoder&apos;s thesis is that running N coding agents in parallel only matters if
                the merge you land at the end is trustworthy — and provably so. The product
                mechanism for that is the evidence engine: every governed merge gets a
                SHA-256 content-hashed record, mapped to specific SOC 2 / EU AI Act / DORA
                controls, each one derived truthfully from fields that are actually present —
                never hardcoded to &quot;met&quot;.
              </p>
              <p>
                That engine had no public surface until this page. Paste your own diff and test
                output above and you get back exactly the kind of record a real Recoder merge
                produces automatically — a concrete answer to &quot;what does your compliance
                story actually look like&quot; instead of a marketing claim.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
