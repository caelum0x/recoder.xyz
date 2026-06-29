/**
 * WorkspaceListItem - one row in the Conductor workspace monitor.
 *
 * Shows the workspace's task/branch, runtime, state badge, and last-updated
 * time. Read-only: tapping opens the detail (RunEvents) view.
 */

import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { GitBranch, Cpu } from 'lucide-react-native';
import { WorkspaceStateBadge } from './WorkspaceStateBadge';
import { relativeTime } from './relative-time';
import type { ConductorWorkspace } from '@/lib/conductor/types';

interface WorkspaceListItemProps {
  workspace: ConductorWorkspace;
  onPress: (workspace: ConductorWorkspace) => void;
}

export function WorkspaceListItem({ workspace, onPress }: WorkspaceListItemProps) {
  const title =
    workspace.taskId ||
    workspace.branch ||
    `Workspace ${workspace.workspaceId.slice(0, 8)}`;
  const timeAgo = useMemo(() => relativeTime(workspace.updatedAt), [workspace.updatedAt]);

  return (
    <Pressable
      onPress={() => onPress(workspace)}
      className="rounded-xl border border-border bg-card p-3.5 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="font-roobert-medium text-sm text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {workspace.branch ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={GitBranch} size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {workspace.branch}
              </Text>
            </View>
          ) : null}
        </View>
        <WorkspaceStateBadge state={workspace.state} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Cpu} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{workspace.runtimeId}</Text>
        </View>
        {timeAgo ? <Text className="text-xs text-muted-foreground">{timeAgo}</Text> : null}
      </View>
    </Pressable>
  );
}
