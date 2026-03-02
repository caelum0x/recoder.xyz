'use client';

import { type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/workspaces/use-workspaces';
import { useChannels } from '@/hooks/channels/use-channels';
import { ChannelSidebar } from '@/components/workspaces/channel-sidebar';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const wsId = params.workspaceId as string;
  const { data: workspace } = useWorkspace(wsId);
  useChannels(wsId);

  return (
    <div className="flex h-full">
      <ChannelSidebar workspaceId={wsId} workspaceName={workspace?.name ?? 'Workspace'} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
