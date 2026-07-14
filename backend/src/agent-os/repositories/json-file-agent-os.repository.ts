import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { InMemoryAgentOsRepository } from './in-memory-agent-os.repository';
import type { AgentOsRepositorySnapshot } from './agent-os.repository';

export class JsonFileAgentOsRepository extends InMemoryAgentOsRepository {
  private readonly stateFilePath: string;

  constructor(stateFilePath: string) {
    const resolvedPath = resolve(stateFilePath);
    super(loadSnapshot(resolvedPath));
    this.stateFilePath = resolvedPath;
    this.setChangeHandler(() => this.persist());
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.stateFilePath), { recursive: true });
    const tempPath = `${this.stateFilePath}.${process.pid}.tmp`;
    const payload = JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        records: this.snapshot(),
      },
      null,
      2,
    );
    writeFileSync(tempPath, payload);
    renameSync(tempPath, this.stateFilePath);
  }
}

function loadSnapshot(stateFilePath: string): Partial<AgentOsRepositorySnapshot> | undefined {
  if (!existsSync(stateFilePath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Invalid Agent OS state file: ${stateFilePath}`);
  }

  const records = parsed.records;
  if (!isRecord(records)) {
    throw new Error(`Invalid Agent OS state records: ${stateFilePath}`);
  }

  return records as Partial<AgentOsRepositorySnapshot>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
