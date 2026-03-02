'use client';

import { useParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/workspaces/use-workspaces';
import { ChannelView } from '@/components/workspaces/channel-view';

export default function WorkspacePage() {
  const params = useParams();
  const wsId = params.workspaceId as string;
  const { data: workspace } = useWorkspace(wsId);

  return (
    <ChannelView
      channelId={workspace?.defaultChannelId ?? null}
      channelName="general"
      workspaceId={wsId}
    />
  );
}
