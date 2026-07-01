/**
 * RunListItem - one row in the canonical Agent OS runs monitor.
 *
 * Shows the run's task, assignee agent, state badge, and last-updated time.
 * Read-only display: the decision surface for a run awaiting approval is the
 * Approvals tab, which posts to the canonical /api/agent-os/approvals API.
 */

import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Bot, Hash } from 'lucide-react-native';
import { RunStateBadge } from './RunStateBadge';
import { relativeTime } from './relative-time';
import type { AgentOsRun } from '@/lib/conductor/types';

interface RunListItemProps {
  run: AgentOsRun;
  /** When provided, the row becomes tappable (opens the run detail). */
  onPress?: () => void;
}

export function RunListItem({ run, onPress }: RunListItemProps) {
  const title = run.taskId || `Run ${run.runId.slice(0, 8)}`;
  const timeAgo = useMemo(
    () => relativeTime(run.updatedAt),
    [run.updatedAt],
  );

  const body = (
    <View className="rounded-xl border border-border bg-card p-3.5">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="font-roobert-medium text-sm text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Icon as={Hash} size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {run.runId}
            </Text>
          </View>
        </View>
        <RunStateBadge state={run.state} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Bot} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {run.assigneeAgentId || 'unassigned'}
          </Text>
        </View>
        {timeAgo ? <Text className="text-xs text-muted-foreground">{timeAgo}</Text> : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
