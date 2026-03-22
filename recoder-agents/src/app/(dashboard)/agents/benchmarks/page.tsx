'use client';

import { useState } from 'react';
import {
  Trophy,
  Plus,
  Play,
  Trash2,
  Loader2,
  FlaskConical,
  BarChart3,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useBenchmarkSuites,
  useCreateBenchmarkSuite,
  useDeleteBenchmarkSuite,
  useRunBenchmark,
  useBenchmarkRuns,
  useBenchmarkRun,
  useBenchmarkLeaderboard,
  type BenchmarkSuite,
  type BenchmarkRun,
  type CreateBenchmarkSuiteData,
} from '@/hooks/agents/use-agent-benchmark-suites';
import type { ScoringMethod } from '@/lib/api/agent-benchmark-suites';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-400 border-green-500/20',
    running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
        map[status] ?? 'bg-muted text-muted-foreground border-border'
      )}
    >
      {status}
    </span>
  );
}

function medalEmoji(idx: number): string {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `${idx + 1}.`;
}

// ---------------------------------------------------------------------------
// Run Dialog (pick agent_id for a suite)
// ---------------------------------------------------------------------------

function RunDialog({
  suite,
  onClose,
}: {
  suite: BenchmarkSuite | null;
  onClose: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const runMutation = useRunBenchmark();

  const handleRun = async () => {
    if (!suite) return;
    if (!agentId.trim()) {
      toast.error('Enter an agent ID');
      return;
    }
    try {
      const run = await runMutation.mutateAsync({ suiteId: suite.id, agentId: agentId.trim() });
      toast.success(
        `Run complete — score: ${run.overall_score?.toFixed(1) ?? 'N/A'}`
      );
      onClose();
      setAgentId('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Run failed');
    }
  };

  return (
    <Dialog open={suite !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Run Benchmark: {suite?.suite_name}</DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {suite?.test_cases?.length ?? 0} test cases &middot; Scoring: {suite?.scoring_method}
          </p>
          <div className="space-y-1">
            <Label>Agent ID</Label>
            <Input
              placeholder="e.g. agent_abc123"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={runMutation.isPending}>
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create Suite Dialog
// ---------------------------------------------------------------------------

const DEFAULT_TEST_CASES = JSON.stringify(
  [
    { name: 'Basic Greeting', prompt: 'Say hello', expected_keywords: ['hello', 'hi'] },
    { name: 'Summarize', prompt: 'Summarize this document', expected_keywords: ['summary'] },
  ],
  null,
  2
);

function CreateSuiteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState<{
    suite_name: string;
    description: string;
    scoring_method: ScoringMethod;
    test_cases_raw: string;
  }>({
    suite_name: '',
    description: '',
    scoring_method: 'average',
    test_cases_raw: DEFAULT_TEST_CASES,
  });
  const createMutation = useCreateBenchmarkSuite();

  const handleSubmit = async () => {
    if (!form.suite_name.trim()) {
      toast.error('Suite name is required');
      return;
    }
    let test_cases;
    try {
      test_cases = JSON.parse(form.test_cases_raw);
      if (!Array.isArray(test_cases)) throw new Error('Must be an array');
    } catch {
      toast.error('Test cases must be a valid JSON array');
      return;
    }
    const data: CreateBenchmarkSuiteData = {
      suite_name: form.suite_name.trim(),
      description: form.description || undefined,
      scoring_method: form.scoring_method,
      test_cases,
    };
    try {
      await createMutation.mutateAsync(data);
      toast.success('Benchmark suite created');
      onOpenChange(false);
      setForm({
        suite_name: '',
        description: '',
        scoring_method: 'average',
        test_cases_raw: DEFAULT_TEST_CASES,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create suite');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Benchmark Suite</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Suite Name</Label>
            <Input
              placeholder="e.g. Core Capability Suite"
              value={form.suite_name}
              onChange={(e) => setForm((f) => ({ ...f, suite_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Scoring Method</Label>
            <Select
              value={form.scoring_method}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, scoring_method: v as ScoringMethod }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="average">Average</SelectItem>
                <SelectItem value="weighted">Weighted</SelectItem>
                <SelectItem value="min">Min</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>
              Test Cases{' '}
              <span className="text-muted-foreground text-xs">(JSON array)</span>
            </Label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[140px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.test_cases_raw}
              onChange={(e) => setForm((f) => ({ ...f, test_cases_raw: e.target.value }))}
              spellCheck={false}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Suite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard Panel (inline per suite)
// ---------------------------------------------------------------------------

function LeaderboardPanel({ suiteId }: { suiteId: string }) {
  const { data, isLoading } = useBenchmarkLeaderboard(suiteId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading leaderboard…
      </div>
    );
  }
  if (!data || data.leaderboard.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3">No completed runs yet.</p>
    );
  }

  return (
    <div className="space-y-1 mt-2">
      {data.leaderboard.slice(0, 10).map((entry, idx) => (
        <div
          key={entry.id}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 bg-muted/40 text-sm"
        >
          <span className="w-6 text-center">{medalEmoji(idx)}</span>
          <span className="flex-1 font-mono text-xs text-muted-foreground truncate">
            {entry.agent_id}
          </span>
          <span className={cn('font-bold tabular-nums', scoreColor(entry.overall_score))}>
            {entry.overall_score?.toFixed(1) ?? '—'}
          </span>
          <span className="text-xs text-muted-foreground">
            {entry.passed_tests}/{entry.total_tests}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run Details Sheet
// ---------------------------------------------------------------------------

function RunDetailsSheet({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const { data: run, isLoading } = useBenchmarkRun(runId);

  return (
    <Sheet open={runId !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Run Details</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : run ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Agent</p>
                <p className="font-mono">{run.agent_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Overall Score</p>
                <p className={cn('font-bold text-lg', scoreColor(run.overall_score))}>
                  {run.overall_score?.toFixed(1) ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tests</p>
                <p>
                  {run.passed_tests}/{run.total_tests} passed
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p>{run.duration_ms ? `${run.duration_ms}ms` : '—'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Test Results</h3>
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test Name</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-center">Passed</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(run.test_results) ? run.test_results : []).map(
                      (tr, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{tr.name}</TableCell>
                          <TableCell
                            className={cn('text-right font-mono', scoreColor(tr.score))}
                          >
                            {tr.score.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-center">
                            {tr.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 inline" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400 inline" />
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {tr.latency_ms}ms
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm mt-4">Run not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Suite Card
// ---------------------------------------------------------------------------

function SuiteCard({
  suite,
  onRun,
  onDelete,
}: {
  suite: BenchmarkSuite;
  onRun: (suite: BenchmarkSuite) => void;
  onDelete: (id: string) => void;
}) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm truncate">{suite.suite_name}</CardTitle>
            {suite.description && (
              <CardDescription className="text-xs mt-0.5">{suite.description}</CardDescription>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRun(suite)}
            >
              <Play className="h-3 w-3 mr-1" />
              Run
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300"
              onClick={() => onDelete(suite.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{suite.test_cases?.length ?? 0} test cases</span>
          <span>&middot;</span>
          <span>Scoring: {suite.scoring_method}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs px-0 h-auto"
          onClick={() => setShowLeaderboard((v) => !v)}
        >
          <Trophy className="h-3 w-3 mr-1" />
          {showLeaderboard ? 'Hide' : 'Show'} Leaderboard
        </Button>
        {showLeaderboard && <LeaderboardPanel suiteId={suite.id} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgentBenchmarksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [runningSuite, setRunningSuite] = useState<BenchmarkSuite | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  const { data: suites, isLoading: suitesLoading } = useBenchmarkSuites();
  const { data: runs, isLoading: runsLoading } = useBenchmarkRuns();
  const deleteSuiteMutation = useDeleteBenchmarkSuite();

  const handleDeleteSuite = async (id: string) => {
    if (!confirm('Delete this benchmark suite and all its runs?')) return;
    try {
      await deleteSuiteMutation.mutateAsync(id);
      toast.success('Suite deleted');
    } catch {
      toast.error('Failed to delete suite');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Agent Benchmarks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define test suites and evaluate agent performance with simulated runs.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Suite
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Suites */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Suites ({suites?.length ?? 0})
          </h2>
          {suitesLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading suites…
            </div>
          ) : !suites || suites.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2 border rounded-lg">
              <FlaskConical className="h-8 w-8" />
              <p className="text-sm">No suites yet. Create one to get started.</p>
            </div>
          ) : (
            suites.map((suite) => (
              <SuiteCard
                key={suite.id}
                suite={suite}
                onRun={setRunningSuite}
                onDelete={handleDeleteSuite}
              />
            ))
          )}
        </div>

        {/* Right: Recent Runs */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Recent Runs ({runs?.length ?? 0})
          </h2>
          {runsLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading runs…
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2 border rounded-lg">
              <Trophy className="h-8 w-8" />
              <p className="text-sm">No runs yet. Select a suite and run it.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Suite</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Tests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs max-w-[100px] truncate">
                        {run.suite_name ?? run.suite_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[100px] truncate">
                        {run.agent_id}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-bold font-mono',
                          scoreColor(run.overall_score)
                        )}
                      >
                        {run.overall_score?.toFixed(1) ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {run.passed_tests}/{run.total_tests}
                      </TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setDetailRunId(run.id)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs & Sheets */}
      <CreateSuiteDialog open={showCreate} onOpenChange={setShowCreate} />
      <RunDialog suite={runningSuite} onClose={() => setRunningSuite(null)} />
      <RunDetailsSheet runId={detailRunId} onClose={() => setDetailRunId(null)} />
    </div>
  );
}
