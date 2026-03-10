import React, { useState, useCallback } from 'react';
import { Settings, Trash2, Star, MessageCircle, Wrench, Globe, GlobeLock, Download, Shield, AlertTriangle, GitBranch, CheckSquare, Square } from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useCreateTemplate, useUnpublishTemplate } from '@/hooks/secure-mcp/use-secure-mcp';
import { toast } from '@/lib/toast';
import { UnifiedAgentCard } from '@/components/ui/unified-agent-card';
import { AgentAvatar } from '../thread/content/agent-avatar';
import { AgentConfigurationDialog } from './agent-configuration-dialog';
import { CloneAgentButton } from './clone-agent-button';
import { CloneAgentDialog } from './clone-agent-dialog';
import { isStagingMode } from '@/lib/config';
import { BulkActionsBar } from './bulk-actions-bar';
import { AgentHealthBadge } from './agent-health-badge';
import { useHealthOverview } from '@/hooks/agents/use-agent-health';

interface Agent {
  agent_id: string;
  name: string;
  is_default: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  configured_mcps?: Array<{ name: string }>;
  agentpress_tools?: Record<string, any>;
  template_id?: string;
  current_version_id?: string;
  version_count?: number;
  current_version?: {
    version_id: string;
    version_name: string;
    version_number: number;
  };
  metadata?: {
    is_recoder_default?: boolean;
    is_suna_default?: boolean;
    centrally_managed?: boolean;
    restrictions?: {
      system_prompt_editable?: boolean;
      tools_editable?: boolean;
      name_editable?: boolean;
      mcps_editable?: boolean;
    };
  };
  // Icon system fields
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
}

interface AgentsGridProps {
  agents: Agent[];
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  deleteAgentMutation?: { isPending: boolean }; // Made optional as we'll track per-agent state
  isDeletingAgent?: (agentId: string) => boolean;
  onPublish?: (agent: Agent) => void;
  publishingId?: string | null;
}

interface AgentModalProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomize: (agentId: string) => void;
  onChat: (agentId: string) => void;
  onPublish: (agentId: string) => void;
  onUnpublish: (agentId: string) => void;
  isPublishing: boolean;
  isUnpublishing: boolean;
}

const AgentModal: React.FC<AgentModalProps> = ({ 
  agent, 
  isOpen, 
  onClose, 
  onCustomize, 
  onChat, 
  onPublish, 
  onUnpublish, 
  isPublishing, 
  isUnpublishing 
}) => {
  if (!agent) return null;

  const isRecoderAgent = agent.metadata?.is_recoder_default || agent.metadata?.is_suna_default || false;
  
  const truncateDescription = (text?: string, maxLength = 120) => {
    if (!text || text.length <= maxLength) return text || 'Try out this agent';
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        <DialogTitle className="sr-only">Worker actions</DialogTitle>
        <div className="relative">
          <div className={`p-4 h-24 flex items-start justify-start relative`}>
            <AgentAvatar
              iconName={agent.icon_name}
              iconColor={agent.icon_color}
              backgroundColor={agent.icon_background}
              agentName={agent.name}
              isRecoderDefault={isRecoderAgent}
              size={64}
            />
          </div>

          <div className="p-4 space-y-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {agent.name}
                </h2>
                {!isRecoderAgent && agent.current_version && (
                  <Badge variant="outline" className="text-xs">
                    <GitBranch className="h-3 w-3" />
                    {agent.current_version.version_name}
                  </Badge>
                )}
                {agent.is_public && (
                  <Badge variant="outline" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Published
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => onCustomize(agent.agent_id)}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Wrench className="h-4 w-4" />
                Customize
              </Button>
              <Button
                onClick={() => onChat(agent.agent_id)}
                className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </Button>
            </div>
            {!isRecoderAgent && (
              <div className="pt-1">
                <CloneAgentButton
                  agentId={agent.agent_id}
                  agentName={agent.name}
                  variant="button"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1 gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onClose();
                    // Trigger the clone dialog via a custom event - the parent AgentsGrid listens
                    window.dispatchEvent(new CustomEvent('open-clone-dialog', { detail: agent }));
                  }}
                >
                  Clone with Modifications...
                </Button>
              </div>
            )}
            {!isRecoderAgent && isStagingMode && (
              <div className="pt-2">
                {agent.is_public ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Published as secure template</span>
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {agent.download_count || 0} downloads
                      </div>
                    </div>
                    <Button
                      onClick={() => onUnpublish(agent.agent_id)}
                      disabled={isUnpublishing}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      {isUnpublishing ? (
                        <>
                          <RecoderLoader customSize={16} />
                          Making Private...
                        </>
                      ) : (
                        <>
                          <GlobeLock className="h-4 w-4" />
                          Make Private
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => onPublish(agent.agent_id)}
                    disabled={isPublishing}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {isPublishing ? (
                      <>
                        <RecoderLoader customSize={16} />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Publish as Template
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AgentsGrid: React.FC<AgentsGridProps> = ({ 
  agents, 
  onEditAgent, 
  onDeleteAgent, 
  onToggleDefault,
  deleteAgentMutation,
  isDeletingAgent,
  onPublish,
  publishingId: externalPublishingId
}) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cloneDialogAgent, setCloneDialogAgent] = useState<Agent | null>(null);
  const router = useRouter();

  // Fetch health scores for all agents (used for health badge overlay)
  const { data: healthOverview } = useHealthOverview();
  const healthScoreMap = React.useMemo(() => {
    const map = new Map<string, { overall: number | null; reliability: number | null; performance: number | null; cost: number | null; satisfaction: number | null }>();
    if (healthOverview?.agents) {
      for (const h of healthOverview.agents) {
        map.set(h.agent_id, {
          overall: h.overall_score,
          reliability: h.reliability_score,
          performance: h.performance_score,
          cost: h.cost_efficiency_score,
          satisfaction: h.user_satisfaction_score,
        });
      }
    }
    return map;
  }, [healthOverview]);

  // Listen for clone dialog events from agent modal
  React.useEffect(() => {
    const handler = (e: Event) => {
      const agent = (e as CustomEvent).detail as Agent;
      if (agent) setCloneDialogAgent(agent);
    };
    window.addEventListener('open-clone-dialog', handler);
    return () => window.removeEventListener('open-clone-dialog', handler);
  }, []);

  const unpublishAgentMutation = useUnpublishTemplate();

  const toggleSelection = useCallback((agentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      // Exit selection mode if nothing selected
      if (next.size === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBulkDelete = useCallback((ids: string[]) => {
    for (const id of ids) {
      onDeleteAgent(id);
    }
    clearSelection();
  }, [onDeleteAgent, clearSelection]);

  const handleBulkExport = useCallback((ids: string[]) => {
    const exportAgents = agents.filter((a) => ids.includes(a.agent_id));
    const data = JSON.stringify(exportAgents, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agents-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ids.length} agent${ids.length !== 1 ? 's' : ''}`);
  }, [agents]);

  const handleBulkClone = useCallback((ids: string[]) => {
    toast.success(`Cloning ${ids.length} agent${ids.length !== 1 ? 's' : ''}...`);
    clearSelection();
  }, [clearSelection]);

  const handleAgentClick = (agent: Agent) => {
    if (selectionMode) {
      toggleSelection(agent.agent_id);
      return;
    }
    setSelectedAgent(agent);
  };

  const handleCustomize = (agentId: string) => {
    setSelectedAgent(null);
    setConfigAgentId(agentId);
    setShowConfigDialog(true);
  };

  const handleChat = (agentId: string) => {
    router.push(`/dashboard?agent_id=${agentId}`);
    setSelectedAgent(null);
  };

  const handlePublish = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    if (agent && onPublish) {
      onPublish(agent);
      setSelectedAgent(null);
    }
  };

  const handleUnpublish = async (agentId: string) => {
    try {
      setUnpublishingId(agentId);
      await unpublishAgentMutation.mutateAsync(agentId);
      toast.success('Worker made private');
      setSelectedAgent(null);
    } catch (error: any) {
      toast.error('Failed to make Worker private');
    } finally {
      setUnpublishingId(null);
    }
  };


  return (
    <>
      {/* Selection mode toggle */}
      {agents.length > 1 && (
        <div className="flex items-center justify-end mb-3">
          <Button
            variant={selectionMode ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={() => {
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectionMode ? 'Cancel Selection' : 'Select'}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => {
          const agentData = {
            ...agent,
            id: agent.agent_id
          };

          const isDeleting = isDeletingAgent?.(agent.agent_id) || false;
          const isGloballyDeleting = deleteAgentMutation?.isPending || false;
          const isSelected = selectedIds.has(agent.agent_id);

          return (
            <div key={agent.agent_id} className={`relative group flex flex-col h-full ${isSelected ? 'ring-2 ring-primary rounded-lg' : ''}`}>
              {isDeleting && (
                <div className="absolute inset-0 bg-destructive/10 backdrop-blur-sm rounded-lg z-20 flex items-center justify-center">
                  <div className="bg-background/95 backdrop-blur-sm rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg border">
                    <RecoderLoader customSize={16} />
                    <span className="text-sm font-medium text-destructive">Deleting...</span>
                  </div>
                </div>
              )}

              {/* Selection checkbox overlay */}
              {selectionMode && (
                <button
                  className="absolute top-3 left-3 z-10 p-0.5 rounded-md hover:bg-muted/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(agent.agent_id);
                  }}
                  aria-label={isSelected ? 'Deselect agent' : 'Select agent'}
                >
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
              )}

              {/* Health score badge */}
              {(() => {
                const hs = healthScoreMap.get(agent.agent_id);
                if (!hs || hs.overall === null) return null;
                return (
                  <div className="absolute top-3 right-3 z-10">
                    <AgentHealthBadge
                      overallScore={hs.overall}
                      reliabilityScore={hs.reliability}
                      performanceScore={hs.performance}
                      costEfficiencyScore={hs.cost}
                      userSatisfactionScore={hs.satisfaction}
                      size="sm"
                    />
                  </div>
                );
              })()}

              <div className={`transition-all duration-200 ${isDeleting ? 'opacity-60 scale-95' : ''}`}>
                <UnifiedAgentCard
                  variant="agent"
                  data={{
                    id: agent.agent_id,
                    name: agent.name,
                    tags: agent.tags,
                    created_at: agent.created_at,
                    agent_id: agent.agent_id,
                    is_default: agent.is_default,
                    is_public: agent.is_public,
                    marketplace_published_at: agent.marketplace_published_at,
                    download_count: agent.download_count,
                    current_version: agent.current_version,
                    metadata: agent.metadata,
                    icon_name: agent.icon_name,
                    icon_color: agent.icon_color,
                    icon_background: agent.icon_background,
                  }}
                  actions={{
                    onClick: () => !isDeleting && handleAgentClick(agent),
                  }}
                />
              </div>
              <div className={`absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity ${isDeleting || selectionMode ? 'pointer-events-none' : ''}`}>
                {!agent.is_default && !selectionMode && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                        disabled={isDeleting || isGloballyDeleting}
                        title="Delete agent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isDeleting ? (
                          <RecoderLoader customSize={14} />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl">Delete Worker</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{agent.name}&quot;? This action cannot be undone.
                          {agent.is_public && (
                            <span className="block mt-2 text-amber-600 dark:text-amber-400">
                              Note: This agent is currently published to the marketplace and will be removed from there as well.
                            </span>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteAgent(agent.agent_id);
                          }}
                          disabled={isDeleting || isGloballyDeleting}
                          className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                          {isDeleting ? (
                            <>
                              <RecoderLoader customSize={16} className="mr-2" />
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk actions bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onDelete={handleBulkDelete}
        onExport={handleBulkExport}
        onClone={handleBulkClone}
        onClearSelection={clearSelection}
        isDeleting={deleteAgentMutation?.isPending}
      />

      <AgentModal
        agent={selectedAgent}
        isOpen={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onCustomize={handleCustomize}
        onChat={handleChat}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        isPublishing={externalPublishingId === selectedAgent?.agent_id}
        isUnpublishing={unpublishingId === selectedAgent?.agent_id}
      />
      
      {configAgentId && (
        <AgentConfigurationDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          agentId={configAgentId}
          onAgentChange={(newAgentId) => {
            setConfigAgentId(newAgentId);
          }}
        />
      )}

      {cloneDialogAgent && (
        <CloneAgentDialog
          open={!!cloneDialogAgent}
          onOpenChange={(open) => { if (!open) setCloneDialogAgent(null); }}
          sourceAgent={cloneDialogAgent}
        />
      )}
    </>
  );
};