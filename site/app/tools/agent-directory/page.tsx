import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";
import { JsonLd } from "@/components/json-ld";
import { AGENTS, AGENT_GROUPS } from "../agents";
import { DirectoryTable } from "./directory-table";

const SITE_URL = "https://recoder.xyz";
const PATH = "/tools/agent-directory";
const URL = `${SITE_URL}${PATH}`;

const TITLE = "AI Coding Agents: The Directory (Claude Code, Cursor, Codex, Aider & more)";
const DESCRIPTION =
  "A free, factual directory of AI coding agents, editors, and cloud dev environments — Claude Code, Codex CLI, Cursor, Aider, Gemini CLI, opencode, Conductor and more. Category, vendor, license, form factor, and models at a glance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  keywords: [
    "AI coding agents",
    "coding agent directory",
    "AI coding tools list",
    "Claude Code",
    "Codex CLI",
    "Cursor",
    "Aider",
    "Gemini CLI",
    "opencode",
    "coding agent comparison",
  ],
  openGraph: {
    title: "AI Coding Agents: The Directory",
    description: DESCRIPTION,
    url: URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Coding Agents: The Directory",
    description: DESCRIPTION,
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
    { "@type": "ListItem", position: 3, name: "AI coding agents directory", item: URL },
  ],
};

// ItemList: the directory as a curated, ordered collection of tools.
const itemListJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "AI coding agents directory",
  description: DESCRIPTION,
  numberOfItems: AGENTS.length,
  itemListElement: AGENTS.map((a, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: a.name,
    url: a.homepage,
  })),
};

// Dataset: this reference table is genuinely a small, structured dataset —
// declaring it as such is honest and helps it get cited by AI answer engines.
const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "AI coding agents directory",
  description:
    "A structured, factual list of AI coding agents, editors, and cloud dev environments with category, vendor, license, form factor, and model posture for each.",
  url: URL,
  license: "https://creativecommons.org/licenses/by/4.0/",
  isAccessibleForFree: true,
  creator: { "@id": `${SITE_URL}/#organization` },
  keywords: ["AI coding agents", "coding CLIs", "AI code editors", "cloud dev environments"],
  variableMeasured: ["name", "category", "vendor", "license", "form factor", "models"],
};

export default function AgentDirectoryPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={itemListJsonLd} />
      <JsonLd data={datasetJsonLd} />
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-20">
            <nav aria-label="Breadcrumb" className="text-xs text-muted">
              <Link href="/tools" className="hover:text-fg">
                Tools
              </Link>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-faint">AI coding agents directory</span>
            </nav>
            <h1 className="text-balance mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              AI coding agents: the directory
            </h1>
            <p className="text-balance mt-3 max-w-2xl text-muted">
              A free, factual map of the coding agents, AI editors, and cloud dev
              environments developers actually use — with the category, vendor,
              license, form factor, and model posture for each. No benchmarks, no
              rankings, no fake numbers.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <SecondaryButton href="/compare" label="Head-to-head comparisons" />
              <SecondaryButton href="/tools" label="All free tools" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-12 md:py-14">
          <p className="text-sm leading-relaxed text-muted">
            The AI coding space moves fast and the categories blur together, so
            it helps to see the whole landscape in one place. This page lists the
            real tools — the terminal agents you run in your shell, the AI-first
            editors, the cloud dev environments that host them, and the
            orchestrators that run several at once. Every field comes straight
            from each tool&apos;s own public docs, repo, or site.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            A note on categories: an <strong className="font-medium text-fg">agent</strong>{" "}
            actually reads and edits your code (Claude Code, Codex CLI, Aider); an{" "}
            <strong className="font-medium text-fg">AI editor</strong> like Cursor puts AI
            inside a GUI you drive line by line; a{" "}
            <strong className="font-medium text-fg">cloud dev environment</strong> such as
            Gitpod or Codespaces is the machine those agents run on, not an agent
            itself; and an{" "}
            <strong className="font-medium text-fg">orchestrator</strong> runs multiple
            agents together and reconciles their output. They compose more than
            they compete.
          </p>

          <div className="mt-10">
            <DirectoryTable />
          </div>

          <p className="mt-6 rounded-lg border border-border bg-bg-soft px-4 py-3 text-xs leading-relaxed text-muted">
            <strong className="font-medium text-fg">Facts only — corrections welcome.</strong>{" "}
            This directory lists publicly-known capabilities and links to each
            tool&apos;s own site as the source of truth. Tools evolve; if a detail
            is out of date or wrong,{" "}
            <Link href="/contact" className="text-accent hover:underline">
              tell us
            </Link>{" "}
            and we&apos;ll fix it. You&apos;re welcome to link to or cite this page.
          </p>
        </section>

        <section className="border-t border-border bg-bg-soft">
          <div className="mx-auto max-w-4xl px-6 py-14">
            <h2 className="text-lg font-medium tracking-tight text-fg">
              How the categories break down
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {AGENT_GROUPS.map((g) => {
                const members = AGENTS.filter((a) => a.group === g.id);
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-border bg-bg p-5"
                  >
                    <h3 className="text-sm font-semibold text-fg">{g.label}</h3>
                    <p className="mt-1 text-sm text-muted">{g.blurb}</p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {members.map((a) => (
                        <li key={a.slug}>
                          <a
                            href={`#${a.slug}`}
                            className="rounded-full border border-border bg-bg-soft px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
                          >
                            {a.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-14">
            <h2 className="text-lg font-medium tracking-tight text-fg">
              The tools in detail
            </h2>
            <p className="mt-2 text-sm text-muted">
              One factual paragraph per tool, with a link to its home and to any
              head-to-head comparisons on this site.
            </p>
            <div className="mt-6 space-y-4">
              {AGENTS.map((a) => (
                <div
                  key={a.slug}
                  className="rounded-xl border border-border bg-bg p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <a
                      href={a.homepage}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-base font-semibold tracking-tight text-fg hover:text-accent"
                    >
                      {a.name}
                    </a>
                    <span className="text-xs text-faint">
                      {a.kind} · {a.license}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {a.note}
                  </p>
                  {a.compareSlugs.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.compareSlugs.map((s) => (
                        <Link
                          key={s}
                          href={`/compare/${s}`}
                          className="rounded-full border border-border bg-bg-soft px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
                        >
                          {s.replace(/-/g, " ")}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-bg-soft">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              Don&apos;t pick one — run several.
            </h2>
            <p className="text-balance mx-auto mt-3 max-w-xl text-muted">
              Most of the agents in this directory run great inside Recoder. Give
              one task to several at once in isolated git worktrees, compare their
              diffs, and converge the best of each into one governed merge. Bring
              your own keys; everything stays on your machine.
            </p>
            <div className="mt-7 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/how-it-works" label="How Recoder works" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
