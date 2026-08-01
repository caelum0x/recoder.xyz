import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";
import { DOC_SECTIONS, type DocBlock } from "./content";

export const metadata: Metadata = {
  title: "Recoder docs — how to use it",
  description:
    "How to use Recoder: install the desktop app, connect Claude Code / Codex / opencode, run agents in parallel, and converge them into one governed merge. Your agents, your keys.",
  alternates: { canonical: "https://recoder.xyz/docs" },
};

function Block({ block }: { block: DocBlock }) {
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

export default function Docs() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Docs
        </h1>
        <p className="mt-3 text-muted">
          How to use Recoder — install, connect your agents, and run them as a
          coordinated team.{" "}
          <Link
            href="/download"
            className="text-accent underline-offset-4 hover:underline"
          >
            Download
          </Link>
        </p>

        <nav aria-label="Contents" className="mt-10 rounded-xl border border-border bg-bg-soft p-6">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            On this page
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {DOC_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-sm text-muted hover:text-fg">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-12">
          {DOC_SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-border pt-8">
              <h2 className="text-xl font-medium tracking-tight">{s.title}</h2>
              {s.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </div>

        <p className="mt-16 border-t border-border pt-8 text-sm text-faint">
          Looking for the full reference — per-runtime setup, review/converge/merge,
          troubleshooting? See the complete guide in the{" "}
          <a
            href="https://github.com/caelum0x/recoder.xyz/tree/main/docs/guide"
            target="_blank"
            rel="noreferrer"
            className="text-muted underline underline-offset-4 hover:text-fg"
          >
            Recoder user guide
          </a>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
