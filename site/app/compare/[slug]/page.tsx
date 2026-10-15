import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { RelatedLinks } from "@/components/related-links";
import {
  SITE_URL,
  createMetadata,
  buildBreadcrumbJsonLd,
  buildArticleJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo";
import { COMPARISONS, comparison, type ToolRef } from "../comparisons";

export const revalidate = 86400;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = comparison(slug);
  if (!c) return { title: "Compare — Recoder" };
  return createMetadata({
    title: c.metaTitle,
    description: c.description,
    path: `/compare/${c.slug}`,
    keywords: c.keywords,
    type: "article",
  });
}

function ToolCard({ tool }: { tool: ToolRef }) {
  return (
    <div className="rounded-lg border border-border bg-bg-soft px-4 py-3">
      <div className="text-sm font-semibold text-fg">{tool.name}</div>
      <div className="mt-1 text-xs text-muted">{tool.kind}</div>
      <div className="mt-0.5 text-xs text-faint">{tool.license}</div>
    </div>
  );
}

function ProsCons({
  tool,
  pros,
  cons,
}: {
  tool: ToolRef;
  pros: string[];
  cons: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-6">
      <h3 className="text-base font-semibold tracking-tight text-fg">
        {tool.name}
      </h3>
      <div className="mt-4 text-xs font-medium uppercase tracking-wide text-faint">
        Strengths
      </div>
      <ul className="mt-2 space-y-2">
        {pros.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
            <span aria-hidden className="text-accent">+</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 text-xs font-medium uppercase tracking-wide text-faint">
        Trade-offs
      </div>
      <ul className="mt-2 space-y-2">
        {cons.map((c, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
            <span aria-hidden className="text-faint">−</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ComparePageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = comparison(slug);
  if (!c) notFound();

  const url = `${SITE_URL}/compare/${c.slug}`;
  const related = c.related
    .map((s) => comparison(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", item: SITE_URL },
    { name: "Compare", item: `${SITE_URL}/compare` },
    { name: c.title, item: url },
  ]);

  const articleJsonLd = buildArticleJsonLd({
    headline: c.title,
    description: c.description,
    url,
    about: [c.a.name, c.b.name],
  });

  const faqJsonLd = buildFaqJsonLd(c.faq);

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
              <Link href="/compare" className="hover:text-fg">
                Compare
              </Link>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-faint">{c.title}</span>
            </nav>
            <h1 className="text-balance mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {c.title}
            </h1>
            <p className="text-balance mt-3 max-w-2xl text-muted">{c.tagline}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ToolCard tool={c.a} />
              <ToolCard tool={c.b} />
            </div>
          </div>
        </section>

        <article className="mx-auto max-w-3xl px-6 py-14">
          {c.intro.map((p, i) => (
            <p
              key={i}
              className="mt-4 text-sm leading-relaxed text-muted first:mt-0"
            >
              {p}
            </p>
          ))}

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            {c.a.name} vs {c.b.name} at a glance
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-soft">
                  {c.table.head.map((h) => (
                    <th key={h} className="px-4 py-2 font-medium text-fg">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={
                          "px-4 py-2 " +
                          (j === 0 ? "font-medium text-fg" : "text-muted")
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            Strengths and trade-offs
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ProsCons tool={c.a} pros={c.prosA} cons={c.consA} />
            <ProsCons tool={c.b} pros={c.prosB} cons={c.consB} />
          </div>

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            When to use which
          </h2>
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-border bg-bg-soft px-4 py-3 text-sm leading-relaxed text-muted">
              <span className="font-medium text-fg">{c.a.name}: </span>
              {c.whenA}
            </p>
            <p className="rounded-lg border border-border bg-bg-soft px-4 py-3 text-sm leading-relaxed text-muted">
              <span className="font-medium text-fg">{c.b.name}: </span>
              {c.whenB}
            </p>
          </div>

          <h2 className="mt-12 text-lg font-medium tracking-tight text-fg">
            Where Recoder fits
          </h2>
          {c.recoderFit.map((p, i) => (
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
            {c.faq.map((item) => (
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

          {related.length > 0 ? (
            <>
              <h2 className="mt-14 text-lg font-medium tracking-tight text-fg">
                Related comparisons
              </h2>
              <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/compare/${r.slug}`}
                    className="group bg-bg p-5 transition-colors hover:bg-bg-soft"
                  >
                    <div className="text-sm font-medium text-fg">{r.title}</div>
                    <div className="mt-1 text-sm text-muted">{r.tagline}</div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <RelatedLinks
            heading="Keep exploring"
            links={[
              {
                href: "/use-cases",
                title: "Use cases",
                summary: "Run agents in parallel, converge diffs, and govern merges.",
              },
              {
                href: "/features",
                title: "What Recoder does",
                summary: "Isolation while agents work, convergence when they finish.",
              },
              {
                href: "/how-it-works",
                title: "How it works",
                summary: "From one task to N agents to a single governed merge.",
              },
              {
                href: "/pricing",
                title: "Pricing",
                summary: "Free for local use; paid plans for teams and governance.",
              },
            ]}
          />

          <div className="mt-10 text-sm">
            <Link href="/compare" className="text-muted hover:text-fg">
              ← All comparisons
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
