/**
 * TaskDetailView - Detailed view for a single delegated A2A task
 *
 * Shows task info, current state badge, and a state timeline.
 * Emits `mobile_task_viewed` activation event on mount.
 */

import React, { useEffect, useMemo } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { RecoderLoader } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { ArrowLeft, Clock, User, Hash, FileText } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useDelegatedTask, useTaskApproval, useTaskActivationEvents } from '@/lib/a2a-tasks';
import { TaskStateBadge } from './TaskStateBadge';
import type { TaskState, TaskStateEntry } from '@/lib/a2a-tasks/types';

interface TaskDetailViewProps {
  taskId: string;
  onBack: () => void;
}

const STATE_ORDER: TaskState[] = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'failed',
  'cancelled',
];

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

export function TaskDetailView({ taskId, onBack }: TaskDetailViewProps) {
  const { colorScheme } = useColorScheme();
  const { data: task, isLoading, error, refetch, isRefetching } = useDelegatedTask(taskId);
  const { data: approval } = useTaskApproval(taskId);
  const { emitTaskViewed } = useTaskActivationEvents();

  // Fire activation event on mount
  useEffect(() => {
    emitTaskViewed(taskId);
  }, [taskId, emitTaskViewed]);

  // Build a timeline from state history or fall back to single entry
  const timeline: TaskStateEntry[] = useMemo(() => {
    if (task?.stateHistory && task.stateHistory.length > 0) {
      return task.stateHistory;
    }
    if (task) {
      return [{ state: task.state, timestamp: task.updatedAt }];
    }
    return [];
  }, [task]);

  if (isLoading && !task) {
    return (
      <View className="flex-1 items-center justify-center">
        <RecoderLoader size="small" />
        <Text
          style={{
            color: colorScheme === 'dark' ? 'rgba(248,248,248,0.6)' : 'rgba(18,18,21,0.6)',
          }}
          className="mt-2 text-sm font-roobert"
        >
          Loading task...
        </Text>
      </View>
    );
  }

  if (error && !task) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text
          style={{ color: colorScheme === 'dark' ? '#EF4444' : '#DC2626' }}
          className="mb-2 text-center text-sm font-roobert"
        >
          Failed to load task details
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

  if (!task) return null;

  const displayTitle = task.title || task.description || `Task ${task.id.slice(0, 8)}`;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
      }
    >
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Pressable onPress={onBack} className="active:opacity-60" hitSlop={12}>
          <Icon as={ArrowLeft} size={20} className="text-foreground" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-roobert-semibold text-lg text-foreground" numberOfLines={2}>
            {displayTitle}
          </Text>
        </View>
        <TaskStateBadge state={task.state} />
      </View>

      {/* Info Card */}
      <View className="rounded-xl border border-border bg-card p-4 gap-3">
        <InfoRow icon={Hash} label="Task ID" value={task.id} />
        {task.agentName && <InfoRow icon={User} label="Agent" value={task.agentName} />}
        {task.agentId && !task.agentName && (
          <InfoRow icon={User} label="Agent ID" value={task.agentId} />
        )}
        <InfoRow icon={Clock} label="Created" value={formatDate(task.createdAt)} />
        <InfoRow icon={Clock} label="Updated" value={formatDate(task.updatedAt)} />
        {task.description && task.title && (
          <InfoRow icon={FileText} label="Description" value={task.description} />
        )}
      </View>

      {/* Approval Info (if exists) */}
      {approval && (
        <View className="rounded-xl border border-border bg-card p-4 gap-2">
          <Text className="font-roobert-semibold text-sm text-foreground">Approval</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground">Status</Text>
            <Text className="text-xs font-roobert-medium text-foreground capitalize">
              {approval.status}
            </Text>
          </View>
          {approval.message && (
            <Text className="text-xs text-muted-foreground">{approval.message}</Text>
          )}
        </View>
      )}

      {/* State Timeline */}
      <View className="rounded-xl border border-border bg-card p-4 gap-3">
        <Text className="font-roobert-semibold text-sm text-foreground">State Timeline</Text>
        {timeline.length === 0 ? (
          <Text className="text-xs text-muted-foreground">No state history available</Text>
        ) : (
          <View className="gap-0">
            {timeline.map((entry, idx) => (
              <TimelineEntry
                key={`${entry.state}-${idx}`}
                entry={entry}
                isLast={idx === timeline.length - 1}
                isCurrent={idx === timeline.length - 1}
              />
            ))}
          </View>
        )}
      </View>

      {/* Artifacts */}
      {task.artifacts && task.artifacts.length > 0 && (
        <View className="rounded-xl border border-border bg-card p-4 gap-2">
          <Text className="font-roobert-semibold text-sm text-foreground">
            Artifacts ({task.artifacts.length})
          </Text>
          {task.artifacts.map((artifact, idx) => (
            <View
              key={idx}
              className="rounded-lg bg-muted p-2.5"
            >
              <Text className="text-xs font-roobert-medium text-foreground">
                {artifact.name || `Artifact ${idx + 1}`}
              </Text>
              {artifact.type && (
                <Text className="text-xs text-muted-foreground">{artifact.type}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ---- Sub-components ----

function InfoRow({
  icon: IconComponent,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start gap-2.5">
      <Icon as={IconComponent} size={14} className="mt-0.5 text-muted-foreground" />
      <View className="flex-1">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className="text-sm text-foreground" selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TimelineEntry({
  entry,
  isLast,
  isCurrent,
}: {
  entry: TaskStateEntry;
  isLast: boolean;
  isCurrent: boolean;
}) {
  return (
    <View className="flex-row">
      {/* Dot + line */}
      <View className="mr-3 items-center" style={{ width: 16 }}>
        <View
          className={`h-3 w-3 rounded-full ${
            isCurrent ? 'bg-primary' : 'bg-muted-foreground/40'
          }`}
        />
        {!isLast && (
          <View className="w-0.5 flex-1 bg-muted-foreground/20" style={{ minHeight: 24 }} />
        )}
      </View>
      {/* Content */}
      <View className="flex-1 pb-4">
        <View className="flex-row items-center gap-2">
          <TaskStateBadge state={entry.state} />
          <Text className="text-xs text-muted-foreground">
            {formatDate(entry.timestamp)}
          </Text>
        </View>
        {entry.message && (
          <Text className="mt-1 text-xs text-muted-foreground">{entry.message}</Text>
        )}
      </View>
    </View>
  );
}
