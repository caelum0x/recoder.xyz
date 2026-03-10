'use client';

import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Settings,
  Play,
  Zap,
  AlertTriangle,
  Mail,
  Globe,
  Smartphone,
  ChevronDown,
  ChevronUp,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useNotificationRules,
  useNotificationRule,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useTestRule,
  useNotificationRuleLog,
} from '@/hooks/notifications/use-notification-rules';
import type {
  NotificationRule,
  CreateNotificationRuleRequest,
  RuleCondition,
  RuleAction,
  TriggerEvent,
  TestRuleResult,
} from '@/lib/api/notification-rules';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Constants
// ============================================================================

const TRIGGER_EVENTS: { value: TriggerEvent; label: string; color: string }[] = [
  { value: 'run_completed', label: 'Run Completed', color: 'bg-green-500' },
  { value: 'run_failed', label: 'Run Failed', color: 'bg-red-500' },
  { value: 'cost_exceeded', label: 'Cost Exceeded', color: 'bg-orange-500' },
  { value: 'agent_error', label: 'Agent Error', color: 'bg-red-600' },
  { value: 'health_degraded', label: 'Health Degraded', color: 'bg-yellow-500' },
  { value: 'quota_warning', label: 'Quota Warning', color: 'bg-amber-500' },
  { value: 'thread_completed', label: 'Thread Completed', color: 'bg-blue-500' },
  { value: 'schedule_missed', label: 'Schedule Missed', color: 'bg-purple-500' },
];

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
];

const ACTION_TYPES = [
  { value: 'in_app', label: 'In-App', icon: Smartphone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'webhook', label: 'Webhook', icon: Globe },
];

function getTriggerBadge(event: string) {
  const trigger = TRIGGER_EVENTS.find((t) => t.value === event);
  if (!trigger) return <Badge variant="secondary">{event}</Badge>;
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', trigger.color)} />
      {trigger.label}
    </Badge>
  );
}

// ============================================================================
// Condition Builder Row
// ============================================================================

function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
}: {
  condition: RuleCondition;
  index: number;
  onChange: (index: number, condition: RuleCondition) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Field (e.g., cost)"
        value={condition.field}
        onChange={(e) => onChange(index, { ...condition, field: e.target.value })}
        className="flex-1"
      />
      <Select
        value={condition.operator}
        onValueChange={(v) =>
          onChange(index, { ...condition, operator: v as RuleCondition['operator'] })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Value"
        value={String(condition.value)}
        onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
        className="flex-1"
      />
      <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// Action Builder Row
// ============================================================================

function ActionRow({
  action,
  index,
  onChange,
  onRemove,
}: {
  action: RuleAction;
  index: number;
  onChange: (index: number, action: RuleAction) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={action.type}
        onValueChange={(v) =>
          onChange(index, { ...action, type: v as RuleAction['type'] })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_TYPES.map((at) => (
            <SelectItem key={at.value} value={at.value}>
              {at.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {action.type === 'webhook' && (
        <Input
          placeholder="Webhook URL"
          value={action.config?.url || ''}
          onChange={(e) =>
            onChange(index, {
              ...action,
              config: { ...action.config, url: e.target.value },
            })
          }
          className="flex-1"
        />
      )}
      {action.type === 'email' && (
        <span className="text-sm text-muted-foreground flex-1">
          Sends to your account email
        </span>
      )}
      {action.type === 'in_app' && (
        <span className="text-sm text-muted-foreground flex-1">
          Shows in notification center
        </span>
      )}
      <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// New Rule Dialog
// ============================================================================

function NewRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createRule = useCreateRule();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>('run_completed');
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [actions, setActions] = useState<RuleAction[]>([
    { type: 'in_app', config: {} },
  ]);
  const [cooldownMinutes, setCooldownMinutes] = useState('0');

  const addCondition = () => {
    setConditions([...conditions, { field: '', operator: 'equals', value: '' }]);
  };

  const updateCondition = (index: number, condition: RuleCondition) => {
    const updated = [...conditions];
    updated[index] = condition;
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const addAction = () => {
    setActions([...actions, { type: 'in_app', config: {} }]);
  };

  const updateAction = (index: number, action: RuleAction) => {
    const updated = [...actions];
    updated[index] = action;
    setActions(updated);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const request: CreateNotificationRuleRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      trigger_event: triggerEvent,
      conditions: conditions.filter((c) => c.field.trim()),
      actions,
      cooldown_minutes: parseInt(cooldownMinutes, 10) || 0,
    };
    createRule.mutate(request, {
      onSuccess: () => {
        onOpenChange(false);
        setName('');
        setDescription('');
        setTriggerEvent('run_completed');
        setConditions([]);
        setActions([{ type: 'in_app', config: {} }]);
        setCooldownMinutes('0');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Notification Rule</DialogTitle>
          <DialogDescription>
            Define when and how you want to be notified.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          {/* Name & Description */}
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alert on failed runs"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          {/* Trigger Event */}
          <div>
            <label className="text-sm font-medium">Trigger Event</label>
            <Select
              value={triggerEvent}
              onValueChange={(v) => setTriggerEvent(v as TriggerEvent)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTS.map((te) => (
                  <SelectItem key={te.value} value={te.value}>
                    {te.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Conditions</label>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No conditions -- rule triggers on every event
              </p>
            ) : (
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    condition={c}
                    index={i}
                    onChange={updateCondition}
                    onRemove={removeCondition}
                  />
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Actions</label>
              <Button variant="outline" size="sm" onClick={addAction}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <ActionRow
                  key={i}
                  action={a}
                  index={i}
                  onChange={updateAction}
                  onRemove={removeAction}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Cooldown */}
          <div>
            <label className="text-sm font-medium">Cooldown (minutes)</label>
            <Input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum time between triggers. 0 = no cooldown.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createRule.isPending}
          >
            {createRule.isPending ? 'Creating...' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Test Result Display
// ============================================================================

function TestResultDisplay({ result }: { result: TestRuleResult }) {
  return (
    <Card className="mt-4 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play className="h-4 w-4" />
          Test Result: {result.rule_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">All conditions met:</span>
          <Badge variant={result.all_conditions_met ? 'default' : 'destructive'}>
            {result.all_conditions_met ? 'Yes' : 'No'}
          </Badge>
        </div>
        {result.cooldown_active && (
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            Cooldown is active -- rule would not fire
          </div>
        )}
        {result.conditions_evaluated.length > 0 && (
          <div>
            <p className="font-medium mb-1">Conditions:</p>
            {result.conditions_evaluated.map((c, i) => (
              <div
                key={i}
                className={cn(
                  'text-xs p-2 rounded mb-1',
                  c.met ? 'bg-green-500/10' : 'bg-red-500/10'
                )}
              >
                {c.field} {c.operator} &quot;{String(c.expected)}&quot; -- actual: &quot;{String(c.actual)}&quot;{' '}
                {c.met ? '(passed)' : `(failed${c.reason ? `: ${c.reason}` : ''})`}
              </div>
            ))}
          </div>
        )}
        {result.actions_that_would_fire.length > 0 && (
          <div>
            <p className="font-medium mb-1">Actions that would fire:</p>
            {result.actions_that_would_fire.map((a, i) => (
              <div key={i} className="text-xs p-2 bg-blue-500/10 rounded mb-1">
                {a.type}
                {a.config?.url ? ` -> ${a.config.url}` : ''}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Rule Row (with expandable detail)
// ============================================================================

function RuleRow({ rule }: { rule: NotificationRule }) {
  const [expanded, setExpanded] = useState(false);
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const testRule = useTestRule();
  const [testResult, setTestResult] = useState<TestRuleResult | null>(null);

  const { data: ruleDetail } = useNotificationRule(expanded ? rule.id : undefined);

  const handleToggleActive = () => {
    updateRule.mutate({
      ruleId: rule.id,
      is_active: !rule.is_active,
    });
  };

  const handleTest = () => {
    testRule.mutate(rule.id, {
      onSuccess: (result) => setTestResult(result),
    });
  };

  const handleDelete = () => {
    if (confirm('Delete this notification rule?')) {
      deleteRule.mutate(rule.id);
    }
  };

  return (
    <div className="border rounded-lg">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{rule.name}</span>
            {getTriggerBadge(rule.trigger_event)}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {rule.conditions?.length ?? 0} condition
              {(rule.conditions?.length ?? 0) !== 1 ? 's' : ''}
            </span>
            <span>
              {rule.actions?.length ?? 0} action
              {(rule.actions?.length ?? 0) !== 1 ? 's' : ''}
            </span>
            {rule.last_triggered_at && (
              <span>
                Last triggered:{' '}
                {(() => {
                  try {
                    return format(parseISO(rule.last_triggered_at), 'MMM d, HH:mm');
                  } catch {
                    return rule.last_triggered_at;
                  }
                })()}
              </span>
            )}
            <span>{rule.trigger_count} triggers</span>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch checked={rule.is_active} onCheckedChange={handleToggleActive} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleTest}>
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {rule.description && (
            <p className="text-sm text-muted-foreground">{rule.description}</p>
          )}

          {/* Conditions */}
          <div>
            <h4 className="text-sm font-medium mb-2">Conditions</h4>
            {(rule.conditions?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                No conditions -- triggers on every matching event
              </p>
            ) : (
              <div className="space-y-1">
                {rule.conditions.map((c, i) => (
                  <div key={i} className="text-xs bg-muted/50 p-2 rounded">
                    <span className="font-mono">{c.field}</span>{' '}
                    <span className="text-muted-foreground">{c.operator}</span>{' '}
                    <span className="font-mono">&quot;{String(c.value)}&quot;</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <h4 className="text-sm font-medium mb-2">Actions</h4>
            <div className="space-y-1">
              {rule.actions.map((a, i) => {
                const actionType = ACTION_TYPES.find((at) => at.value === a.type);
                const Icon = actionType?.icon ?? Bell;
                return (
                  <div key={i} className="text-xs bg-muted/50 p-2 rounded flex items-center gap-2">
                    <Icon className="h-3 w-3" />
                    {actionType?.label ?? a.type}
                    {a.type === 'webhook' && a.config?.url && (
                      <span className="text-muted-foreground font-mono ml-1 truncate">
                        {a.config.url}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cooldown */}
          {rule.cooldown_minutes > 0 && (
            <div className="text-xs text-muted-foreground">
              Cooldown: {rule.cooldown_minutes} minute{rule.cooldown_minutes !== 1 ? 's' : ''}
            </div>
          )}

          {/* Test Result */}
          {testResult && testResult.rule_id === rule.id && (
            <TestResultDisplay result={testResult} />
          )}

          {/* Execution Log */}
          {ruleDetail?.recent_logs && ruleDetail.recent_logs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Recent Executions</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {ruleDetail.recent_logs.map((log: any) => (
                  <div
                    key={log.id}
                    className="text-xs bg-muted/30 p-2 rounded flex items-center justify-between"
                  >
                    <span className="text-muted-foreground">
                      {(() => {
                        try {
                          return format(parseISO(log.created_at), 'MMM d, HH:mm:ss');
                        } catch {
                          return log.created_at;
                        }
                      })()}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {log.trigger_event}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function NotificationRulesPage() {
  const [showNewRule, setShowNewRule] = useState(false);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const { data: rules, isLoading } = useNotificationRules();

  const filteredRules = (rules ?? []).filter((r) => {
    if (filterActive === 'active') return r.is_active;
    if (filterActive === 'inactive') return !r.is_active;
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6" />
            Notification Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define automated notifications based on events and conditions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={filterActive}
            onValueChange={(v) => setFilterActive(v as 'all' | 'active' | 'inactive')}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowNewRule(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Rules List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">
              {filterActive !== 'all' ? 'No matching rules' : 'No notification rules yet'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Create rules to get notified when specific events occur
            </p>
            <Button onClick={() => setShowNewRule(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </div>
      )}

      {/* Summary */}
      {rules && rules.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{rules.length}</p>
                <p className="text-xs text-muted-foreground">Total Rules</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.filter((r) => r.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.reduce((sum, r) => sum + r.trigger_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Triggers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Rule Dialog */}
      <NewRuleDialog open={showNewRule} onOpenChange={setShowNewRule} />
    </div>
  );
}
