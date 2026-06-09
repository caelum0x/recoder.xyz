export type OSSComponentKind =
  | 'issue-graph'
  | 'code-intelligence'
  | 'planner'
  | 'protocol'
  | 'runtime'
  | 'mcp-server'
  | 'sandbox'
  | 'memory'
  | 'browser'
  | 'network'
  | 'observability'
  | 'workflow'
  | 'support'
  | 'custom';

export type OSSComponentContract =
  | 'TaskGraph'
  | 'RepoContextProvider'
  | 'PALPlanner'
  | 'RuntimeAdapter'
  | 'McpServer'
  | 'SandboxProvider'
  | 'MemoryStore'
  | 'EventBus'
  | 'TelemetryBackend'
  | 'NetworkProvider'
  | 'SupportSurface'
  | 'Custom';

export type OSSPatchPolicy = 'none' | 'local_patch' | 'vendored' | 'forked';

export type RecoderComponentOrigin =
  | 'recoder-native'
  | 'vendored-oss'
  | 'forked-oss'
  | 'external-oss'
  | 'protocol'
  | 'runtime'
  | 'infrastructure';

export type RecoderComponentContract =
  | 'TaskGraph'
  | 'RepoIntelligence'
  | 'Planner'
  | 'InstructionSource'
  | 'InstructionCompiler'
  | 'RuntimeAdapter'
  | 'McpServer'
  | 'A2AAgent'
  | 'SandboxProvider'
  | 'BrowserVerifier'
  | 'MemoryProvider'
  | 'ArtifactStore'
  | 'EventBus'
  | 'PolicyEngine'
  | 'ObservabilityBackend'
  | 'DeploymentProvider'
  | 'SupportInbox'
  | 'UiSurface';

export type RecoderComponentStatus =
  | 'active'
  | 'experimental'
  | 'vendored'
  | 'needs-contract'
  | 'deprecated'
  | 'retired';

export type OSSComponentDescriptor = {
  id: string;
  name: string;
  kind: OSSComponentKind;
  contract: OSSComponentContract;
  owner?: string;
  source: {
    path?: string;
    repo?: string;
    package?: string;
    image?: string;
    license?: string;
    version?: string;
    pinnedSha?: string;
  };
  healthCheck: {
    command?: string;
    endpoint?: string;
  };
  patchPolicy: OSSPatchPolicy;
  metadata?: Record<string, unknown>;
};

export type RecoderComponentDescriptor = {
  id: string;
  name: string;
  origin: RecoderComponentOrigin;
  location: {
    repo?: string;
    path?: string;
    packageName?: string;
    dockerImage?: string;
    externalUrl?: string;
  };
  contract: RecoderComponentContract;
  healthCheck: {
    command?: string;
    endpoint?: string;
    expected?: string;
  };
  security: {
    requiresAuth: boolean;
    handlesSecrets: boolean;
    canExecuteCode: boolean;
    canTouchProduction: boolean;
  };
  status: RecoderComponentStatus;
  owner?: string;
  evidence?: {
    docs?: string[];
    scripts?: string[];
    dashboards?: string[];
  };
  metadata?: Record<string, unknown>;
};
