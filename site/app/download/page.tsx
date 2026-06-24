import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Download Recoder",
  description:
    "Download Recoder for macOS, Windows, or Linux. Runs your own Claude Code, Codex, and opencode, coordinated.",
};

const PLATFORMS = [
  { os: "macOS", note: "Apple silicon & Intel", href: "#" },
  { os: "Windows", note: "x64", href: "#" },
  { os: "Linux", note: "AppImage & deb", href: "#" },
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
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <Link
              key={p.os}
              href={p.href}
              className="rounded-xl border border-border bg-bg-soft p-6 transition-colors hover:border-border-strong"
            >
              <div className="text-lg font-medium">{p.os}</div>
              <div className="mt-1 text-xs text-faint">{p.note}</div>
              <div className="mt-4 text-sm text-accent">Download →</div>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-xs text-faint">
          Prefer the terminal?{" "}
          <code className="rounded bg-bg-soft px-1.5 py-0.5 font-mono text-muted">
            brew install recoder
          </code>
        </p>
        <p className="mt-2 text-xs text-faint">
          Builds are coming online — follow the{" "}
          <Link href="/changelog" className="text-muted underline hover:text-fg">
            changelog
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
