'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, LayoutGrid, AlertTriangle, Play, CheckCircle2, XCircle, Loader2, Plus, Send, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useAllSquadTasks,
  useTransitionBoardAssignment,
  useDispatchAnySquad,
  useCollabStream,
  useSquads,
  type BoardTask,
  type AssignmentStatus,
  type DispatchStrategy,
} from '@/hooks/use-squads';

const ASSIGN_STATUS_STYLE: Record<AssignmentStatus, string> = {
  queued: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
};

interface Column {
  key: string;
  label: string;
  statuses: BoardTask['status'][];
  accent: string;
}

const COLUMNS: Column[] = [
  { key: 'queued', label: 'Queued', statuses: ['assigned'], accent: 'text-muted-foreground' },
  { key: 'active', label: 'Active', statuses: ['in_progress', 'partial'], accent: 'text-blue-500' },
  { key: 'completed', label: 'Completed', statuses: ['completed'], accent: 'text-emerald-500' },
  { key: 'failed', label: 'Failed', statuses: ['failed'], accent: 'text-red-500' },
];

export default function SquadTaskBoardPage() {
  const { data: tasks, isLoading, isError } = useAllSquadTasks();
  const transition = useTransitionBoardAssignment();
  const redispatch = useDispatchAnySquad();

  const handleRetry = async (t: BoardTask) => {
    try {
      await redispatch.mutateAsync({ squadId: t.squadId, task: t.task, strategy: t.strategy });
      toast.success('Re-dispatched to squad');
    } catch {
      toast.error('Retry failed (backend unreachable?)');
    }
  };
  const qc = useQueryClient();

  // Live refresh: when a dispatch/assignment event crosses the collab stream,
  // refetch the board immediately instead of waiting for the 10s poll.
  const { events, connected } = useCollabStream(20);
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    const latest = events[0];
    if (!latest || latest.at === lastSeen.current) return;
    lastSeen.current = latest.at;
    const a = latest.action ?? '';
    if (a.startsWith('task_') || a.startsWith('assignment_')) {
      qc.invalidateQueries({ queryKey: ['squad-tasks'] });
    }
  }, [events, qc]);

  // Squad filter — options derived from the loaded tasks (no extra fetch).
  const [squadFilter, setSquadFilter] = useState('all');
  const squadOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks ?? []) if (!seen.has(t.squadId)) seen.set(t.squadId, t.squadName);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filteredTasks = squadFilter === 'all' ? (tasks ?? []) : (tasks ?? []).filter((t) => t.squadId === squadFilter);
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const byColumn = (col: Column) => filteredTasks.filter((t) => col.statuses.includes(t.status));

  // Roll-up across the visible (filtered) tasks. Completion rate counts only
  // terminal tasks (completed vs failed) so in-flight work doesn't skew it.
  const summary = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === 'completed').length;
    const failed = filteredTasks.filter((t) => t.status === 'failed').length;
    const terminal = completed + failed;
    return { total, completed, failed, rate: terminal > 0 ? Math.round((completed / terminal) * 100) : null };
  }, [filteredTasks]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Link href="/squads" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Squads
        </Link>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" /> Task board
            </h1>
            <p className="text-sm text-muted-foreground">Every dispatched task across your squads, grouped by status.</p>
          </div>
          <div className="flex items-center gap-3">
            {squadOptions.length > 1 && (
              <select
                value={squadFilter}
                onChange={(e) => setSquadFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
                aria-label="Filter by squad"
              >
                <option value="all">All squads</option>
                {squadOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              <span className={cn('h-2 w-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-zinc-400')} />
              {connected ? 'Live' : 'Polling'}
            </span>
            <Button size="sm" onClick={() => setDispatchOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New task
            </Button>
            <Button variant="outline" size="sm" asChild><Link href="/squads">Manage squads</Link></Button>
          </div>
        </div>
      </div>

      <DispatchDialog open={dispatchOpen} onOpenChange={setDispatchOpen} />

      {summary.total > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><span className="font-semibold text-foreground">{summary.total}</span> task{summary.total === 1 ? '' : 's'}</span>
          <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.completed}</span> completed</span>
          <span><span className="font-semibold text-red-600 dark:text-red-400">{summary.failed}</span> failed</span>
          {summary.rate !== null && (
            <span><span className="font-semibold text-foreground">{summary.rate}%</span> completion rate</span>
          )}
        </div>
      )}

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Couldn’t reach the collaboration backend.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex flex-col gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (tasks ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No tasks dispatched yet. <Link href="/squads" className="underline-offset-2 hover:underline">Dispatch one from a squad →</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = byColumn(col);
            return (
              <div key={col.key} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className={cn('text-sm font-semibold', col.accent)}>{col.label}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{colTasks.length}</span>
                </div>
                {colTasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">Nothing here.</p>
                ) : (
                  colTasks.map((t) => (
                    <Card key={t.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="truncate text-xs font-medium">
                            <Link href={`/squads/${t.squadId}`} className="hover:underline">{t.squadName}</Link>
                          </CardTitle>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.strategy}</span>
                        </div>
                        <CardDescription className="line-clamp-3 text-xs text-foreground/80">{t.task}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <ul className="flex flex-col gap-1.5">
                          {t.assignments.map((a) => (
                            <li key={a.memberId} className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-mono text-[11px] text-muted-foreground">{a.memberId}</span>
                                <span className={cn('shrink-0 font-medium', ASSIGN_STATUS_STYLE[a.status])}>{a.status}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-0.5">
                                {a.status === 'queued' && (
                                  <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={transition.isPending}
                                    onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'in_progress' })} aria-label="Start">
                                    <Play className="h-3 w-3" />
                                  </Button>
                                )}
                                {a.status === 'in_progress' && (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={transition.isPending}
                                      onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'completed' })} aria-label="Complete">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={transition.isPending}
                                      onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'failed' })} aria-label="Fail">
                                      <XCircle className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p>
                          {(t.status === 'failed' || t.status === 'partial') && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={redispatch.isPending}
                              onClick={() => handleRetry(t)} aria-label="Retry task">
                              <RotateCcw className="mr-1 h-3 w-3" /> Retry
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {transition.isPending && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Updating…
        </p>
      )}
    </div>
  );
}

const STRATEGIES: DispatchStrategy[] = ['all', 'leader', 'round-robin', 'best-match'];

function DispatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: squads } = useSquads();
  const dispatch = useDispatchAnySquad();
  const [squadId, setSquadId] = useState('');
  const [task, setTask] = useState('');
  const [strategy, setStrategy] = useState<DispatchStrategy>('all');
  const [projectId, setProjectId] = useState('');
  const [runOnProject, setRunOnProject] = useState(false);
  const [createSandbox, setCreateSandbox] = useState(false);
  const selectedSquad = (squads ?? []).find((s) => s.id === squadId);
  const mappedProjectId = selectedSquad?.projectId?.trim();

  const handleDispatch = async () => {
    if (!squadId || !task.trim()) return;
    try {
      const res = await dispatch.mutateAsync({
        squadId,
        task: task.trim(),
        strategy,
        ...(projectId.trim() ? { projectId: projectId.trim() } : {}),
        ...((runOnProject || projectId.trim()) ? { execute: true, createSandbox } : {}),
      });
      if (!res?.execution?.requested) {
        toast.success('Dispatched to squad');
      } else if (res?.execution?.started) {
        toast.success('Dispatched + running on coding runtime');
      } else {
        toast.warning(`Dispatched — execution skipped: ${res?.execution?.reason ?? 'coding runtime unavailable'}`);
      }
      setTask('');
      onOpenChange(false);
    } catch {
      toast.error('Dispatch failed (backend unreachable?)');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch a task</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Squad</label>
            <select
              value={squadId}
              onChange={(e) => setSquadId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select a squad…</option>
              {(squads ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.members.length})</option>
              ))}
            </select>
            {(!squads || squads.length === 0) && (
              <span className="text-xs text-muted-foreground">No squads yet — create one on the Squads page.</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Task</label>
            <Textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} placeholder="What should the squad do?" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as DispatchStrategy)}
              className="h-9 w-44 rounded-md border bg-background px-2 text-sm"
            >
              {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Project execution <span className="font-normal">(optional)</span></label>
            <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder={mappedProjectId ? `override project id (default: ${mappedProjectId})` : 'project id override'} />
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Run on the explicit project, member project, or squad default project">
              <input type="checkbox" checked={runOnProject} onChange={(e) => setRunOnProject(e.target.checked)} className="h-3.5 w-3.5" />
              run on mapped project
            </label>
            {(runOnProject || projectId.trim()) && (
              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Provision a fresh sandbox if the project has none">
                <input type="checkbox" checked={createSandbox} onChange={(e) => setCreateSandbox(e.target.checked)} className="h-3.5 w-3.5" />
                provision sandbox if missing
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleDispatch} disabled={dispatch.isPending || !squadId || !task.trim()}>
            {dispatch.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
