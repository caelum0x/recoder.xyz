import * as React from 'react';
import { type ViewProps } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import type { Agent } from '@/api/types';

interface AgentAvatarProps extends ViewProps {
  agent?: Agent;
  size?: number;
}

/**
 * AgentAvatar Component - Agent-specific wrapper around unified Avatar
 * 
 * Uses the unified Avatar component with agent-specific configuration.
 * Automatically handles:
 * - Agent icon from backend (icon_name)
 * - Agent colors (icon_color, icon_background)
 * - RECODER/RECODER SUPER WORKER special case (Recoder symbol)
 * - Fallback to agent name initial
 * 
 * @example
 * <AgentAvatar agent={agent} size={48} />
 */
export function AgentAvatar({ agent, size = 48, style, ...props }: AgentAvatarProps) {
  // Check if this is the RECODER/RECODER SUPER WORKER
  const isRecoderAgent = agent?.metadata?.is_recoder_default || 
                      agent?.name?.toLowerCase() === 'recoder' ||
                      agent?.name?.toLowerCase() === 'superworker' ||
                      agent?.name?.toLowerCase() === 'recoder super worker';

  return (
    <Avatar
      variant="agent"
      size={size}
      icon={agent?.icon_name || undefined}
      iconColor={isRecoderAgent ? undefined : agent?.icon_color ?? undefined}
      backgroundColor={isRecoderAgent ? undefined : agent?.icon_background ?? undefined}
      useRecoderSymbol={isRecoderAgent}
      fallbackText={agent?.name}
      style={style}
      {...props}
    />
  );
}
