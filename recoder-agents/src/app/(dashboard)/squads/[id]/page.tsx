'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Users,
  Crown,
  Plus,
  Trash2,
  Loader2,
  Bot,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { Textarea } from '@/components/ui/textarea';
import {
  useSquad,
  useUpdateSquad,
  useAddMember,
  useUpdateMember,
  useRemoveMember,
  useCloneSquad,
  useSquadTasks,
  useSquadStats,
  useDispatchToSquad,
  useTransitionAssignment,
  useCollabStream,
  type AgentPresence,
  type MemberKind,
  type DispatchStrategy,
  type AssignmentStatus,
  type Squad,
  type SquadTask,
} from '@/hooks/use-squads';
import { Send, Play, CheckCircle2, XCircle, Copy, Download } from 'lucide-react';
import { useAgents } from '@/hooks/agents/use-agents';

const AVAIL_STYLE: Record<AgentPresence['availability'], string> = {
  online: 'bg-emerald-500',
  unstable: 'bg-amber-500',
  offline: 'bg-zinc-400',
};

const WORKLOAD_LABEL: Record<AgentPresence['workload'], string> = {
  working: 'working',
  queued: 'queued',
  idle: 'idle',
};

export default function SquadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: squad, isLoading } = useSquad(id, true);
  const addMember = useAddMember(id);
  const updateMember = useUpdateMember(id);
  const removeMember = useRemoveMember(id);
  const clone = useCloneSquad();

  const handleClone = async () => {
    try {
      const created = await clone.mutateAsync(id);
      toast.success(`Cloned to "${created.name}"`);
      router.push(`/squads/${created.id}`);
    } catch {
      toast.error('Clone failed');
    }
  };

  const { data: agentsData } = useAgents();
  const [memberId, setMemberId] = useState('');
  const [kind, setKind] = useState<MemberKind>('agent');
  const [role, setRole] = useState('member');
  const [memberProjectId, setMemberProjectId] = useState('');

  const handleAdd = async () => {
    if (!memberId.trim()) {
      toast.error('Enter a member id.');
      return;
    }
    try {
      await addMember.mutateAsync({
        id: memberId.trim(),
        kind,
        role: role.trim() || 'member',
        ...(memberProjectId.trim() ? { projectId: memberProjectId.trim() } : {}),
      });
      toast.success(`Added ${kind} ${memberId.trim()}`);
      setMemberId('');
      setRole('member');
      setMemberProjectId('');
    } catch {
      toast.error('Add failed');
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!squad) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="font-medium">Squad not found</p>
        <Button variant="outline" asChild><Link href="/squads">Back to squads</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Link href="/squads" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Squads
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Users className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{squad.name}</h1>
              <p className="text-sm text-muted-foreground">{squad.description || 'No description.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const portable = {
                name: squad.name,
                description: squad.description,
                leaderId: squad.leaderId,
                projectId: squad.projectId,
                members: squad.members.map((m) => ({ id: m.id, kind: m.kind, role: m.role, projectId: m.projectId })),
              };
              const blob = new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${squad.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.squad.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleClone} disabled={clone.isPending}>
              {clone.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              Clone
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/workflows/runner?squadId=${squad.id}`}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Build workflow
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <DefaultProjectCard squad={squad} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Members ({squad.members.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {squad.members.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">No members yet — add agents or humans below.</p>
          ) : (
            squad.members.map((m) => {
              const presence = m.kind === 'agent' ? squad.presence?.[m.id] : undefined;
              const isLeader = squad.leaderId === m.id;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
                  {m.kind === 'agent' ? <Bot className="h-4 w-4 text-muted-foreground" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {m.id}
                      {isLeader && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.role}
                      {m.projectId ? ` · project ${m.projectId}` : ''}
                    </p>
                  </div>
                  {m.kind === 'agent' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        const next = prompt(`Project id for ${m.id}`, m.projectId ?? '');
                        if (next === null) return;
                        updateMember.mutate({ memberId: m.id, projectId: next.trim() || null });
                      }}
                    >
                      Project
                    </Button>
                  )}
                  {presence && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full', AVAIL_STYLE[presence.availability])} />
                      <span>{presence.availability}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{WORKLOAD_LABEL[presence.workload]}</span>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => removeMember.mutate(m.id)} disabled={removeMember.isPending} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              );
            })
          )}

          <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Member id</label>
              <Input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder={kind === 'agent' ? 'pick or type an agent id' : 'user id'}
                list={kind === 'agent' ? 'squad-agent-options' : undefined}
              />
              {kind === 'agent' && (
                <datalist id="squad-agent-options">
                  {(agentsData?.agents ?? []).map((a) => (
                    <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
                  ))}
                </datalist>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MemberKind)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="agent">agent</option>
                <option value="human">human</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="role" className="sm:w-32" />
            </div>
            {kind === 'agent' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <Input value={memberProjectId} onChange={(e) => setMemberProjectId(e.target.value)} placeholder="optional project id" className="sm:w-44" />
              </div>
            )}
            <Button onClick={handleAdd} disabled={addMember.isPending}>
              {addMember.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <SquadStatsBar squadId={id} />

      <DispatchPanel squad={squad} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Activity</CardTitle></CardHeader>
        <CardContent>
          {squad.activity.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {[...squad.activity].reverse().slice(0, 30).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{a.action}</span>
                    {a.detail && <span className="text-muted-foreground"> — {a.detail}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const TASK_STATUS_STYLE: Record<SquadTask['status'], string> = {
  assigned: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const ASSIGN_STATUS_STYLE: Record<AssignmentStatus, string> = {
  queued: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
};

function DefaultProjectCard({ squad }: { squad: Squad }) {
  const update = useUpdateSquad(squad.id);
  const [projectId, setProjectId] = useState(squad.projectId ?? '');

  useEffect(() => {
    setProjectId(squad.projectId ?? '');
  }, [squad.projectId]);

  const handleSave = async () => {
    try {
      await update.mutateAsync({ projectId: projectId.trim() || null });
      toast.success(projectId.trim() ? 'Default project saved' : 'Default project cleared');
    } catch {
      toast.error('Project update failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Default project</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="project id used when dispatch execution is enabled" />
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function SquadStatsBar({ squadId }: { squadId: string }) {
  const { data: stats } = useSquadStats(squadId);
  if (!stats || stats.totalTasks === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
      <span className="flex items-baseline gap-1.5"><span className="text-base font-semibold">{stats.totalTasks}</span><span className="text-xs text-muted-foreground">tasks</span></span>
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-baseline gap-1.5"><span className="text-base font-semibold">{Math.round(stats.completionRate * 100)}%</span><span className="text-xs text-muted-foreground">completion</span></span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-xs text-muted-foreground">
        {stats.assignments.completed} done · {stats.assignments.inProgress} active · {stats.assignments.queued} queued
        {stats.assignments.failed > 0 ? ` · ${stats.assignments.failed} failed` : ''}
      </span>
    </div>
  );
}

function DispatchPanel({ squad }: { squad: Squad }) {
  const { data: tasks } = useSquadTasks(squad.id);
  const dispatch = useDispatchToSquad(squad.id);
  const transition = useTransitionAssignment(squad.id);
  const qc = useQueryClient();

  // Live refresh: reflect this squad's dispatch/assignment events (incl. those
  // driven by other actors) the moment they cross the collab stream.
  const { events } = useCollabStream(20);
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    const latest = events[0];
    if (!latest || latest.at === lastSeen.current) return;
    lastSeen.current = latest.at;
    if (latest.squadId && latest.squadId !== squad.id) return;
    const a = latest.action ?? '';
    if (a.startsWith('task_') || a.startsWith('assignment_')) {
      qc.invalidateQueries({ queryKey: ['squad-tasks', squad.id] });
      qc.invalidateQueries({ queryKey: ['squad-stats', squad.id] });
    }
  }, [events, qc, squad.id]);
  const [task, setTask] = useState('');
  const [strategy, setStrategy] = useState<DispatchStrategy>('all');
  const [projectId, setProjectId] = useState('');
  const [runOnProject, setRunOnProject] = useState(false);
  const [createSandbox, setCreateSandbox] = useState(false);
  const mappedProjectId = squad.projectId?.trim();

  const handleDispatch = async () => {
    if (!task.trim()) {
      toast.error('Describe the task.');
      return;
    }
    try {
      const res = await dispatch.mutateAsync({
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
        // Truthful: the squad got the task, but execution did not start.
        toast.warning(`Dispatched — execution skipped: ${res?.execution?.reason ?? 'coding runtime unavailable'}`);
      }
      setTask('');
    } catch {
      toast.error('Dispatch failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Dispatch a task</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Textarea value={task} onChange={(e) => setTask(e.target.value)} placeholder="Describe the task to assign to this squad…" rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as DispatchStrategy)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">all members</option>
              <option value="leader">leader</option>
              <option value="round-robin">round-robin</option>
              <option value="best-match">best-match</option>
            </select>
            <Input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder={mappedProjectId ? `override project id (default: ${mappedProjectId})` : 'project id override'}
              className="h-9 w-64"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Run on the explicit project, member project, or squad default project">
              <input type="checkbox" checked={runOnProject} onChange={(e) => setRunOnProject(e.target.checked)} className="h-3.5 w-3.5" />
              run on mapped project
            </label>
            {(runOnProject || projectId.trim()) && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Provision a fresh sandbox if the project has none">
                <input type="checkbox" checked={createSandbox} onChange={(e) => setCreateSandbox(e.target.checked)} className="h-3.5 w-3.5" />
                provision sandbox if missing
              </label>
            )}
            <Button onClick={handleDispatch} disabled={dispatch.isPending} className="ml-auto">
              {dispatch.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Dispatch
            </Button>
          </div>
        </div>

        {tasks && tasks.length > 0 && (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm">{t.task}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', TASK_STATUS_STYLE[t.status])}>
                    {t.status}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {t.assignments.map((a) => (
                    <div key={a.memberId} className="flex items-center gap-2 text-xs">
                      <span className={cn('font-medium', ASSIGN_STATUS_STYLE[a.status])}>{a.status}</span>
                      <span className="flex-1 truncate text-muted-foreground">{a.memberId}</span>
                      {a.status === 'queued' && (
                        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'in_progress' })} aria-label="Start">
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      {a.status === 'in_progress' && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'completed' })} aria-label="Complete">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => transition.mutate({ taskId: t.id, memberId: a.memberId, status: 'failed' })} aria-label="Fail">
                            <XCircle className="h-3 w-3 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
