export type SpacePolicy = {
  policyId: string;
  approvalRequiredFor: string[];
  forbiddenPaths: string[];
  defaultVerificationCommands: string[];
  allowNetworkByDefault: boolean;
  allowShellByDefault: boolean;
  metadata?: Record<string, unknown>;
};

export type SpaceRepositoryRef = {
  repoId: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'local' | 'custom';
  owner: string;
  name: string;
  defaultBranch?: string;
  url?: string;
};

export type Space = {
  spaceId: string;
  displayName: string;
  ownerId: string;
  repositories: SpaceRepositoryRef[];
  policy: SpacePolicy;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};
