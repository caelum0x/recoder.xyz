import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { AGENTS } from "./agents";

const SITE_URL = "https://recoder.xyz";
const URL = `${SITE_URL}/tools`;

const DESCRIPTION =
  "Free, no-login developer tools and references from Recoder: the AI coding agents directory and shareable comparison badges. Factual, open, and made to link to.";

export const metadata: Metadata = {
  title: "Free developer tools & references — Recoder",
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: "Free developer tools & references",
    description: DESCRIPTION,
    url: URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free developer tools & references — Recoder",
    description: DESCRIPTION,
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Tools", item: URL },
  ],
};

interface ToolCard {
  href: string;
  title: string;
  blurb: string;
  cta: string;
}

const TOOLS: ToolCard[] = [
  {
    href: "/tools/agent-directory",
    title: "AI coding agents directory",
    blurb: `A free, factual reference table of ${AGENTS.length} coding agents, AI editors, and cloud dev environments — category, vendor, license, form factor, and models at a glance. Filter by type or open source.`,
    cta: "Open the directory",
  },
  {
    href: "/compare",
    title: "Head-to-head comparisons",
    blurb:
      "Honest, side-by-side comparisons of the tools in the directory — Claude Code vs Cursor, Codex vs Aider, and more. Real capabilities, pros and cons, and when to use each.",
    cta: "Browse comparisons",
  },
];

export default function ToolsHub() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Free tools & references
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Free developer references, no login.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Open, factual resources for anyone navigating the AI coding
              landscape — built from the same data we keep honest across the
              site. Use them, link to them, cite them.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <SecondaryButton href="/tools/agent-directory" label="The agents directory" />
              <SecondaryButton href="/features" label="What Recoder does" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {TOOLS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex flex-col gap-3 bg-bg p-7 transition-colors hover:bg-bg-soft"
                >
                  <h2 className="text-lg font-semibold tracking-tight text-fg">
                    {t.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted">{t.blurb}</p>
                  <span className="mt-auto pt-2 text-sm text-accent group-hover:underline">
                    {t.cta} →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              The tool behind the references.
            </h2>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Recoder runs the agents in these references in parallel isolated git
              worktrees, then converges the best of each into one governed merge.
              Local-first and bring-your-own-keys.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/how-it-works" label="How it works" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
