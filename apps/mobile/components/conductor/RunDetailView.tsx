/**
 * RunDetailView — read-only detail for a single Agent OS run: metadata + state.
 *
 * Runs are the canonical control-plane record (GET /api/agent-os/runs); they are
 * NOT conductor workspaces, so there is no live event stream here — the rich
 * RunEvent log lives on the Workspaces tab. A run awaiting approval is decided on
 * the Approvals tab. This view surfaces the run's full metadata truthfully; it
 * never fabricates fields (missing values render as "—" / "unassigned").
 */

import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ArrowLeft, Bot } from 'lucide-react-native';
import { RunStateBadge } from './RunStateBadge';
import { relativeTime } from './relative-time';
import type { AgentOsRun } from '@/lib/conductor/types';

interface RunDetailViewProps {
  run: AgentOsRun;
  onBack: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border/50 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-xs text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function RunDetailView({ run, onBack }: RunDetailViewProps) {
  const title = run.taskId || `Run ${run.runId.slice(0, 8)}`;

  return (
    <View className="flex-1">
      <View className="gap-3 border-b border-border px-4 pb-3 pt-2">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={onBack} className="active:opacity-60" hitSlop={12}>
            <Icon as={ArrowLeft} size={20} className="text-foreground" />
          </Pressable>
          <Text
            className="flex-1 font-roobert-semibold text-base text-foreground"
            numberOfLines={1}
          >
            {title}
          </Text>
          <RunStateBadge state={run.state} />
        </View>
        <View className="flex-row items-center gap-1.5">
          <Icon as={Bot} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {run.assigneeAgentId || 'unassigned'}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-3">
        <MetaRow label="Run ID" value={run.runId} />
        <MetaRow label="Task" value={run.taskId || '—'} />
        <MetaRow label="Space" value={run.spaceId || '—'} />
        <MetaRow label="Assignee" value={run.assigneeAgentId || 'unassigned'} />
        {run.instructionBundleId ? (
          <MetaRow label="Instructions" value={run.instructionBundleId} />
        ) : null}
        {run.startedAt ? (
          <MetaRow label="Started" value={relativeTime(run.startedAt) || run.startedAt} />
        ) : null}
        <MetaRow label="Updated" value={relativeTime(run.updatedAt) || run.updatedAt} />
        {run.completedAt ? (
          <MetaRow label="Completed" value={relativeTime(run.completedAt) || run.completedAt} />
        ) : null}
        <Text className="mb-8 mt-4 text-xs text-muted-foreground">
          Live logs stream on the Workspaces tab. Approvals are decided on the Approvals tab.
        </Text>
      </ScrollView>
    </View>
  );
}
