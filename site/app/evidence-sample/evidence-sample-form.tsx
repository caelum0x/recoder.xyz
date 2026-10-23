"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

type Status = "idle" | "submitting" | "done" | "error";

interface EvidenceControl {
  id: string;
  framework: string;
  title: string;
  requirement: string;
  status: "met" | "partial" | "not-evidenced";
  evidenceRefs: string[];
  reason?: string;
}

interface EvidenceSampleResponse {
  success: boolean;
  error?: string;
  disclaimer?: string;
  input?: {
    changedFiles: number;
    insertions: number;
    deletions: number;
    riskTier: "low" | "medium" | "high";
    verificationVerdict: "ready" | "not_ready" | "unknown";
  };
  export?: {
    controls: EvidenceControl[];
    coverage: { met: number; partial: number; notEvidenced: number; total: number };
    summary: string;
    contentHash: string;
    generatedAt: string;
    signature?: { algorithm: string; publicKeyPem: string; signature: string; signedAt: string } | null;
  };
  integrity?: {
    recordHashVerified: boolean;
    exportHashVerified: boolean;
    signature: { signed: boolean; valid: boolean; reason?: string };
  };
}

const STATUS_STYLE: Record<EvidenceControl["status"], string> = {
  met: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  partial: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  "not-evidenced": "text-zinc-400 border-zinc-500/40 bg-zinc-500/10",
};

const STATUS_LABEL: Record<EvidenceControl["status"], string> = {
  met: "MET",
  partial: "PARTIAL",
  "not-evidenced": "NOT EVIDENCED",
};

const EXAMPLE_DIFF = `diff --git a/src/billing/charge.ts b/src/billing/charge.ts
index 83db48f..bf269a9 100644
--- a/src/billing/charge.ts
+++ b/src/billing/charge.ts
@@ -12,7 +12,10 @@ export async function chargeCustomer(customerId: string, amountCents: number) {
-  const result = await provider.charge(customerId, amountCents);
+  if (amountCents <= 0) {
+    throw new Error("amountCents must be positive");
+  }
+  const result = await provider.charge(customerId, amountCents);
   return result;
 }`;

const EXAMPLE_VERIFICATION = `$ pnpm test billing/charge.test.ts

 PASS  src/billing/charge.test.ts
  chargeCustomer
    ✓ rejects a non-positive amount (4 ms)
    ✓ charges the provider with the given amount (2 ms)

Tests:       2 passed, 2 total
exit code: 0`;

export function EvidenceSampleForm() {
  const [diff, setDiff] = useState("");
  const [verificationOutput, setVerificationOutput] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceSampleResponse | null>(null);

  const canSubmit = useMemo(() => diff.trim().length > 0 && status !== "submitting", [diff, status]);

  function loadExample() {
    setDiff(EXAMPLE_DIFF);
    setVerificationOutput(EXAMPLE_VERIFICATION);
    setTaskDescription("Reject non-positive charge amounts before calling the payment provider");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/evidence-sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diff, verificationOutput, taskDescription }),
      });
      const data = (await res.json().catch(() => null)) as EvidenceSampleResponse | null;
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  function downloadMarkdown() {
    if (!result?.export?.summary) return;
    const blob = new Blob([result.export.summary], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "convergence-evidence-sample.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl px-6">
      <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-bg-soft p-6 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="diff" className="text-sm font-medium text-fg">
            1. Paste a real PR diff
          </label>
          <button
            type="button"
            onClick={loadExample}
            className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Load an example instead
          </button>
        </div>
        <textarea
          id="diff"
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          placeholder={"diff --git a/src/file.ts b/src/file.ts\n@@ -1,3 +1,4 @@\n..."}
          rows={10}
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <label htmlFor="verification" className="mt-6 block text-sm font-medium text-fg">
          2. Paste the test / verification output (optional, but the honest controls below depend on it)
        </label>
        <textarea
          id="verification"
          value={verificationOutput}
          onChange={(e) => setVerificationOutput(e.target.value)}
          placeholder={"$ pnpm test\n...\nTests: 4 passed, 4 total"}
          rows={6}
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <label htmlFor="task" className="mt-6 block text-sm font-medium text-fg">
          3. What was this change supposed to do? (optional)
        </label>
        <input
          id="task"
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          placeholder="e.g. Reject non-positive charge amounts before calling the payment provider"
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <div className="mt-6 flex items-center gap-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "submitting" ? "Generating…" : "Generate evidence record"}
            <span aria-hidden="true">→</span>
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
        <p className="mt-3 text-xs text-muted">
          Nothing you paste is stored. This runs the same control-derivation logic Recoder runs on
          every real governed merge — on your input only, in this one request.
        </p>
      </form>

      {result?.success && result.export && result.input && (
        <div className="mt-10 rounded-2xl border border-border bg-bg-soft p-6 md:p-8">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {result.disclaimer}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Changed files" value={String(result.input.changedFiles)} />
            <Stat label="Lines +/-" value={`+${result.input.insertions} / -${result.input.deletions}`} />
            <Stat label="Risk tier" value={result.input.riskTier} />
            <Stat label="Verification" value={result.input.verificationVerdict.replace("_", " ")} />
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-semibold text-fg">
              Control mapping — {result.export.coverage.met} met · {result.export.coverage.partial} partial ·{" "}
              {result.export.coverage.notEvidenced} not evidenced
            </h3>
            <div className="mt-4 space-y-3">
              {result.export.controls.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-bg p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    <span className="text-xs font-mono text-muted">{c.framework} · {c.id}</span>
                    <span className="text-sm font-medium text-fg">{c.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{c.requirement}</p>
                  {c.reason && <p className="mt-1 text-xs text-zinc-400">Note: {c.reason}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-border pt-6">
            <div className="text-xs text-muted">
              <div>
                Export hash: <span className="font-mono text-fg">{result.export.contentHash.slice(0, 16)}…</span>{" "}
                ({result.integrity?.exportHashVerified ? "verified" : "UNVERIFIED"})
              </div>
              <div className="mt-1">
                Signature:{" "}
                {result.export.signature
                  ? result.integrity?.signature.valid
                    ? "Ed25519-signed and verified"
                    : "signed, but failed verification"
                  : "unsigned (no signing key configured on this deployment)"}
              </div>
            </div>
            <button
              type="button"
              onClick={downloadMarkdown}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg"
            >
              Download markdown report
              <span aria-hidden="true">↓</span>
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <Link href="/pricing" className="text-fg underline-offset-4 hover:underline">
              Run this for real on every merge →
            </Link>
            <Link href="/enterprise" className="text-muted underline-offset-4 hover:text-fg hover:underline">
              Enterprise evidence SLA
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold capitalize text-fg">{value}</div>
    </div>
  );
}
