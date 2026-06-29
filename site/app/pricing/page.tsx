import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder pricing",
  description:
    "Recoder is free for solo developers running agents locally. Pro (coming soon) adds cloud sync and a shared brain across machines. Enterprise adds SSO, audit and replay, governance approvals, and self-hosting. You always bring your own agents — Recoder never resells tokens.",
};

/**
 * Subscribe CTA target. The Pro checkout is fulfilled by Polar acting as the
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
  footnote?: string;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    priceNote: "for individuals, forever",
    blurb: "The local cockpit. Run your own agents as a team on one machine.",
    features: [
      "Local cockpit for macOS, Windows, Linux",
      "Run Claude Code, Codex, opencode, and pi in parallel",
      "Shared brain on your own machine",
      "Work-locks so agents stop editing the same file",
      "Context reuse across agents, designed to cut repeat token spend",
    ],
    cta: { label: "Download", href: "/download" },
    footnote: "No account required. Your agents, your keys.",
  },
  {
    name: "Pro",
    price: "Coming soon",
    priceNote: "billing via Polar (Merchant of Record)",
    blurb: "Cloud sync and a shared brain designed to follow you across machines.",
    features: [
      "Everything in Free",
      "Cloud-synced shared brain across your machines (in development)",
      "Higher parallel-agent limits per cockpit",
      "Persistent repo intel, memory, and run history",
      "Priority changelog and early builds",
    ],
    cta: {
      label: PRO_CTA_CONFIGURED ? "Subscribe" : "Get early access",
      href: PRO_CTA_HREF,
      external: true,
    },
    featured: true,
    footnote: PRO_CTA_CONFIGURED
      ? "Checkout is handled by Polar, the legal seller of record."
      : "Subscriptions open soon — we'll bill through Polar as Merchant of Record.",
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceNote: "talk to us",
    blurb: "Governed, audited, and self-hostable across your whole org.",
    features: [
      "Everything in Pro",
      "SSO and per-seat management",
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
      <main className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Free to start. You bring your own agents.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
            Recoder is the OS for coding agents. You pay for the coordination
            layer — never for inference. We don&apos;t proxy models or resell
            tokens.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                "flex flex-col rounded-xl border p-7 " +
                (t.featured
                  ? "border-border-strong bg-bg-soft ring-1 ring-accent/30"
                  : "border-border bg-bg")
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{t.name}</span>
                {t.featured && (
                  <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">
                    Most popular
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">
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
            and invoicing. We list plan framing rather than firm prices until the
            exact Pro price and product are live in Polar, so nothing here is a
            placeholder dressed up as a real price.
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
