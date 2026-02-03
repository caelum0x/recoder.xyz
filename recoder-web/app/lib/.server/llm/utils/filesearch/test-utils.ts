import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import os from 'node:os';

export interface TmpDirSpec {
  [key: string]: string | string[] | Buffer | TmpDirSpec;
}

async function writeSpec(root: string, spec: TmpDirSpec): Promise<void> {
  const entries = Object.entries(spec);
  for (const [name, value] of entries) {
    const targetPath = path.join(root, name);
    if (Array.isArray(value)) {
      await fs.mkdir(targetPath, { recursive: true });
      for (const fileName of value) {
        await fs.writeFile(path.join(targetPath, fileName), '');
      }
      continue;
    }
    if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
      await fs.mkdir(targetPath, { recursive: true });
      await writeSpec(targetPath, value as TmpDirSpec);
      continue;
    }
    const content = Buffer.isBuffer(value) ? value : String(value ?? '');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
  }
}

export async function createTmpDir(spec: TmpDirSpec): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-filesearch-'));
  await writeSpec(tmpDir, spec);
  return tmpDir;
}

export async function cleanupTmpDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
