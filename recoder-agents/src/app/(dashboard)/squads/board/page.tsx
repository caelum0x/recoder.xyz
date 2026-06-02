'use client';

import Link from 'next/link';
import { ChevronLeft, LayoutGrid, AlertTriangle, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAllSquadTasks,
  useTransitionBoardAssignment,
  type BoardTask,
  type AssignmentStatus,
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

  const byColumn = (col: Column) => (tasks ?? []).filter((t) => col.statuses.includes(t.status));

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
          <Button variant="outline" size="sm" asChild><Link href="/squads">Manage squads</Link></Button>
        </div>
      </div>

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
                        <p className="mt-2 text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p>
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
