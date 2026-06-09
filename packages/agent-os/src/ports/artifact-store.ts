import type { Artifact } from '../domain';

export type ArtifactWriteRequest = Omit<Artifact, 'artifactId' | 'createdAt'> & {
  artifactId?: string;
  createdAt?: string;
};

export interface ArtifactStorePort {
  put(input: ArtifactWriteRequest): Promise<Artifact>;
  get(artifactId: string): Promise<Artifact | null>;
  listByRun(runId: string): Promise<Artifact[]>;
}
