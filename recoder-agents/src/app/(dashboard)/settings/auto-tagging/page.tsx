'use client';

import React, { useState, useCallback } from 'react';
import {
  Tags,
  Plus,
  Trash2,
  Play,
  PlayCircle,
  Pencil,
  BarChart3,
  Loader2,
  Hash,
  Bot,
  Wrench,
  MessageSquare,
  Smile,
  Code,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAutoTagRules,
  useCreateAutoTagRule,
  useUpdateAutoTagRule,
  useDeleteAutoTagRule,
  useApplyAllAutoTags,
  useAutoTagStats,
} from '@/hooks/threads/use-thread-auto-tagging';
import type { AutoTagRule } from '@/lib/api/thread-auto-tagging';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RULE_TYPES = [
  { value: 'keyword',       label: 'Keyword',       icon: Hash,           description: 'Match threads containing specific keywords' },
  { value: 'agent',         label: 'Agent',          icon: Bot,            description: 'Match threads run by specific agents' },
  { value: 'tool_used',     label: 'Tool Used',      icon: Wrench,         description: 'Match threads where specific tools were used' },
  { value: 'message_count', label: 'Message Count',  icon: MessageSquare,  description: 'Match threads by number of messages' },
  { value: 'sentiment',     label: 'Sentiment',      icon: Smile,          description: 'Match threads by sentiment metadata' },
  { value: 'regex',         label: 'Regex',          icon: Code,           description: 'Match threads using regular expressions' },
] as const;

const TAG_COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#10b981',
  '#3b82f6', '#ec4899', '#8b5cf6', '#f97316',
  '#14b8a6', '#64748b',
];

// ---------------------------------------------------------------------------
// Rule config forms
// ---------------------------------------------------------------------------

function KeywordConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const keywords: string[] = config.keywords || [];
  const [newKw, setNewKw] = useState('');

  const addKeyword = () => {
    if (newKw.trim() && !keywords.includes(newKw.trim())) {
      onChange({ ...config, keywords: [...keywords, newKw.trim()] });
      setNewKw('');
    }
  };

  const removeKeyword = (kw: string) => {
    onChange({ ...config, keywords: keywords.filter((k) => k !== kw) });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Add keyword..."
          value={newKw}
          onChange={(e) => setNewKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
        />
        <Button variant="outline" size="sm" onClick={addKeyword}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <Badge key={kw} variant="secondary" className="gap-1">
            {kw}
            <button onClick={() => removeKeyword(kw)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function AgentConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const agentIds: string[] = config.agent_ids || [];
  const [newId, setNewId] = useState('');

  const addId = () => {
    if (newId.trim() && !agentIds.includes(newId.trim())) {
      onChange({ ...config, agent_ids: [...agentIds, newId.trim()] });
      setNewId('');
    }
  };

  const removeId = (id: string) => {
    onChange({ ...config, agent_ids: agentIds.filter((a) => a !== id) });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Agent ID..."
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addId())}
        />
        <Button variant="outline" size="sm" onClick={addId}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {agentIds.map((id) => (
          <Badge key={id} variant="secondary" className="gap-1 font-mono text-xs">
            {id.length > 12 ? id.slice(0, 10) + '...' : id}
            <button onClick={() => removeId(id)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ToolUsedConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const toolNames: string[] = config.tool_names || [];
  const [newTool, setNewTool] = useState('');

  const addTool = () => {
    if (newTool.trim() && !toolNames.includes(newTool.trim())) {
      onChange({ ...config, tool_names: [...toolNames, newTool.trim()] });
      setNewTool('');
    }
  };

  const removeTool = (name: string) => {
    onChange({ ...config, tool_names: toolNames.filter((t) => t !== name) });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Tool name..."
          value={newTool}
          onChange={(e) => setNewTool(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTool())}
        />
        <Button variant="outline" size="sm" onClick={addTool}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {toolNames.map((name) => (
          <Badge key={name} variant="secondary" className="gap-1">
            {name}
            <button onClick={() => removeTool(name)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MessageCountConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="text-xs text-muted-foreground mb-1 block">Min messages</label>
        <Input
          type="number"
          min={0}
          value={config.min ?? 0}
          onChange={(e) => onChange({ ...config, min: parseInt(e.target.value) || 0 })}
        />
      </div>
      <div className="flex-1">
        <label className="text-xs text-muted-foreground mb-1 block">Max messages (optional)</label>
        <Input
          type="number"
          min={0}
          value={config.max ?? ''}
          placeholder="No limit"
          onChange={(e) => {
            const val = e.target.value;
            onChange({ ...config, max: val ? parseInt(val) : undefined });
          }}
        />
      </div>
    </div>
  );
}

function RegexConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">Pattern (PostgreSQL regex)</label>
      <Input
        placeholder="e.g. error|exception|fail"
        value={config.pattern ?? ''}
        onChange={(e) => onChange({ ...config, pattern: e.target.value })}
        className="font-mono text-sm"
      />
    </div>
  );
}

function SentimentConfigForm({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">Sentiment value</label>
      <Select
        value={config.sentiment ?? ''}
        onValueChange={(val) => onChange({ ...config, sentiment: val })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select sentiment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="positive">Positive</SelectItem>
          <SelectItem value="negative">Negative</SelectItem>
          <SelectItem value="neutral">Neutral</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function RuleConfigForm({
  ruleType,
  config,
  onChange,
}: {
  ruleType: string;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  switch (ruleType) {
    case 'keyword':
      return <KeywordConfigForm config={config} onChange={onChange} />;
    case 'agent':
      return <AgentConfigForm config={config} onChange={onChange} />;
    case 'tool_used':
      return <ToolUsedConfigForm config={config} onChange={onChange} />;
    case 'message_count':
      return <MessageCountConfigForm config={config} onChange={onChange} />;
    case 'regex':
      return <RegexConfigForm config={config} onChange={onChange} />;
    case 'sentiment':
      return <SentimentConfigForm config={config} onChange={onChange} />;
    default:
      return <p className="text-sm text-muted-foreground">Select a rule type</p>;
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AutoTaggingSettingsPage() {
  const { data: rules, isLoading: rulesLoading } = useAutoTagRules();
  const { data: stats, isLoading: statsLoading } = useAutoTagStats();
  const createRule = useCreateAutoTagRule();
  const updateRule = useUpdateAutoTagRule();
  const deleteRule = useDeleteAutoTagRule();
  const applyAll = useApplyAllAutoTags();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTagRule | null>(null);

  // Create form state
  const [newTagName, setNewTagName] = useState('');
  const [newRuleType, setNewRuleType] = useState('keyword');
  const [newRuleConfig, setNewRuleConfig] = useState<Record<string, any>>({});
  const [newColor, setNewColor] = useState('#6366f1');

  // Edit form state
  const [editTagName, setEditTagName] = useState('');
  const [editRuleType, setEditRuleType] = useState('');
  const [editRuleConfig, setEditRuleConfig] = useState<Record<string, any>>({});
  const [editColor, setEditColor] = useState('');

  const resetCreateForm = useCallback(() => {
    setNewTagName('');
    setNewRuleType('keyword');
    setNewRuleConfig({});
    setNewColor('#6366f1');
  }, []);

  const handleCreate = useCallback(() => {
    if (!newTagName.trim()) return;
    createRule.mutate(
      {
        tag_name: newTagName.trim(),
        rule_type: newRuleType,
        rule_config: newRuleConfig,
        color: newColor,
      },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          resetCreateForm();
        },
      }
    );
  }, [createRule, newTagName, newRuleType, newRuleConfig, newColor, resetCreateForm]);

  const openEdit = useCallback((rule: AutoTagRule) => {
    setEditingRule(rule);
    setEditTagName(rule.tag_name);
    setEditRuleType(rule.rule_type);
    setEditRuleConfig(rule.rule_config || {});
    setEditColor(rule.color);
  }, []);

  const handleUpdate = useCallback(() => {
    if (!editingRule) return;
    updateRule.mutate(
      {
        ruleId: editingRule.id,
        data: {
          tag_name: editTagName.trim() || undefined,
          rule_type: editRuleType || undefined,
          rule_config: editRuleConfig,
          color: editColor || undefined,
        },
      },
      {
        onSuccess: () => setEditingRule(null),
      }
    );
  }, [updateRule, editingRule, editTagName, editRuleType, editRuleConfig, editColor]);

  const handleDelete = useCallback(
    (ruleId: string) => {
      deleteRule.mutate(ruleId);
    },
    [deleteRule]
  );

  const handleToggleActive = useCallback(
    (rule: AutoTagRule) => {
      updateRule.mutate({
        ruleId: rule.id,
        data: { is_active: !rule.is_active },
      });
    },
    [updateRule]
  );

  const getRuleTypeIcon = (type: string) => {
    const found = RULE_TYPES.find((r) => r.value === type);
    return found ? found.icon : Hash;
  };

  if (rulesLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Tags className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Auto-Tagging</h1>
              <p className="text-sm text-muted-foreground">
                Automatically tag threads based on rules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyAll.mutate()}
              disabled={applyAll.isPending}
            >
              {applyAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-1.5" />
              )}
              Apply to All
            </Button>
            <Button
              size="sm"
              onClick={() => {
                resetCreateForm();
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Rule
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))
          ) : (
            <>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">Rules</p>
                  <p className="text-2xl font-semibold">{stats?.total_rules ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">Tags Applied</p>
                  <p className="text-2xl font-semibold">{stats?.total_tags_applied ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">Active Rules</p>
                  <p className="text-2xl font-semibold">
                    {rules?.filter((r) => r.is_active).length ?? 0}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">Unique Tags</p>
                  <p className="text-2xl font-semibold">
                    {stats?.tag_distribution?.length ?? 0}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Rules table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>
              Configure rules that automatically tag threads based on their content
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!rules || rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tags className="h-10 w-10 mx-auto opacity-30 mb-3" />
                <p className="text-sm">No rules created yet. Click "New Rule" to get started.</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Matches</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => {
                      const TypeIcon = getRuleTypeIcon(rule.rule_type);
                      return (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: rule.color }}
                              />
                              <span className="font-medium">{rule.tag_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <TypeIcon className="h-3 w-3" />
                              {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label ?? rule.rule_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {rule.match_count}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={rule.is_active}
                              onCheckedChange={() => handleToggleActive(rule)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEdit(rule)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(rule.id)}
                                disabled={deleteRule.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tag distribution */}
        {stats && stats.tag_distribution.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Tag Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.tag_distribution.map((item) => {
                  const maxCount = stats.tag_distribution[0]?.count ?? 1;
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  const matchingRule = rules?.find((r) => r.tag_name === item.tag_name);
                  const color = matchingRule?.color ?? '#6366f1';
                  return (
                    <div key={item.tag_name} className="flex items-center gap-3">
                      <span className="text-sm w-32 truncate">{item.tag_name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-10 text-right">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Auto-Tag Rule</DialogTitle>
            <DialogDescription>
              Create a rule to automatically tag threads that match specific criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Tag Name</label>
              <Input
                placeholder="e.g. Bug Report"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-all',
                      newColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rule Type</label>
              <Select value={newRuleType} onValueChange={(v) => { setNewRuleType(v); setNewRuleConfig({}); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {RULE_TYPES.find((r) => r.value === newRuleType)?.description}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Configuration</label>
              <RuleConfigForm
                ruleType={newRuleType}
                config={newRuleConfig}
                onChange={setNewRuleConfig}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newTagName.trim() || createRule.isPending}
            >
              {createRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Rule</DialogTitle>
            <DialogDescription>
              Update the auto-tag rule configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Tag Name</label>
              <Input
                value={editTagName}
                onChange={(e) => setEditTagName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-all',
                      editColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rule Type</label>
              <Select value={editRuleType} onValueChange={(v) => { setEditRuleType(v); setEditRuleConfig({}); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Configuration</label>
              <RuleConfigForm
                ruleType={editRuleType}
                config={editRuleConfig}
                onChange={setEditRuleConfig}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateRule.isPending}
            >
              {updateRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
