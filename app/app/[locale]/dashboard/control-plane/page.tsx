/**
 * Agent OS Control Plane — recoder.xyz
 *
 * Shows control-plane STATE (online agents + capabilities, runs + state,
 * approvals waiting, handoff/work signals, delivery artifacts) from
 * /api/agent-os/summary — not a ChatGPT-style chat box. This is what Recoder is:
 * the control plane for agent work. (docs/PRODUCT-PLAN.md §6)
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  GitPullRequest,
  ShieldCheck,
  Workflow,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
} from 'lucide-react';
import { apiClient, type AgentOsControlPlaneSummary } from '@/lib/api-client';

const STATE_TONE: Record<string, string> = {
  failed: 'text-red-400', rejected: 'text-red-400', blocked: 'text-red-400',
  waiting_for_approval: 'text-amber-400', needs_input: 'text-amber-400',
  completed: 'text-emerald-400', approved: 'text-emerald-400', delivered: 'text-emerald-400',
};
const SEV_TONE: Record<string, string> = {
  critical: 'text-red-400', high: 'text-amber-400', medium: 'text-sky-400', low: 'text-gray-400',
};

export default function ControlPlanePage() {
  const [summary, setSummary] = useState<AgentOsControlPlaneSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setSummary(await apiClient.getAgentOsSummary());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load control plane');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const agents = summary?.agents ?? [];
  const runs = summary?.runs ?? [];
  const approvals = (summary?.approvals ?? []).filter((a) => a.status === 'pending' || a.status === 'escalated');
  const signals = (summary?.workSignals ?? []).filter((s) => s.status === 'open');
  const delivery = summary?.deliveryArtifacts ?? [];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-300">
            <Workflow className="h-4 w-4" /> Agent OS Control Plane
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Agents, runs, approvals & delivery</h1>
          <p className="mt-2 max-w-2xl text-gray-400">
            Live control-plane state — who is working, what task/run is in flight, what is waiting on
            you, and what shipped. Not a chat box.
          </p>
        </header>

        {loading && <p className="text-gray-400">Loading control-plane state…</p>}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error} — is the Agent OS API reachable?
          </div>
        )}

        {summary && (
          <div className="space-y-10">
            {/* Online agents */}
            <Section icon={<Bot className="h-5 w-5" />} title="Agents" count={agents.length}>
              {agents.length === 0 ? <Empty text="No agents connected yet — connect Claude Code, Codex, or Recoder Code." /> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {agents.map((a) => (
                    <div key={a.agentId} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{a.displayName}</div>
                        <span className={`text-xs ${a.health === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`}>{a.health ?? 'unknown'}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{a.runtime} · {(a.capabilityLabels ?? []).slice(0, 4).join(', ') || 'no capabilities'}</div>
                      <div className="mt-1 text-xs text-gray-500">{(a.activeRunIds ?? []).length} active run(s)</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Runs */}
            <Section icon={<Workflow className="h-5 w-5" />} title="Runs" count={runs.length}>
              {runs.length === 0 ? <Empty text="No runs yet — create a task and let an agent claim it." /> : (
                <div className="space-y-2">
                  {runs.map((r) => (
                    <div key={r.runId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div>
                        <div className="font-medium">{r.title ?? r.taskId}</div>
                        <div className="text-xs text-gray-500">{r.assigneeAgentId ?? 'unassigned'} · {r.artifactCount ?? 0} artifacts · {r.runtimeEvidenceCount ?? 0} evidence</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {(r.openWorkSignalCount ?? 0) > 0 && <span className="text-amber-400"><AlertTriangle className="inline h-3 w-3" /> {r.openWorkSignalCount}</span>}
                        <span className={`font-semibold ${STATE_TONE[r.state] ?? 'text-gray-300'}`}>{r.state}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Approvals waiting */}
            <Section icon={<ShieldCheck className="h-5 w-5" />} title="Waiting on you (approvals)" count={approvals.length}>
              {approvals.length === 0 ? <Empty text="Nothing waiting for approval." /> : (
                <div className="space-y-2">
                  {approvals.map((a) => (
                    <div key={a.approvalId} className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                      <div><div className="font-medium">{a.reason ?? a.taskId}</div><div className="text-xs text-gray-500">gate: {a.requiredAt ?? '—'}</div></div>
                      <Clock className="h-4 w-4 text-amber-400" />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Handoff / attention signals */}
            <Section icon={<ArrowRightLeft className="h-5 w-5" />} title="Handoff & attention signals" count={signals.length}>
              {signals.length === 0 ? <Empty text="No open work signals." /> : (
                <div className="space-y-2">
                  {signals.map((s) => (
                    <div key={s.signalId} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{s.title}</div>
                        <span className={`text-xs font-semibold ${SEV_TONE[s.severity] ?? 'text-gray-400'}`}>{s.severity}</span>
                      </div>
                      {s.recommendedNextAction && <div className="mt-1 text-xs text-gray-400">→ {s.recommendedNextAction}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Delivery */}
            <Section icon={<GitPullRequest className="h-5 w-5" />} title="Delivery (PRs & previews)" count={delivery.length}>
              {delivery.length === 0 ? <Empty text="No delivery artifacts yet." /> : (
                <div className="space-y-2">
                  {delivery.map((d) => (
                    <a key={d.artifactId} href={d.url ?? '#'} target="_blank" rel="noopener noreferrer"
                       className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.04]">
                      <div className="font-medium">{d.kind}{d.number ? ` #${d.number}` : ''} {d.repository ? `· ${d.repository}` : ''}</div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </a>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {icon} {title} <span className="text-sm font-normal text-gray-500">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-gray-500">{text}</div>;
}
