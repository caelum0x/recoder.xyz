/**
 * Bounded code-impact evidence shared by installed PR review, Conductor
 * readiness, Agent OS, and Wave. Consumers render this contract and do not
 * reinterpret raw engine responses into a second blast-radius model.
 */

export type CodeImpactDirection = 'upstream' | 'downstream';
export type CodeImpactRisk = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CodeImpactScope = 'symbol' | 'file' | 'mixed' | 'unavailable';

export interface CodeImpactProcess {
  readonly id?: string;
  readonly label: string;
  readonly processType?: string;
  readonly filePath?: string;
}

export interface CodeImpactConsumer {
  readonly repoId: string;
  readonly path: string;
  readonly ecosystem: 'npm' | 'python' | 'go' | 'cargo';
  readonly packageName: string;
  readonly importSpecifier: string;
  readonly relationType: 'CONSUMED_BY';
}

export interface CodeImpactFile {
  readonly path: string;
  readonly isTest: boolean;
  readonly minDepth: number;
  readonly directions: readonly CodeImpactDirection[];
  readonly changedSymbols: readonly string[];
  readonly symbols: readonly string[];
  readonly relationTypes: readonly string[];
  readonly processes: readonly string[];
  /** Strongest bounded git-history relationship to a changed file. */
  readonly coChange?: {
    readonly commits: number;
    readonly confidence: number;
  };
}

export interface CodeImpactSummary {
  readonly impactedFiles: number;
  readonly affectedTests: number;
  readonly upstreamFiles: number;
  readonly downstreamFiles: number;
  readonly affectedProcesses: number;
  readonly coChangedFiles: number;
  readonly crossRepositoryFiles: number;
  readonly consumerRepositories: number;
}

export interface CodeImpactLedger {
  readonly available: boolean;
  readonly reason?: string;
  readonly source: 'recodergit';
  /** `file` is static import evidence; `symbol` is definition-backed call evidence. */
  readonly scope: CodeImpactScope;
  readonly risk: CodeImpactRisk;
  readonly partial: boolean;
  readonly files: readonly CodeImpactFile[];
  readonly tests: readonly CodeImpactFile[];
  readonly processes: readonly CodeImpactProcess[];
  readonly consumers: readonly CodeImpactConsumer[];
  readonly summary: CodeImpactSummary;
}
