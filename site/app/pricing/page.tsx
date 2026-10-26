import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder pricing",
  description:
    "Recoder is free — the desktop console for running Claude Code, Codex, pi, open-agents, and opencode in parallel. No paid tiers.",
  alternates: { canonical: "https://recoder.xyz/pricing" },
};

/**
 * Owner decision 2026-10-27: Recoder's hosted paid tiers (Pro $29/mo, Team
 * $99/mo, Enterprise custom — all sold via Dodo Payments) are retired. The
 * product is completely free. This page used to render a 4-tier comparison
 * grid with Dodo-checkout CTAs; it is now a single free tier. See git
 * history (pre-2026-10-27) for the removed Pro/Team/Enterprise tiers and
 * Dodo checkout-URL wiring.
 */
interface Tier {
  name: string;
  price: string;
  priceNote: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  footnote?: string;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    priceNote: "for everyone, forever",
    blurb:
      "The full desktop console. Run your own agents in parallel, govern their writes, review and merge — no paid tiers, no limits.",
    features: [
      "Desktop app for macOS (Apple Silicon) — Windows & Linux planned",
      "Run Claude Code, Codex, pi, open-agents, and opencode in parallel",
      "Isolated git worktree per agent",
      "Review diffs, run a terminal, merge or open a PR",
      "Unlimited parallel agents, shared team memory, full retention",
      "Governance gates risky writes",
    ],
    cta: { label: "Download", href: "/download" },
    footnote: "No account required. Your agents, your keys.",
  },
];

export default function Pricing() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Recoder is free.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-2xl text-muted">
            Recoder is the desktop console for your coding agents. You bring your
            own agents and keys — we don&apos;t proxy models or resell tokens.
            Every feature is unlocked, for everyone, at no cost.
          </p>
        </div>

        <div className="mt-14 grid gap-5 mx-auto max-w-sm">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="flex flex-col rounded-xl border border-border-strong bg-bg-soft p-6 ring-1 ring-accent/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{t.name}</span>
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

              <Link href={t.cta.href} className={ctaClass(true)}>
                {t.cta.label}
              </Link>

              {t.footnote && (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
                  {t.footnote}
                </p>
              )}
            </div>
          ))}
        </div>

        <section className="mx-auto mt-16 max-w-3xl rounded-xl border border-border bg-bg-soft p-7 text-center">
          <h2 className="text-lg font-medium">No billing, no catch</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Recoder has no paid plans. You always bring your own agents and model
            keys; Recoder never resells tokens or charges for the console. See our{" "}
            <Link href="/terms" className="text-fg underline hover:opacity-80">
              terms
            </Link>{" "}
            and{" "}
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
