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
import { COMPARISONS } from "./comparisons";

export const metadata: Metadata = createMetadata({
  title: "Recoder vs Conductor, Cursor — honest comparisons",
  description:
    "Honest, verified comparisons of Recoder against named competitors: agents supported, governance, self-hosting, and pricing — sourced from each product's own site.",
  path: "/compare",
  keywords: ["recoder vs conductor", "recoder vs cursor", "ai coding agent comparison"],
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: "Home", item: SITE_URL },
  { name: "Compare", item: `${SITE_URL}/compare` },
]);

const itemListJsonLd = buildItemListJsonLd(
  "Recoder comparisons",
  COMPARISONS.map((c) => ({
    name: c.title,
    url: `${SITE_URL}/compare/${c.slug}`,
  })),
);

export default function CompareIndex() {
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
              Compare
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              How Recoder compares
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Honest, fact-checked comparisons against named competitors —
              agents supported, governance, self-hosting, and pricing, each
              sourced from the competitor&apos;s own site. No invented
              benchmarks.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/how-it-works" label="How Recoder works" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
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
              Recoder runs your coding agents at once in isolated git
              worktrees, then converges the best of each into one governed
              merge. Bring your own keys; everything stays on your machine.
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
