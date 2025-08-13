import * as path from 'path';
import * as os from 'os';
import { safeWriteJson, safeReadJson } from './safeWriteJson';
import { ensureDir, fileExists } from './fs';

export class LocalStorage {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(os.homedir(), '.recoder');
    ensureDir(this.basePath);
  }

  private getFilePath(key: string): string {
    return path.join(this.basePath, `${key}.json`);
  }

  set(key: string, value: any): void {
    const filePath = this.getFilePath(key);
    safeWriteJson(filePath, value);
  }

  get(key: string): any {
    const filePath = this.getFilePath(key);
    return safeReadJson(filePath);
  }

  has(key: string): boolean {
    const filePath = this.getFilePath(key);
    return fileExists(filePath);
  }

  delete(key: string): void {
    const filePath = this.getFilePath(key);
    if (fileExists(filePath)) {
      require('fs').unlinkSync(filePath);
    }
  }

  clear(): void {
    const files = require('fs').readdirSync(this.basePath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        require('fs').unlinkSync(path.join(this.basePath, file));
      }
    }
  }

  keys(): string[] {
    if (!fileExists(this.basePath)) {
      return [];
    }
    
    const files = require('fs').readdirSync(this.basePath);
    return files
      .filter((file: string) => file.endsWith('.json'))
      .map((file: string) => path.basename(file, '.json'));
  }
}

export const localStorage = new LocalStorage();

export async function getCacheDirectoryPath(basePath?: string): Promise<string> {
  const defaultPath = path.join(os.homedir(), '.recoder', 'cache');
  const cachePath = basePath ? path.join(basePath, 'cache') : defaultPath;
  await ensureDir(cachePath);
  return cachePath;
}