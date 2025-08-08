/**
 * File system utilities
 */
import { access } from 'fs/promises';

export async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  return fileExistsAtPath(path);
}