/**
 * ApprovalsListView - pending approvals first (actionable), then recently
 * decided. Read + approve/reject over the canonical Agent OS approvals API.
 */

import React, { useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { RecoderLoader } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { ShieldCheck } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useApprovals } from '@/lib/conductor';
import { PENDING_APPROVAL_STATUSES } from '@/lib/conductor/types';
import { ApprovalCard } from './ApprovalCard';
import type { AgentOsApproval } from '@/lib/conductor/types';

function SectionHeader({ label }: { label: string }) {
  return (
    <Text className="px-1 pb-1 pt-2 text-xs font-roobert-medium uppercase text-muted-foreground">
      {label}
    </Text>
  );
}

export function ApprovalsListView() {
  const { colorScheme } = useColorScheme();
  const { data, isLoading, error, refetch, isRefetching } = useApprovals();

  const { pending, decided } = useMemo(() => {
    const all = data ?? [];
    return {
      pending: all.filter((a) => PENDING_APPROVAL_STATUSES.has(a.status)),
      decided: all.filter((a) => !PENDING_APPROVAL_STATUSES.has(a.status)),
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
          Loading approvals...
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
          A live Agent OS backend is required to review approvals.
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

  const approvals = data ?? [];

  if (approvals.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <EmptyState
          icon={ShieldCheck}
          title="No approvals"
          description="Approval requests from agent runs will appear here for you to approve or reject."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
    >
      {pending.length > 0 ? (
        <>
          <SectionHeader label={`Pending (${pending.length})`} />
          {pending.map((approval: AgentOsApproval) => (
            <ApprovalCard key={approval.approvalId} approval={approval} />
          ))}
        </>
      ) : null}

      {decided.length > 0 ? (
        <>
          <SectionHeader label="Recently decided" />
          {decided.map((approval: AgentOsApproval) => (
            <ApprovalCard key={approval.approvalId} approval={approval} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
