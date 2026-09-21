import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { RelatedLinks, type RelatedLink } from "@/components/related-links";
import {
  SITE_URL,
  createMetadata,
  buildBreadcrumbJsonLd,
  buildArticleJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo";
import { ALTERNATIVES, alternative, type AltOption } from "../alternatives";
import { comparison } from "../../compare/comparisons";
import { useCase } from "../../use-cases/use-cases";

// Revalidate daily so lastModified/OG stay fresh without a full redeploy
// (mirrors the programmatic-SEO convention used across the content routes).
export const revalidate = 86400;

export function generateStaticParams() {
  return ALTERNATIVES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = alternative(slug);
  if (!a) return { title: "Alternatives — Recoder" };
  return createMetadata({
    title: a.metaTitle,
    description: a.description,
    path: `/alternatives/${a.slug}`,
    keywords: a.keywords,
    type: "article",
  });
}

function OptionCard({ option }: { option: AltOption }) {
  return (
    <div className="flex flex-col gap-2 bg-bg p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-fg">
          {option.name}
        </h3>
        <span className="text-xs text-faint">{option.kind}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{option.blurb}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        <span className="font-medium text-fg">Best for: </span>
        {option.bestFor}
      </p>
    </div>
  );
}

export default async function AlternativePageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = alternative(slug);
  if (!a) notFound();

  const url = `${SITE_URL}/alternatives/${a.slug}`;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", item: SITE_URL },
    { name: "Alternatives", item: `${SITE_URL}/alternatives` },
    { name: a.title, item: url },
  ]);

  const articleJsonLd = buildArticleJsonLd({
    headline: a.title,
    description: a.description,
    url,
    about: [a.target, ...a.options.map((o) => o.name)],
  });

  const faqJsonLd = buildFaqJsonLd(a.faq);

  // Cross-type internal-link mesh: compare pages, use-cases, and sibling
  // alternatives. Resolved against the real data so we never link a dead slug.
  const compareLinks: RelatedLink[] = a.relatedCompare
    .map((s) => comparison(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((c) => ({
      href: `/compare/${c.slug}`,
      title: c.title,
      summary: c.tagline,
    }));

  const useCaseLinks: RelatedLink[] = a.relatedUseCases
    .map((s) => useCase(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((u) => ({
      href: `/use-cases/${u.slug}`,
      title: u.title,
      summary: u.tagline,
    }));

  const altLinks: RelatedLink[] = a.related
    .map((s) => alternative(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((alt) => ({
      href: `/alternatives/${alt.slug}`,
      title: alt.title,
      summary: alt.tagline,
    }));

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={faqJsonLd} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-20">
            <nav aria-label="Breadcrumb" className="text-xs text-muted">
              <Link href="/alternatives" className="hover:text-fg">
                Alternatives
              </Link>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-faint">{a.target}</span>
            </nav>
            <h1 className="text-balance mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {a.title}
            </h1>
            <p className="text-balance mt-3 max-w-2xl text-muted">{a.tagline}</p>
          </div>
        </section>

        <article className="mx-auto max-w-3xl px-6 py-14">
          {a.intro.map((p, i) => (
            <p
              key={i}
              className="mt-4 text-sm leading-relaxed text-muted first:mt-0"
            >
              {p}
            </p>
          ))}

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            The best {a.target} alternatives
          </h2>
          <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {a.options.map((option) => (
              <OptionCard key={option.name} option={option} />
            ))}
          </div>

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            Where Recoder fits
          </h2>
          {a.recoderAngle.map((p, i) => (
            <p key={i} className="mt-4 text-sm leading-relaxed text-muted">
              {p}
            </p>
          ))}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <DownloadButton />
            <SecondaryButton href="/features" label="See what Recoder does" />
          </div>

          <h2 className="mt-14 text-lg font-medium tracking-tight text-fg">
            FAQ
          </h2>
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
            {a.faq.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-fg">
                  {item.q}
                  <span
                    aria-hidden
                    className="text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          <RelatedLinks heading="Related comparisons" links={compareLinks} />
          <RelatedLinks heading="Recoder use cases" links={useCaseLinks} />
          <RelatedLinks heading="More alternatives" links={altLinks} />

          <div className="mt-10 text-sm">
            <Link href="/alternatives" className="text-muted hover:text-fg">
              ← All alternatives
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
