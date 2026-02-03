/**
 * Simple JSON file persistence utility
 * Provides load/save with atomic writes and debounced saving
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadStore<T>(name: string, defaultValue: T): T {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[persistence] Failed to load ${name}:`, e);
  }
  return defaultValue;
}

export function saveStore(name: string, data: unknown): void {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath); // atomic write
  } catch (e) {
    console.error(`[persistence] Failed to save ${name}:`, e);
  }
}

/**
 * Create a debounced save function to avoid excessive writes during burst operations
 */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function debouncedSave(name: string, data: unknown, delayMs: number = 100): void {
  const existing = pendingTimers.get(name);
  if (existing) {
    clearTimeout(existing);
  }
  pendingTimers.set(name, setTimeout(() => {
    pendingTimers.delete(name);
    saveStore(name, data);
  }, delayMs));
}
