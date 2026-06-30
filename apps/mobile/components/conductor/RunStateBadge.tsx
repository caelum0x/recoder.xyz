/**
 * RunStateBadge - at-a-glance status for a canonical Agent OS TaskRun.
 *
 * Maps each TaskRunState to a colour + icon. `waiting_for_approval` and
 * `needs_input` are highlighted as action states (a human decision is owed).
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
  MessageCircleMore,
  PackageCheck,
  FileCheck2,
  Route,
  Hand,
  Hammer,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { TaskRunState } from '@/lib/conductor/types';

interface BadgeConfig {
  label: string;
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
  iconClass: string;
}

const GRAY: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-gray-100 dark:bg-gray-800/50',
  textClass: 'text-gray-600 dark:text-gray-400',
  iconClass: 'text-gray-500 dark:text-gray-500',
};

const BLUE: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-blue-100 dark:bg-blue-900/30',
  textClass: 'text-blue-700 dark:text-blue-300',
  iconClass: 'text-blue-600 dark:text-blue-400',
};

const AMBER: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-amber-100 dark:bg-amber-900/30',
  textClass: 'text-amber-700 dark:text-amber-300',
  iconClass: 'text-amber-600 dark:text-amber-400',
};

const PURPLE: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-purple-100 dark:bg-purple-900/30',
  textClass: 'text-purple-700 dark:text-purple-300',
  iconClass: 'text-purple-600 dark:text-purple-400',
};

const GREEN: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-green-100 dark:bg-green-900/30',
  textClass: 'text-green-700 dark:text-green-300',
  iconClass: 'text-green-600 dark:text-green-400',
};

const RED: Omit<BadgeConfig, 'label' | 'icon'> = {
  bgClass: 'bg-red-100 dark:bg-red-900/30',
  textClass: 'text-red-700 dark:text-red-300',
  iconClass: 'text-red-600 dark:text-red-400',
};

const STATE_CONFIG: Record<TaskRunState, BadgeConfig> = {
  created: { label: 'Created', icon: Circle, ...GRAY },
  compiled: { label: 'Compiled', icon: Hammer, ...BLUE },
  routed: { label: 'Routed', icon: Route, ...BLUE },
  claimed: { label: 'Claimed', icon: Hand, ...BLUE },
  running: { label: 'Running', icon: Loader, ...AMBER },
  needs_input: { label: 'Needs Input', icon: MessageCircleMore, ...PURPLE },
  verifying: { label: 'Verifying', icon: FileCheck2, ...AMBER },
  waiting_for_approval: { label: 'Needs Approval', icon: ShieldQuestion, ...PURPLE },
  approved: { label: 'Approved', icon: CheckCircle2, ...GREEN },
  delivered: { label: 'Delivered', icon: PackageCheck, ...GREEN },
  completed: { label: 'Completed', icon: CheckCircle2, ...GREEN },
  failed: { label: 'Failed', icon: XCircle, ...RED },
  cancelled: { label: 'Cancelled', icon: Ban, ...GRAY },
  rejected: { label: 'Rejected', icon: XCircle, ...RED },
};

interface RunStateBadgeProps {
  state: TaskRunState;
}

export function RunStateBadge({ state }: RunStateBadgeProps) {
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
