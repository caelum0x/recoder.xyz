import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { COMPARISONS } from "./comparisons";

export const metadata: Metadata = {
  title: "Compare AI coding tools — Claude Code, Cursor, Codex, Aider & more",
  description:
    "Honest head-to-head comparisons of AI coding tools: Claude Code, Cursor, Codex CLI, Aider, opencode, Gemini CLI, Conductor, and Recoder. Features, pros/cons, and when to use each.",
  alternates: { canonical: "https://recoder.xyz/compare" },
  openGraph: {
    title: "Compare AI coding tools",
    description:
      "Honest head-to-head comparisons of AI coding agents and editors — features, pros/cons, and when to use each.",
    url: "https://recoder.xyz/compare",
    type: "website",
  },
};

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://recoder.xyz" },
    { "@type": "ListItem", position: 2, name: "Compare", item: "https://recoder.xyz/compare" },
  ],
};

// An ItemList helps search engines understand this hub as a curated collection
// of comparison pages rather than a thin link farm.
const ITEMLIST_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "AI coding tool comparisons",
  itemListElement: COMPARISONS.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.title,
    url: `https://recoder.xyz/compare/${c.slug}`,
  })),
};

export default function CompareIndex() {
  return (
    <>
      <JsonLd data={BREADCRUMB_JSON_LD} />
      <JsonLd data={ITEMLIST_JSON_LD} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Compare AI coding tools
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Which AI coding tool fits your workflow?
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Honest, side-by-side comparisons of the coding agents and editors
              developers actually use — Claude Code, Cursor, Codex, Aider,
              opencode, Gemini CLI, and more. No hype, no fake benchmarks.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/how-it-works" label="How Recoder works" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {COMPARISONS.map((c) => (
                <Link
                  key={c.slug}
                  href={`/compare/${c.slug}`}
                  className="group flex flex-col gap-3 bg-bg p-6 transition-colors hover:bg-bg-soft"
                >
                  <h2 className="text-base font-semibold tracking-tight text-fg">
                    {c.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted">
                    {c.tagline}
                  </p>
                  <span className="mt-auto pt-2 text-sm text-accent group-hover:underline">
                    Read the comparison →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Or don&apos;t choose — run them in parallel.
            </h2>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Recoder runs your coding agents at once in isolated git worktrees,
              then converges the best of each into one governed merge. Bring your
              own keys; everything stays on your machine.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/features" label="See the features" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
