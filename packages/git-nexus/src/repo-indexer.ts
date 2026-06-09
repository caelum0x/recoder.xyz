import { createContextPack, type ContextPack, type CreateContextPackInput } from './context-pack';

export type RepoIndexer = {
  contextPack(input: CreateContextPackInput): Promise<ContextPack> | ContextPack;
};

export function createRepoIndexer(): RepoIndexer {
  return {
    contextPack: createContextPack,
  };
}
