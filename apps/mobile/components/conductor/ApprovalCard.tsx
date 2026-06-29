/**
 * ApprovalCard - a single Agent OS approval with approve/reject actions.
 *
 * Pending/escalated approvals show Approve + Reject buttons that call the
 * canonical /api/agent-os/approvals/:id/{approve,reject} decision API. Decided
 * approvals render read-only with their outcome.
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast-provider';
import { Check, X, ShieldQuestion, ShieldCheck, ShieldX } from 'lucide-react-native';
import { useDecideApproval } from '@/lib/conductor';
import { PENDING_APPROVAL_STATUSES } from '@/lib/conductor/types';
import { relativeTime } from './relative-time';
import type { AgentOsApproval } from '@/lib/conductor/types';

interface ApprovalCardProps {
  approval: AgentOsApproval;
}

function targetSummary(approval: AgentOsApproval): string | null {
  const t = approval.target;
  if (!t) return null;
  return t.command || t.path || t.toolName || null;
}

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const toast = useToast();
  const approveMutation = useDecideApproval('approve');
  const rejectMutation = useDecideApproval('reject');

  const isPending = PENDING_APPROVAL_STATUSES.has(approval.status);
  const busy = approveMutation.isPending || rejectMutation.isPending;

  const handleApprove = useCallback(() => {
    approveMutation.mutate(
      { approvalId: approval.approvalId },
      {
        onSuccess: () => toast.success('Approval granted'),
        onError: (err) => toast.error(err.message || 'Failed to approve'),
      },
    );
  }, [approveMutation, approval.approvalId, toast]);

  const handleReject = useCallback(() => {
    rejectMutation.mutate(
      { approvalId: approval.approvalId },
      {
        onSuccess: () => toast.success('Approval rejected'),
        onError: (err) => toast.error(err.message || 'Failed to reject'),
      },
    );
  }, [rejectMutation, approval.approvalId, toast]);

  const target = targetSummary(approval);

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start gap-2.5">
        <Icon
          as={
            approval.status === 'approved'
              ? ShieldCheck
              : approval.status === 'rejected'
                ? ShieldX
                : ShieldQuestion
          }
          size={18}
          className={
            approval.status === 'approved'
              ? 'text-green-500'
              : approval.status === 'rejected'
                ? 'text-red-500'
                : 'text-purple-500'
          }
        />
        <View className="flex-1 gap-1">
          <Text className="font-roobert-medium text-sm text-foreground">
            {approval.reason || 'Approval required'}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {approval.requiredAt.replace(/_/g, ' ')} · {relativeTime(approval.requestedAt)}
          </Text>
        </View>
      </View>

      {target ? (
        <View className="rounded-lg bg-muted px-3 py-2">
          <Text className="text-xs text-muted-foreground" numberOfLines={3}>
            {target}
          </Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-x-4 gap-y-0.5">
        {approval.taskId ? (
          <Text className="text-xs text-muted-foreground">task: {approval.taskId}</Text>
        ) : null}
        {approval.runId ? (
          <Text className="text-xs text-muted-foreground">run: {approval.runId}</Text>
        ) : null}
      </View>

      {isPending ? (
        <View className="flex-row gap-2.5">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onPress={handleApprove}
            disabled={busy}
          >
            <Icon as={Check} size={16} className="text-primary-foreground" />
            <Text>Approve</Text>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onPress={handleReject}
            disabled={busy}
          >
            <Icon as={X} size={16} className="text-white" />
            <Text>Reject</Text>
          </Button>
        </View>
      ) : (
        <View className="rounded-lg bg-muted px-3 py-2">
          <Text className="text-xs text-muted-foreground">
            {approval.status === 'approved' ? 'Approved' : 'Rejected'}
            {approval.decidedBy ? ` by ${approval.decidedBy}` : ''}
            {approval.decidedAt ? ` · ${relativeTime(approval.decidedAt)}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}
