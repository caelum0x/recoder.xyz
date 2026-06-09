import type { TaskSpec } from '@recoder/agent-os';
import type { TestTarget } from './test-target-map';

export type ChangedFileRisk = {
  path: string;
  risk: 'low' | 'medium' | 'high';
  reason: string;
};

export type ImpactReport = {
  taskId: string;
  targetPaths: string[];
  impactedPackages: string[];
  relatedTests: TestTarget[];
  changedFileRisks: ChangedFileRisk[];
  generatedAt: string;
};

function riskForPath(path: string): ChangedFileRisk {
  const highRisk = /auth|billing|security|secrets?|infra|migrations?/i.test(path);
  const mediumRisk = /api|backend|server|workflow|runtime|policy/i.test(path);
  return {
    path,
    risk: highRisk ? 'high' : mediumRisk ? 'medium' : 'low',
    reason: highRisk
      ? 'Path appears to affect sensitive platform behavior.'
      : mediumRisk
        ? 'Path appears to affect shared runtime or API behavior.'
        : 'Path appears isolated or low blast-radius.',
  };
}

export function createImpactReport(task: TaskSpec, relatedTests: TestTarget[] = []): ImpactReport {
  const impactedPackages = [...new Set(task.targetPaths
    .map((path) => path.split('/').slice(0, 2).join('/'))
    .filter(Boolean))];

  return {
    taskId: task.taskId,
    targetPaths: task.targetPaths,
    impactedPackages,
    relatedTests,
    changedFileRisks: task.targetPaths.map(riskForPath),
    generatedAt: new Date().toISOString(),
  };
}
