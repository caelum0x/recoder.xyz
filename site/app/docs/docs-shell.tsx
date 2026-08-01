import Link from "next/link";
import { DOC_PAGES, type DocBlock } from "./content";

export function DocBlockView({ block }: { block: DocBlock }) {
  if (block.kind === "h") {
    return (
      <h2 className="mt-10 text-lg font-medium tracking-tight text-fg">
        {block.text}
      </h2>
    );
  }
  if (block.kind === "p") {
    return <p className="mt-4 text-sm leading-relaxed text-muted">{block.text}</p>;
  }
  if (block.kind === "note") {
    return (
      <p className="mt-4 rounded-lg border border-border bg-bg-soft px-4 py-3 text-sm leading-relaxed text-faint">
        {block.text}
      </p>
    );
  }
  if (block.kind === "code") {
    return (
      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-bg-soft px-4 py-3 text-xs text-muted">
        <code>{block.code}</code>
      </pre>
    );
  }
  if (block.kind === "steps") {
    return (
      <ol className="mt-4 space-y-2">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
            <span className="font-mono text-xs text-accent">{i + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.kind === "bullets") {
    return (
      <ul className="mt-4 space-y-2">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
            <span className="text-accent">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-soft">
            {block.head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium text-fg">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-muted">
                  {j === 0 ? <code className="text-xs">{cell}</code> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocsSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <nav aria-label="Docs" className="text-sm">
      <Link
        href="/docs"
        className={
          "block rounded-md px-3 py-1.5 transition-colors " +
          (activeSlug == null
            ? "bg-bg-soft font-medium text-fg"
            : "text-muted hover:text-fg")
        }
      >
        Overview
      </Link>
      <div className="mt-2 space-y-0.5">
        {DOC_PAGES.map((p) => {
          const active = p.slug === activeSlug;
          return (
            <Link
              key={p.slug}
              href={`/docs/${p.slug}`}
              aria-current={active ? "page" : undefined}
              className={
                "block rounded-md px-3 py-1.5 transition-colors " +
                (active
                  ? "bg-bg-soft font-medium text-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {p.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DocsShell({
  activeSlug,
  children,
}: {
  activeSlug?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <DocsSidebar activeSlug={activeSlug} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
