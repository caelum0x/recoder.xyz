/**
 * TaskStateBadge - Visual indicator for A2A delegated task states
 *
 * Maps each task state to a colour and icon to provide at-a-glance status.
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import {
  Clock,
  Loader,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { TaskState } from '@/lib/a2a-tasks/types';

interface StateBadgeConfig {
  label: string;
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
  iconClass: string;
}

const STATE_CONFIG: Record<TaskState, StateBadgeConfig> = {
  submitted: {
    label: 'Submitted',
    icon: Clock,
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-300',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  working: {
    label: 'Working',
    icon: Loader,
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-300',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  'input-required': {
    label: 'Input Required',
    icon: HelpCircle,
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    textClass: 'text-purple-700 dark:text-purple-300',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  completed: {
    label: 'Completed',
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
};

interface TaskStateBadgeProps {
  state: TaskState;
  compact?: boolean;
}

export function TaskStateBadge({ state, compact = false }: TaskStateBadgeProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.submitted;

  if (compact) {
    return (
      <View className={`h-2.5 w-2.5 rounded-full ${config.bgClass}`} />
    );
  }

  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${config.bgClass}`}>
      <Icon as={config.icon} size={12} className={config.iconClass} />
      <Text className={`text-xs font-roobert-medium ${config.textClass}`}>
        {config.label}
      </Text>
    </View>
  );
}
