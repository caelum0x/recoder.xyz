'use client';

import React, { useState } from 'react';
import {
  Route,
  Plus,
  Trash2,
  Pencil,
  Play,
  BarChart3,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import {
  useRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
  useEvaluateRouting,
  useRoutingStats,
} from '@/hooks/agents/use-model-routing';
import type { RoutingRule, CreateRoutingRuleData, UpdateRoutingRuleData } from '@/lib/api/model-routing';

interface RoutingScreenProps {
  agentId: string;
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  message_length: 'Message Length',
  keyword: 'Keyword',
  time_of_day: 'Time of Day',
  cost_threshold: 'Cost Threshold',
  complexity: 'Complexity',
  fallback: 'Fallback',
};

const CONDITION_TYPE_COLORS: Record<string, string> = {
  message_length: 'bg-blue-500/10 text-blue-500',
  keyword: 'bg-purple-500/10 text-purple-500',
  time_of_day: 'bg-orange-500/10 text-orange-500',
  cost_threshold: 'bg-green-500/10 text-green-500',
  complexity: 'bg-red-500/10 text-red-500',
  fallback: 'bg-gray-500/10 text-gray-500',
};

function getConditionSummary(rule: RoutingRule): string {
  const cv = rule.condition_value || {};
  switch (rule.condition_type) {
    case 'message_length':
      return `${cv.min ?? 0} - ${cv.max ?? '\u221e'} chars`;
    case 'keyword':
      return (cv.keywords || []).join(', ') || 'No keywords';
    case 'time_of_day':
      return `${cv.start ?? 0}:00 - ${cv.end ?? 23}:00 UTC`;
    case 'cost_threshold':
      return cv.max_cost ? `Max $${cv.max_cost}` : 'Any cost';
    case 'complexity':
      return cv.level ? cv.level.charAt(0).toUpperCase() + cv.level.slice(1) : 'Medium';
    case 'fallback':
      return 'Always matches';
    default:
      return '';
  }
}

export function RoutingScreen({ agentId }: RoutingScreenProps) {
  const { data: rules, isLoading } = useRoutingRules(agentId);
  const { data: stats } = useRoutingStats(agentId);
  const createMutation = useCreateRoutingRule(agentId);
  const updateMutation = useUpdateRoutingRule(agentId);
  const deleteMutation = useDeleteRoutingRule(agentId);
  const evaluateMutation = useEvaluateRouting(agentId);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [testMessage, setTestMessage] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formConditionType, setFormConditionType] = useState('message_length');
  const [formTargetModel, setFormTargetModel] = useState('');
  const [formPriority, setFormPriority] = useState(0);
  // Condition-specific state
  const [formMinLength, setFormMinLength] = useState('');
  const [formMaxLength, setFormMaxLength] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formStartHour, setFormStartHour] = useState('0');
  const [formEndHour, setFormEndHour] = useState('23');
  const [formMaxCost, setFormMaxCost] = useState('');
  const [formComplexity, setFormComplexity] = useState('medium');

  const resetForm = () => {
    setFormName('');
    setFormConditionType('message_length');
    setFormTargetModel('');
    setFormPriority(0);
    setFormMinLength('');
    setFormMaxLength('');
    setFormKeywords('');
    setFormStartHour('0');
    setFormEndHour('23');
    setFormMaxCost('');
    setFormComplexity('medium');
    setEditingRule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: RoutingRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormConditionType(rule.condition_type);
    setFormTargetModel(rule.target_model);
    setFormPriority(rule.priority);
    const cv = rule.condition_value || {};
    setFormMinLength(cv.min != null ? String(cv.min) : '');
    setFormMaxLength(cv.max != null ? String(cv.max) : '');
    setFormKeywords((cv.keywords || []).join(', '));
    setFormStartHour(cv.start != null ? String(cv.start) : '0');
    setFormEndHour(cv.end != null ? String(cv.end) : '23');
    setFormMaxCost(cv.max_cost != null ? String(cv.max_cost) : '');
    setFormComplexity(cv.level || 'medium');
    setIsDialogOpen(true);
  };

  const buildConditionValue = (): Record<string, any> => {
    switch (formConditionType) {
      case 'message_length':
        return {
          ...(formMinLength ? { min: parseInt(formMinLength) } : {}),
          ...(formMaxLength ? { max: parseInt(formMaxLength) } : {}),
        };
      case 'keyword':
        return {
          keywords: formKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        };
      case 'time_of_day':
        return {
          start: parseInt(formStartHour),
          end: parseInt(formEndHour),
        };
      case 'cost_threshold':
        return formMaxCost ? { max_cost: parseFloat(formMaxCost) } : {};
      case 'complexity':
        return { level: formComplexity };
      case 'fallback':
        return {};
      default:
        return {};
    }
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formTargetModel.trim()) {
      toast.error('Name and target model are required');
      return;
    }

    try {
      const conditionValue = buildConditionValue();

      if (editingRule) {
        const data: UpdateRoutingRuleData = {
          name: formName,
          priority: formPriority,
          condition_type: formConditionType,
          condition_value: conditionValue,
          target_model: formTargetModel,
        };
        await updateMutation.mutateAsync({ ruleId: editingRule.id, data });
        toast.success('Rule updated');
      } else {
        const data: CreateRoutingRuleData = {
          name: formName,
          priority: formPriority,
          condition_type: formConditionType,
          condition_value: conditionValue,
          target_model: formTargetModel,
        };
        await createMutation.mutateAsync(data);
        toast.success('Rule created');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save rule');
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteMutation.mutateAsync(ruleId);
      toast.success('Rule deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete rule');
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    try {
      await updateMutation.mutateAsync({
        ruleId: rule.id,
        data: { is_active: !rule.is_active },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle rule');
    }
  };

  const handleEvaluate = async () => {
    if (!testMessage.trim()) {
      toast.error('Enter a test message');
      return;
    }
    try {
      await evaluateMutation.mutateAsync(testMessage);
    } catch (error: any) {
      toast.error(error.message || 'Evaluation failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto space-y-4 pb-8">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const maxHitCount = stats
    ? Math.max(...stats.map((s) => s.hit_count), 1)
    : 1;

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Model Routing Rules</h2>
          <Badge variant="secondary" className="ml-1">
            {rules?.length ?? 0}
          </Badge>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Rules List */}
      {rules && rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {rule.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={CONDITION_TYPE_COLORS[rule.condition_type] || ''}
                      >
                        {CONDITION_TYPE_LABELS[rule.condition_type] || rule.condition_type}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        P{rule.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{getConditionSummary(rule)}</span>
                      <span>Model: {rule.target_model}</span>
                      <span>Hits: {rule.hit_count}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggleActive(rule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Route className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No routing rules yet. Add a rule to route messages to different models based on conditions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Test Routing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Play className="h-4 w-4" />
            Test Routing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Enter a test message to evaluate routing rules..."
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleEvaluate}
              disabled={evaluateMutation.isPending}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Evaluate
            </Button>
            {evaluateMutation.data && (
              <div className="flex items-center gap-2 text-sm">
                {evaluateMutation.data.matched ? (
                  <>
                    <Badge variant="default" className="bg-green-600">
                      Matched
                    </Badge>
                    <span className="text-muted-foreground">
                      {evaluateMutation.data.rule_name} &rarr;{' '}
                      <span className="font-medium text-foreground">
                        {evaluateMutation.data.target_model}
                      </span>
                    </span>
                  </>
                ) : (
                  <Badge variant="secondary">No match</Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Hit Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.map((stat) => (
              <div key={stat.id} className="flex items-center gap-3">
                <span className="text-sm w-36 truncate flex-shrink-0">
                  {stat.name}
                </span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-full transition-all"
                    style={{
                      width: `${(stat.hit_count / maxHitCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">
                  {stat.hit_count}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Routing Rule' : 'Add Routing Rule'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Rule name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Condition Type</label>
                <Select
                  value={formConditionType}
                  onValueChange={setFormConditionType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message_length">Message Length</SelectItem>
                    <SelectItem value="keyword">Keyword</SelectItem>
                    <SelectItem value="time_of_day">Time of Day</SelectItem>
                    <SelectItem value="cost_threshold">Cost Threshold</SelectItem>
                    <SelectItem value="complexity">Complexity</SelectItem>
                    <SelectItem value="fallback">Fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Input
                  type="number"
                  value={formPriority}
                  onChange={(e) => setFormPriority(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Dynamic condition config */}
            {formConditionType === 'message_length' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Min Length</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formMinLength}
                    onChange={(e) => setFormMinLength(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Max Length</label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={formMaxLength}
                    onChange={(e) => setFormMaxLength(e.target.value)}
                  />
                </div>
              </div>
            )}

            {formConditionType === 'keyword' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Keywords (comma-separated)
                </label>
                <Input
                  placeholder="code, debug, refactor"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                />
              </div>
            )}

            {formConditionType === 'time_of_day' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Hour (UTC)</label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={formStartHour}
                    onChange={(e) => setFormStartHour(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Hour (UTC)</label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={formEndHour}
                    onChange={(e) => setFormEndHour(e.target.value)}
                  />
                </div>
              </div>
            )}

            {formConditionType === 'cost_threshold' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Max Cost ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.10"
                  value={formMaxCost}
                  onChange={(e) => setFormMaxCost(e.target.value)}
                />
              </div>
            )}

            {formConditionType === 'complexity' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Complexity Level</label>
                <div className="flex gap-3">
                  {['simple', 'medium', 'complex'].map((level) => (
                    <label
                      key={level}
                      className="flex items-center gap-1.5 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="complexity"
                        value={level}
                        checked={formComplexity === level}
                        onChange={(e) => setFormComplexity(e.target.value)}
                        className="accent-primary"
                      />
                      <span className="text-sm capitalize">{level}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {formConditionType === 'fallback' && (
              <p className="text-sm text-muted-foreground">
                This rule will always match. Place it at the lowest priority as a catch-all.
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Target Model</label>
              <Input
                placeholder="e.g., gpt-4o, claude-sonnet-4-20250514"
                value={formTargetModel}
                onChange={(e) => setFormTargetModel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
