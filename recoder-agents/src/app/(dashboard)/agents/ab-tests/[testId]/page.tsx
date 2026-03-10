'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  FlaskConical,
  Trophy,
  Play,
  XCircle,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAbTest, useAbTestResults, useRecordTrial, useUpdateAbTest } from '@/hooks/agents/use-ab-tests';
import { useAgentsFromCache } from '@/hooks/agents/use-agents';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const METRIC_LABELS: Record<string, string> = {
  success_rate: 'Success Rate',
  latency: 'Avg Latency (ms)',
  cost: 'Avg Cost',
  user_rating: 'Avg Rating',
};

function RecordTrialDialog({ testId, agentAId, agentBId }: { testId: string; agentAId: string; agentBId: string }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<'A' | 'B'>('A');
  const [success, setSuccess] = useState(true);
  const [latencyMs, setLatencyMs] = useState('');
  const [cost, setCost] = useState('');
  const [tokensUsed, setTokensUsed] = useState('');
  const [userRating, setUserRating] = useState('');
  const [inputMessage, setInputMessage] = useState('');

  const recordTrial = useRecordTrial();

  const handleRecord = async () => {
    try {
      await recordTrial.mutateAsync({
        testId,
        data: {
          variant,
          agent_id: variant === 'A' ? agentAId : agentBId,
          success,
          latency_ms: latencyMs ? parseInt(latencyMs) : undefined,
          cost: cost ? parseFloat(cost) : undefined,
          tokens_used: tokensUsed ? parseInt(tokensUsed) : undefined,
          user_rating: userRating ? parseInt(userRating) : undefined,
          input_message: inputMessage || undefined,
        },
      });
      toast.success('Trial recorded');
      setOpen(false);
      setLatencyMs('');
      setCost('');
      setTokensUsed('');
      setUserRating('');
      setInputMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record trial');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Record Trial
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Trial Result</DialogTitle>
          <DialogDescription>
            Manually record the result of a trial run.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select value={variant} onValueChange={(v) => setVariant(v as 'A' | 'B')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Variant A</SelectItem>
                <SelectItem value="B">Variant B</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="trial-success">Success</Label>
            <Switch
              id="trial-success"
              checked={success}
              onCheckedChange={setSuccess}
            />
          </div>
          <div className="space-y-2">
            <Label>Input Message (optional)</Label>
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="What was the prompt?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Latency (ms)</Label>
              <Input
                type="number"
                value={latencyMs}
                onChange={(e) => setLatencyMs(e.target.value)}
                placeholder="e.g. 1200"
              />
            </div>
            <div className="space-y-2">
              <Label>Cost ($)</Label>
              <Input
                type="number"
                step="0.001"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="e.g. 0.05"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tokens Used</Label>
              <Input
                type="number"
                value={tokensUsed}
                onChange={(e) => setTokensUsed(e.target.value)}
                placeholder="e.g. 500"
              />
            </div>
            <div className="space-y-2">
              <Label>User Rating (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={userRating}
                onChange={(e) => setUserRating(e.target.value)}
                placeholder="1-5"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleRecord} disabled={recordTrial.isPending}>
            {recordTrial.isPending ? 'Recording...' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AbTestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const { data: test, isLoading } = useAbTest(testId);
  const { data: results } = useAbTestResults(testId);
  const updateTest = useUpdateAbTest();

  const agentIds = test ? [test.agent_a_id, test.agent_b_id] : [];
  const agentsMap = useAgentsFromCache(agentIds);
  const agentAName = agentsMap.get(test?.agent_a_id || '')?.name || test?.agent_a_id || 'Agent A';
  const agentBName = agentsMap.get(test?.agent_b_id || '')?.name || test?.agent_b_id || 'Agent B';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <RecoderLoader size="large" />
      </div>
    );
  }

  if (!test) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted-foreground">Test not found</p>
      </div>
    );
  }

  const progress = test.total_trials > 0
    ? Math.round((test.completed_trials / test.total_trials) * 100)
    : 0;

  const handleStart = async () => {
    try {
      await updateTest.mutateAsync({ testId: test.id, data: { status: 'running' } });
      toast.success('Test started');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start test');
    }
  };

  const handleCancel = async () => {
    try {
      await updateTest.mutateAsync({ testId: test.id, data: { status: 'cancelled' } });
      toast.success('Test cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel test');
    }
  };

  // Build chart data from results
  const chartData = results ? (() => {
    const metric = test.metric;
    const items: { name: string; A: number; B: number }[] = [];

    if (metric === 'success_rate') {
      items.push({
        name: 'Success Rate (%)',
        A: (results.variant_a.success_rate ?? 0) * 100,
        B: (results.variant_b.success_rate ?? 0) * 100,
      });
    }
    if (results.variant_a.avg_latency_ms != null || results.variant_b.avg_latency_ms != null) {
      items.push({
        name: 'Avg Latency (ms)',
        A: results.variant_a.avg_latency_ms ?? 0,
        B: results.variant_b.avg_latency_ms ?? 0,
      });
    }
    if (results.variant_a.avg_cost != null || results.variant_b.avg_cost != null) {
      items.push({
        name: 'Avg Cost ($)',
        A: results.variant_a.avg_cost ?? 0,
        B: results.variant_b.avg_cost ?? 0,
      });
    }
    if (results.variant_a.avg_rating != null || results.variant_b.avg_rating != null) {
      items.push({
        name: 'Avg Rating',
        A: results.variant_a.avg_rating ?? 0,
        B: results.variant_b.avg_rating ?? 0,
      });
    }
    return items;
  })() : [];

  return (
    <div className="h-[100dvh] overflow-auto bg-background px-4 sm:px-6 md:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/agents/ab-tests')}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              {test.name}
            </h1>
            {test.description && (
              <p className="text-muted-foreground text-sm">{test.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[test.status] || ''}>{test.status}</Badge>
            {test.status === 'draft' && (
              <Button size="sm" onClick={handleStart} className="gap-1">
                <Play className="h-3 w-3" /> Start
              </Button>
            )}
            {test.status === 'running' && (
              <>
                <RecordTrialDialog testId={test.id} agentAId={test.agent_a_id} agentBId={test.agent_b_id} />
                <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1">
                  <XCircle className="h-3 w-3" /> Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{test.completed_trials} / {test.total_trials} trials</span>
            </div>
            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>

        {/* Side-by-side comparison */}
        {results && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Variant A */}
              <Card className={results.winner === 'A' ? 'border-green-500/50' : ''}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Variant A: {agentAName}</span>
                    {results.winner === 'A' && (
                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 gap-1">
                        <Trophy className="h-3 w-3" /> Winner
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Trials</span><span>{results.variant_a.trial_count}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Success Rate</span><span>{results.variant_a.success_rate != null ? `${(results.variant_a.success_rate * 100).toFixed(1)}%` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Latency</span><span>{results.variant_a.avg_latency_ms != null ? `${results.variant_a.avg_latency_ms}ms` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Cost</span><span>{results.variant_a.avg_cost != null ? `$${results.variant_a.avg_cost}` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Rating</span><span>{results.variant_a.avg_rating != null ? `${results.variant_a.avg_rating}/5` : '-'}</span></div>
                </CardContent>
              </Card>

              {/* Variant B */}
              <Card className={results.winner === 'B' ? 'border-green-500/50' : ''}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Variant B: {agentBName}</span>
                    {results.winner === 'B' && (
                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 gap-1">
                        <Trophy className="h-3 w-3" /> Winner
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Trials</span><span>{results.variant_b.trial_count}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Success Rate</span><span>{results.variant_b.success_rate != null ? `${(results.variant_b.success_rate * 100).toFixed(1)}%` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Latency</span><span>{results.variant_b.avg_latency_ms != null ? `${results.variant_b.avg_latency_ms}ms` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Cost</span><span>{results.variant_b.avg_cost != null ? `$${results.variant_b.avg_cost}` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Rating</span><span>{results.variant_b.avg_rating != null ? `${results.variant_b.avg_rating}/5` : '-'}</span></div>
                </CardContent>
              </Card>
            </div>

            {/* Statistical Results */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Statistical Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Primary Metric</span>
                  <span className="font-medium">{METRIC_LABELS[test.metric]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Winner</span>
                  <span className="font-medium">
                    {results.winner ? `Variant ${results.winner} (${results.winner === 'A' ? agentAName : agentBName})` : 'No winner yet'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-medium">{results.confidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statistically Significant</span>
                  <Badge variant={results.statistical_test.significant ? 'default' : 'outline'}>
                    {results.statistical_test.significant ? 'Yes (p < 0.05)' : 'Not yet'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Bar Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Metric Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} barGap={8}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 12 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="A" name={`A: ${agentAName}`} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="B" name={`B: ${agentBName}`} fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Trial Log Table */}
        {test.trials && test.trials.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trial Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead>Input</TableHead>
                      <TableHead>Success</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {test.trials.map((trial) => (
                      <TableRow key={trial.id}>
                        <TableCell>
                          <Badge variant="outline">{trial.variant}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {trial.input_message || '-'}
                        </TableCell>
                        <TableCell>
                          {trial.success === null ? '-' : trial.success ? (
                            <Badge className="bg-green-500/10 text-green-600">Pass</Badge>
                          ) : (
                            <Badge className="bg-red-500/10 text-red-600">Fail</Badge>
                          )}
                        </TableCell>
                        <TableCell>{trial.latency_ms != null ? `${trial.latency_ms}ms` : '-'}</TableCell>
                        <TableCell>{trial.cost != null ? `$${trial.cost}` : '-'}</TableCell>
                        <TableCell>{trial.user_rating != null ? `${trial.user_rating}/5` : '-'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(trial.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
