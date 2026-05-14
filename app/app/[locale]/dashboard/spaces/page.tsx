'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Layers3, Loader2, Plus, Workflow } from 'lucide-react';

type SpaceAgent = {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
};

type SpaceRecord = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  agents: SpaceAgent[];
};

type SpacesPayload = {
  plan: string;
  entitlements: {
    workspaces: number;
    connectedAgents: number;
    artifactRetentionDays: number;
    previewDeploysPerMonth: number;
    approvalWorkflows: string;
    governance: string;
  };
  spaces: SpaceRecord[];
  activation: {
    hasSpace: boolean;
    hasConnectedAgent: boolean;
    hasShippingLoop: boolean;
    nextStep: string;
  };
  usage: {
    spacesUsed: number;
    connectedAgentsUsed: number;
    previewOrDeployProjects: number;
  };
  limits: {
    canCreateSpace: boolean;
    canConnectAgent: boolean;
  };
};

const AGENT_TYPES = [
  { id: 'recoder-code', label: 'Recoder Code' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
] as const;

export default function DashboardSpacesPage() {
  const [data, setData] = useState<SpacesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [spaceDescription, setSpaceDescription] = useState('');
  const [connectingSpaceId, setConnectingSpaceId] = useState<string | null>(null);

  const loadSpaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/spaces');
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load spaces');
      }
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpaces();
  }, []);

  const createSpace = async () => {
    if (!spaceName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: spaceName.trim(),
          description: spaceDescription.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to create space');
      }
      setSpaceName('');
      setSpaceDescription('');
      await loadSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create space');
    } finally {
      setCreating(false);
    }
  };

  const connectAgent = async (spaceId: string, type: string) => {
    setConnectingSpaceId(spaceId);
    setError(null);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: AGENT_TYPES.find((agent) => agent.id === type)?.label || `${type} agent`,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to connect agent');
      }
      await loadSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect agent');
    } finally {
      setConnectingSpaceId(null);
    }
  };

  const activationSteps = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: 'Create your first Space',
        complete: data.activation.hasSpace,
        description: 'Give your team and agents one shared control room.',
      },
      {
        title: 'Connect an agent',
        complete: data.activation.hasConnectedAgent,
        description: 'Make an external coding agent your first activation milestone.',
      },
      {
        title: 'Ship the loop',
        complete: data.activation.hasShippingLoop,
        description: 'Task -> artifact -> PR -> preview -> approval should be visible before handoff.',
      },
    ];
  }, [data]);

  if (loading) {
    return <div className="min-h-screen bg-black text-white p-8">Loading Spaces…</div>;
  }

  if (error && !data) {
    return <div className="min-h-screen bg-black text-red-300 p-8">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 mb-3">Primary conversion flow</p>
          <h1 className="text-4xl font-bold mb-4">Create a Space, connect an agent, ship one visible loop</h1>
          <p className="text-lg text-gray-400 max-w-3xl">
            This is the main signed-in path. The product should prove one real software workflow before asking the user to do anything more complicated.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] mb-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3 mb-5">
              <Layers3 className="h-5 w-5 text-orange-400" />
              <h2 className="text-2xl font-semibold">Activation checklist</h2>
            </div>
            <div className="space-y-4">
              {activationSteps.map((step) => (
                <div key={step.title} className="rounded-xl border border-white/10 p-4 flex items-start gap-4">
                  <CheckCircle2 className={`h-5 w-5 mt-0.5 ${step.complete ? 'text-green-400' : 'text-gray-600'}`} />
                  <div>
                    <div className="font-medium">{step.title}</div>
                    <div className="text-sm text-gray-400 mt-1">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3 mb-5">
              <Workflow className="h-5 w-5 text-orange-400" />
              <h2 className="text-2xl font-semibold">Entitlements</h2>
            </div>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex justify-between"><span>Plan</span><span className="capitalize">{data?.plan}</span></div>
              <div className="flex justify-between"><span>Workspaces</span><span>{data?.usage.spacesUsed} / {data?.entitlements.workspaces >= 999 ? 'Unlimited' : data?.entitlements.workspaces}</span></div>
              <div className="flex justify-between"><span>Connected agents</span><span>{data?.usage.connectedAgentsUsed} / {data?.entitlements.connectedAgents >= 999 ? 'Unlimited' : data?.entitlements.connectedAgents}</span></div>
              <div className="flex justify-between"><span>Artifact retention</span><span>{data?.entitlements.artifactRetentionDays} days</span></div>
              <div className="flex justify-between"><span>Preview deploys</span><span>{data?.entitlements.previewDeploysPerMonth}/month</span></div>
            </div>
            <Link href="/pricing" className="mt-6 inline-flex items-center gap-2 text-orange-300 hover:text-white">
              Compare plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-10">
          <h2 className="text-2xl font-semibold mb-4">Create your first Space</h2>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={spaceName}
              onChange={(event) => setSpaceName(event.target.value)}
              placeholder="SaaS landing page"
              className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
            <input
              value={spaceDescription}
              onChange={(event) => setSpaceDescription(event.target.value)}
              placeholder="One workspace for coding, preview, and approval"
              className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={createSpace}
              disabled={creating || !data?.limits.canCreateSpace}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-medium text-black disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Space
            </button>
          </div>
          {!data?.limits.canCreateSpace && (
            <p className="mt-3 text-sm text-amber-300">Your current plan has reached its Space limit. Upgrade to create another Space.</p>
          )}
        </div>

        <div className="grid gap-6">
          {(data?.spaces || []).map((space) => (
            <div key={space.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-2xl font-semibold">{space.name}</h3>
                  <p className="text-sm text-gray-400 mt-2">{space.description || 'Recoder Space'}</p>
                  <div className="mt-4 text-sm text-gray-500">
                    {space.agents.length} connected agent{space.agents.length === 1 ? '' : 's'} in this Space
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:min-w-[320px]">
                  <div className="text-sm text-gray-400">Connect an agent</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {AGENT_TYPES.map((agentType) => (
                      <button
                        key={agentType.id}
                        type="button"
                        onClick={() => connectAgent(space.id, agentType.id)}
                        disabled={connectingSpaceId === space.id || !data?.limits.canConnectAgent}
                        className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm hover:border-orange-500 disabled:opacity-50"
                      >
                        {connectingSpaceId === space.id ? 'Connecting…' : agentType.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Bot className="h-4 w-4 text-orange-400" />
                    First activation milestone: connect one real agent before trying to scale the workflow.
                  </div>
                </div>
              </div>

              {space.agents.length > 0 && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-3">Shipping loop</div>
                  <div className="grid gap-3 md:grid-cols-5">
                    {['Task', 'Artifact', 'PR', 'Preview', 'Approval'].map((step) => (
                      <div key={step} className="rounded-xl border border-white/10 bg-black/30 p-4 text-center text-sm">
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm text-gray-400">
                    The main product path should always make this loop visible: task -&gt; artifact -&gt; PR -&gt; preview -&gt; approval.
                  </div>
                </div>
              )}
            </div>
          ))}

          {data && data.spaces.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-gray-400">
              No Spaces yet. Create the first one above, then connect an agent and run the workflow.
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/agents" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 hover:bg-white/[0.04]">
            Open agent connection guide
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard/billing" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 hover:bg-white/[0.04]">
            Review plan entitlements
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

