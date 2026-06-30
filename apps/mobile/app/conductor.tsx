/**
 * Conductor Monitor + Approve Screen.
 *
 * Mobile is a READ-ONLY monitor + approve surface for the Recoder agent control
 * plane (not an authoring surface). Three tabs:
 *   - Runs:       list canonical Agent OS runs (state-of-record TaskRun lifecycle)
 *                 with active/approval-waiting runs surfaced first.
 *   - Workspaces: list parallel agent workspaces + run state, tap to view RunEvents.
 *   - Approvals:  review pending approvals and approve/reject them via the
 *                 canonical Agent OS approvals API.
 *
 * Wired into the Expo Router Stack navigation (see app/_layout.tsx).
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ArrowLeft, Activity, LayoutGrid, ShieldQuestion } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RunsListView,
  WorkspaceListView,
  WorkspaceDetailView,
  ApprovalsListView,
} from '@/components/conductor';
import type { ConductorWorkspace } from '@/lib/conductor/types';

type ConductorTab = 'runs' | 'workspaces' | 'approvals';

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: typeof LayoutGrid;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
        active ? 'bg-card' : ''
      }`}
    >
      <Icon
        as={icon}
        size={15}
        className={active ? 'text-foreground' : 'text-muted-foreground'}
      />
      <Text
        className={`text-sm font-roobert-medium ${
          active ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ConductorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<ConductorTab>('runs');
  const [selectedWorkspace, setSelectedWorkspace] = useState<ConductorWorkspace | null>(null);

  const handleWorkspacePress = useCallback((workspace: ConductorWorkspace) => {
    setSelectedWorkspace(workspace);
  }, []);

  const handleDetailBack = useCallback(() => {
    setSelectedWorkspace(null);
  }, []);

  const showDetail = tab === 'workspaces' && selectedWorkspace;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {showDetail ? (
          <WorkspaceDetailView workspace={selectedWorkspace} onBack={handleDetailBack} />
        ) : (
          <>
            <View className="flex-row items-center gap-3 px-4 pb-2 pt-2">
              <Pressable
                onPress={() => router.back()}
                className="active:opacity-60"
                hitSlop={12}
              >
                <Icon as={ArrowLeft} size={20} className="text-foreground" />
              </Pressable>
              <Text className="flex-1 font-roobert-semibold text-lg text-foreground">
                Conductor
              </Text>
            </View>

            <View className="mx-4 mb-3 flex-row gap-1 rounded-xl bg-muted p-1">
              <TabButton
                active={tab === 'runs'}
                label="Runs"
                icon={Activity}
                onPress={() => setTab('runs')}
              />
              <TabButton
                active={tab === 'workspaces'}
                label="Workspaces"
                icon={LayoutGrid}
                onPress={() => setTab('workspaces')}
              />
              <TabButton
                active={tab === 'approvals'}
                label="Approvals"
                icon={ShieldQuestion}
                onPress={() => setTab('approvals')}
              />
            </View>

            {tab === 'runs' ? (
              <RunsListView />
            ) : tab === 'workspaces' ? (
              <WorkspaceListView onWorkspacePress={handleWorkspacePress} />
            ) : (
              <ApprovalsListView />
            )}
          </>
        )}
      </View>
    </>
  );
}
