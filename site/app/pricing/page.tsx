import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder pricing",
  description:
    "Recoder is a desktop app, free for solo developers running agents locally. Pro and Team (coming soon) add limits, retention, seats, and shared approvals. Enterprise adds SSO, audit and replay, governance, and self-hosting. You always bring your own agents and keys — Recoder never resells tokens.",
};

/**
 * Subscribe CTA target. Paid checkout is fulfilled by Polar acting as the
 * Merchant of Record (Polar is the legal seller). The exact checkout URL is
 * environment-driven so we never hardcode a product/price that isn't live yet.
 * If the link is not configured, we fall back to contacting the founders so we
 * never present a dead or fake "Subscribe" button.
 */
const POLAR_PRO_CHECKOUT = process.env.NEXT_PUBLIC_POLAR_PRO_CHECKOUT_URL?.trim();
const PRO_CTA_HREF =
  POLAR_PRO_CHECKOUT && /^https?:\/\//.test(POLAR_PRO_CHECKOUT)
    ? POLAR_PRO_CHECKOUT
    : "mailto:founders@recoder.xyz?subject=Recoder%20Pro%20early%20access";
const PRO_CTA_CONFIGURED = Boolean(
  POLAR_PRO_CHECKOUT && /^https?:\/\//.test(POLAR_PRO_CHECKOUT),
);

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
      "Desktop app for macOS, Windows, Linux",
      "Run Claude Code, Codex, Cursor, and opencode in parallel",
      "Isolated git worktree per agent",
      "Review diffs, run a terminal, merge or open a PR",
      "Shared brain on your own machine",
    ],
    cta: { label: "Download", href: "/download" },
    footnote: "No account required. Your agents, your keys.",
  },
  {
    name: "Pro",
    price: "Coming soon",
    priceNote: "per developer · billed via Polar",
    blurb: "For solo devs running many agents who want more headroom.",
    features: [
      "Everything in Free",
      "Higher parallel-agent limits per console",
      "Longer run history and repo-intel retention",
      "Persistent shared brain across your own machines (in development)",
      "Priority changelog and early builds",
    ],
    cta: {
      label: PRO_CTA_CONFIGURED ? "Subscribe" : "Get early access",
      href: PRO_CTA_HREF,
      external: true,
    },
    featured: true,
    badge: "Most popular",
    footnote: PRO_CTA_CONFIGURED
      ? "Checkout is handled by Polar, the legal seller of record."
      : "Subscriptions open soon — we'll bill through Polar as Merchant of Record.",
  },
  {
    name: "Team",
    price: "Coming soon",
    priceNote: "per seat · billed via Polar",
    blurb: "For small teams that want shared review and approvals.",
    features: [
      "Everything in Pro",
      "Per-seat management for your team",
      "Shared approvals on agent merges (in development)",
      "Cross-machine sync of workspaces and brain (maturing)",
      "Team-wide run history and retention",
    ],
    cta: {
      label: "Join the waitlist",
      href: "mailto:founders@recoder.xyz?subject=Recoder%20Team%20waitlist",
      external: true,
    },
    badge: "Coming soon",
    footnote:
      "Team sync and shared approvals are still maturing — we'll open seats once they're solid.",
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceNote: "talk to us",
    blurb: "Governed, audited, and self-hostable across your whole org.",
    features: [
      "Everything in Team",
      "SSO and centralized seat management",
      "Governance approvals + deny-biased policy",
      "Tamper-evident audit chain and replay",
      "Self-host the entire control plane",
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
              href="https://polar.sh"
              target="_blank"
              rel="noreferrer"
              className="text-fg underline hover:opacity-80"
            >
              Polar
            </a>{" "}
            as the Merchant of Record — Polar is the legal seller and handles tax
            and invoicing. We show plan framing rather than firm prices until the
            exact Pro and Team products are live in Polar, so nothing here is a
            placeholder dressed up as a real price. Plans marked &ldquo;Coming
            soon&rdquo; are not purchasable yet.
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
