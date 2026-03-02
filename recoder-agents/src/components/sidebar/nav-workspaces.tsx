'use client';

import { useRouter } from 'next/navigation';
import { Hash, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaces } from '@/hooks/workspaces/use-workspaces';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function NavWorkspaces() {
  const router = useRouter();
  const { data, isLoading } = useWorkspaces();
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workspaces
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => router.push('/workspaces')}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : data?.workspaces.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No workspaces yet
        </p>
      ) : (
        data?.workspaces.map((ws) => (
          <button
            key={ws.workspaceId}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full hover:bg-accent/50 transition-colors text-left ${
              currentWorkspaceId === ws.workspaceId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
            }`}
            onClick={() => {
              setCurrentWorkspace(ws.workspaceId);
              router.push(`/workspaces/${ws.workspaceId}`);
            }}
          >
            <Hash className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{ws.name}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {ws.memberAgentIds.length}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
