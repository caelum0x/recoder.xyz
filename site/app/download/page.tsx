import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";
import { DownloadNotify } from "@/components/download-notify";

export const metadata: Metadata = {
  title: "Download Recoder",
  description:
    "Recoder for macOS, Windows, and Linux. Runs your own Claude Code, Codex, and opencode, coordinated. Get notified the moment builds land.",
};

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
