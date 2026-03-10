'use client';

import React, { useState, useCallback } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { cloneAgent } from '@/hooks/agents/utils';

interface CloneAgentButtonProps {
  agentId: string;
  agentName: string;
  variant?: 'button' | 'menu-item';
  onCloned?: (newAgentId: string) => void;
}

export function CloneAgentButton({
  agentId,
  agentName,
  variant = 'button',
  onCloned,
}: CloneAgentButtonProps) {
  const [isCloning, setIsCloning] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleClone = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isCloning) return;

      setIsCloning(true);
      try {
        const newAgent = await cloneAgent(agentId);
        queryClient.invalidateQueries({ queryKey: ['agents'] });
        toast.success(`"${agentName}" cloned successfully`);

        if (onCloned) {
          onCloned(newAgent.agent_id);
        } else {
          router.push(`/agents/config/${newAgent.agent_id}`);
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to clone agent');
      } finally {
        setIsCloning(false);
      }
    },
    [agentId, agentName, isCloning, onCloned, queryClient, router]
  );

  if (variant === 'menu-item') {
    return (
      <button
        onClick={handleClone}
        disabled={isCloning}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-sm transition-colors disabled:opacity-50"
      >
        {isCloning ? (
          <RecoderLoader customSize={14} />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {isCloning ? 'Cloning...' : 'Clone'}
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2"
      onClick={handleClone}
      disabled={isCloning}
    >
      {isCloning ? (
        <>
          <RecoderLoader customSize={14} />
          Cloning...
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Clone
        </>
      )}
    </Button>
  );
}
