export type ArtifactPart = {
  artifactId: string;
  name: string;
  mimeType: string;
  uri?: string;
  content?: string;
  sha256?: string;
  metadata?: Record<string, unknown>;
};
