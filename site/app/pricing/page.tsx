import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder pricing",
  description:
    "Recoder is free for solo developers. Team and enterprise plans add a shared brain, governance, audit, and self-hosting. You always bring your own agents.",
};

const TIERS = [
  {
    name: "Solo",
    price: "Free",
    blurb: "For one developer running multiple agents.",
    features: [
      "Local cockpit (macOS/Win/Linux)",
      "Run Claude Code, Codex, opencode in parallel",
      "Shared brain on your machine",
      "Work-locks + token-saving reuse",
    ],
    cta: { label: "Download", href: "/download" },
  },
  {
    name: "Team",
    price: "Usage",
    blurb: "Shared brain and coordination across your team.",
    features: [
      "Everything in Solo",
      "Shared brain across teammates",
      "Cross-machine coordination",
      "Approvals + audit trail",
    ],
    cta: { label: "Contact sales", href: "mailto:founders@recoder.xyz?subject=Recoder%20Team" },
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "Self-hosted, governed, zero-trust.",
    features: [
      "Everything in Team",
      "Self-hosting",
      "Permission rubrics + SSO",
      "Session replay + compliance",
    ],
    cta: { label: "Contact sales", href: "mailto:founders@recoder.xyz?subject=Recoder%20Enterprise" },
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
            Recoder never resells tokens. You pay for the coordination layer, not
            for inference.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                "flex flex-col rounded-xl border p-7 " +
                (t.featured
                  ? "border-border-strong bg-bg-soft"
                  : "border-border bg-bg")
              }
            >
              <div className="text-sm text-muted">{t.name}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">
                {t.price}
              </div>
              <p className="mt-2 text-sm text-faint">{t.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent">·</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={t.cta.href}
                className={
                  "mt-7 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 " +
                  (t.featured
                    ? "bg-fg text-bg"
                    : "border border-border-strong text-fg")
                }
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
