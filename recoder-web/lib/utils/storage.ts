/**
 * Storage utilities for cache management
 */
import { homedir } from 'os';
import { join } from 'path';

export async function getCacheDirectoryPath(basePath?: string): Promise<string> {
  // Return a cache directory path
  if (basePath) {
    return join(basePath, 'cache');
  }
  
  const homeDir = homedir();
  return join(homeDir, '.recoder', 'cache');
}

export async function getStorageDirectoryPath(basePath?: string): Promise<string> {
  // Return a storage directory path
  if (basePath) {
    return join(basePath, 'storage');
  }
  
  const homeDir = homedir();
  return join(homeDir, '.recoder', 'storage');
}