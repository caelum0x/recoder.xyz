'use client';

import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConflictFile {
  path: string;
  oursContent: string;
  theirsContent: string;
}

interface MergeConflictResolverProps {
  conflicts: ConflictFile[];
  onResolve?: (resolutions: Record<string, 'ours' | 'theirs' | 'manual'>) => void;
  onCancel?: () => void;
}

export function MergeConflictResolver({
  conflicts,
  onResolve,
  onCancel,
}: MergeConflictResolverProps) {
  const [resolutions, setResolutions] = useState<Record<string, 'ours' | 'theirs' | 'manual'>>({});
  const [selectedFile, setSelectedFile] = useState<string>(conflicts[0]?.path ?? '');

  const setResolution = (path: string, resolution: 'ours' | 'theirs' | 'manual') => {
    setResolutions((prev) => ({ ...prev, [path]: resolution }));
  };

  const allResolved = conflicts.every((c) => resolutions[c.path]);
  const selectedConflict = conflicts.find((c) => c.path === selectedFile);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/20 border-b">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium text-red-700 dark:text-red-400">
          {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} to resolve
        </span>
      </div>

      <div className="flex h-[400px]">
        {/* File list */}
        <div className="w-48 border-r overflow-y-auto">
          {conflicts.map((conflict) => {
            const res = resolutions[conflict.path];
            return (
              <button
                key={conflict.path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-xs w-full text-left hover:bg-accent/30',
                  selectedFile === conflict.path && 'bg-accent',
                )}
                onClick={() => setSelectedFile(conflict.path)}
              >
                {res ? (
                  <Check className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                )}
                <span className="truncate">{conflict.path.split('/').pop()}</span>
              </button>
            );
          })}
        </div>

        {/* Diff view */}
        {selectedConflict && (
          <div className="flex-1 flex flex-col">
            {/* Resolution buttons */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
              <span className="text-xs text-muted-foreground mr-2">{selectedConflict.path}</span>
              <Button
                size="sm"
                variant={resolutions[selectedConflict.path] === 'ours' ? 'default' : 'outline'}
                className="h-6 text-[10px]"
                onClick={() => setResolution(selectedConflict.path, 'ours')}
              >
                Accept Ours
              </Button>
              <Button
                size="sm"
                variant={resolutions[selectedConflict.path] === 'theirs' ? 'default' : 'outline'}
                className="h-6 text-[10px]"
                onClick={() => setResolution(selectedConflict.path, 'theirs')}
              >
                Accept Theirs
              </Button>
            </div>

            {/* Side-by-side diff */}
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 border-r overflow-auto">
                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-red-50 dark:bg-red-950/10 sticky top-0">
                  Ours (base branch)
                </div>
                <pre className="text-[10px] font-mono px-2 py-1 whitespace-pre-wrap">
                  {selectedConflict.oursContent}
                </pre>
              </div>
              <div className="flex-1 overflow-auto">
                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-green-50 dark:bg-green-950/10 sticky top-0">
                  Theirs (agent branch)
                </div>
                <pre className="text-[10px] font-mono px-2 py-1 whitespace-pre-wrap">
                  {selectedConflict.theirsContent}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
        <span className="text-xs text-muted-foreground">
          {Object.keys(resolutions).length}/{conflicts.length} resolved
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" />
            Abort Merge
          </Button>
          <Button
            size="sm"
            onClick={() => onResolve?.(resolutions)}
            disabled={!allResolved}
            className="h-7 text-xs"
          >
            <Check className="h-3 w-3 mr-1" />
            Apply Resolutions
          </Button>
        </div>
      </div>
    </div>
  );
}
