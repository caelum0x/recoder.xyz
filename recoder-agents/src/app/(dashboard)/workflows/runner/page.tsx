'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Play, Plus, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useRunSteps,
  defaultConfigFor,
  type StepType,
  type RunStepsResult,
} from '@/hooks/use-workflow-runner';
import { useSquads } from '@/hooks/use-squads';

const STEP_TYPES: StepType[] = ['llm', 'http', 'code', 'branch', 'trigger', 'squad', 'parallel', 'conditional'];

interface DraftStep {
  type: StepType;
  name: string;
  configText: string;
}

function newStep(type: StepType): DraftStep {
  return { type, name: `${type}-step`, configText: defaultConfigFor(type) };
}

export default function WorkflowRunnerPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>}>
      <RunnerInner />
    </Suspense>
  );
}

function RunnerInner() {
  const run = useRunSteps();
  const searchParams = useSearchParams();
  const seedSquadId = searchParams.get('squadId');
  const [steps, setSteps] = useState<DraftStep[]>(() =>
    seedSquadId
      ? [{ type: 'squad', name: 'squad-step', configText: JSON.stringify({ squadId: seedSquadId, task: '{{_lastOutput}}', strategy: 'all' }, null, 2) }]
      : [newStep('squad')],
  );
  const [result, setResult] = useState<RunStepsResult | null>(null);

  const update = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const handleRun = async () => {
    const parsed: { type: StepType; name: string; config: Record<string, unknown> }[] = [];
    for (const s of steps) {
      try {
        parsed.push({ type: s.type, name: s.name.trim() || `${s.type}-step`, config: JSON.parse(s.configText || '{}') });
      } catch {
        toast.error(`Invalid JSON config in "${s.name}"`);
        return;
      }
    }
    try {
      const res = await run.mutateAsync(parsed);
      setResult(res);
      toast[res.success ? 'success' : 'error'](res.success ? 'Workflow completed' : 'Workflow finished with errors');
    } catch {
      toast.error('Run failed (backend unreachable?)');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Link href="/workflows" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Workflows
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Step Runner</h1>
          <p className="text-sm text-muted-foreground">
            Compose and run a sequence of steps. Outputs flow forward via <code>{'{{_lastOutput}}'}</code>; a <code>squad</code> step dispatches to a team.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <Card key={i}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                <select
                  value={s.type}
                  onChange={(e) => update(i, { type: e.target.value as StepType, configText: defaultConfigFor(e.target.value as StepType) })}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} className="h-8 w-40" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(i)} disabled={steps.length === 1} aria-label="Remove step">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </CardHeader>
            <CardContent>
              {s.type === 'squad' ? (
                <SquadStepFields configText={s.configText} onChange={(text) => update(i, { configText: text })} />
              ) : (
                <Textarea
                  value={s.configText}
                  onChange={(e) => update(i, { configText: e.target.value })}
                  rows={5}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setSteps((prev) => [...prev, newStep('llm')])}>
          <Plus className="mr-1.5 h-4 w-4" /> Add step
        </Button>
        <Button onClick={handleRun} disabled={run.isPending} className="ml-auto">
          {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
          Run {steps.length} step{steps.length === 1 ? '' : 's'}
        </Button>
      </div>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {result.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
              Run result
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {result.results.map((r, i) => {
              const errored = !!(r.output && typeof r.output === 'object' && 'error' in (r.output as Record<string, unknown>));
              return (
                <div key={i} className={cn('rounded-md border p-2', errored ? 'border-red-500/30 bg-red-500/5' : 'bg-muted/20')}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{r.step} <span className="text-muted-foreground">({r.type})</span></span>
                    <span className="text-muted-foreground">{r.durationMs}ms</span>
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                    {typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2)}
                  </pre>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const STRATEGIES = ['all', 'leader', 'round-robin', 'best-match'] as const;

function SquadStepFields({ configText, onChange }: { configText: string; onChange: (text: string) => void }) {
  const { data: squads } = useSquads();
  let cfg: { squadId?: string; task?: string; strategy?: string } = {};
  try { cfg = JSON.parse(configText || '{}'); } catch { /* keep defaults */ }

  const patch = (next: Partial<typeof cfg>) =>
    onChange(JSON.stringify({ squadId: '', task: '{{_lastOutput}}', strategy: 'all', ...cfg, ...next }, null, 2));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Squad</label>
        <select
          value={cfg.squadId ?? ''}
          onChange={(e) => patch({ squadId: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a squad…</option>
          {(squads ?? []).map((sq) => (
            <option key={sq.id} value={sq.id}>{sq.name} ({sq.members.length})</option>
          ))}
        </select>
        {(!squads || squads.length === 0) && (
          <span className="text-xs text-muted-foreground">No squads yet — create one on the Squads page.</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Task ({'{{_lastOutput}}'} flows from the previous step)</label>
        <Textarea value={cfg.task ?? ''} onChange={(e) => patch({ task: e.target.value })} rows={2} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Strategy</label>
        <select
          value={cfg.strategy ?? 'all'}
          onChange={(e) => patch({ strategy: e.target.value })}
          className="h-9 w-44 rounded-md border bg-background px-2 text-sm"
        >
          {STRATEGIES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>
    </div>
  );
}
