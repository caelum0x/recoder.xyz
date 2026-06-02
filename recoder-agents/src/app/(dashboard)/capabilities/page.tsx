'use client';

import {
  Boxes,
  ShieldCheck,
  Globe,
  Brain,
  BookOpen,
  Network,
  Cpu,
  TrendingUp,
  Workflow as WorkflowIcon,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCapabilities, type CapabilitiesResponse } from '@/hooks/use-capabilities';

type Status = 'on' | 'partial' | 'off';

interface CapabilityCard {
  key: string;
  label: string;
  description: string;
  icon: typeof Boxes;
  status: Status;
  detail: string;
}

const STATUS_META: Record<Status, { icon: typeof CheckCircle2; className: string; chip: string; text: string }> = {
  on: { icon: CheckCircle2, className: 'text-emerald-500', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', text: 'Active' },
  partial: { icon: AlertTriangle, className: 'text-amber-500', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', text: 'Needs config' },
  off: { icon: XCircle, className: 'text-zinc-400', chip: 'bg-zinc-500/15 text-zinc-500', text: 'Unavailable' },
};

function buildCards(data: CapabilitiesResponse): CapabilityCard[] {
  return [
    {
      key: 'codingRuntimes',
      label: 'Coding backends',
      description: 'Pluggable coding agents with intent-based routing.',
      icon: Boxes,
      status: data.codingRuntimes.available ? 'on' : 'off',
      detail: `${data.codingRuntimes.runtimes.length} runtimes: ${data.codingRuntimes.catalog
        .filter((c) => c.available)
        .map((c) => c.label)
        .join(', ')}`,
    },
    {
      key: 'llmRouter',
      label: 'Unified LLM router',
      description: 'One endpoint, any provider — BYOK-aware.',
      icon: Cpu,
      status: data.llmRouter.configured > 0 ? 'on' : 'partial',
      detail: `${data.llmRouter.configured}/${data.llmRouter.providers} providers configured`,
    },
    {
      key: 'secureRunner',
      label: 'Secure runner (E2B)',
      description: 'Ephemeral sandboxes for untrusted code execution.',
      icon: ShieldCheck,
      status: data.secureRunner.available ? 'on' : data.secureRunner.sdkInstalled ? 'partial' : 'off',
      detail: data.secureRunner.available ? 'Ready' : data.secureRunner.reason ?? 'Unavailable',
    },
    {
      key: 'browserVerification',
      label: 'Browser verification',
      description: 'Agents verify their own work in a real browser.',
      icon: Globe,
      status: data.browserVerification.deterministic ? (data.browserVerification.ai ? 'on' : 'partial') : 'off',
      detail: data.browserVerification.deterministic
        ? `Deterministic ✓${data.browserVerification.ai ? ' · AI (Stagehand) ✓' : ' · AI off'}`
        : data.browserVerification.reason ?? 'Unavailable',
    },
    {
      key: 'agentMemory',
      label: 'Agent memory (mem0)',
      description: 'LLM-managed memory that compounds across tasks.',
      icon: Brain,
      status: data.agentMemory.available ? 'on' : 'off',
      detail: data.agentMemory.available
        ? `${data.agentMemory.mode} mode${data.agentMemory.llmProvider ? ` · ${data.agentMemory.llmProvider}` : ''}${data.agentMemory.vectorStore ? ` · ${data.agentMemory.vectorStore.split(':')[0]}` : ''}`
        : data.agentMemory.reason ?? 'Unavailable',
    },
    {
      key: 'libraryDocs',
      label: 'Live library docs',
      description: 'Up-to-date API docs injected into agent context.',
      icon: BookOpen,
      status: data.libraryDocs.available ? (data.libraryDocs.apiKeyPresent ? 'on' : 'partial') : 'off',
      detail: data.libraryDocs.apiKeyPresent ? 'Context7 (keyed)' : 'Context7 (free tier — rate limited)',
    },
    {
      key: 'codeIntelligence',
      label: 'Code intelligence',
      description: 'Queryable symbol/dependency graph of a codebase.',
      icon: Network,
      status: data.codeIntelligence.available ? 'on' : 'off',
      detail: 'Build a graph, navigate symbols & imports',
    },
    {
      key: 'agentSkills',
      label: 'Agent skill profiles',
      description: 'Demonstrated proficiency, learned from outcomes.',
      icon: TrendingUp,
      status: data.agentSkills.available ? 'on' : 'off',
      detail: `${data.agentSkills.trackedAgents} agent${data.agentSkills.trackedAgents === 1 ? '' : 's'} tracked`,
    },
    {
      key: 'zeroTrustNetwork',
      label: 'Zero-trust network',
      description: 'OpenZiti identities/enrollment for runners.',
      icon: Network,
      status: data.zeroTrustNetwork.available ? 'on' : data.zeroTrustNetwork.configured ? 'partial' : 'off',
      detail: data.zeroTrustNetwork.available ? 'Controller reachable' : data.zeroTrustNetwork.reason ?? 'Not configured',
    },
    {
      key: 'billing',
      label: 'Billing (Polar)',
      description: 'Optional self-hostable billing & subscriptions.',
      icon: CreditCard,
      status: data.billing?.available ? 'on' : data.billing?.configured ? 'partial' : 'off',
      detail: data.billing?.available
        ? `Connected · ${data.billing.server.replace(/^https?:\/\//, '')}`
        : data.billing?.reason ?? 'Not configured',
    },
  ];
}

export default function CapabilitiesPage() {
  const { data, isLoading, isError, refetch, isFetching } = useCapabilities();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <WorkflowIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Capabilities</h1>
            <p className="text-sm text-muted-foreground">
              The agent capability layer powering your workspace. Status reflects live config.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <div>
            <p className="font-medium">Couldn’t reach the capability layer</p>
            <p className="text-sm text-muted-foreground">
              docker-backend may be unreachable. Check that <code>DOCKER_BACKEND_URL</code> is set and the{' '}
              <code>/dx/*</code> proxy resolves.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildCards(data).map((card) => {
            const meta = STATUS_META[card.status];
            const StatusIcon = meta.icon;
            const CardIcon = card.icon;
            return (
              <Card key={card.key} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardIcon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{card.label}</CardTitle>
                    </div>
                    <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', meta.chip)}>
                      <StatusIcon className={cn('h-3 w-3', meta.className)} />
                      {meta.text}
                    </span>
                  </div>
                  <CardDescription className="min-h-[2.5rem]">{card.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0 text-xs text-muted-foreground">{card.detail}</CardContent>
              </Card>
            );
          })}
        </div>

        <CapabilityDetails data={data} />
        </>
      )}
    </div>
  );
}

function CapabilityDetails({ data }: { data: CapabilitiesResponse }) {
  const catalog = data.codingRuntimes.catalog ?? [];
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Coding backends</CardTitle>
          </div>
          <CardDescription>Pluggable agent runtimes, each based on an open-source project.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {catalog.map((rt) => (
            <div key={rt.type} className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {rt.label}
                  {rt.basedOn && <span className="ml-2 font-normal text-xs text-muted-foreground">{rt.basedOn}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{rt.description}</p>
              </div>
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  rt.available ? STATUS_META.on.chip : STATUS_META.off.chip,
                )}
              >
                {rt.available ? 'ready' : 'off'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Adaptive routing & prompt enrichment</CardTitle>
          </div>
          <CardDescription>What happens automatically when a coding task runs in <code>auto</code> mode.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Adaptive routing</p>
            <p>Intent is classified into a category, routed to the best backend (e.g. tests → Qwen Code, docs → Gemini CLI), then overridden by whichever runtime has the best <em>proven</em> success rate for that category.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Auto-enrichment</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><code>codeContext</code> — project structure injected for code-touching tasks (feature, bug-fix, refactor, …).</li>
              <li><code>useMemory</code> — relevant memories recalled before, new memories persisted after each run.</li>
              <li><code>injectDocs</code> — current library docs (Context7), when the caller names libraries.</li>
            </ul>
          </div>
          <p className="text-xs">Explicit request flags always override these defaults.</p>
        </CardContent>
      </Card>
    </div>
  );
}
