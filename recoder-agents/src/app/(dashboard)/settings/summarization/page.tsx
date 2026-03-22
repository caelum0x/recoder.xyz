'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  List,
  CheckSquare,
  Zap,
  AlertCircle,
  Loader2,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import {
  useSummarizationStats,
  useSummarizationConfig,
  useUpdateSummarizationConfig,
  useSummarizeThread,
} from '@/hooks/threads/use-thread-summarization';
import type { SummarizationConfig, ThreadSummary, SummaryType, SummaryLength } from '@/lib/api/thread-summarization';

// ---- Stat Card ----

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm flex items-center gap-4">
      <div className="rounded-lg bg-primary/10 p-2.5 text-primary">{icon}</div>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ---- Config Section ----

interface ConfigFormProps {
  initial: SummarizationConfig;
}

function ConfigForm({ initial }: ConfigFormProps) {
  const [threshold, setThreshold] = useState(initial.auto_summarize_threshold);
  const [keyPoints, setKeyPoints] = useState(initial.include_key_points);
  const [actionItems, setActionItems] = useState(initial.include_action_items);
  const [length, setLength] = useState<SummaryLength>(initial.summary_length);

  const updateMutation = useUpdateSummarizationConfig();

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        auto_summarize_threshold: threshold,
        include_key_points: keyPoints,
        include_action_items: actionItems,
        summary_length: length,
      });
      toast.success('Config saved.');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save config.');
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
      <h2 className="text-lg font-semibold">Summarization Config</h2>

      <div className="space-y-2">
        <Label>Auto-summarize Threshold: {threshold} messages</Label>
        <Slider
          min={10}
          max={200}
          step={5}
          value={[threshold]}
          onValueChange={([v]) => setThreshold(v)}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          Trigger auto-summarization when a thread reaches this many messages.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="key_points"
          checked={keyPoints}
          onCheckedChange={setKeyPoints}
        />
        <Label htmlFor="key_points">Include Key Points</Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="action_items"
          checked={actionItems}
          onCheckedChange={setActionItems}
        />
        <Label htmlFor="action_items">Include Action Items</Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary_length">Summary Length</Label>
        <Select
          value={length}
          onValueChange={(v) => setLength(v as SummaryLength)}
        >
          <SelectTrigger id="summary_length" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="brief">Brief</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="detailed">Detailed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSave} disabled={updateMutation.isPending}>
        {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Config
      </Button>
    </div>
  );
}

// ---- Demo Section ----

function DemoSection() {
  const [messagesJson, setMessagesJson] = useState('');
  const [summaryType, setSummaryType] = useState<SummaryType>('manual');
  const [result, setResult] = useState<ThreadSummary | null>(null);

  const summarizeMutation = useSummarizeThread();

  const handleSummarize = async () => {
    let messages: Array<{ role: string; content: string }>;
    try {
      messages = JSON.parse(messagesJson);
      if (!Array.isArray(messages)) throw new Error('Must be an array.');
    } catch {
      toast.error('Invalid JSON. Paste a JSON array of {role, content} objects.');
      return;
    }

    try {
      const summary = await summarizeMutation.mutateAsync({
        threadId: 'demo',
        data: { messages, summary_type: summaryType },
      });
      setResult(summary);
      toast.success('Summarization complete.');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to summarize.');
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
      <h2 className="text-lg font-semibold">Test Summarization</h2>

      <div className="space-y-1.5">
        <Label htmlFor="messages_json">
          Messages (JSON array of {'{role, content}'} objects)
        </Label>
        <Textarea
          id="messages_json"
          value={messagesJson}
          onChange={(e) => setMessagesJson(e.target.value)}
          placeholder={`[\n  { "role": "user", "content": "Hello!" },\n  { "role": "assistant", "content": "Hi there, how can I help?" }\n]`}
          rows={8}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="summary_type_demo">Summary Type</Label>
          <Select
            value={summaryType}
            onValueChange={(v) => setSummaryType(v as SummaryType)}
          >
            <SelectTrigger id="summary_type_demo" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="checkpoint">Checkpoint</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSummarize} disabled={summarizeMutation.isPending}>
          {summarizeMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Summarize
        </Button>
      </div>

      {result && (
        <div className="space-y-4 pt-2 border-t">
          <div className="flex gap-2">
            <Badge variant="outline">{result.message_count} messages</Badge>
            <Badge variant="outline">{result.tokens_summarized} tokens</Badge>
            <Badge variant="outline">{result.summary_type}</Badge>
          </div>

          {/* Summary text */}
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <FileText className="h-4 w-4" />
              Summary
            </p>
            <p className="text-sm leading-relaxed">{result.summary_text}</p>
          </div>

          {/* Key Points */}
          {result.key_points.length > 0 && (
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <List className="h-4 w-4" />
                Key Points
              </p>
              <ul className="space-y-1">
                {result.key_points.map((point, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Items */}
          {result.action_items.length > 0 && (
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <CheckSquare className="h-4 w-4" />
                Action Items
              </p>
              <ul className="space-y-1.5">
                {result.action_items.map((item, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5 flex-shrink-0" readOnly />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Page ----

export default function SummarizationPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useSummarizationStats();
  const { data: config, isLoading: configLoading } = useSummarizationConfig();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thread Summarization</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure automatic summarization and test it with sample messages.
        </p>
      </div>

      {/* Stats */}
      {statsLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading stats...</span>
        </div>
      )}
      {statsError && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">Failed to load stats.</p>
        </div>
      )}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Summaries"
            value={stats.total_summaries}
            icon={<FileText className="h-5 w-5" />}
          />
          <StatCard
            label="Threads Summarized"
            value={stats.threads_summarized}
            icon={<List className="h-5 w-5" />}
          />
          <StatCard
            label="Avg Messages / Summary"
            value={stats.avg_message_count}
            icon={<Zap className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Config */}
      {configLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading config...</span>
        </div>
      )}
      {config && <ConfigForm initial={config} />}

      {/* Demo */}
      <DemoSection />
    </div>
  );
}
