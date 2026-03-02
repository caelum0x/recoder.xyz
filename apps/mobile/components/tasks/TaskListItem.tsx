/**
 * TaskListItem - A single row in the delegated task list
 *
 * Displays task title, state badge, agent name, and relative timestamp.
 */

import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { TaskStateBadge } from './TaskStateBadge';
import type { DelegatedTask } from '@/lib/a2a-tasks/types';

interface TaskListItemProps {
  task: DelegatedTask;
  onPress: (task: DelegatedTask) => void;
}

function relativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

export function TaskListItem({ task, onPress }: TaskListItemProps) {
  const displayTitle = task.title || task.description || `Task ${task.id.slice(0, 8)}`;
  const timeAgo = useMemo(() => relativeTime(task.updatedAt), [task.updatedAt]);

  return (
    <Pressable
      onPress={() => onPress(task)}
      className="rounded-xl border border-border bg-card p-3.5 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text
            className="font-roobert-medium text-sm text-foreground"
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
          {task.agentName && (
            <Text
              className="text-xs text-muted-foreground"
              numberOfLines={1}
            >
              Agent: {task.agentName}
            </Text>
          )}
        </View>
        <TaskStateBadge state={task.state} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">
          ID: {task.id.length > 12 ? `${task.id.slice(0, 12)}...` : task.id}
        </Text>
        {timeAgo ? (
          <Text className="text-xs text-muted-foreground">{timeAgo}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
