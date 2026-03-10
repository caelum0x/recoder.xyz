import React from 'react';
import { Bot, Search, Plus, MessageSquare, Globe, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface EmptyStateProps {
  hasAgents: boolean;
  onCreateAgent: () => void;
  onClearFilters: () => void;
}

const quickStartOptions = [
  {
    icon: MessageSquare,
    title: 'Describe what you need',
    description: 'Tell AI what your worker should do and it will configure everything for you',
    action: 'create' as const,
  },
  {
    icon: Globe,
    title: 'Browse templates',
    description: 'Start from a pre-built worker across 13 categories',
    action: 'templates' as const,
  },
  {
    icon: Wrench,
    title: 'Build from scratch',
    description: 'Full control over instructions, tools, and model settings',
    action: 'create' as const,
  },
];

export const EmptyState = ({ hasAgents, onCreateAgent, onClearFilters }: EmptyStateProps) => {
  const router = useRouter();

  if (hasAgents) {
    return (
      <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-3 sm:px-4">
        <div className="flex flex-col items-center text-center max-w-md space-y-4 sm:space-y-6">
          <div className="rounded-full bg-muted p-4 sm:p-6">
            <Search className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
          </div>
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
              No workers found
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              No workers match your current search and filter criteria. Try adjusting your filters or search terms.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onClearFilters}
            className="mt-3 sm:mt-4"
          >
            Clear filters
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-3 sm:px-4">
      <div className="flex flex-col items-center text-center max-w-2xl space-y-6 sm:space-y-8">
        <div className="rounded-full bg-muted p-4 sm:p-6">
          <Bot className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
        </div>
        <div className="space-y-2 sm:space-y-3">
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
            Create your first AI worker
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
            Workers automate tasks using custom instructions, AI models, and tool integrations. Pick how you want to get started:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl">
          {quickStartOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.title}
                onClick={() => {
                  if (option.action === 'templates') {
                    router.push('/agents/templates');
                  } else {
                    onCreateAgent();
                  }
                }}
                className="flex flex-col items-center text-center p-4 sm:p-5 rounded-xl border border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-muted/60 group-hover:bg-primary/10 transition-colors mb-3">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-sm font-medium text-foreground mb-1">
                  {option.title}
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          size="lg"
          onClick={onCreateAgent}
          className="mt-2 h-10 sm:h-11 text-sm sm:text-base"
        >
          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
          Create your first worker
        </Button>
      </div>
    </div>
  );
};
