import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, Footer } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { DOC_PAGES, docPage, type DocBlock, type DocPage } from "../content";
import { DocBlockView, DocsShell } from "../docs-shell";

const SITE_URL = "https://recoder.xyz";

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug }));
}

/** Flattens a text-bearing block into a single plain string for JSON-LD. */
function blockText(block: DocBlock): string | undefined {
  if (block.kind === "p" || block.kind === "note") return block.text;
  if (block.kind === "bullets" || block.kind === "steps") {
    return block.items.join(" ");
  }
  return undefined;
}

/**
 * Some docs (troubleshooting) are authored as problem → fix sections: an `h`
 * heading followed by the text that answers it. When that shape is present we
 * expose it as FAQPage structured data. Sections without any answer text are
 * skipped so we never emit an empty Question.
 */
function faqFromDoc(page: DocPage): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];
  let current: { q: string; parts: string[] } | null = null;
  for (const block of page.blocks) {
    if (block.kind === "h") {
      if (current && current.parts.length > 0) {
        faqs.push({ q: current.q, a: current.parts.join(" ") });
      }
      current = { q: block.text, parts: [] };
      continue;
    }
    if (!current) continue;
    const text = blockText(block);
    if (text) current.parts.push(text);
  }
  if (current && current.parts.length > 0) {
    faqs.push({ q: current.q, a: current.parts.join(" ") });
  }
  return faqs;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) return { title: "Recoder docs" };
  return {
    title: `${page.title} — Recoder docs`,
    description: page.description,
    alternates: { canonical: `https://recoder.xyz/docs/${page.slug}` },
  };
}

export default async function DocPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) notFound();

  const index = DOC_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = index > 0 ? DOC_PAGES[index - 1] : undefined;
  const next = index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : undefined;

  const url = `${SITE_URL}/docs/${page.slug}`;
  const techArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    author: { "@type": "Organization", name: "Recoder", url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website` },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Docs", item: `${SITE_URL}/docs` },
      { "@type": "ListItem", position: 3, name: page.title, item: url },
    ],
  };
  // Only the troubleshooting page is authored in a problem→fix (Q&A) shape.
  const faqs = page.slug === "troubleshooting" ? faqFromDoc(page) : [];
  const faqJsonLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  return (
    <>
      <JsonLd data={techArticleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}
      <Nav />
      <main>
        <DocsShell activeSlug={page.slug}>
          <article className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-faint">
              Docs
            </div>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {page.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {page.description}
            </p>
            <div className="mt-8 border-t border-border pt-2">
              {page.blocks.map((block, i) => (
                <DocBlockView key={i} block={block} />
              ))}
            </div>

            <nav className="mt-16 flex items-center justify-between gap-4 border-t border-border pt-8 text-sm">
              {prev ? (
                <Link href={`/docs/${prev.slug}`} className="text-muted hover:text-fg">
                  ← {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/docs/${next.slug}`} className="text-right text-muted hover:text-fg">
                  {next.title} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </article>
        </DocsShell>
      </main>
      <Footer />
    </>
  );
}
