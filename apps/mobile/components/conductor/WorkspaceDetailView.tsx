/**
 * WorkspaceDetailView - header (workspace metadata + state) + RunEvent log.
 *
 * Read-only monitor detail for a single Conductor workspace.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ArrowLeft, GitBranch } from 'lucide-react-native';
import { WorkspaceStateBadge } from './WorkspaceStateBadge';
import { RunEventLog } from './RunEventLog';
import type { ConductorWorkspace } from '@/lib/conductor/types';

interface WorkspaceDetailViewProps {
  workspace: ConductorWorkspace;
  onBack: () => void;
}

export function WorkspaceDetailView({ workspace, onBack }: WorkspaceDetailViewProps) {
  const title =
    workspace.taskId ||
    workspace.branch ||
    `Workspace ${workspace.workspaceId.slice(0, 8)}`;

  return (
    <View className="flex-1">
      <View className="gap-3 border-b border-border px-4 pb-3 pt-2">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={onBack} className="active:opacity-60" hitSlop={12}>
            <Icon as={ArrowLeft} size={20} className="text-foreground" />
          </Pressable>
          <Text className="flex-1 font-roobert-semibold text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <WorkspaceStateBadge state={workspace.state} />
        </View>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          {workspace.branch ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={GitBranch} size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{workspace.branch}</Text>
            </View>
          ) : null}
          <Text className="text-xs text-muted-foreground">runtime: {workspace.runtimeId}</Text>
          <Text className="text-xs text-muted-foreground">substrate: {workspace.substrate}</Text>
        </View>
      </View>
      <RunEventLog workspaceId={workspace.workspaceId} />
    </View>
  );
}
