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
import { USE_CASES, useCase } from "../use-cases";

export const revalidate = 86400;

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const u = useCase(slug);
  if (!u) return { title: "Use cases — Recoder" };
  return createMetadata({
    title: u.metaTitle,
    description: u.description,
    path: `/use-cases/${u.slug}`,
    keywords: u.keywords,
    type: "article",
  });
}

export default async function UseCasePageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = useCase(slug);
  if (!u) notFound();

  const url = `${SITE_URL}/use-cases/${u.slug}`;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", item: SITE_URL },
    { name: "Use cases", item: `${SITE_URL}/use-cases` },
    { name: u.title, item: url },
  ]);

  const articleJsonLd = buildArticleJsonLd({
    headline: u.title,
    description: u.description,
    url,
  });

  const faqJsonLd = buildFaqJsonLd(u.faq);

  const useCaseLinks: RelatedLink[] = u.related
    .map((s) => useCase(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((rel) => ({
      href: `/use-cases/${rel.slug}`,
      title: rel.title,
      summary: rel.tagline,
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
              <Link href="/use-cases" className="hover:text-fg">
                Use cases
              </Link>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-faint">{u.title}</span>
            </nav>
            <h1 className="text-balance mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {u.title}
            </h1>
            <p className="text-balance mt-3 max-w-2xl text-muted">{u.tagline}</p>
          </div>
        </section>

        <article className="mx-auto max-w-3xl px-6 py-14">
          {u.intro.map((p, i) => (
            <p
              key={i}
              className="mt-4 text-sm leading-relaxed text-muted first:mt-0"
            >
              {p}
            </p>
          ))}

          {u.sections.map((section) => (
            <section key={section.h}>
              <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
                {section.h}
              </h2>
              {section.body.map((p, i) => (
                <p key={i} className="mt-4 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-4 space-y-2">
                  {section.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm leading-relaxed text-muted"
                    >
                      <span aria-hidden className="text-accent">
                        +
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            How Recoder does it
          </h2>
          <ol className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border">
            {u.steps.map((step, i) => (
              <li key={i} className="flex gap-4 bg-bg p-5">
                <span className="font-mono text-xs text-accent">{i + 1}</span>
                <span className="text-sm leading-relaxed text-muted">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <DownloadButton />
            <SecondaryButton href="/how-it-works" label="How it works" />
          </div>

          <h2 className="mt-14 text-lg font-medium tracking-tight text-fg">
            FAQ
          </h2>
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
            {u.faq.map((item) => (
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

          <RelatedLinks heading="More use cases" links={useCaseLinks} />

          <div className="mt-10 text-sm">
            <Link href="/use-cases" className="text-muted hover:text-fg">
              ← All use cases
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
