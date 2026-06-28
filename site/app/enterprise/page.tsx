import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer, SecondaryButton } from "@/components/site";
import { LeadForm } from "@/components/lead-form";

export const metadata: Metadata = {
  title: "Recoder for teams & enterprise",
  description:
    "Govern your coding agents: approvals with deny-biased policy, a tamper-evident Merkle audit chain, security below the model with Envoy ext-authz and XDR detections, work-locks for coordination, SSO and seats, and full self-hosting.",
};

interface Capability {
  title: string;
  body: string;
  /** The real, shipped subsystem this claim maps to. */
  subsystem: string;
}

/**
 * Each capability ties to a real subsystem that exists in this repo today.
 * We name the package/module so the claim is auditable, not marketing fluff.
 */
const GOVERNANCE: Capability[] = [
  {
    title: "Approvals on risky actions",
    body: "Gate the actions you decide are dangerous. An approval that times out resolves to a deny — it fails closed, never open.",
    subsystem: "governance · approval-gateway",
  },
  {
    title: "Deny-biased policy engine",
    body: "Policy is evaluated before an agent acts. Forbidden auth and security paths resolve to deny by default, so the safe answer is the default answer.",
    subsystem: "governance · policy/engine",
  },
  {
    title: "Tamper-evident audit chain",
    body: "Every governed decision is sealed into a SHA-256 Merkle chain. The hash for any entry is verifiable, so the record can't be quietly rewritten.",
    subsystem: "governance · audit (merkle-verifier)",
  },
];

const SECURITY: Capability[] = [
  {
    title: "Security below the model",
    body: "Trust is enforced at the edge, not in a prompt. An Envoy ext-authz check admits or rejects traffic before it ever reaches the control plane.",
    subsystem: "network · ext-authz + envoy-config",
  },
  {
    title: "XDR detections",
    body: "Network and admission events feed detection rules so anomalous agent or connector behavior is surfaced, not silently allowed.",
    subsystem: "network · xdr/detections",
  },
  {
    title: "Signed-envelope ingress",
    body: "Every inbound A2A envelope is untrusted until its signature, identity, and policy are proven at the edge — HMAC and Ed25519 both verified.",
    subsystem: "interop · signed-ingress-gate",
  },
];

const COORDINATION: Capability[] = [
  {
    title: "Work-locks",
    body: "Two agents can't edit the same file at once. Locks are held, reaped on expiry, and conflicts are detected before work collides.",
    subsystem: "coordination · locks",
  },
  {
    title: "Coherence checks",
    body: "Semantic checks catch the conflicts git can't see — a lock without a task, overlapping active locks — and escalate them.",
    subsystem: "coordination · coherence",
  },
  {
    title: "SSO, seats & self-host",
    body: "Single sign-on and per-seat management for your org, and the option to run the entire control plane inside your own infrastructure.",
    subsystem: "deploy · self-host stack",
  },
];

export default function Enterprise() {
  return (
    <>
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              The OS for coding agents — governed
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Let agents move fast. Keep your org in control.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Everything in the cockpit, plus governance, tamper-evident audit,
              security enforced below the model, and coordination across machines
              and orgs. Self-hostable. You always bring your own agents — we never
              resell tokens.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="#contact"
                className="inline-flex items-center justify-center rounded-lg bg-fg px-6 py-3 text-[15px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Contact sales
              </Link>
              <SecondaryButton href="/self-host" label="Self-host it →" />
            </div>
          </div>
        </section>

        <CapabilitySection
          id="governance"
          eyebrow="Governance"
          title="Approvals, policy, and an audit chain you can prove."
          caps={GOVERNANCE}
        />
        <CapabilitySection
          id="security"
          eyebrow="Security below the model"
          title="Trust is enforced at the edge, not in a prompt."
          caps={SECURITY}
          soft
        />
        <CapabilitySection
          id="coordination"
          eyebrow="Coordination & control"
          title="Work-locks, coherence, SSO, and self-host."
          caps={COORDINATION}
        />

        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Talk to the team.
          </h2>
          <p className="text-balance mx-auto mt-3 max-w-xl text-muted">
            Tell us your team size, what you want to coordinate, and your
            governance requirements. The founders reply directly.
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
      </main>
      <Footer />
    </>
  );
}

function CapabilitySection({
  id,
  eyebrow,
  title,
  caps,
  soft = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  caps: Capability[];
  soft?: boolean;
}) {
  return (
    <section
      id={id}
      className={
        "scroll-mt-20 border-b border-border " + (soft ? "bg-bg-soft" : "")
      }
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-wider text-accent">
            {eyebrow}
          </div>
          <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h2>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {caps.map((c) => (
            <div key={c.title} className="bg-bg p-7">
              <h3 className="font-medium">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
              <p className="mt-5 font-mono text-[11px] text-faint">
                {c.subsystem}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
