'use client';

import React, { useState } from 'react';
import {
  FlaskConical,
  Plus,
  Play,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Tag,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useTestCases,
  useCreateTestCase,
  useUpdateTestCase,
  useDeleteTestCase,
  useStartTestRun,
  useTestRuns,
  useTestRunDetail,
  type TestCase,
  type TestRun,
} from '@/hooks/agents/use-agent-testing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestingScreenProps {
  agentId: string;
}

// ---------------------------------------------------------------------------
// Add/Edit Test Case Dialog
// ---------------------------------------------------------------------------

function TestCaseDialog({
  open,
  onOpenChange,
  agentId,
  editCase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  editCase?: TestCase | null;
}) {
  const createMutation = useCreateTestCase();
  const updateMutation = useUpdateTestCase();

  const [name, setName] = useState(editCase?.name || '');
  const [inputMessage, setInputMessage] = useState(editCase?.input_message || '');
  const [expectedBehavior, setExpectedBehavior] = useState(editCase?.expected_behavior || '');
  const [containsInput, setContainsInput] = useState('');
  const [notContainsInput, setNotContainsInput] = useState('');
  const [expectedContains, setExpectedContains] = useState<string[]>(editCase?.expected_contains || []);
  const [expectedNotContains, setExpectedNotContains] = useState<string[]>(editCase?.expected_not_contains || []);
  const [maxLatency, setMaxLatency] = useState(editCase?.max_latency_ms?.toString() || '');
  const [maxCost, setMaxCost] = useState(editCase?.max_cost?.toString() || '');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>(editCase?.tags || []);

  // Reset state when dialog opens with new data
  React.useEffect(() => {
    if (open) {
      setName(editCase?.name || '');
      setInputMessage(editCase?.input_message || '');
      setExpectedBehavior(editCase?.expected_behavior || '');
      setExpectedContains(editCase?.expected_contains || []);
      setExpectedNotContains(editCase?.expected_not_contains || []);
      setMaxLatency(editCase?.max_latency_ms?.toString() || '');
      setMaxCost(editCase?.max_cost?.toString() || '');
      setTags(editCase?.tags || []);
      setContainsInput('');
      setNotContainsInput('');
      setTagsInput('');
    }
  }, [open, editCase]);

  const handleSubmit = async () => {
    if (!name.trim() || !inputMessage.trim()) {
      toast.error('Name and input message are required');
      return;
    }

    const payload = {
      name: name.trim(),
      input_message: inputMessage.trim(),
      expected_behavior: expectedBehavior.trim() || undefined,
      expected_contains: expectedContains.length > 0 ? expectedContains : undefined,
      expected_not_contains: expectedNotContains.length > 0 ? expectedNotContains : undefined,
      max_latency_ms: maxLatency ? parseInt(maxLatency) : undefined,
      max_cost: maxCost ? parseFloat(maxCost) : undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    try {
      if (editCase) {
        await updateMutation.mutateAsync({
          agentId,
          caseId: editCase.id,
          data: payload,
        });
      } else {
        await createMutation.mutateAsync({ agentId, data: payload });
      }
      onOpenChange(false);
    } catch {
      // Error handled in hook
    }
  };

  const addTag = (value: string, setter: (v: string[]) => void, current: string[], inputSetter: (v: string) => void) => {
    const trimmed = value.trim();
    if (trimmed && !current.includes(trimmed)) {
      setter([...current, trimmed]);
    }
    inputSetter('');
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editCase ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basic greeting test" />
          </div>

          <div className="space-y-2">
            <Label>Input Message</Label>
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="The message to send to the agent..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Expected Behavior (optional)</Label>
            <Textarea
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              placeholder="Describe what the agent should do..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Expected Contains</Label>
            <div className="flex gap-2">
              <Input
                value={containsInput}
                onChange={(e) => setContainsInput(e.target.value)}
                placeholder="Add keyword..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(containsInput, setExpectedContains, expectedContains, setContainsInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(containsInput, setExpectedContains, expectedContains, setContainsInput)}
              >
                Add
              </Button>
            </div>
            {expectedContains.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {expectedContains.map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setExpectedContains(expectedContains.filter((_, idx) => idx !== i))}>
                    {t} <XCircle className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Expected NOT Contains</Label>
            <div className="flex gap-2">
              <Input
                value={notContainsInput}
                onChange={(e) => setNotContainsInput(e.target.value)}
                placeholder="Add forbidden keyword..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(notContainsInput, setExpectedNotContains, expectedNotContains, setNotContainsInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(notContainsInput, setExpectedNotContains, expectedNotContains, setNotContainsInput)}
              >
                Add
              </Button>
            </div>
            {expectedNotContains.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {expectedNotContains.map((t, i) => (
                  <Badge key={i} variant="destructive" className="gap-1 cursor-pointer" onClick={() => setExpectedNotContains(expectedNotContains.filter((_, idx) => idx !== i))}>
                    {t} <XCircle className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Latency (ms)</Label>
              <Input
                type="number"
                value={maxLatency}
                onChange={(e) => setMaxLatency(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Cost ($)</Label>
              <Input
                type="number"
                step="0.001"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder="e.g. 0.05"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagsInput, setTags, tags, setTagsInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(tagsInput, setTags, tags, setTagsInput)}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((t, i) => (
                  <Badge key={i} variant="outline" className="gap-1 cursor-pointer" onClick={() => setTags(tags.filter((_, idx) => idx !== i))}>
                    {t} <XCircle className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editCase ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Test Run Result Row
// ---------------------------------------------------------------------------

function RunResultBadge({ passed }: { passed: boolean | null }) {
  if (passed === true) {
    return (
      <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Passed
      </Badge>
    );
  }
  if (passed === false) {
    return (
      <Badge variant="destructive" className="bg-red-500/15 text-red-600 border-red-500/30">
        <XCircle className="h-3 w-3 mr-1" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <MinusCircle className="h-3 w-3 mr-1" /> Skipped
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function TestingScreen({ agentId }: TestingScreenProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { data: casesData, isLoading: casesLoading } = useTestCases(agentId);
  const { data: runsData, isLoading: runsLoading } = useTestRuns(agentId);

  const startRunMutation = useStartTestRun();
  const updateMutation = useUpdateTestCase();
  const deleteMutation = useDeleteTestCase();

  const testCases = casesData?.test_cases || [];
  const testRuns = runsData?.test_runs || [];
  const activeCases = testCases.filter((tc) => tc.is_active).length;

  const handleRunTests = async () => {
    if (activeCases === 0) {
      toast.error('No active test cases to run');
      return;
    }
    try {
      await startRunMutation.mutateAsync({ agentId });
    } catch {
      // Error handled in hook
    }
  };

  const handleToggleActive = async (tc: TestCase) => {
    try {
      await updateMutation.mutateAsync({
        agentId,
        caseId: tc.id,
        data: { is_active: !tc.is_active },
      });
    } catch {
      // Error handled in hook
    }
  };

  const handleDelete = async (tc: TestCase) => {
    try {
      await deleteMutation.mutateAsync({ agentId, caseId: tc.id });
    } catch {
      // Error handled in hook
    }
  };

  if (casesLoading) {
    return (
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-4 pb-8">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 overflow-y-auto">
      <div className="space-y-6 pb-8 pr-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Test Suite
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {testCases.length} test case{testCases.length !== 1 ? 's' : ''} ({activeCases} active)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunTests}
              disabled={startRunMutation.isPending || activeCases === 0}
            >
              <Play className="h-4 w-4 mr-1" />
              {startRunMutation.isPending ? 'Running...' : 'Run All Tests'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditCase(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Test Case
            </Button>
          </div>
        </div>

        {/* Test Cases List */}
        {testCases.length === 0 ? (
          <SpotlightCard className="p-8 text-center">
            <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No test cases yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create test cases to validate your agent&apos;s behavior
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => {
                setEditCase(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create First Test Case
            </Button>
          </SpotlightCard>
        ) : (
          <div className="space-y-2">
            {testCases.map((tc) => (
              <SpotlightCard
                key={tc.id}
                className={cn(
                  'p-4 transition-colors',
                  !tc.is_active && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{tc.name}</h3>
                      {tc.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="h-3 w-3 mr-0.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {tc.input_message}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {tc.max_latency_ms && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {tc.max_latency_ms}ms
                        </span>
                      )}
                      {tc.max_cost && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> ${tc.max_cost}
                        </span>
                      )}
                      {tc.expected_contains.length > 0 && (
                        <span>Must contain: {tc.expected_contains.length}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={tc.is_active}
                      onCheckedChange={() => handleToggleActive(tc)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditCase(tc);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(tc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </SpotlightCard>
            ))}
          </div>
        )}

        {/* Test Run History */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Test Run History</h3>
          {runsLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : testRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test runs yet. Run your first test above.</p>
          ) : (
            <div className="space-y-2">
              {testRuns.map((run) => (
                <TestRunCard
                  key={run.id}
                  run={run}
                  agentId={agentId}
                  expanded={expandedRunId === run.id}
                  onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog */}
      <TestCaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agentId={agentId}
        editCase={editCase}
      />
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Test Run Card (expandable)
// ---------------------------------------------------------------------------

function TestRunCard({
  run,
  agentId,
  expanded,
  onToggle,
}: {
  run: TestRun;
  agentId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: detail, isLoading } = useTestRunDetail(
    agentId,
    expanded ? run.id : ''
  );

  const passRate =
    run.total_cases > 0
      ? Math.round(((run.passed) / run.total_cases) * 100)
      : 0;

  return (
    <SpotlightCard className="p-3">
      <button
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {run.suite_name || 'default'}
              </span>
              <Badge
                variant={run.status === 'completed' ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {run.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
          <span className="text-emerald-600">{run.passed} passed</span>
          <span className="text-red-500">{run.failed} failed</span>
          <span>{run.skipped} skipped</span>
          <Badge variant="outline" className="ml-1">
            {passRate}%
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t pt-3 space-y-2">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : detail?.results?.length ? (
            detail.results.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <RunResultBadge passed={result.passed} />
                  <span className="truncate">{result.test_case_name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                  {result.latency_ms != null && (
                    <span>{result.latency_ms}ms</span>
                  )}
                  {result.cost != null && <span>${result.cost}</span>}
                  {result.failure_reason && (
                    <span className="text-red-500 truncate max-w-[150px]" title={result.failure_reason}>
                      {result.failure_reason}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No results available</p>
          )}
        </div>
      )}
    </SpotlightCard>
  );
}
