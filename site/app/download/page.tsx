import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";
import { DownloadNotify } from "@/components/download-notify";

export const metadata: Metadata = {
  title: "Download Recoder",
  description:
    "Recoder for macOS, Windows, and Linux. Runs your own Claude Code, Codex, and opencode, coordinated. Get notified the moment builds land.",
};

const GETTING_STARTED: { title: string; body: string }[] = [
  {
    title: "Install the cockpit",
    body: "Run the local control plane on your own machine. No account is required to start.",
  },
  {
    title: "Bring your own keys",
    body: "Point it at the provider keys your agents already use. Recoder orchestrates; it never proxies or resells tokens.",
  },
  {
    title: "Connect your agents",
    body: "Attach Claude Code, Codex, opencode, and pi over MCP and the A2A bus, then run them as a coordinated team.",
  },
];

export default function Download() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Download Recoder
        </h1>
        <p className="text-balance mx-auto mt-4 max-w-lg text-muted">
          Local-first. It drives the Claude Code and Codex you already have
          installed. Nothing leaves your machine unless you turn on team mode.
        </p>
        <p className="text-balance mx-auto mt-4 max-w-lg text-sm text-faint">
          Desktop builds aren&apos;t public yet. Pick your platform and we&apos;ll
          email you the moment it ships.
        </p>

        <DownloadNotify />

        <section className="mx-auto mt-16 max-w-2xl text-left">
          <h2 className="text-center text-lg font-medium">
            How getting started will work
          </h2>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {GETTING_STARTED.map((step, i) => (
              <li key={step.title} className="bg-bg p-6">
                <div className="font-mono text-xs text-accent">{i + 1}</div>
                <h3 className="mt-2 text-sm font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-xs text-faint">
            Bring your own provider keys (BYOK). You pay Recoder for
            orchestration and control — never for tokens. See{" "}
            <Link href="/pricing" className="text-muted underline hover:text-fg">
              pricing
            </Link>
            .
          </p>
        </section>

        <p className="mt-8 text-xs text-faint">
          Follow the{" "}
          <Link href="/changelog" className="text-muted underline hover:text-fg">
            changelog
          </Link>{" "}
          for the latest on builds.
        </p>
      </main>
      <Footer />
    </>
  );
}
