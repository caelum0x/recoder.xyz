import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import {
  SITE_URL,
  createMetadata,
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
} from "@/lib/seo";
import { ALTERNATIVES } from "./alternatives";

export const metadata: Metadata = createMetadata({
  title: "AI coding tool alternatives",
  description:
    "Honest alternatives to Cursor, Aider, GitHub Codespaces, Gitpod, and Open Interpreter. What each option does, when to pick it, and where Recoder fits.",
  path: "/alternatives",
  keywords: [
    "AI coding tool alternatives",
    "cursor alternatives",
    "aider alternatives",
    "codespaces alternatives",
    "gitpod alternatives",
  ],
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: "Home", item: SITE_URL },
  { name: "Alternatives", item: `${SITE_URL}/alternatives` },
]);

const itemListJsonLd = buildItemListJsonLd(
  "AI coding tool alternatives",
  ALTERNATIVES.map((a) => ({
    name: a.title,
    url: `${SITE_URL}/alternatives/${a.slug}`,
  })),
);

export default function AlternativesIndex() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={itemListJsonLd} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Alternatives
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Looking for an alternative?
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Honest, side-by-side alternatives to the AI coding tools and dev
              environments developers actually use — what each does well, when to
              pick it, and where Recoder composes with them rather than replacing
              them.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/compare" label="Compare tools" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {ALTERNATIVES.map((a) => (
                <Link
                  key={a.slug}
                  href={`/alternatives/${a.slug}`}
                  className="group flex flex-col gap-3 bg-bg p-6 transition-colors hover:bg-bg-soft"
                >
                  <h2 className="text-base font-semibold tracking-tight text-fg">
                    {a.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted">
                    {a.tagline}
                  </p>
                  <span className="mt-auto pt-2 text-sm text-accent group-hover:underline">
                    See the alternatives →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Or don&apos;t choose — run them together.
            </h2>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Recoder runs your coding agents in parallel isolated git worktrees,
              then converges the best of each into one governed merge. Bring your
              own keys; everything stays on your machine.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/use-cases" label="See use cases" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
