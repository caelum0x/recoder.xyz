import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site";
import { LeadForm } from "@/components/lead-form";

export const metadata: Metadata = {
  title: "Recoder for teams & enterprise",
  description:
    "Coordinate coding agents across your team with approvals, audit trails, permission rubrics, session replay, and self-hosting over a zero-trust mesh.",
};

const FEATURES = [
  { t: "Shared brain across the team", d: "Repo memory and history shared across everyone's agents, not siloed per laptop." },
  { t: "Approvals & permission rubrics", d: "Gate risky actions. Define what agents may touch. Every decision is recorded." },
  { t: "Audit & session replay", d: "Full audit trail and replay of every agent run for review and compliance." },
  { t: "Cross-machine, zero-trust", d: "Coordinate agents across laptops, CI, and cloud over a zero-trust mesh." },
  { t: "Self-hosted", d: "Run the whole control plane inside your own infrastructure. Your code never leaves." },
  { t: "Your keys, never ours", d: "Teams use their own agent subscriptions. Recoder never proxies models or tokens." },
];

export default function Enterprise() {
  return (
    <>
      <Nav />
      <main>
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Coordinate your team&apos;s coding agents.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
            Everything in the solo cockpit, plus governance, audit, and a shared
            brain across your whole team. Self-hostable.
          </p>
          <div id="contact" className="mx-auto mt-8 max-w-md scroll-mt-20 text-left">
            <LeadForm
              kind="sales"
              source="enterprise"
              plan="Enterprise"
              withMessage
              submitLabel="Contact sales"
              successText="Thanks — we got it. The founders will reply to your email shortly."
            />
            <p className="mt-3 text-center text-xs text-faint">
              Prefer email? Reach us at{" "}
              <a
                href="mailto:founders@recoder.xyz?subject=Recoder%20for%20our%20team"
                className="text-muted underline hover:text-fg"
              >
                founders@recoder.xyz
              </a>
              .
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="bg-bg p-7">
                <h3 className="font-medium">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
