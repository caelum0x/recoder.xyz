'use client';

import { useState } from 'react';
import { FolderGit2, Github, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useAgentOsSpaces,
  useConnectAgentOsRepository,
  type AgentOsSpace,
} from '@/hooks/workspaces/use-mission-control';

/**
 * Parse `owner` and `name` from a GitHub URL or a bare `owner/repo` slug.
 * Returns null when the input cannot be resolved to both parts.
 */
export function parseGitHubRepoInput(
  raw: string,
): { owner: string; name: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], name: urlMatch[2] };
  }

  const slugMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slugMatch) {
    return { owner: slugMatch[1], name: slugMatch[2] };
  }

  return null;
}

function SpaceCard({
  space,
  onConnect,
  isConnecting,
  connectingSpaceId,
}: {
  space: AgentOsSpace;
  onConnect: (spaceId: string, raw: string, branch: string) => void;
  isConnecting: boolean;
  connectingSpaceId?: string;
}) {
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('');
  const [open, setOpen] = useState(space.repositories.length === 0);
  const parsed = parseGitHubRepoInput(repoInput);
  const busy = isConnecting && connectingSpaceId === space.spaceId;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {space.displayName || space.spaceId}
          </span>
        </div>
        <Badge variant="outline" className="shrink-0 rounded px-2 py-0.5 text-[11px]">
          {space.repositories.length} repo
          {space.repositories.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {space.repositories.length > 0 ? (
        <div className="mt-2 space-y-1">
          {space.repositories.map((repo) => (
            <div
              key={repo.repoId}
              className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="inline-flex min-w-0 items-center gap-1">
                <Github className="h-3 w-3 shrink-0" />
                {repo.url ? (
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate underline-offset-4 hover:underline"
                  >
                    {repo.owner}/{repo.name}
                  </a>
                ) : (
                  <span className="truncate">
                    {repo.owner}/{repo.name}
                  </span>
                )}
              </span>
              {repo.defaultBranch ? (
                <span className="shrink-0 text-muted-foreground">
                  {repo.defaultBranch}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
          <Input
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="owner/repo or github.com URL"
            className="h-8 text-sm"
            aria-label={`Repository for ${space.displayName || space.spaceId}`}
          />
          <Input
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="main"
            className="h-8 text-sm"
            aria-label="Default branch"
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!parsed || busy}
            onClick={() => onConnect(space.spaceId, repoInput, branch)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Connect'
            )}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-7 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Connect another repo
        </Button>
      )}
      {repoInput.trim() && !parsed ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          Enter a GitHub URL or owner/repo slug.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Lists Agent OS control-plane Spaces and lets the operator connect GitHub
 * repositories to them — the 'connect repo' step of the paid-user loop.
 */
export function SpacesRepositories() {
  const { data: spaces, isLoading, isError, error } = useAgentOsSpaces();
  const connectRepository = useConnectAgentOsRepository();

  const handleConnect = (spaceId: string, raw: string, branch: string) => {
    const parsed = parseGitHubRepoInput(raw);
    if (!parsed || connectRepository.isPending) return;
    connectRepository.mutate({
      spaceId,
      owner: parsed.owner,
      name: parsed.name,
      defaultBranch: branch.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading spaces…</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'Failed to load spaces.'}
      </p>
    );
  }

  if (!spaces || spaces.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Agent OS spaces yet. Create a Space to connect a repository and start
        the task → PR → preview → approval loop.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {spaces.map((space) => (
        <SpaceCard
          key={space.spaceId}
          space={space}
          onConnect={handleConnect}
          isConnecting={connectRepository.isPending}
          connectingSpaceId={connectRepository.variables?.spaceId}
        />
      ))}
      {connectRepository.isError ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          {connectRepository.error instanceof Error
            ? connectRepository.error.message
            : 'Failed to connect repository.'}
        </p>
      ) : null}
    </div>
  );
}
