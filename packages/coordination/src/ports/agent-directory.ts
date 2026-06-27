/**
 * AgentDirectoryPort — registry read: capabilities, health, permissions. This
 * is the seam to the agent-os AgentProfile + A2A agent-registry; coordination
 * reads a projection (`DirectoryAgent`) so it does not fork those types.
 */

export type DirectoryAgentHealth = 'healthy' | 'degraded' | 'unhealthy' | 'offline';

export type DirectoryAgentPermissions = {
  allowGitWrite: boolean;
  allowNetwork: boolean;
  allowShell: boolean;
};

export type DirectoryAgent = {
  agentId: string;
  displayName: string;
  vendorSurface: string;
  runtimeKind: string;
  health: DirectoryAgentHealth;
  capabilityIds: string[];
  supportedIntents: string[];
  permissions: DirectoryAgentPermissions;
  /** Optional platform tier hint for capability scoring. */
  platform?: string;
};

export interface AgentDirectoryPort {
  get(agentId: string): Promise<DirectoryAgent | undefined>;
  /** Agents eligible to be routed within a space. */
  listForSpace(spaceId: string): Promise<DirectoryAgent[]>;
}
