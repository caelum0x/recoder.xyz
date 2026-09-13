import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";
import { DOC_PAGES } from "./content";
import { DocsShell } from "./docs-shell";

export const metadata: Metadata = {
  title: "Recoder docs — how to use it",
  description:
    "Install Recoder, connect Claude Code, Codex, or opencode, run agents in parallel, and converge their work into one governed merge.",
  alternates: { canonical: "https://recoder.xyz/docs" },
};

export default function DocsIndex() {
  return (
    <>
      <Nav />
      <main>
        <DocsShell>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Documentation
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            How to use Recoder — install the desktop app, connect the coding agents
            you already run, and coordinate them: run in parallel, review, converge,
            and land one governed merge. Local-first; your agents, your keys.
          </p>
          <div className="mt-4">
            <Link
              href="/download"
              className="inline-block rounded-lg bg-accent/80 px-4 py-2 text-sm text-primary transition-colors hover:bg-accent"
            >
              Download Recoder
            </Link>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {DOC_PAGES.map((p, i) => (
              <Link
                key={p.slug}
                href={`/docs/${p.slug}`}
                className="group bg-bg p-6 transition-colors hover:bg-bg-soft"
              >
                <div className="font-mono text-xs text-accent">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h2 className="mt-2 text-sm font-medium text-fg group-hover:text-fg">
                  {p.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {p.description}
                </p>
              </Link>
            ))}
          </div>
        </DocsShell>
      </main>
      <Footer />
    </>
  );
}
