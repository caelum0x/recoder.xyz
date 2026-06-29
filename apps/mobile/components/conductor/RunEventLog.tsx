/**
 * RunEventLog - chronological RunEvents for a workspace's run (monitor detail).
 *
 * Read-only lifecycle + log feed. Each event renders its type, optional message,
 * and relative time. Polls via useWorkspaceEvents.
 */

import React, { useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { RecoderLoader } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Play,
  ArrowRightLeft,
  FileText,
  Package,
  HelpCircle,
  CheckCircle2,
  ShieldQuestion,
  GitFork,
  XCircle,
  CircleCheck,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useWorkspaceEvents } from '@/lib/conductor';
import { relativeTime } from './relative-time';
import type { ConductorRunEvent, RunEventType } from '@/lib/conductor/types';

const EVENT_ICON: Record<RunEventType, LucideIcon> = {
  started: Play,
  state_transition: ArrowRightLeft,
  log: FileText,
  artifact: Package,
  needs_input: HelpCircle,
  verified: CheckCircle2,
  approval_requested: ShieldQuestion,
  handoff: GitFork,
  failed: XCircle,
  completed: CircleCheck,
};

const EVENT_ICON_CLASS: Record<RunEventType, string> = {
  started: 'text-blue-500',
  state_transition: 'text-blue-500',
  log: 'text-muted-foreground',
  artifact: 'text-indigo-500',
  needs_input: 'text-purple-500',
  verified: 'text-green-500',
  approval_requested: 'text-purple-500',
  handoff: 'text-amber-500',
  failed: 'text-red-500',
  completed: 'text-green-500',
};

function EventRow({ event }: { event: ConductorRunEvent }) {
  const icon = EVENT_ICON[event.type] ?? FileText;
  const iconClass = EVENT_ICON_CLASS[event.type] ?? 'text-muted-foreground';
  const label = event.message || event.state || event.type.replace(/_/g, ' ');

  return (
    <View className="flex-row gap-2.5 rounded-lg border border-border bg-card p-3">
      <Icon as={icon} size={16} className={iconClass} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-xs font-roobert-medium uppercase text-muted-foreground">
            {event.type.replace(/_/g, ' ')}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {relativeTime(event.createdAt)}
          </Text>
        </View>
        <Text className="text-sm text-foreground" numberOfLines={4}>
          {label}
        </Text>
      </View>
    </View>
  );
}

interface RunEventLogProps {
  workspaceId: string;
}

export function RunEventLog({ workspaceId }: RunEventLogProps) {
  const { colorScheme } = useColorScheme();
  const { data, isLoading, error, refetch, isRefetching } = useWorkspaceEvents(workspaceId);

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
          Loading run events...
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
          Failed to load run events
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

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <EmptyState
          icon={FileText}
          title="No run events yet"
          description="Lifecycle and log events for this workspace's run will stream here."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 8 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
    >
      {events.map((event) => (
        <EventRow key={event.eventId} event={event} />
      ))}
    </ScrollView>
  );
}
