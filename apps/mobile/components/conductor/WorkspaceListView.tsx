/**
 * WorkspaceListView - scrollable list of Conductor workspaces (monitor).
 *
 * Pull-to-refresh + loading/error/empty states. Read-only: mobile observes
 * parallel agent workspaces but does not author or launch them.
 */

import React, { useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { RecoderLoader } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { LayoutGrid } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useWorkspaces } from '@/lib/conductor';
import { WorkspaceListItem } from './WorkspaceListItem';
import type { ConductorWorkspace } from '@/lib/conductor/types';

interface WorkspaceListViewProps {
  onWorkspacePress: (workspace: ConductorWorkspace) => void;
}

export function WorkspaceListView({ onWorkspacePress }: WorkspaceListViewProps) {
  const { colorScheme } = useColorScheme();
  const { data, isLoading, error, refetch, isRefetching } = useWorkspaces();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center" style={{ minHeight: 200 }}>
        <RecoderLoader size="small" />
        <Text
          style={{
            color: colorScheme === 'dark' ? 'rgba(248,248,248,0.6)' : 'rgba(18,18,21,0.6)',
          }}
          className="mt-2 text-sm font-roobert"
        >
          Loading workspaces...
        </Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text
          style={{ color: colorScheme === 'dark' ? '#EF4444' : '#DC2626' }}
          className="mb-2 text-center text-sm font-roobert"
        >
          Couldn&apos;t reach the agent control plane
        </Text>
        <Text
          style={{
            color: colorScheme === 'dark' ? 'rgba(248,248,248,0.5)' : 'rgba(18,18,21,0.5)',
          }}
          className="mb-3 text-center text-xs font-roobert"
        >
          A live Conductor backend is required to monitor workspaces.
        </Text>
        <Text
          onPress={() => refetch()}
          style={{ color: colorScheme === 'dark' ? '#f8f8f8' : '#121215' }}
          className="text-sm font-roobert-medium underline"
        >
          Retry
        </Text>
      </View>
    );
  }

  const workspaces = data ?? [];

  if (workspaces.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <EmptyState
          icon={LayoutGrid}
          title="No active workspaces"
          description="Parallel agent workspaces launched in Conductor will appear here."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
    >
      {workspaces.map((workspace) => (
        <WorkspaceListItem
          key={workspace.workspaceId}
          workspace={workspace}
          onPress={onWorkspacePress}
        />
      ))}
    </ScrollView>
  );
}
