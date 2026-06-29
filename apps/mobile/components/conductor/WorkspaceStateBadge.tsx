/**
 * WorkspaceStateBadge - at-a-glance status for a Conductor workspace.
 *
 * Maps each WorkspaceState to a colour + icon. `awaiting_approval` and
 * `awaiting_review` are highlighted as action states.
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import {
  Circle,
  Loader,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldQuestion,
  Eye,
  GitMerge,
  GitPullRequestArrow,
  Archive,
  Wrench,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { WorkspaceState } from '@/lib/conductor/types';

interface BadgeConfig {
  label: string;
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
  iconClass: string;
}

const STATE_CONFIG: Record<WorkspaceState, BadgeConfig> = {
  created: {
    label: 'Created',
    icon: Circle,
    bgClass: 'bg-gray-100 dark:bg-gray-800/50',
    textClass: 'text-gray-600 dark:text-gray-400',
    iconClass: 'text-gray-500 dark:text-gray-500',
  },
  setting_up: {
    label: 'Setting Up',
    icon: Wrench,
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-300',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  ready: {
    label: 'Ready',
    icon: Circle,
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-300',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  running: {
    label: 'Running',
    icon: Loader,
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-300',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  awaiting_approval: {
    label: 'Needs Approval',
    icon: ShieldQuestion,
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    textClass: 'text-purple-700 dark:text-purple-300',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  awaiting_review: {
    label: 'Needs Review',
    icon: Eye,
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    textClass: 'text-purple-700 dark:text-purple-300',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  changes_requested: {
    label: 'Changes Requested',
    icon: GitPullRequestArrow,
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
    textClass: 'text-orange-700 dark:text-orange-300',
    iconClass: 'text-orange-600 dark:text-orange-400',
  },
  merging: {
    label: 'Merging',
    icon: GitMerge,
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-300',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  merged: {
    label: 'Merged',
    icon: CheckCircle2,
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    textClass: 'text-green-700 dark:text-green-300',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    textClass: 'text-red-700 dark:text-red-300',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    bgClass: 'bg-gray-100 dark:bg-gray-800/50',
    textClass: 'text-gray-600 dark:text-gray-400',
    iconClass: 'text-gray-500 dark:text-gray-500',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    bgClass: 'bg-gray-100 dark:bg-gray-800/50',
    textClass: 'text-gray-600 dark:text-gray-400',
    iconClass: 'text-gray-500 dark:text-gray-500',
  },
};

interface WorkspaceStateBadgeProps {
  state: WorkspaceState;
}

export function WorkspaceStateBadge({ state }: WorkspaceStateBadgeProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.created;

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${config.bgClass}`}
    >
      <Icon as={config.icon} size={12} className={config.iconClass} />
      <Text className={`text-xs font-roobert-medium ${config.textClass}`}>
        {config.label}
      </Text>
    </View>
  );
}
