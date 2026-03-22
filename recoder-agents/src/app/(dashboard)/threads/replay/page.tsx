'use client';

import React, { useState, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useCheckpoints,
  useCreateCheckpoint,
  useDeleteCheckpoint,
  useCreateReplay,
  useReplays,
  useReplayDetail,
  useUpdateReplay,
  useDeleteReplay,
} from '@/hooks/threads/use-thread-replay';
import type { ThreadCheckpoint, ThreadReplay } from '@/lib/api/thread-replay';

// ============================================================================
// Helpers
// ============================================================================

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), 'MMM d, HH:mm');
  } catch {
    return iso;
  }
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: <Clock className="h-2.5 w-2.5 mr-1" />, cls: 'bg-muted text-muted-foreground' },
  running: { label: 'Running', icon: <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />, cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  completed: { label: 'Completed', icon: <CheckCircle2 className="h-2.5 w-2.5 mr-1" />, cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
  failed: { label: 'Failed', icon: <XCircle className="h-2.5 w-2.5 mr-1" />, cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

function StatusBadge({ status }: { status: ThreadReplay['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

// ============================================================================
// Replay Detail Sheet
// ============================================================================

function ReplayDetailSheet({
  replayId,
  open,
  onClose,
}: {
  replayId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const detailQuery = useReplayDetail(replayId);
  const updateMutation = useUpdateReplay();

  const replay = detailQuery.data;

  const handleSaveNotes = () => {
    if (!replay) return;
    updateMutation.mutate(
      { replayId: replay.id, data: { comparison_notes: notes } },
      { onSuccess: () => setNotesSaved(true) }
    );
  };

  // Sync notes from loaded data
  React.useEffect(() => {
    if (replay?.comparison_notes != null) {
      setNotes(replay.comparison_notes);
    }
  }, [replay?.comparison_notes]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            Replay Details
          </SheetTitle>
        </SheetHeader>

        {detailQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : !replay ? (
          <div className="text-sm text-muted-foreground text-center py-8">Replay not found.</div>
        ) : (
          <div className="space-y-4">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Status</span>
                <StatusBadge status={replay.status} />
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Source Thread</span>
                <span className="font-mono">{replay.source_thread_id}</span>
              </div>
              {replay.agent_id && (
                <div>
                  <span className="text-muted-foreground block mb-0.5">Agent ID</span>
                  <span className="font-mono">{replay.agent_id}</span>
                </div>
              )}
              {replay.replay_thread_id && (
                <div>
                  <span className="text-muted-foreground block mb-0.5">Replay Thread</span>
                  <span className="font-mono">{replay.replay_thread_id}</span>
                </div>
              )}
            </div>

            {/* Checkpoint Messages Snapshot */}
            {replay.messages_snapshot && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Messages Snapshot ({Array.isArray(replay.messages_snapshot) ? replay.messages_snapshot.length : 0} messages)
                </h4>
                <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                  {JSON.stringify(replay.messages_snapshot, null, 2)}
                </pre>
              </div>
            )}

            {/* Agent Config Override */}
            {replay.agent_config_override && Object.keys(replay.agent_config_override).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Agent Config Override</h4>
                <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-x-auto max-h-36 whitespace-pre-wrap break-all">
                  {JSON.stringify(replay.agent_config_override, null, 2)}
                </pre>
              </div>
            )}

            {/* Comparison Notes */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Comparison Notes</h4>
              <Textarea
                placeholder="Add notes comparing this replay to the original…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesSaved(false);
                }}
                rows={4}
              />
              <div className="flex items-center justify-between mt-2">
                {notesSaved && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Saved
                  </span>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={handleSaveNotes}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Notes'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Replay From Here Dialog
// ============================================================================

function ReplayFromCheckpointDialog({
  checkpoint,
  threadId,
  open,
  onClose,
}: {
  checkpoint: ThreadCheckpoint;
  threadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const [configOverride, setConfigOverride] = useState('{}');
  const [replayThreadId, setReplayThreadId] = useState('');
  const [configError, setConfigError] = useState('');

  const createReplayMutation = useCreateReplay(threadId);

  const handleCreate = () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = configOverride.trim() ? JSON.parse(configOverride) : {};
      setConfigError('');
    } catch {
      setConfigError('Invalid JSON');
      return;
    }
    createReplayMutation.mutate(
      {
        checkpoint_id: checkpoint.id,
        agent_id: agentId.trim() || undefined,
        agent_config_override: parsed,
        replay_thread_id: replayThreadId.trim() || undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Replay from Checkpoint</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {checkpoint.checkpoint_name || `Checkpoint at message #${checkpoint.message_index}`} · {fmtDate(checkpoint.created_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 p-3 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">
                {Array.isArray(checkpoint.messages_snapshot) ? checkpoint.messages_snapshot.length : 0} messages in snapshot
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agent ID</label>
            <Input
              placeholder="Override agent (leave blank to use original)"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agent Config Override (JSON)</label>
            <Textarea
              placeholder="{}"
              value={configOverride}
              onChange={(e) => {
                setConfigOverride(e.target.value);
                setConfigError('');
              }}
              rows={3}
              className={cn(configError && 'border-destructive')}
            />
            {configError && <p className="text-xs text-destructive mt-1">{configError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Replay Thread ID</label>
            <Input
              placeholder="Optional: ID for the new replay thread"
              value={replayThreadId}
              onChange={(e) => setReplayThreadId(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createReplayMutation.isPending}>
            {createReplayMutation.isPending ? 'Creating…' : 'Start Replay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Create Checkpoint Dialog
// ============================================================================

function CreateCheckpointDialog({
  threadId,
  open,
  onClose,
}: {
  threadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [msgIndex, setMsgIndex] = useState('0');
  const [msgsSnapshot, setMsgsSnapshot] = useState('[]');
  const [agentConfig, setAgentConfig] = useState('{}');
  const [msgsError, setMsgsError] = useState('');
  const [configError, setConfigError] = useState('');

  const createMutation = useCreateCheckpoint(threadId);

  const handleCreate = () => {
    let msgs: unknown[] = [];
    let config: Record<string, unknown> = {};
    try {
      msgs = JSON.parse(msgsSnapshot);
      setMsgsError('');
    } catch {
      setMsgsError('Invalid JSON');
      return;
    }
    try {
      config = agentConfig.trim() ? JSON.parse(agentConfig) : {};
      setConfigError('');
    } catch {
      setConfigError('Invalid JSON');
      return;
    }
    const idx = parseInt(msgIndex, 10);
    createMutation.mutate(
      {
        checkpoint_name: name.trim() || undefined,
        message_index: isNaN(idx) ? 0 : idx,
        messages_snapshot: msgs,
        agent_config_snapshot: config,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Checkpoint</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Thread ID</label>
            <Input value={threadId} disabled className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Checkpoint Name</label>
            <Input
              placeholder="e.g. Before tool call"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message Index *</label>
            <Input
              type="number"
              min={0}
              value={msgIndex}
              onChange={(e) => setMsgIndex(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Messages Snapshot (JSON array) *</label>
            <Textarea
              placeholder="[]"
              value={msgsSnapshot}
              onChange={(e) => {
                setMsgsSnapshot(e.target.value);
                setMsgsError('');
              }}
              rows={4}
              className={cn(msgsError && 'border-destructive')}
            />
            {msgsError && <p className="text-xs text-destructive mt-1">{msgsError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agent Config Snapshot (JSON)</label>
            <Textarea
              placeholder="{}"
              value={agentConfig}
              onChange={(e) => {
                setAgentConfig(e.target.value);
                setConfigError('');
              }}
              rows={3}
              className={cn(configError && 'border-destructive')}
            />
            {configError && <p className="text-xs text-destructive mt-1">{configError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Saving…' : 'Create Checkpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ThreadReplayPage() {
  const [threadId, setThreadId] = useState('');
  const [submittedThreadId, setSubmittedThreadId] = useState('');
  const [showCreateCheckpoint, setShowCreateCheckpoint] = useState(false);
  const [replayTarget, setReplayTarget] = useState<ThreadCheckpoint | null>(null);
  const [detailReplayId, setDetailReplayId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const checkpointsQuery = useCheckpoints(submittedThreadId);
  const replaysQuery = useReplays(submittedThreadId);
  const deleteCheckpointMutation = useDeleteCheckpoint(submittedThreadId);
  const deleteReplayMutation = useDeleteReplay();
  const updateReplayMutation = useUpdateReplay();

  const checkpoints = checkpointsQuery.data ?? [];
  const replays = replaysQuery.data ?? [];

  const handleScopeThread = useCallback(() => {
    setSubmittedThreadId(threadId.trim());
  }, [threadId]);

  const handleSaveNotes = (replayId: string) => {
    const notes = editingNotes[replayId] ?? '';
    updateReplayMutation.mutate({ replayId, data: { comparison_notes: notes } });
  };

  return (
    <div className="flex-1 overflow-auto pb-8 px-4 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold">Thread Replay</h1>
          <p className="text-sm text-muted-foreground">Create checkpoints and replay threads with different configurations</p>
        </div>
        {submittedThreadId && (
          <Button size="sm" className="gap-2" onClick={() => setShowCreateCheckpoint(true)}>
            <Plus className="h-4 w-4" />
            Create Checkpoint
          </Button>
        )}
      </div>

      {/* Thread ID Scope */}
      <div className="flex gap-2 mb-6">
        <Input
          className="h-10 max-w-sm"
          placeholder="Enter Thread ID to scope view…"
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScopeThread()}
        />
        <Button className="h-10" onClick={handleScopeThread} disabled={!threadId.trim()}>
          Load
        </Button>
        {submittedThreadId && (
          <Button
            variant="ghost"
            className="h-10 px-3 text-muted-foreground"
            onClick={() => {
              setThreadId('');
              setSubmittedThreadId('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {!submittedThreadId ? (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-12 text-center">
            <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h4 className="text-sm font-medium mb-1">Enter a Thread ID</h4>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Type a thread ID above and click Load to view checkpoints and replays.
            </p>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Checkpoints */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Checkpoints</h2>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowCreateCheckpoint(true)}
              >
                <Plus className="h-3 w-3" />
                New
              </Button>
            </div>

            {checkpointsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
              </div>
            ) : checkpoints.length === 0 ? (
              <SpotlightCard className="bg-card border border-border">
                <div className="p-8 text-center">
                  <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No checkpoints for this thread.</p>
                </div>
              </SpotlightCard>
            ) : (
              <div className="space-y-2">
                {checkpoints.map((cp) => (
                  <SpotlightCard key={cp.id} className="bg-card border border-border">
                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-sm font-medium">
                            {cp.checkpoint_name || `Checkpoint at msg #${cp.message_index}`}
                          </span>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {Array.isArray(cp.messages_snapshot) ? cp.messages_snapshot.length : 0} messages
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtDate(cp.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 flex-1"
                          onClick={() => setReplayTarget(cp)}
                        >
                          <Play className="h-3 w-3" />
                          Replay from here
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deleteCheckpointMutation.isPending}
                          onClick={() => deleteCheckpointMutation.mutate(cp.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </SpotlightCard>
                ))}
              </div>
            )}
          </div>

          {/* Right: Replays */}
          <div>
            <div className="flex items-center mb-3">
              <h2 className="text-sm font-semibold">Replays</h2>
            </div>

            {replaysQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
              </div>
            ) : replays.length === 0 ? (
              <SpotlightCard className="bg-card border border-border">
                <div className="p-8 text-center">
                  <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No replays yet. Use "Replay from here" on a checkpoint.</p>
                </div>
              </SpotlightCard>
            ) : (
              <div className="space-y-2">
                {replays.map((replay) => (
                  <SpotlightCard key={replay.id} className="bg-card border border-border">
                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs text-muted-foreground truncate">
                              {replay.source_thread_id}
                            </span>
                            <StatusBadge status={replay.status} />
                          </div>
                          {replay.agent_id && (
                            <div className="text-xs text-muted-foreground">Agent: {replay.agent_id}</div>
                          )}
                          {replay.comparison_notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                              "{replay.comparison_notes}"
                            </p>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {fmtDate(replay.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 flex-1"
                          onClick={() => setDetailReplayId(replay.id)}
                        >
                          <Eye className="h-3 w-3" />
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deleteReplayMutation.isPending}
                          onClick={() => deleteReplayMutation.mutate(replay.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </SpotlightCard>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Checkpoint Dialog */}
      {showCreateCheckpoint && submittedThreadId && (
        <CreateCheckpointDialog
          threadId={submittedThreadId}
          open={showCreateCheckpoint}
          onClose={() => setShowCreateCheckpoint(false)}
        />
      )}

      {/* Replay from Checkpoint Dialog */}
      {replayTarget && submittedThreadId && (
        <ReplayFromCheckpointDialog
          checkpoint={replayTarget}
          threadId={submittedThreadId}
          open={!!replayTarget}
          onClose={() => setReplayTarget(null)}
        />
      )}

      {/* Replay Detail Sheet */}
      {detailReplayId && (
        <ReplayDetailSheet
          replayId={detailReplayId}
          open={!!detailReplayId}
          onClose={() => setDetailReplayId(null)}
        />
      )}
    </div>
  );
}
