/**
 * Types for GitHub blob document loaders
 */

export type GitHubBlobMetadata = {
  owner: string;
  repo: string;
  fileSha: string;
  path: string;
};

export type GitHubTreeLoaderParams = {
  owner: string;
  repo: string;
  commitSha: string;
};

export type GitHubTreeLoaderOptions = {
  maxBlobSize?: number;
};

export type GitHubArchiveLoaderParams = {
  owner: string;
  repo: string;
  commitSha: string;
};

export type GitHubArchiveLoaderOptions = {
  maxBlobSize?: number;
};
