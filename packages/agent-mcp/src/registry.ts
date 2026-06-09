export type McpServerKind =
  | 'github'
  | 'repo'
  | 'tasks'
  | 'runs'
  | 'artifacts'
  | 'approvals'
  | 'browser'
  | 'memory'
  | 'deploy'
  | 'billing'
  | 'preview'
  | 'logs'
  | 'git_nexus'
  | 'beads'
  | 'oss'
  | 'custom';

export type McpServerRegistration = {
  serverId: string;
  kind: McpServerKind;
  displayName: string;
  transport: 'stdio' | 'http' | 'sse' | 'custom';
  endpoint?: string;
  enabled: boolean;
  toolNames: string[];
  metadata?: Record<string, unknown>;
};

export class McpRegistry {
  private readonly servers = new Map<string, McpServerRegistration>();

  register(server: McpServerRegistration): McpServerRegistration {
    this.servers.set(server.serverId, server);
    return server;
  }

  list(): McpServerRegistration[] {
    return [...this.servers.values()];
  }

  get(serverId: string): McpServerRegistration | null {
    return this.servers.get(serverId) ?? null;
  }
}
