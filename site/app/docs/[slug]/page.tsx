import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, Footer } from "@/components/site";
import { DOC_PAGES, docPage } from "../content";
import { DocBlockView, DocsShell } from "../docs-shell";

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug }));
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

  return (
    <>
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
