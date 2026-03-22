'use client';

import { useState, useMemo } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Star,
  ChevronRight,
  Loader2,
  Award,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useSkillTreeNodes,
  useCreateSkillNode,
  useUnlockSkill,
  useDeleteSkillNode,
  useAwardXP,
  useXPEvents,
  useSkillProgress,
  type SkillTreeNode,
  type CreateSkillNodeData,
  type AwardXPData,
} from '@/hooks/agents/use-agent-skill-trees';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XP_EVENT_TYPES = [
  { value: 'task_completed', label: 'Task Completed' },
  { value: 'test_passed', label: 'Test Passed' },
  { value: 'user_rating', label: 'User Rating' },
  { value: 'manual', label: 'Manual Award' },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  reasoning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  coding: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  communication: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  creativity: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  analysis: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  tools: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function XPBar({
  totalXp,
  currentLevel,
  xpToNext,
}: {
  totalXp: number;
  currentLevel: number;
  xpToNext: number;
}) {
  const xpPerLevel = 500;
  const xpInCurrentLevel = totalXp - (currentLevel - 1) * xpPerLevel;
  const progressPct = Math.min(100, (xpInCurrentLevel / xpPerLevel) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Star className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold">Level {currentLevel}</p>
            <p className="text-xs text-muted-foreground">{totalXp.toLocaleString()} total XP</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-muted-foreground">
            {xpToNext.toLocaleString()} XP to Level {currentLevel + 1}
          </p>
        </div>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
        <span>Level {currentLevel}</span>
        <span>{Math.round(progressPct)}%</span>
        <span>Level {currentLevel + 1}</span>
      </div>
    </div>
  );
}

function SkillNode({
  skill,
  progress,
  onUnlock,
  onDelete,
}: {
  skill: SkillTreeNode;
  progress: { current_level: number; total_xp: number } | null;
  onUnlock: (skillId: string) => void;
  onDelete: (skillId: string) => void;
}) {
  const canUnlock =
    !skill.is_unlocked &&
    progress &&
    progress.current_level >= skill.level_required &&
    progress.total_xp >= skill.xp_cost;

  const categoryColor =
    CATEGORY_COLORS[skill.skill_category] ?? CATEGORY_COLORS.general;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-2 transition-all',
        skill.is_unlocked
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card opacity-75'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{skill.icon || '⭐'}</span>
          <div>
            <p className="font-semibold text-sm leading-tight">{skill.skill_name}</p>
            {skill.skill_description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {skill.skill_description}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(skill.id)}
          className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0"
          title="Delete skill"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize', categoryColor)}>
          {skill.skill_category}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {skill.xp_cost} XP
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Lv. {skill.level_required}
        </span>
        {skill.is_unlocked ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-primary font-medium">
            <Unlock className="h-3.5 w-3.5" />
            Unlocked
          </span>
        ) : (
          <button
            onClick={() => canUnlock && onUnlock(skill.id)}
            disabled={!canUnlock}
            className={cn(
              'ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-colors',
              canUnlock
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
            )}
          >
            <Lock className="h-3 w-3" />
            {canUnlock ? 'Unlock' : 'Locked'}
          </button>
        )}
      </div>
    </div>
  );
}

function AddSkillDialog({
  agentId,
  nodes,
  onClose,
}: {
  agentId: string;
  nodes: SkillTreeNode[];
  onClose: () => void;
}) {
  const createMutation = useCreateSkillNode();
  const [form, setForm] = useState<CreateSkillNodeData>({
    skill_name: '',
    skill_description: '',
    skill_category: 'general',
    parent_skill_id: undefined,
    level_required: 1,
    xp_cost: 100,
    icon: '⭐',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.skill_name.trim()) { toast.error('Skill name is required'); return; }
    try {
      await createMutation.mutateAsync({ agentId, data: form });
      toast.success('Skill created');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create skill';
      toast.error(msg);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold">Add Skill</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm px-2 py-1">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Skill Name *</label>
              <input
                value={form.skill_name}
                onChange={(e) => setForm({ ...form, skill_name: e.target.value })}
                placeholder="e.g. Advanced Reasoning"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.skill_description}
                onChange={(e) => setForm({ ...form, skill_description: e.target.value })}
                rows={2}
                placeholder="What does this skill enable?"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select
                value={form.skill_category}
                onChange={(e) => setForm({ ...form, skill_category: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.keys(CATEGORY_COLORS).map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Icon (emoji)</label>
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="⭐"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Level Required</label>
              <input
                type="number"
                value={form.level_required}
                onChange={(e) => setForm({ ...form, level_required: Number(e.target.value) })}
                min={1}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">XP Cost</label>
              <input
                type="number"
                value={form.xp_cost}
                onChange={(e) => setForm({ ...form, xp_cost: Number(e.target.value) })}
                min={0}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Parent Skill</label>
              <select
                value={form.parent_skill_id ?? ''}
                onChange={(e) => setForm({ ...form, parent_skill_id: e.target.value || undefined })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None (root skill)</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.icon} {n.skill_name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Skill
          </button>
        </form>
      </div>
    </div>
  );
}

function AwardXPPanel({ agentId }: { agentId: string }) {
  const awardMutation = useAwardXP();
  const [form, setForm] = useState<AwardXPData>({
    xp_amount: 50,
    event_type: 'task_completed',
    description: '',
  });

  const handleAward = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await awardMutation.mutateAsync({ agentId, data: form });
      toast.success(`+${form.xp_amount} XP awarded! Now Level ${result.current_level}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to award XP';
      toast.error(msg);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-primary" />
        Award XP
      </h3>
      <form onSubmit={handleAward} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">XP Amount</label>
            <input
              type="number"
              value={form.xp_amount}
              onChange={(e) => setForm({ ...form, xp_amount: Number(e.target.value) })}
              min={1}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Event Type</label>
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {XP_EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional note…"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={awardMutation.isPending}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {awardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Award XP
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function SkillsScreen({ agentId }: { agentId: string }) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: nodes, isLoading: nodesLoading } = useSkillTreeNodes(agentId);
  const { data: xpEvents, isLoading: eventsLoading } = useXPEvents(agentId, 20);
  const { data: progress, isLoading: progressLoading } = useSkillProgress(agentId);

  const unlockMutation = useUnlockSkill();
  const deleteMutation = useDeleteSkillNode();

  // Build tree structure (root nodes and their children)
  const treeData = useMemo(() => {
    if (!nodes) return { roots: [], childrenMap: {} as Record<string, SkillTreeNode[]> };
    const childrenMap: Record<string, SkillTreeNode[]> = {};
    const roots: SkillTreeNode[] = [];
    for (const node of nodes) {
      if (!node.parent_skill_id) {
        roots.push(node);
      } else {
        if (!childrenMap[node.parent_skill_id]) childrenMap[node.parent_skill_id] = [];
        childrenMap[node.parent_skill_id].push(node);
      }
    }
    return { roots, childrenMap };
  }, [nodes]);

  const handleUnlock = async (skillId: string) => {
    try {
      const result = await unlockMutation.mutateAsync({ agentId, skillId });
      toast.success(`Skill unlocked! (−${result.xp_spent} XP)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock skill';
      toast.error(msg);
    }
  };

  const handleDelete = async (skillId: string) => {
    try {
      await deleteMutation.mutateAsync({ agentId, skillId });
      toast.success('Skill deleted');
    } catch {
      toast.error('Failed to delete skill');
    }
  };

  const renderSkillNode = (node: SkillTreeNode, depth: number = 0): React.ReactNode => {
    const children = treeData.childrenMap[node.id];
    return (
      <div key={node.id} className="flex flex-col gap-2">
        <div className={cn('flex items-start gap-2', depth > 0 && 'pl-4 relative')}>
          {depth > 0 && (
            <div className="absolute left-0 top-5 h-px w-4 bg-border" />
          )}
          {depth > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-4 shrink-0" />
          )}
          <div className="flex-1">
            <SkillNode
              skill={node}
              progress={progress ?? null}
              onUnlock={handleUnlock}
              onDelete={handleDelete}
            />
          </div>
        </div>
        {children && children.length > 0 && (
          <div className="pl-6 border-l border-border ml-6 space-y-2">
            {children.map((child) => renderSkillNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const isLoading = nodesLoading || progressLoading;

  return (
    <div className="flex-1 overflow-auto pb-8">
      <div className="space-y-6">
        {/* Progress bar */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading progress…
          </div>
        ) : progress ? (
          <XPBar
            totalXp={progress.total_xp}
            currentLevel={progress.current_level}
            xpToNext={progress.xp_to_next_level}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No XP awarded yet. Award XP to start leveling up this agent.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Skill tree */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Star className="h-4 w-4" />
                Skill Tree
                {nodes && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({nodes.filter((n) => n.is_unlocked).length}/{nodes.length} unlocked)
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowAddDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Add Skill
              </button>
            </div>

            {nodesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading skills…
              </div>
            ) : nodes && nodes.length > 0 ? (
              <div className="space-y-3">
                {treeData.roots.map((root) => renderSkillNode(root, 0))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-10 flex flex-col items-center text-center">
                <Star className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No skills yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add skills to build this agent&apos;s skill tree.
                </p>
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Add First Skill
                </button>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Award XP */}
            <AwardXPPanel agentId={agentId} />

            {/* XP History */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                XP History
              </h3>
              {eventsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : xpEvents && xpEvents.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {xpEvents.map((evt) => {
                    const eventLabel =
                      XP_EVENT_TYPES.find((et) => et.value === evt.event_type)?.label ??
                      evt.event_type;
                    return (
                      <div
                        key={evt.id}
                        className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
                              +{evt.xp_amount} XP
                            </span>
                            <span className="text-xs text-muted-foreground">{eventLabel}</span>
                          </div>
                          {evt.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {evt.description}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(evt.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No XP events yet.</p>
              )}
            </div>

            {/* Stats */}
            {progress && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h3 className="text-sm font-semibold">Progress Stats</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Total XP</p>
                    <p className="font-semibold">{progress.total_xp.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Level</p>
                    <p className="font-semibold">{progress.current_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Skills Unlocked</p>
                    <p className="font-semibold">{progress.skills_unlocked}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">XP to Next</p>
                    <p className="font-semibold">{progress.xp_to_next_level.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Skill Dialog */}
      {showAddDialog && (
        <AddSkillDialog
          agentId={agentId}
          nodes={nodes ?? []}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
