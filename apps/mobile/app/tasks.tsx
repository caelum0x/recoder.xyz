/**
 * Delegated Tasks Screen (SFA-019)
 *
 * Shows a list of A2A delegated tasks with state badges.
 * Tapping a task opens its detail view with state timeline.
 * Wired into the Expo Router Stack navigation.
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ArrowLeft, ClipboardList } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { TaskListView, TaskDetailView } from '@/components/tasks';
import type { DelegatedTask } from '@/lib/a2a-tasks/types';

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleTaskPress = useCallback((task: DelegatedTask) => {
    setSelectedTaskId(task.id);
  }, []);

  const handleBack = useCallback(() => {
    if (selectedTaskId) {
      setSelectedTaskId(null);
    } else {
      router.back();
    }
  }, [selectedTaskId, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
      >
        {/* Header */}
        {!selectedTaskId && (
          <View className="flex-row items-center gap-3 px-4 pb-3 pt-2">
            <Pressable onPress={() => router.back()} className="active:opacity-60" hitSlop={12}>
              <Icon as={ArrowLeft} size={20} className="text-foreground" />
            </Pressable>
            <Icon as={ClipboardList} size={20} className="text-foreground" />
            <Text className="flex-1 font-roobert-semibold text-lg text-foreground">
              Delegated Tasks
            </Text>
          </View>
        )}

        {/* Content */}
        {selectedTaskId ? (
          <TaskDetailView taskId={selectedTaskId} onBack={handleBack} />
        ) : (
          <TaskListView onTaskPress={handleTaskPress} />
        )}
      </View>
    </>
  );
}
