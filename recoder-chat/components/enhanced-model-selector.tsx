'use client';

import { startTransition, useMemo, useOptimistic, useState } from 'react';
import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { chatModels } from '@/lib/ai/models';
import { getModelById } from '@/lib/ai/model-registry';
import { cn } from '@/lib/utils';
import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import type { Session } from 'next-auth';

interface ModelBadgeProps {
  model: any;
}

function ModelBadge({ model }: ModelBadgeProps) {
  const modelInfo = getModelById(model.id);

  if (!modelInfo) {
    return null;
  }

  const badges = [];

  if (modelInfo.isFree) {
    badges.push(
      <span key="free" className="px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded">
        FREE
      </span>
    );
  }

  if (modelInfo.capabilities.reasoning) {
    badges.push(
      <span key="reasoning" className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100 rounded">
        Reasoning
      </span>
    );
  }

  if (modelInfo.capabilities.code) {
    badges.push(
      <span key="code" className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 rounded">
        Code
      </span>
    );
  }

  if (modelInfo.capabilities.imageGeneration) {
    badges.push(
      <span key="image" className="px-1.5 py-0.5 text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100 rounded">
        Images
      </span>
    );
  }

  if (modelInfo.capabilities.vision) {
    badges.push(
      <span key="vision" className="px-1.5 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100 rounded">
        Vision
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1 mt-1">{badges}</div>;
}

export function EnhancedModelSelector({
  session,
  selectedModelId,
  className,
}: {
  session: Session;
  selectedModelId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useOptimistic(selectedModelId);

  const userType = session.user.type;
  const { availableChatModelIds } = entitlementsByUserType[userType];

  const availableChatModels = chatModels.filter((chatModel) =>
    availableChatModelIds.includes(chatModel.id),
  );

  // Group models by category
  const freeModels = availableChatModels.filter(m => m.id.includes(':free') || m.id === 'glm-4.5-air');
  const imageModels = availableChatModels.filter(m => m.id.includes('image'));
  const unifiedModels = availableChatModels.filter(m => m.id.includes('unified'));
  const premiumModels = availableChatModels.filter(m =>
    m.id.includes('claude') && !m.id.includes('unified')
  );
  const localModels = availableChatModels.filter(m => m.id.includes('local'));

  const selectedChatModel = useMemo(
    () => availableChatModels.find((chatModel) => chatModel.id === optimisticModelId),
    [optimisticModelId, availableChatModels],
  );

  const renderModelGroup = (title: string, models: typeof chatModels, icon: string) => {
    if (models.length === 0) return null;

    return (
      <>
        <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
          {icon} {title}
        </DropdownMenuLabel>
        {models.map((chatModel) => {
          const { id } = chatModel;
          return (
            <DropdownMenuItem
              data-testid={`model-selector-item-${id}`}
              key={id}
              onSelect={() => {
                setOpen(false);
                startTransition(() => {
                  setOptimisticModelId(id);
                  saveChatModelAsCookie(id);
                });
              }}
              data-active={id === optimisticModelId}
              asChild
            >
              <button
                type="button"
                className="gap-4 group/item flex flex-row justify-between items-start w-full"
              >
                <div className="flex flex-col gap-1 items-start flex-1">
                  <div className="font-medium">{chatModel.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {chatModel.description}
                  </div>
                  <ModelBadge model={chatModel} />
                </div>

                <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100 mt-1">
                  <CheckCircleFillIcon />
                </div>
              </button>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
      </>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button
          data-testid="model-selector"
          variant="outline"
          className="md:px-2 md:h-[34px]"
        >
          {selectedChatModel?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[350px] max-h-[600px] overflow-y-auto">
        {renderModelGroup('Free Models', freeModels, '🆓')}
        {renderModelGroup('Image Generation', imageModels, '🎨')}
        {renderModelGroup('Unified AI', unifiedModels, '🚀')}
        {renderModelGroup('Premium Models', premiumModels, '👑')}
        {renderModelGroup('Local Models', localModels, '💻')}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
