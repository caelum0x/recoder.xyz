/**
 * RunsListView - scrollable list of canonical Agent OS runs (monitor).
 *
 * Active (non-terminal) runs are shown first, with runs awaiting a human
 * decision highlighted, then recently finished runs. Read-only: mobile observes
 * the state-of-record TaskRun lifecycle but does not author or launch runs.
 * Approve/deny happens on the Approvals tab via the canonical approvals API.
 */

import React, { useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { RecoderLoader } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { Activity } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRuns } from '@/lib/conductor';
import {
  APPROVAL_WAITING_RUN_STATES,
  TERMINAL_TASK_RUN_STATES,
} from '@/lib/conductor/types';
import { RunListItem } from './RunListItem';
import type { AgentOsRun } from '@/lib/conductor/types';

function SectionHeader({ label }: { label: string }) {
  return (
    <Text className="px-1 pb-1 pt-2 text-xs font-roobert-medium uppercase text-muted-foreground">
      {label}
    </Text>
  );
}

interface RunsListViewProps {
  /** When provided, each run row is tappable and opens the run detail. */
  onRunPress?: (run: AgentOsRun) => void;
}

export function RunsListView({ onRunPress }: RunsListViewProps = {}) {
  const { colorScheme } = useColorScheme();
  const { data, isLoading, error, refetch, isRefetching } = useRuns();

  const { active, finished } = useMemo(() => {
    const all = data ?? [];
    const isActive = (r: AgentOsRun) => !TERMINAL_TASK_RUN_STATES.has(r.state);
    // Surface approval-waiting runs first within the active group — they are the
    // actionable ones the user is here to handle.
    const activeRuns = all.filter(isActive).sort((a, b) => {
      const aWaiting = APPROVAL_WAITING_RUN_STATES.has(a.state) ? 0 : 1;
      const bWaiting = APPROVAL_WAITING_RUN_STATES.has(b.state) ? 0 : 1;
      return aWaiting - bWaiting;
    });
    return {
      active: activeRuns,
      finished: all.filter((r) => !isActive(r)),
    };
  }, [data]);

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
          Loading runs...
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
          A live Agent OS backend is required to monitor runs.
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

  const runs = data ?? [];

  if (runs.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <EmptyState
          icon={Activity}
          title="No active runs"
          description="Agent runs launched in the control plane will appear here. Approve or reject pending decisions on the Approvals tab."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
    >
      {active.length > 0 ? (
        <>
          <SectionHeader label={`Active (${active.length})`} />
          {active.map((run) => (
            <RunListItem
              key={run.runId}
              run={run}
              onPress={onRunPress ? () => onRunPress(run) : undefined}
            />
          ))}
        </>
      ) : null}

      {finished.length > 0 ? (
        <>
          <SectionHeader label="Recently finished" />
          {finished.map((run) => (
            <RunListItem
              key={run.runId}
              run={run}
              onPress={onRunPress ? () => onRunPress(run) : undefined}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
