'use client';

import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Star,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  Tag,
  BarChart3,
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  useFeedbackStats,
  useAllFeedback,
  useSubmitFeedback,
  useUpdateFeedback,
  useDeleteFeedback,
  useFeedbackCategories,
  useCreateCategory,
  useDeleteCategory,
} from '@/hooks/agents/use-agent-feedback';
import type { FeedbackType } from '@/lib/api/agent-feedback';

// ============================================================================
// Constants
// ============================================================================

const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'speed', label: 'Speed' },
  { value: 'helpfulness', label: 'Helpfulness' },
  { value: 'formatting', label: 'Formatting' },
  { value: 'bug_report', label: 'Bug Report' },
];

const RATING_COLORS = [
  '#ef4444', // 1 - red
  '#f97316', // 2 - orange
  '#eab308', // 3 - yellow
  '#84cc16', // 4 - lime
  '#22c55e', // 5 - green
];

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#3b82f6', '#6b7280',
];

function StarRating({ rating, size = 'sm' }: { rating: number | null; size?: 'sm' | 'md' }) {
  if (!rating) return <span className="text-muted-foreground text-xs">No rating</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
            i <= rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <Star
            className={cn(
              'h-5 w-5 transition-colors',
              i <= (hovered || value)
                ? 'text-amber-400 fill-amber-400'
                : 'text-muted-foreground/30 hover:text-amber-300'
            )}
          />
        </button>
      ))}
    </div>
  );
}

function FeedbackTypeBadge({ type }: { type: FeedbackType }) {
  const colorMap: Record<FeedbackType, string> = {
    general: 'bg-muted text-muted-foreground',
    accuracy: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    speed: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    helpfulness: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    formatting: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    bug_report: 'bg-red-500/10 text-red-500 border-red-500/20',
  };
  const label = FEEDBACK_TYPES.find((t) => t.value === type)?.label ?? type;
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border', colorMap[type])}>
      {label}
    </Badge>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AgentFeedbackPage() {
  const [agentIdFilter, setAgentIdFilter] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);

  // Form state for submit dialog
  const [formAgentId, setFormAgentId] = useState('');
  const [formRating, setFormRating] = useState(3);
  const [formType, setFormType] = useState<FeedbackType>('general');
  const [formComment, setFormComment] = useState('');
  const [formTags, setFormTags] = useState('');

  // Category form state
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catColor, setCatColor] = useState(COLOR_PRESETS[0]);

  const statsQuery = useFeedbackStats(selectedAgentId);
  const allFeedbackQuery = useAllFeedback(
    agentIdFilter ? { agent_id: agentIdFilter } : undefined
  );
  const categoriesQuery = useFeedbackCategories();

  const submitMutation = useSubmitFeedback(formAgentId);
  const updateMutation = useUpdateFeedback();
  const deleteMutation = useDeleteFeedback();
  const createCategoryMutation = useCreateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const feedback = allFeedbackQuery.data ?? [];
  const stats = statsQuery.data;
  const categories = categoriesQuery.data ?? [];

  const histogramData = useMemo(() => {
    if (!stats) return [];
    return [1, 2, 3, 4, 5].map((rating) => ({
      rating: `${rating}★`,
      count: stats.rating_histogram[String(rating)] ?? 0,
      fill: RATING_COLORS[rating - 1],
    }));
  }, [stats]);

  const handleSubmit = () => {
    if (!formAgentId.trim()) return;
    submitMutation.mutate(
      {
        rating: formRating,
        feedback_type: formType,
        comment: formComment || undefined,
        tags: formTags
          ? formTags.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined,
      },
      {
        onSuccess: () => {
          setShowSubmitDialog(false);
          setFormAgentId('');
          setFormRating(3);
          setFormType('general');
          setFormComment('');
          setFormTags('');
        },
      }
    );
  };

  const handleCreateCategory = () => {
    if (!catName.trim()) return;
    createCategoryMutation.mutate(
      { category_name: catName, description: catDescription || undefined, color: catColor },
      {
        onSuccess: () => {
          setCatName('');
          setCatDescription('');
          setCatColor(COLOR_PRESETS[0]);
        },
      }
    );
  };

  const totalFeedback = feedback.length;
  const resolved = feedback.filter((f) => f.is_resolved).length;
  const unresolved = totalFeedback - resolved;
  const avgRating =
    feedback.filter((f) => f.rating != null).length > 0
      ? feedback.filter((f) => f.rating != null).reduce((s, f) => s + (f.rating ?? 0), 0) /
        feedback.filter((f) => f.rating != null).length
      : 0;

  return (
    <div className="flex-1 overflow-auto pb-8 px-4 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold">Agent Feedback</h1>
          <p className="text-sm text-muted-foreground">Collect and review feedback for your agents</p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => setShowSubmitDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Submit Feedback
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Total Feedback</span>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xl font-semibold">{totalFeedback}</span>
          </div>
        </SpotlightCard>

        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg Rating</span>
              <Star className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold">{avgRating.toFixed(1)}</span>
              <StarRating rating={Math.round(avgRating)} />
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Resolved</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xl font-semibold text-emerald-500">{resolved}</span>
          </div>
        </SpotlightCard>

        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Unresolved</span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xl font-semibold text-amber-500">{unresolved}</span>
          </div>
        </SpotlightCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Agent Selector + Histogram */}
        <SpotlightCard className="bg-card border border-border lg:col-span-2">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Rating Distribution
              </h3>
              <div className="flex-1">
                <Input
                  placeholder="Filter by agent ID…"
                  value={agentIdFilter}
                  onChange={(e) => {
                    setAgentIdFilter(e.target.value);
                    setSelectedAgentId(e.target.value);
                  }}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {histogramData.length > 0 && stats ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histogramData} margin={{ left: -10 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rating" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {histogramData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                {selectedAgentId ? 'No feedback yet for this agent' : 'Enter an agent ID to see stats'}
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* Categories */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Categories
              </h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setShowCategoryDialog(true)}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>

            {categoriesQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No categories yet</p>
            ) : (
              <div className="space-y-1.5">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 group"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs font-medium truncate">{cat.category_name}</span>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => deleteCategoryMutation.mutate(cat.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SpotlightCard>
      </div>

      {/* Feedback Table */}
      <SpotlightCard className="bg-card border border-border">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-4">Feedback List</h3>

          {allFeedbackQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : feedback.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No feedback yet. Submit the first one!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Rating</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Comment</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-xs truncate max-w-[100px] block">{item.agent_id}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <StarRating rating={item.rating} />
                      </td>
                      <td className="py-2.5 px-3">
                        <FeedbackTypeBadge type={item.feedback_type} />
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {item.comment || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {item.is_resolved ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                            Open
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(parseISO(item.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {!item.is_resolved && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs gap-1 text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                              onClick={() =>
                                updateMutation.mutate({ id: item.id, data: { is_resolved: true } })
                              }
                              disabled={updateMutation.isPending}
                            >
                              <Check className="h-3 w-3" />
                              Resolve
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(item.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SpotlightCard>

      {/* Submit Feedback Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agent ID *</label>
              <Input
                placeholder="e.g. agent_abc123"
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rating</label>
              <StarSelector value={formRating} onChange={setFormRating} />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
              <Select value={formType} onValueChange={(v) => setFormType(v as FeedbackType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Comment</label>
              <Textarea
                placeholder="Describe the issue or feedback…"
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tags <span className="font-normal">(comma-separated)</span>
              </label>
              <Input
                placeholder="e.g. slow, hallucination, great"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formAgentId.trim() || submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name *</label>
              <Input
                placeholder="Category name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
              <Input
                placeholder="Optional description"
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCatColor(c)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      catColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateCategory}
              disabled={!catName.trim() || createCategoryMutation.isPending}
            >
              {createCategoryMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
