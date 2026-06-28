import type { AgentProfile } from "@recoder/agent-os";
import type { McpServerRegistration } from "@recoder/agent-mcp";

/** A minimal MCP server registration exposing the given tools. */
export function testServer(
  overrides: Partial<McpServerRegistration> = {},
): McpServerRegistration {
  return {
    serverId: "srv-repo",
    kind: "repo",
    displayName: "Repo MCP",
    transport: "http",
    enabled: true,
    toolNames: ["repo.read"],
    ...overrides,
  };
}

/** A minimal actor profile; toolRules default to empty (allow-by-registry). */
export function testActor(
  permissionOverrides: Partial<AgentProfile["permissions"]> = {},
): AgentProfile {
  return {
    agentId: "agent-1",
    displayName: "Test Agent",
    vendorSurface: "claude_code",
    connectorId: "conn-1",
    runtimeKind: "local",
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: "deny",
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
      ...permissionOverrides,
    },
    approvalPolicy: {
      mode: "policy",
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: "none",
    cwdPolicy: { mode: "repo_root", allowedRoots: ["/repo"] },
    health: { status: "healthy", checkedAt: new Date().toISOString() },
    lastSeenAt: new Date().toISOString(),
  } as unknown as AgentProfile;
}
