'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Network, Bot, Users, Activity, AlertTriangle, TrendingUp, ChevronDown, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useRoster,
  useCollabSummary,
  useCollabFeed,
  useCollabStream,
  useAgentSkills,
  useLeaderboard,
  type AgentPresence,
} from '@/hooks/use-squads';

const AVAIL_STYLE: Record<AgentPresence['availability'], string> = {
  online: 'bg-emerald-500',
  unstable: 'bg-amber-500',
  offline: 'bg-zinc-400',
};

export default function TeamPage() {
  const { data: roster, isLoading, isError } = useRoster();
  const { data: summary } = useCollabSummary();
  const { data: feed } = useCollabFeed(40);
  const { events: live, connected } = useCollabStream(60);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const entries = connected && live.length > 0 ? live : (feed ?? []).map((e) => ({ ...e, type: e.action }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Network className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Live command center — agents, squads, presence, and activity at a glance.</p>
        </div>
      </header>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="Squads" value={summary.squads} />
          <StatCard icon={Bot} label="Agents on teams" value={roster?.length ?? 0} />
          <StatCard icon={Activity} label="Activity events" value={summary.totalActivity} />
          <StatCard icon={Network} label="Online now" value={(roster ?? []).filter((r) => r.presence?.availability === 'online').length} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Agent roster</CardTitle>
            <CardDescription>Every agent across your squads, with live presence.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Couldn’t reach the collaboration backend.
              </div>
            ) : !roster || roster.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No agents on squads yet. <Link href="/squads" className="underline-offset-2 hover:underline">Create a squad →</Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y">
                {roster.map((r) => (
                  <li key={r.agentId}>
                    <button
                      type="button"
                      onClick={() => setSelectedAgent((cur) => (cur === r.agentId ? null : r.agentId))}
                      className={cn(
                        'flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40',
                        selectedAgent === r.agentId && 'bg-muted/40',
                      )}
                    >
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', AVAIL_STYLE[r.presence?.availability ?? 'offline'])} />
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.agentId}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.squads.map((s) => s.squadName).join(', ')}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.presence?.workload ?? 'idle'}
                        {r.presence && r.presence.activeTasks > 0 ? ` · ${r.presence.activeTasks} active` : ''}
                      </span>
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', selectedAgent === r.agentId && 'rotate-180')} />
                    </button>
                    {selectedAgent === r.agentId && <AgentSkillPanel agentId={r.agentId} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Activity</CardTitle>
              <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                <span className={cn('h-2 w-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-zinc-400')} />
                {connected ? 'Live' : 'Polling'}
              </span>
            </div>
            <CardDescription>Across all squads.</CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="flex max-h-[420px] flex-col divide-y overflow-auto text-sm">
                {entries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{e.squadName}</span>
                      <span className="text-muted-foreground"> · {e.action}</span>
                      {e.detail && <span className="truncate text-muted-foreground"> — {e.detail}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Leaderboard />

      <div className="flex gap-2">
        <Button variant="outline" asChild><Link href="/squads">Manage squads</Link></Button>
        <Button variant="outline" asChild><Link href="/workflows/runner">Step Runner</Link></Button>
      </div>
    </div>
  );
}

const SKILL_FILTERS = ['overall', 'feature', 'bug-fix', 'debug', 'refactor', 'visual', 'test', 'doc', 'general'];

function Leaderboard() {
  const [skill, setSkill] = useState('overall');
  const { data: board, isLoading } = useLeaderboard(skill === 'overall' ? undefined : skill);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Trophy className="h-4 w-4 text-amber-500" />
            Skills leaderboard
          </CardTitle>
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {SKILL_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <CardDescription>Agents ranked by demonstrated success ({skill}).</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !board || board.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No scored agents yet for “{skill}”.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {board.map((e, i) => (
              <li key={e.agentId} className="flex items-center gap-3">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  i === 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                  {i + 1}
                </span>
                <span className="w-40 shrink-0 truncate text-sm font-medium">{e.agentId}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', e.successRate >= 0.7 ? 'bg-emerald-500' : e.successRate >= 0.4 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${Math.max(4, Math.round(e.successRate * 100))}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {Math.round(e.successRate * 100)}% · {e.successes}/{e.attempts}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function AgentSkillPanel({ agentId }: { agentId: string }) {
  const { data: profile, isLoading } = useAgentSkills(agentId);
  const skills = profile ? Object.values(profile.skills).sort((a, b) => b.attempts - a.attempts) : [];

  return (
    <div className="mb-2 ml-5 rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Demonstrated skills
      </div>
      {isLoading ? (
        <Skeleton className="h-6 w-full" />
      ) : !profile || skills.length === 0 ? (
        <p className="text-xs text-muted-foreground">No track record yet — this agent hasn’t completed scored tasks.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {skills.map((s) => (
            <div key={s.skill} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 truncate font-medium">{s.skill}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', s.successRate >= 0.7 ? 'bg-emerald-500' : s.successRate >= 0.4 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.round(s.successRate * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-muted-foreground">
                {Math.round(s.successRate * 100)}% · {s.successes}/{s.attempts}
              </span>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {profile.totalSuccesses}/{profile.totalTasks} tasks succeeded overall.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2 text-muted-foreground"><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
