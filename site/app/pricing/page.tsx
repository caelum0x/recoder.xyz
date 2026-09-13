import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder pricing",
  description:
    "Compare Recoder's Free, Pro ($29/month), Team ($99/month), and Enterprise plans for local and shared AI coding-agent orchestration.",
  alternates: { canonical: "https://recoder.xyz/pricing" },
};

/**
 * Subscribe CTA targets. Paid checkout is fulfilled by Creem, the
 * Merchant of Record (legal seller, tax + invoicing). The exact hosted-checkout
 * URLs are environment-driven; when unset the CTA routes through the account
 * signup + subscribe flow on recoder.xyz/auth — never a dead or fake button.
 */
// Paid checkout is fulfilled by Creem, the Merchant of Record. When a
// Creem hosted-checkout URL is configured we link straight to it; otherwise the
// CTA is a real "Get <plan>" that routes through the account signup + subscribe
// flow on recoder.xyz/auth (never a dead button, never a bare waitlist).
const CREEM_PRO_CHECKOUT = process.env.NEXT_PUBLIC_CREEM_PRO_CHECKOUT_URL?.trim();
const CREEM_TEAM_CHECKOUT = process.env.NEXT_PUBLIC_CREEM_TEAM_CHECKOUT_URL?.trim();
const isUrl = (v?: string) => Boolean(v && /^https?:\/\//.test(v));
const PRO_CTA_HREF = isUrl(CREEM_PRO_CHECKOUT)
  ? (CREEM_PRO_CHECKOUT as string)
  : "/auth/signup?plan=pro";
const TEAM_CTA_HREF = isUrl(CREEM_TEAM_CHECKOUT)
  ? (CREEM_TEAM_CHECKOUT as string)
  : "/auth/signup?plan=team";

interface Tier {
  name: string;
  price: string;
  priceNote: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string; external?: boolean };
  featured?: boolean;
  badge?: string;
  footnote?: string;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    priceNote: "for individuals, forever",
    blurb:
      "The local desktop console. Run your own agents in parallel on one machine.",
    features: [
      "Desktop app for macOS (Apple Silicon) — Windows & Linux planned",
      "Run Claude Code, Codex, pi, open-agents, and opencode in parallel",
      "Isolated git worktree per agent (tmux)",
      "Review diffs, run a terminal, merge or open a PR",
      "One shared brain on your own machine",
      "Governance gates risky writes",
    ],
    cta: { label: "Download", href: "/download" },
    footnote: "No account required. Your agents, your keys.",
  },
  {
    name: "Pro",
    price: "$29",
    priceNote: "per developer / month · billed via Creem",
    blurb: "For solo devs running many agents who want more headroom.",
    features: [
      "Everything in Free",
      "More parallel agents per console",
      "Longer run history and retention",
      "Context reuse across runs (repo intel)",
      "Persistent shared brain across your own machines",
      "Priority changelog and early builds",
    ],
    cta: {
      label: "Get Pro",
      href: PRO_CTA_HREF,
      external: isUrl(CREEM_PRO_CHECKOUT),
    },
    featured: true,
    badge: "Most popular",
    footnote:
      "$290/year (2 months free). Checkout is handled by Creem, the Merchant of Record.",
  },
  {
    name: "Team",
    price: "$99",
    priceNote: "per month · billed via Creem",
    blurb: "For teams sharing an audited agent fleet across machines.",
    features: [
      "Everything in Pro",
      "Shared workspaces + audit across machines",
      "Shared approvals on agent merges",
      "Cross-machine fleet mesh (zero-trust Envoy)",
      "Per-seat management and team-wide retention",
    ],
    cta: {
      label: "Get Team",
      href: TEAM_CTA_HREF,
      external: isUrl(CREEM_TEAM_CHECKOUT),
    },
    footnote: "Checkout is handled by Creem, the Merchant of Record.",
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceNote: "talk to us",
    blurb: "Governed, audited, and self-hostable across your whole org.",
    features: [
      "Everything in Team",
      "SSO / OIDC and centralized seat management",
      "Device recognition + approval and remote revoke",
      "XDR security telemetry sealed into a tamper-evident audit chain",
      "Self-host the control plane (AMI / compose) in your VPC",
      "Direct support from the team",
    ],
    cta: { label: "Contact sales", href: "/enterprise#contact" },
    footnote: "See the Enterprise page for what each capability maps to.",
  },
];

export default function Pricing() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Pay for orchestration, never for tokens.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-2xl text-muted">
            Recoder is the desktop console for your coding agents. You bring your
            own agents and keys — we don&apos;t proxy models or resell tokens.
            You pay for the console, seats, retention, and governance.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-4 md:grid-cols-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                "flex flex-col rounded-xl border p-6 " +
                (t.featured
                  ? "border-border-strong bg-bg-soft ring-1 ring-accent/30"
                  : "border-border bg-bg")
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{t.name}</span>
                {t.badge && (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] " +
                      (t.featured
                        ? "border border-accent/40 text-accent"
                        : "border border-border text-faint")
                    }
                  >
                    {t.badge}
                  </span>
                )}
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {t.price}
              </div>
              <div className="mt-1 text-xs text-faint">{t.priceNote}</div>
              <p className="mt-3 text-sm text-faint">{t.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent">·</span>
                    {f}
                  </li>
                ))}
              </ul>

              {t.cta.external ? (
                <a
                  href={t.cta.href}
                  className={ctaClass(t.featured)}
                  {...(t.cta.href.startsWith("http")
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {t.cta.label}
                </a>
              ) : (
                <Link href={t.cta.href} className={ctaClass(t.featured)}>
                  {t.cta.label}
                </Link>
              )}

              {t.footnote && (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
                  {t.footnote}
                </p>
              )}
            </div>
          ))}
        </div>

        <section className="mx-auto mt-16 max-w-3xl rounded-xl border border-border bg-bg-soft p-7 text-center">
          <h2 className="text-lg font-medium">Billing &amp; honesty</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Paid plans are sold through{" "}
            <a
              href="https://creem.io"
              target="_blank"
              rel="noreferrer"
              className="text-fg underline hover:opacity-80"
            >
              Creem
            </a>{" "}
            as the Merchant of Record — Creem is the legal seller and
            handles tax and invoicing. You always bring your own agents and model
            keys; Recoder never resells tokens. See our{" "}
            <Link href="/refund" className="text-fg underline hover:opacity-80">
              refund &amp; cancellation policy
            </Link>
            ,{" "}
            <Link href="/terms" className="text-fg underline hover:opacity-80">
              terms
            </Link>
            , and{" "}
            <Link href="/privacy" className="text-fg underline hover:opacity-80">
              privacy policy
            </Link>
            .
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function ctaClass(featured?: boolean): string {
  return (
    "mt-7 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 " +
    (featured ? "bg-fg text-bg" : "border border-border-strong text-fg")
  );
}
