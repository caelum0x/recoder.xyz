'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModelSelection } from '@/hooks/agents';
import { ModelProviderIcon } from '@/lib/model-provider-icons';

export const ModeIndicator = memo(function ModeIndicator() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedModel,
    allModels: modelOptions,
    handleModelChange,
  } = useModelSelection();

  const selectedModelData = useMemo(
    () => modelOptions.find((m) => m.id === selectedModel),
    [modelOptions, selectedModel]
  );

  const handleModelClick = useCallback((modelId: string) => {
    handleModelChange(modelId);
    setIsOpen(false);
  }, [handleModelChange]);

  const displayName = selectedModelData?.label || 'Recoder';

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-9 rounded-lg transition-all duration-150 cursor-pointer touch-manipulation',
            'hover:bg-accent/50 active:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <span className="text-sm font-medium truncate max-w-[120px]">{displayName}</span>
          <ChevronDown className={cn(
            "h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[280px] sm:w-[320px] p-1.5 sm:p-2 rounded-xl border border-border/50 shadow-lg"
        sideOffset={6}
      >
        <div className="max-h-[300px] overflow-y-auto">
          {modelOptions.map((model) => {
            const isSelected = selectedModel === model.id;

            return (
              <div
                key={model.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg transition-all duration-150 my-0.5',
                  isSelected
                    ? 'bg-accent'
                    : 'hover:bg-accent/50 active:bg-accent/70'
                )}
                onClick={() => handleModelClick(model.id)}
              >
                <ModelProviderIcon modelId={model.id} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{model.label}</div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-foreground flex-shrink-0" strokeWidth={2} />
                )}
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export default ModeIndicator;
