import type { TaskSpec } from '@recoder/agent-os';
import { createEmptyDependencyGraph, type DependencyGraph } from './dependency-graph';
import { createImpactReport, type ImpactReport } from './impact-report';
import type { OwnershipMap } from './ownership-map';
import { relatedTestsForPaths, type TestTargetMap } from './test-target-map';

export type RepoMap = {
  repoRoot: string;
  packageGlobs: string[];
  indexedAt: string;
};

export type ContextPack = {
  taskId: string;
  repoMap: RepoMap;
  dependencyGraph: DependencyGraph;
  ownershipMap: OwnershipMap;
  testTargetMap: TestTargetMap;
  impactReport: ImpactReport;
  sourceRefs: Array<{
    kind: 'git_nexus';
    ref: string;
    detail?: string;
  }>;
};

export type CreateContextPackInput = {
  task: TaskSpec;
  repoRoot: string;
  repoMap?: RepoMap;
  dependencyGraph?: DependencyGraph;
  ownershipMap?: OwnershipMap;
  testTargetMap?: TestTargetMap;
};

export function createContextPack(input: CreateContextPackInput): ContextPack {
  const testTargetMap = input.testTargetMap ?? { targets: [] };
  const relatedTests = relatedTestsForPaths(testTargetMap, input.task.targetPaths);

  return {
    taskId: input.task.taskId,
    repoMap: input.repoMap ?? {
      repoRoot: input.repoRoot,
      packageGlobs: ['packages/*', 'apps/*', 'docker-backend'],
      indexedAt: new Date().toISOString(),
    },
    dependencyGraph: input.dependencyGraph ?? createEmptyDependencyGraph(input.repoRoot),
    ownershipMap: input.ownershipMap ?? { entries: [] },
    testTargetMap,
    impactReport: createImpactReport(input.task, relatedTests),
    sourceRefs: input.task.targetPaths.map((path) => ({
      kind: 'git_nexus',
      ref: path,
      detail: 'Target path included in Git Nexus context pack.',
    })),
  };
}
