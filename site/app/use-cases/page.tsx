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
import { USE_CASES } from "./use-cases";

export const metadata: Metadata = createMetadata({
  title: "Recoder use cases",
  description:
    "What you can do with Recoder: run AI coding agents in parallel, compare and merge their diffs, govern every merge, and keep it all self-hosted and BYOK.",
  path: "/use-cases",
  keywords: [
    "AI coding agent use cases",
    "parallel AI coding agents",
    "AI code governance",
    "self-hosted AI agents",
    "BYOK AI coding",
  ],
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: "Home", item: SITE_URL },
  { name: "Use cases", item: `${SITE_URL}/use-cases` },
]);

const itemListJsonLd = buildItemListJsonLd(
  "Recoder use cases",
  USE_CASES.map((u) => ({
    name: u.title,
    url: `${SITE_URL}/use-cases/${u.slug}`,
  })),
);

export default function UseCasesIndex() {
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
              Use cases
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              What you can do with Recoder
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Run your coding agents in parallel, converge their divergent work
              into one trusted merge, govern every change, and keep it all on your
              own machine with your own keys.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/features" label="See the features" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {USE_CASES.map((u) => (
                <Link
                  key={u.slug}
                  href={`/use-cases/${u.slug}`}
                  className="group flex flex-col gap-3 bg-bg p-6 transition-colors hover:bg-bg-soft"
                >
                  <h2 className="text-base font-semibold tracking-tight text-fg">
                    {u.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted">
                    {u.tagline}
                  </p>
                  <span className="mt-auto pt-2 text-sm text-accent group-hover:underline">
                    Read the use case →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              N divergent agents. One trusted merge.
            </h2>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Isolation while your agents work, convergence when they finish — on
              your machine, with a governed, auditable merge at the end.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
