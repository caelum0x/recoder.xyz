/**
 * TaskListView - Scrollable list of delegated A2A tasks
 *
 * Emits `mobile_task_list_opened` activation event on mount.
 * Supports pull-to-refresh and loading/error/empty states.
 */

import React, { useCallback, useEffect } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { RecoderLoader } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClipboardList } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useDelegatedTasks, useTaskActivationEvents } from '@/lib/a2a-tasks';
import { TaskListItem } from './TaskListItem';
import type { DelegatedTask, TaskListParams } from '@/lib/a2a-tasks/types';

interface TaskListViewProps {
  params?: TaskListParams;
  onTaskPress: (task: DelegatedTask) => void;
}

export function TaskListView({ params, onTaskPress }: TaskListViewProps) {
  const { colorScheme } = useColorScheme();
  const { data, isLoading, error, refetch, isRefetching } = useDelegatedTasks(params);
  const { emitTaskListOpened } = useTaskActivationEvents();

  // Fire activation event on mount
  useEffect(() => {
    emitTaskListOpened();
  }, [emitTaskListOpened]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Loading
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
          Loading tasks...
        </Text>
      </View>
    );
  }

  // Error
  if (error && !data) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text
          style={{ color: colorScheme === 'dark' ? '#EF4444' : '#DC2626' }}
          className="mb-2 text-center text-sm font-roobert"
        >
          Failed to load delegated tasks
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

  const tasks = data?.tasks ?? [];

  // Empty
  if (tasks.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />
        }
      >
        <EmptyState
          icon={ClipboardList}
          title="No delegated tasks"
          description="Tasks delegated to agents via A2A will appear here."
        />
      </ScrollView>
    );
  }

  // List
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />
      }
    >
      {tasks.map((task) => (
        <TaskListItem key={task.id} task={task} onPress={onTaskPress} />
      ))}
    </ScrollView>
  );
}
