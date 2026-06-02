'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Trash2, Loader2, ChevronRight, Crown, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useSquads, useCreateSquad, useDeleteSquad, useImportSquad, useCollabFeed, useCollabStream, useCollabSummary, useRoster, type Squad } from '@/hooks/use-squads';

export default function SquadsPage() {
  const { data: squads, isLoading, isError, refetch } = useSquads();
  const { data: roster } = useRoster();
  const importSquad = useImportSquad();
  const fileRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const presenceByAgent = new Map((roster ?? []).map((r) => [r.agentId, r.presence?.availability ?? 'offline']));

  const handleImportFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data?.name) {
        toast.error('Invalid squad file (missing name).');
        return;
      }
      const created = await importSquad.mutateAsync({
        name: data.name,
        description: data.description,
        leaderId: data.leaderId,
        members: Array.isArray(data.members) ? data.members : [],
      });
      toast.success(`Imported "${created.name}"`);
    } catch {
      toast.error('Import failed — not a valid squad JSON.');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Squads</h1>
            <p className="text-sm text-muted-foreground">
              Teams of agents and humans — assign work to a group, not just one agent.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importSquad.isPending}>
            {importSquad.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Squad
          </Button>
        </div>
      </header>

      <SquadStats />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <div>
            <p className="font-medium">Couldn’t load squads</p>
            <p className="text-sm text-muted-foreground">
              The agent backend may be unreachable (check the <code>/dx</code> proxy / session auth).
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : !squads || squads.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">No squads yet</p>
            <p className="text-sm text-muted-foreground">Create a team of agents (and humans) to collaborate on tasks.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Squad
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {squads.map((squad) => (
            <SquadCard key={squad.id} squad={squad} presenceByAgent={presenceByAgent} />
          ))}
        </div>
      )}

      {squads && squads.length > 0 && <CollabFeed />}

      <CreateSquadDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function SquadStats() {
  const { data } = useCollabSummary();
  if (!data || data.squads === 0) return null;
  const topActions = Object.entries(data.byAction).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
      <Stat label="Squads" value={data.squads} />
      <span className="text-muted-foreground/40">·</span>
      <Stat label="Activity events" value={data.totalActivity} />
      {topActions.length > 0 && <span className="text-muted-foreground/40">·</span>}
      {topActions.map(([action, count]) => (
        <span key={action} className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {action} {count}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-base font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function CollabFeed() {
  const { data: feed } = useCollabFeed(30);
  const { events: live, connected } = useCollabStream(50);

  // Prefer the live stream when connected; otherwise show the polled feed.
  const entries = connected && live.length > 0
    ? live
    : (feed ?? []).map((e) => ({ ...e, type: e.action }));

  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Recent collaboration activity</CardTitle>
          <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            <span className={cn('h-2 w-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-zinc-400')} />
            {connected ? 'Live' : 'Polling'}
          </span>
        </div>
        <CardDescription>Across all your squads.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y text-sm">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">{e.squadName}</span>
                <span className="text-muted-foreground"> · {e.action}</span>
                {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SquadCard({ squad, presenceByAgent }: { squad: Squad; presenceByAgent?: Map<string, string> }) {
  const remove = useDeleteSquad();
  const agentMembers = squad.members.filter((m) => m.kind === 'agent');
  const agents = agentMembers.length;
  const humans = squad.members.filter((m) => m.kind === 'human').length;
  const online = presenceByAgent ? agentMembers.filter((m) => presenceByAgent.get(m.id) === 'online').length : 0;

  const handleDelete = async () => {
    if (!confirm(`Delete squad "${squad.name}"?`)) return;
    try {
      await remove.mutateAsync(squad.id);
      toast.success(`Deleted "${squad.name}"`);
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <Card className="flex flex-col transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="line-clamp-1 text-base">{squad.name}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
          {squad.description || 'No description.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-1.5 pb-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>{squad.members.length} member{squad.members.length === 1 ? '' : 's'}</span>
          <span className="text-muted-foreground/60">·</span>
          <span>{agents} agent{agents === 1 ? '' : 's'}, {humans} human{humans === 1 ? '' : 's'}</span>
        </div>
        {agents > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', online > 0 ? 'bg-emerald-500' : 'bg-zinc-400')} />
            <span>{online}/{agents} agent{agents === 1 ? '' : 's'} online</span>
          </div>
        )}
        {squad.leaderId && (
          <div className="flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="truncate">led by {squad.leaderId}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2 border-t pt-3">
        <Button size="sm" variant="outline" className="flex-1" asChild>
          <Link href={`/squads/${squad.id}`}>
            Open
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete} disabled={remove.isPending} aria-label="Delete squad">
          {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
      </CardFooter>
    </Card>
  );
}

function CreateSquadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateSquad();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Give the squad a name.');
      return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      toast.success(`Created "${name.trim()}"`);
      setName('');
      setDescription('');
      onOpenChange(false);
    } catch {
      toast.error('Create failed (backend unreachable?)');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New squad</DialogTitle>
          <DialogDescription>A named team you can add agents and humans to, then assign work as a group.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend strike team" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span></label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this squad do?" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create squad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
