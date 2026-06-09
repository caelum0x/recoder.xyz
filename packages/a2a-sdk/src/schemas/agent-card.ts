import type { RecoderAgentPlatform } from './types';

export type AgentCardSkill = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
};

export type AgentCardSecurityScheme = {
  type: 'bearer' | 'api_key' | 'oauth2' | 'mutual_tls' | 'custom';
  description?: string;
};

export type AgentCard = {
  id: string;
  name: string;
  platform: RecoderAgentPlatform;
  description?: string;
  url?: string;
  version?: string;
  capabilities: string[];
  skills: AgentCardSkill[];
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  metadata?: Record<string, unknown>;
};
