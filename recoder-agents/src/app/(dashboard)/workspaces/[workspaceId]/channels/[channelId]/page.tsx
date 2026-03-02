'use client';

import { useParams } from 'next/navigation';
import { useChannelStore } from '@/stores/channel-store';
import { ChannelView } from '@/components/workspaces/channel-view';

export default function ChannelPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const wsId = params.workspaceId as string;
  const channel = useChannelStore((s) =>
    s.channels.find((ch) => ch.id === channelId),
  );

  return (
    <ChannelView
      channelId={channelId}
      channelName={channel?.name ?? channelId}
      workspaceId={wsId}
    />
  );
}
