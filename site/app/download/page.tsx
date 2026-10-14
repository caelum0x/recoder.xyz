import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";
import { DownloadNotify, DownloadReleases } from "@/components/download-notify";
import { LeadForm } from "@/components/lead-form";
import { CliCommand } from "@/components/cli-command";
import { JsonLd } from "@/components/json-ld";
import { buildSoftwareApplicationJsonLd } from "@/lib/seo";
import {
  downloadHref,
  platformChecksum,
  releasesArePublic,
  releaseVersionLabel,
  type PlatformId,
} from "@/lib/releases";

export const metadata: Metadata = {
  title: "Download Recoder",
  description:
    "Get Recoder for macOS (Apple Silicon) to coordinate your own Claude Code, Codex, and opencode agents. Windows and Linux are planned.",
  alternates: { canonical: "https://recoder.xyz/download" },
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
  const isLive = releasesArePublic();
  const versionLabel = releaseVersionLabel();
  // Resolve real GitHub release hrefs server-side so the client never hardcodes
  // a URL that could 404 (ROADMAP M4.3). Empty when no public build exists.
  const platforms: PlatformId[] = ["macos", "windows", "linux"];
  const hrefs = platforms.reduce<Partial<Record<PlatformId, string>>>(
    (acc, p) => {
      const href = downloadHref(p);
      if (href) acc[p] = href;
      return acc;
    },
    {},
  );
  const checksums = platforms.reduce<Partial<Record<PlatformId, string>>>(
    (acc, p) => {
      const sum = platformChecksum(p);
      if (sum) acc[p] = sum;
      return acc;
    },
    {},
  );

  return (
    <>
      {/* Scoped to /download, where the page itself describes the signed,
          notarized macOS build — so the SoftwareApplication node is honest here
          even though layout.tsx deliberately keeps it out of the sitewide @graph. */}
      <JsonLd data={buildSoftwareApplicationJsonLd()} />
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          {isLive ? "Download Recoder" : "Get the Recoder desktop app"}
        </h1>
        <p className="text-balance mx-auto mt-4 max-w-lg text-muted">
          Local-first. It drives the Claude Code and Codex you already have
          installed. Nothing leaves your machine unless you turn on team mode.
        </p>
        {isLive ? (
          <p className="text-balance mx-auto mt-4 max-w-lg text-sm text-faint">
            Pick your platform to download the latest build. The macOS build is
            signed with a Developer ID and notarized by Apple, so it installs
            without Gatekeeper warnings. Expand &ldquo;Verify checksum&rdquo; to
            confirm integrity before installing.
          </p>
        ) : (
          <p className="text-balance mx-auto mt-4 max-w-lg text-sm text-faint">
            Desktop builds aren&apos;t public yet. Pick your platform and
            we&apos;ll email you the moment it ships.
          </p>
        )}

        <section className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-bg-soft p-6 text-left">
          <p className="text-sm font-medium text-fg">
            Don&apos;t want to wait? Try the CLI right now
          </p>
          <p className="mt-1.5 text-xs text-muted">
            <code className="text-fg">recoder-code</code> is the same
            BYOK coding agent, published and working on npm today — no
            desktop install, no waitlist.
          </p>
          <div className="mt-4 space-y-3">
            <CliCommand command="npx recoder-code@latest" />
            <CliCommand command={'npx recoder-code@latest parallel "describe the task"'} />
          </div>
        </section>

        {isLive ? (
          <>
            <DownloadReleases
              hrefs={hrefs}
              checksums={checksums}
              versionLabel={versionLabel}
            />
            {/* Optional, non-blocking: the download works without an email.
                This is the only capture moment on the primary CTA path. */}
            <section className="mx-auto mt-10 max-w-md text-left">
              <p className="text-center text-sm text-muted">
                Email me the getting-started guide + release updates
              </p>
              <LeadForm
                kind="notify"
                source="post-download-macos"
                platform="macos"
                submitLabel="Send the guide"
                successText="You're on the list — the getting-started guide and release updates will land in your inbox."
                className="mt-3"
              />
            </section>
          </>
        ) : (
          <DownloadNotify />
        )}

        <section className="mx-auto mt-16 max-w-2xl text-left">
          <h2 className="text-center text-lg font-medium">
            {isLive ? "How getting started works" : "How getting started will work"}
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
