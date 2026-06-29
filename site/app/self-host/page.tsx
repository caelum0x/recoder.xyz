import type { Metadata } from "next";
import {
  Nav,
  Footer,
  DownloadButton,
  SecondaryButton,
  PUBLIC_GITHUB_URL,
} from "@/components/site";

export const metadata: Metadata = {
  title: "Self-host Recoder",
  description:
    "Run the entire Recoder control plane inside your own infrastructure. A scripted docker-compose stack and a Packer-baked machine image stand up a Postgres state-of-record behind an edge proxy — so your code and your audit trail never leave your network.",
};

/**
 * Source links are only rendered when a public repo URL is configured. The
 * source is private today, so we surface a request-access path instead of
 * shipping GitHub links that 404 for the public.
 */
const REPO = PUBLIC_GITHUB_URL;
const README_URL = REPO ? `${REPO}/blob/main/deploy/README.md` : undefined;
const COMPOSE_URL = REPO ? `${REPO}/blob/main/docker-compose.selfhost.yml` : undefined;
const SCRIPT_URL = REPO ? `${REPO}/blob/main/scripts/selfhost-up.sh` : undefined;
const PACKER_URL = REPO ? `${REPO}/blob/main/deploy/packer/recoder.pkr.hcl` : undefined;
const ACCESS_HREF =
  "mailto:founders@recoder.xyz?subject=Recoder%20self-host%20access";

interface StackRow {
  service: string;
  image: string;
  role: string;
}

const STACK: StackRow[] = [
  {
    service: "backend",
    image: "docker-backend (built)",
    role: "The Recoder control plane — the product itself.",
  },
  {
    service: "postgres",
    image: "postgres:17",
    role: "State of record: recoder_main, recoder_backend, recoder_pm.",
  },
  {
    service: "redis",
    image: "redis:7",
    role: "Sessions and the A2A coordination bus.",
  },
  {
    service: "qdrant",
    image: "qdrant/qdrant",
    role: "Vector store for the shared brain (memory / embeddings).",
  },
  {
    service: "envoy",
    image: "envoyproxy/envoy:v1.31",
    role: "L7 edge proxy in front of the control plane.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Clone and configure",
    body: "Copy .env.selfhost.example to .env.selfhost. The up-script generates safe secrets and validates required env before anything starts.",
  },
  {
    n: "2",
    title: "Bring it up",
    body: "scripts/selfhost-up.sh builds the backend image, starts Postgres, Redis, Qdrant, and Envoy, and waits for every service to report healthy.",
  },
  {
    n: "3",
    title: "Run governed",
    body: "Point your agents at your own control plane. State, audit, and memory all live on your infrastructure — your code never leaves.",
  },
];

export default function SelfHost() {
  return (
    <>
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Your infrastructure. Your control plane.
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Self-host the whole control plane.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Run the full control plane — Postgres state-of-record, the shared
              brain, governance, and an Envoy edge — inside your own network. Your
              code and audit trail never leave your infrastructure.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              {README_URL ? (
                <SecondaryButton href={README_URL} label="Read the deploy guide →" />
              ) : (
                <SecondaryButton href={ACCESS_HREF} label="Request deploy access →" />
              )}
              <DownloadButton label="Download the cockpit" className="px-6 py-3 text-[15px]" />
            </div>
            {!REPO && (
              <p className="mx-auto mt-4 max-w-md text-xs text-faint">
                The self-host source is in private preview. Request access and
                we&apos;ll send the deploy bundle and walk you through it.
              </p>
            )}
          </div>
        </section>

        {/* One command */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">
              Scripted bring-up
            </div>
            <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              docker-compose, scripted and health-checked.
            </h2>
            <p className="mt-4 text-muted">
              The whole stack is defined in{" "}
              <code className="font-mono text-sm text-fg">
                docker-compose.selfhost.yml
              </code>{" "}
              and brought up by{" "}
              <code className="font-mono text-sm text-fg">
                scripts/selfhost-up.sh
              </code>
              , which validates env, generates secrets, and waits for health.
              Once you have the deploy bundle, bring-up looks like this:
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-border-strong bg-bg-soft">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/50" />
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/40" />
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/30" />
              <span className="ml-3 text-xs text-muted">your-host · bash</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-muted">
              <span className="text-faint"># in the deploy bundle directory</span>
              {"\n"}
              cp .env.selfhost.example .env.selfhost
              {"\n\n"}
              <span className="text-faint"># validates env, generates secrets, waits for health</span>
              {"\n"}
              <span className="text-emerald-400">scripts/selfhost-up.sh</span>
            </pre>
          </div>
          {!REPO && (
            <p className="mt-4 text-xs text-faint">
              The source repo is in private preview.{" "}
              <a
                href={ACCESS_HREF}
                className="text-muted underline hover:text-fg"
              >
                Request access
              </a>{" "}
              to get the deploy bundle.
            </p>
          )}

          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-bg p-7">
                <div className="font-mono text-xs text-accent">{s.n}</div>
                <h3 className="mt-2 font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture */}
        <section className="border-y border-border bg-bg-soft">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-wider text-accent">
                Architecture
              </div>
              <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                A control plane on a Postgres state-of-record, behind Envoy.
              </h2>
              <p className="mt-4 text-muted">
                The backend is the product. Postgres is the durable record for
                tasks, runs, approvals, and audit. Redis carries the A2A bus,
                Qdrant holds the brain, and Envoy is the L7 edge in front of it
                all.
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-bg text-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Service</th>
                    <th className="px-5 py-3 font-medium">Image</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {STACK.map((row) => (
                    <tr key={row.service} className="border-t border-border bg-bg">
                      <td className="px-5 py-3 font-mono text-xs text-fg">
                        {row.service}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-muted">
                        {row.image}
                      </td>
                      <td className="px-5 py-3 text-muted">{row.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* AMI / Packer */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">
              Machine image
            </div>
            <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Or boot it from a baked image.
            </h2>
            <p className="mt-4 text-muted">
              A Packer template bakes Docker, the compose stack, and the pinned
              substrate binaries into a machine image. It builds a real AMI for
              AWS, or provisions any reachable host over SSH using the exact same
              provisioner — so bare metal, a VM, or a CI runner all follow one
              path. A booted instance runs Recoder via a systemd unit.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-border-strong bg-bg-soft">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/50" />
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/40" />
              <span aria-hidden className="h-3 w-3 rounded-full bg-faint/30" />
              <span className="ml-3 text-xs text-muted">packer</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-muted">
              packer init deploy/packer/recoder.pkr.hcl
              {"\n"}
              packer validate deploy/packer/recoder.pkr.hcl
              {"\n\n"}
              <span className="text-faint"># build a publishable AMI</span>
              {"\n"}
              <span className="text-emerald-400">
                packer build -only=&apos;amazon-ebs.recoder&apos; deploy/packer/recoder.pkr.hcl
              </span>
            </pre>
          </div>

          {REPO && README_URL && COMPOSE_URL && SCRIPT_URL && PACKER_URL ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <SecondaryButton href={README_URL} label="Deploy README" />
              <SecondaryButton href={COMPOSE_URL} label="docker-compose.selfhost.yml" />
              <SecondaryButton href={SCRIPT_URL} label="selfhost-up.sh" />
              <SecondaryButton href={PACKER_URL} label="recoder.pkr.hcl" />
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <SecondaryButton href={ACCESS_HREF} label="Request the deploy bundle" />
            </div>
          )}
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              Need SSO, seats, and support on top of self-host?
            </h2>
            <p className="text-balance mx-auto mt-3 max-w-xl text-muted">
              Self-hosting is open to everyone. Enterprise adds single sign-on,
              per-seat management, governance approvals, and direct support.
            </p>
            <div className="mt-8 flex justify-center">
              <SecondaryButton href="/enterprise#contact" label="Contact sales" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
