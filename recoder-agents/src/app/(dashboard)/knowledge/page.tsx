'use client';

import { useState } from 'react';
import { FileText, ExternalLink, Upload, FolderOpen, Bot, List, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ContextualTip } from '@/components/onboarding/contextual-tip';
import { KbGraphView } from '@/components/knowledge-base/kb-graph-view';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'graph';

export default function KnowledgeRoute() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className={cn(
        "container mx-auto px-3 sm:px-4 py-6 sm:py-8",
        viewMode === 'graph' ? 'max-w-5xl' : 'max-w-2xl'
      )}>
        <div className="space-y-6">
          <ContextualTip
            tipId="knowledge-intro"
            title="Knowledge Base"
            description="Upload PDFs, docs, or clone a git repo for your agents to reference during conversations."
          />

          {/* Header with view toggle */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold">Knowledge Base</h1>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode('list')}
              >
                <List className="h-3.5 w-3.5" />
                List
              </Button>
              <Button
                variant={viewMode === 'graph' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode('graph')}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Graph
              </Button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <>
              <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md mx-auto">
                Upload files and documents that your workers can reference for more accurate, context-aware responses.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
                  <Upload className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Upload files</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PDF, DOC, TXT, MD, CSV and more</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
                  <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Organize in folders</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Group related files together</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
                  <Bot className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Assign to workers</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Choose files each worker accesses</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => router.push('/agents')}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Worker Configuration
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Select any worker and navigate to the Knowledge tab to upload files and manage assignments.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md mx-auto">
                Visualize relationships between your knowledge base entries. Click nodes for details, use the link tool to create new connections.
              </p>
              <KbGraphView />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
