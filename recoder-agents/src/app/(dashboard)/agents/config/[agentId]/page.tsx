'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAgent } from '@/hooks/agents/use-agents';
import { ChevronLeft, Brain, BookOpen, Zap, Wrench, Server, Pencil, MessageCircle, History, ScrollText, KeyRound, Gauge, Clock, CalendarClock, Download, Activity, BarChart3, MessageSquare, Terminal, FlaskConical, HeartPulse, Shield, Route, Rocket, Lock, GitBranch, Database, Workflow, Camera } from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { AgentAvatar } from '@/components/thread/content/agent-avatar';
import { AgentEditorDialog } from '@/components/agents/config/agent-editor-dialog';
import { TriggersScreen } from './screens/triggers-screen';
import { InstructionsScreen } from './screens/instructions-screen';
import { KnowledgeScreen } from './screens/knowledge-screen';
import { ToolsScreen } from './screens/tools-screen';
import { IntegrationsScreen } from './screens/integrations-screen';
import { VersionsScreen } from './screens/versions-screen';
import { LogsScreen } from './screens/logs-screen';
import { SecretsScreen } from './screens/secrets-screen';
import { QuotaScreen } from './screens/quota-screen';
import { SchedulesScreen } from './screens/schedules-screen';
import { ActivityScreen } from './screens/activity-screen';
import { BenchmarksScreen } from './screens/benchmarks-screen';
import { EnvVarsScreen } from './screens/env-vars-screen';
import { TestingScreen } from './screens/testing-screen';
import { HealthScreen } from './screens/health-screen';
import { ChangelogScreen } from './screens/changelog-screen';
import { PermissionsScreen } from './screens/permissions-screen';
import { RoutingScreen } from './screens/routing-screen';
import { DeploymentScreen } from './screens/deployment-screen';
import { ConfigVersionsScreen } from './screens/config-versions-screen';
import { QuotasScreen } from './screens/quotas-screen';
import { SandboxScreen } from './screens/sandbox-screen';
import { ScheduledTasksScreen } from './screens/scheduled-tasks-screen';
import { CacheScreen } from './screens/cache-screen';
import { PipelineScreen } from './screens/pipeline-screen';
import { SkillsScreen } from './screens/skills-screen';
import { ConfigSnapshotScreen } from './screens/config-snapshot-screen';
import { CommentPanel } from '@/components/agents/config/comment-panel';
import { useCommentCounts } from '@/hooks/agents/use-agent-comments';
import { useUpdateAgent } from '@/hooks/agents/use-agents';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { AgentConfigTour } from '@/components/onboarding/tours/agent-config-tour';
import { AgentExportDialog } from '@/components/agents/agent-export-dialog';

type ConfigView = 'instructions' | 'knowledge' | 'triggers' | 'tools' | 'integrations' | 'versions' | 'config-versions' | 'logs' | 'secrets' | 'environment' | 'quota' | 'quotas' | 'schedules' | 'scheduled-tasks' | 'activity' | 'benchmarks' | 'testing' | 'sandbox' | 'health' | 'changelog' | 'permissions' | 'routing' | 'deployment' | 'cache' | 'pipeline' | 'skills' | 'config-snapshots';

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const agentId = params.agentId as string;
  const [activeView, setActiveView] = useState<ConfigView>('triggers');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);

  const { data: agent, isLoading } = useAgent(agentId);
  const { data: commentCounts } = useCommentCounts(agentId);
  const updateAgentMutation = useUpdateAgent();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <RecoderLoader size="large" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted-foreground">Worker not found</p>
      </div>
    );
  }

  const handleEditorSave = async (data: {
    name: string;
    iconName: string | null;
    iconColor: string;
    backgroundColor: string;
  }) => {
    try {
      await updateAgentMutation.mutateAsync({
        agentId,
        name: data.name,
        icon_name: data.iconName,
        icon_color: data.iconColor,
        icon_background: data.backgroundColor,
      });

      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      toast.success('Worker updated successfully!');
    } catch (error) {
      console.error('Failed to update agent:', error);
      toast.error('Failed to update Worker');
    }
  };

  const menuItems = [
    { id: 'instructions' as const, label: 'Instructions', icon: Brain, tourId: 'instructions-tab' },
    { id: 'tools' as const, label: 'Tools', icon: Wrench, tourId: 'tools-tab' },
    { id: 'integrations' as const, label: 'Integrations', icon: Server, tourId: 'integrations-tab' },
    { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen, tourId: 'knowledge-tab' },
    { id: 'triggers' as const, label: 'Triggers', icon: Zap, tourId: 'triggers-tab' },
    { id: 'versions' as const, label: 'Versions', icon: History, tourId: 'versions-tab' },
    { id: 'config-versions' as const, label: 'Config History', icon: GitBranch, tourId: 'config-versions-tab' },
    { id: 'logs' as const, label: 'Logs', icon: ScrollText, tourId: 'logs-tab' },
    { id: 'secrets' as const, label: 'Secrets', icon: KeyRound, tourId: 'secrets-tab' },
    { id: 'environment' as const, label: 'Environment', icon: Lock, tourId: 'environment-tab' },
    { id: 'quota' as const, label: 'Quota', icon: Gauge, tourId: 'quota-tab' },
    { id: 'quotas' as const, label: 'Quotas', icon: Shield, tourId: 'quotas-tab' },
    { id: 'schedules' as const, label: 'Schedules', icon: Clock, tourId: 'schedules-tab' },
    { id: 'scheduled-tasks' as const, label: 'Scheduled Tasks', icon: CalendarClock, tourId: 'scheduled-tasks-tab' },
    { id: 'activity' as const, label: 'Activity', icon: Activity, tourId: 'activity-tab' },
    { id: 'benchmarks' as const, label: 'Benchmarks', icon: Gauge, tourId: 'benchmarks-tab' },
    { id: 'testing' as const, label: 'Testing', icon: FlaskConical, tourId: 'testing-tab' },
    { id: 'sandbox' as const, label: 'Sandbox', icon: FlaskConical, tourId: 'sandbox-tab' },
    { id: 'health' as const, label: 'Health', icon: HeartPulse, tourId: 'health-tab' },
    { id: 'changelog' as const, label: 'Changelog', icon: History, tourId: 'changelog-tab' },
    { id: 'permissions' as const, label: 'Permissions', icon: Shield, tourId: 'permissions-tab' },
    { id: 'routing' as const, label: 'Routing', icon: Route, tourId: 'routing-tab' },
    { id: 'deployment' as const, label: 'Deployment', icon: Rocket, tourId: 'deployment-tab' },
    { id: 'cache' as const, label: 'Cache', icon: Database, tourId: 'cache-tab' },
    { id: 'pipeline' as const, label: 'Pipeline', icon: Workflow, tourId: 'pipeline-tab' },
    { id: 'skills' as const, label: 'Skills', icon: Zap, tourId: 'skills-tab' },
    { id: 'config-snapshots' as const, label: 'Snapshots', icon: Camera, tourId: 'config-snapshots-tab' },
  ];

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-background px-3 sm:px-4 md:px-7 pt-4 md:pt-7">
      <AgentConfigTour />
      {/* Left Sidebar Menu */}
      <div className="bg-background flex w-full md:w-48 md:flex-col md:pr-4 pt-14 sm:pt-16 md:pt-0 gap-2">
        {/* Back button - desktop only */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/agents?tab=my-agents')}
          className="justify-start -ml-2 mb-6 text-foreground hover:bg-transparent hidden md:flex"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {/* Back button - mobile (icon only) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/agents?tab=my-agents')}
          className="h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border md:hidden"
        >
          <ChevronLeft className="!h-5 !w-5" />
        </Button>

        {/* Menu items - desktop */}
        <div className="space-y-1 hidden md:block">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <SpotlightCard
                key={item.id}
                className={cn(
                  "transition-colors cursor-pointer",
                  isActive ? "bg-muted" : "bg-transparent"
                )}
              >
                <button
                  onClick={() => setActiveView(item.id)}
                  data-tour={item.tourId}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-sm",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              </SpotlightCard>
            );
          })}
        </div>

        {/* Menu items - mobile (icon only) */}
        <div className="flex gap-2 md:hidden md:space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="icon"
                data-tour={item.tourId}
                className={cn(
                  "h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border",
                  isActive ? 'bg-muted/60 border-[1.5px] border-border' : ''
                )}
                onClick={() => setActiveView(item.id)}
              >
                <Icon className="!h-5 !w-5" />
              </Button>
            );
          })}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden w-full md:w-0 md:pl-1 md:pr-1 md:min-w-0 md:px-0">
        {/* Agent Header */}
        <div className="flex items-center justify-between pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-6 w-full gap-3">
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group/header min-w-0 flex-1"
            onClick={() => setIsEditorOpen(true)}
          >
            <div className="relative flex-shrink-0">
              <AgentAvatar
                agent={agent}
                size={40}
                className="border-[1.5px] transition-all group-hover/header:ring-2 group-hover/header:ring-primary/20 sm:!w-12 sm:!h-12"
              />

            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg md:text-xl font-semibold text-foreground truncate">{agent?.name}</h1>
                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground opacity-0 group-hover/header:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10 relative"
              onClick={() => setIsCommentPanelOpen(!isCommentPanelOpen)}
              title="Comments"
            >
              <MessageSquare className="h-4 w-4" />
              {commentCounts && commentCounts.total_unresolved > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                  {commentCounts.total_unresolved}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10"
              onClick={() => setIsExportOpen(true)}
              title="Export agent config"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => router.push(`/dashboard?agent_id=${agentId}`)}
              className="gap-1.5 sm:gap-2 text-sm h-9 sm:h-10 px-3 sm:px-4"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Start Chat</span>
              <span className="sm:hidden">Chat</span>
            </Button>
          </div>
        </div>

        {/* Dynamic Content Based on Active View */}
        {activeView === 'instructions' && <InstructionsScreen agentId={agentId} />}
        {activeView === 'tools' && <ToolsScreen agentId={agentId} />}
        {activeView === 'integrations' && <IntegrationsScreen agentId={agentId} />}
        {activeView === 'knowledge' && <KnowledgeScreen agentId={agentId} />}
        {activeView === 'triggers' && <TriggersScreen agentId={agentId} />}
        {activeView === 'versions' && <VersionsScreen agentId={agentId} />}
        {activeView === 'config-versions' && <ConfigVersionsScreen agentId={agentId} />}
        {activeView === 'logs' && <LogsScreen agentId={agentId} />}
        {activeView === 'secrets' && <SecretsScreen agentId={agentId} />}
        {activeView === 'environment' && <EnvVarsScreen agentId={agentId} />}
        {activeView === 'quota' && <QuotaScreen agentId={agentId} />}
        {activeView === 'quotas' && <QuotasScreen agentId={agentId} />}
        {activeView === 'schedules' && <SchedulesScreen agentId={agentId} />}
        {activeView === 'scheduled-tasks' && <ScheduledTasksScreen agentId={agentId} />}
        {activeView === 'activity' && <ActivityScreen agentId={agentId} />}
        {activeView === 'benchmarks' && <BenchmarksScreen agentId={agentId} />}
        {activeView === 'testing' && <TestingScreen agentId={agentId} />}
        {activeView === 'sandbox' && <SandboxScreen agentId={agentId} />}
        {activeView === 'health' && <HealthScreen agentId={agentId} />}
        {activeView === 'changelog' && <ChangelogScreen agentId={agentId} />}
        {activeView === 'permissions' && <PermissionsScreen agentId={agentId} />}
        {activeView === 'routing' && <RoutingScreen agentId={agentId} />}
        {activeView === 'deployment' && <DeploymentScreen agentId={agentId} />}
        {activeView === 'cache' && <CacheScreen agentId={agentId} />}
        {activeView === 'pipeline' && <PipelineScreen agentId={agentId} />}
        {activeView === 'skills' && <SkillsScreen agentId={agentId} />}
        {activeView === 'config-snapshots' && <ConfigSnapshotScreen agentId={agentId} />}
      </div>

      {/* Agent Editor Dialog */}
      <AgentEditorDialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        agentName={agent?.name}
        currentIconName={agent?.icon_name || undefined}
        currentIconColor={agent?.icon_color || '#000000'}
        currentBackgroundColor={agent?.icon_background || '#F3F4F6'}
        onSave={handleEditorSave}
      />

      {/* Agent Export Dialog */}
      <AgentExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        agentId={agentId}
        agentName={agent?.name || 'Agent'}
      />

      {/* Comment Panel */}
      <CommentPanel
        agentId={agentId}
        isOpen={isCommentPanelOpen}
        onClose={() => setIsCommentPanelOpen(false)}
      />
    </div>
  );
}
