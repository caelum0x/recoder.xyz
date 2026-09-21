import Link from "next/link";

/**
 * Shared internal-linking mesh. Every programmatic page (compare, alternatives,
 * use-cases) ends with one or more RelatedLinks groups so the site forms a dense,
 * consistent internal link graph — compare ↔ alternatives ↔ use-cases ↔
 * features/docs, both directions. Consistent markup here means every new data
 * entry ships its cross-links the same way, which is the single biggest reason
 * this content mesh ranks.
 */

export interface RelatedLink {
  href: string;
  title: string;
  /** One-line description shown under the title. */
  summary: string;
}

export function RelatedLinks({
  heading,
  links,
}: {
  heading: string;
  links: readonly RelatedLink[];
}) {
  if (links.length === 0) return null;
  return (
    <>
      <h2 className="mt-14 text-lg font-medium tracking-tight text-fg">
        {heading}
      </h2>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {links.map((l) => {
          const external = l.href.startsWith("http");
          const inner = (
            <>
              <div className="text-sm font-medium text-fg">{l.title}</div>
              <div className="mt-1 text-sm text-muted">{l.summary}</div>
            </>
          );
          const cls = "group bg-bg p-5 transition-colors hover:bg-bg-soft";
          return external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className={cls}
            >
              {inner}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </>
  );
}
