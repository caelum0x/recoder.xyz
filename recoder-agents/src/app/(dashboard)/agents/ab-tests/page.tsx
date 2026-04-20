'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Plus, Play, XCircle, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAbTests, useCreateAbTest, useUpdateAbTest, useDeleteAbTest } from '@/hooks/agents/use-ab-tests';
import { useAgents } from '@/hooks/agents/use-agents';
import { useAuth } from '@/components/AuthProvider';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import type { AbTest } from '@/lib/api/ab-tests';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const METRIC_LABELS: Record<string, string> = {
  success_rate: 'Success Rate',
  latency: 'Latency',
  cost: 'Cost',
  user_rating: 'User Rating',
};

function NewTestDialog() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentAId, setAgentAId] = useState<string | undefined>(undefined);
  const [agentBId, setAgentBId] = useState<string | undefined>(undefined);
  const [metric, setMetric] = useState('success_rate');
  const [totalTrials, setTotalTrials] = useState(20);

  const { data: agents } = useAgents({}, { enabled: open && !!user && !isAuthLoading });
  const createTest = useCreateAbTest();

  const handleCreate = async () => {
    if (!name || !agentAId || !agentBId) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (agentAId === agentBId) {
      toast.error('Agent A and Agent B must be different');
      return;
    }
    try {
      await createTest.mutateAsync({
        name,
        description: description || undefined,
        agent_a_id: agentAId,
        agent_b_id: agentBId,
        metric,
        total_trials: totalTrials,
      });
      toast.success('A/B test created');
      setOpen(false);
      setName('');
      setDescription('');
      setAgentAId(undefined);
      setAgentBId(undefined);
      setMetric('success_rate');
      setTotalTrials(20);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create test');
    }
  };

  const agentList = Array.isArray(agents) ? agents : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New A/B Test
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create A/B Test</DialogTitle>
          <DialogDescription>
            Compare two agents head-to-head on a chosen metric.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="test-name">Name</Label>
            <Input
              id="test-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GPT vs Claude for summaries"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-desc">Description (optional)</Label>
            <Input
              id="test-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you testing?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agent A</Label>
              <Select value={agentAId} onValueChange={setAgentAId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentList.map((a: any) => (
                    <SelectItem key={a.agent_id} value={a.agent_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agent B</Label>
              <Select value={agentBId} onValueChange={setAgentBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentList.map((a: any) => (
                    <SelectItem key={a.agent_id} value={a.agent_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Metric</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success_rate">Success Rate</SelectItem>
                  <SelectItem value="latency">Latency</SelectItem>
                  <SelectItem value="cost">Cost</SelectItem>
                  <SelectItem value="user_rating">User Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trials">Total Trials</Label>
              <Input
                id="trials"
                type="number"
                min={2}
                max={1000}
                value={totalTrials}
                onChange={(e) => setTotalTrials(parseInt(e.target.value) || 20)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createTest.isPending}>
            {createTest.isPending ? 'Creating...' : 'Create Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestCard({ test }: { test: AbTest }) {
  const updateTest = useUpdateAbTest();
  const deleteTest = useDeleteAbTest();
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

  const handleDelete = async () => {
    try {
      await deleteTest.mutateAsync(test.id);
      toast.success('Test deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete test');
    }
  };

  return (
    <Card className="group hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base truncate">{test.name}</CardTitle>
            {test.description && (
              <CardDescription className="line-clamp-1">{test.description}</CardDescription>
            )}
          </div>
          <Badge className={STATUS_COLORS[test.status] || ''}>
            {test.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Metric: {METRIC_LABELS[test.metric]}</span>
          <span>{test.completed_trials}/{test.total_trials} trials</span>
        </div>
        <Progress value={progress} className="h-2" />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {test.status === 'draft' && (
              <Button size="sm" variant="outline" onClick={handleStart} className="gap-1">
                <Play className="h-3 w-3" /> Start
              </Button>
            )}
            {test.status === 'running' && (
              <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1">
                <XCircle className="h-3 w-3" /> Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <Link href={`/agents/ab-tests/${test.id}`}>
            <Button size="sm" variant="ghost" className="gap-1">
              Details <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AbTestsPage() {
  const { data: tests, isLoading } = useAbTests();

  return (
    <div className="h-[100dvh] overflow-auto bg-background px-4 sm:px-6 md:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              A/B Tests
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Compare agents head-to-head with controlled experiments
            </p>
          </div>
          <NewTestDialog />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RecoderLoader size="large" />
          </div>
        ) : !tests || tests.length === 0 ? (
          <Card className="py-16">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <FlaskConical className="h-12 w-12 text-muted-foreground/50" />
              <div>
                <h3 className="text-lg font-medium">No A/B tests yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first test to compare two agents on a metric.
                </p>
              </div>
              <NewTestDialog />
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tests.map((test) => (
              <TestCard key={test.id} test={test} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
