/**
 * Generation Storage
 * In-memory and persistent storage implementations for generations
 */

import type {
  Generation,
  GenerationId,
  GenerationStorage,
  NodeGenerationIndex,
  NodeId,
  TaskId,
} from './types';

// =============================================================================
// Path Utilities
// =============================================================================

export function generationPath(generationId: GenerationId): string {
  return `generations/${generationId}/generation.json`;
}

export function nodeGenerationIndexPath(nodeId: NodeId): string {
  return `generations/byNode/${nodeId}.json`;
}

export function taskGenerationIndexesPath(taskId: TaskId): string {
  return `generations/byTask/${taskId}.json`;
}

export function generationUiMessageChunksPath(generationId: GenerationId): string {
  return `generations/${generationId}/ui-message-chunks.ndjson`;
}

export function generatedImagePath(generationId: GenerationId, filename: string): string {
  return `generations/${generationId}/generated-images/${filename}`;
}

// =============================================================================
// In-Memory Storage Implementation
// =============================================================================

export class InMemoryStorage implements GenerationStorage {
  private jsonStore: Map<string, unknown> = new Map();
  private blobStore: Map<string, Uint8Array> = new Map();

  async exists(path: string): Promise<boolean> {
    return this.jsonStore.has(path) || this.blobStore.has(path);
  }

  async getJson<T>(params: { path: string }): Promise<T> {
    const data = this.jsonStore.get(params.path);
    if (data === undefined) {
      throw new Error(`Data not found at path: ${params.path}`);
    }
    return data as T;
  }

  async setJson<T>(params: { path: string; data: T }): Promise<void> {
    this.jsonStore.set(params.path, params.data);
  }

  async getBlob(
    path: string,
    options?: { range?: { start?: number; end?: number } },
  ): Promise<Uint8Array> {
    const data = this.blobStore.get(path);
    if (data === undefined) {
      throw new Error(`Blob not found at path: ${path}`);
    }
    if (options?.range) {
      const start = options.range.start ?? 0;
      const end = options.range.end ?? data.length;
      return data.slice(start, end);
    }
    return data;
  }

  async setBlob(path: string, data: Uint8Array): Promise<void> {
    this.blobStore.set(path, data);
  }

  async contentLength(path: string): Promise<number> {
    const data = this.blobStore.get(path);
    return data?.length ?? 0;
  }

  clear(): void {
    this.jsonStore.clear();
    this.blobStore.clear();
  }
}

// =============================================================================
// LocalStorage-Based Storage Implementation
// =============================================================================

export class LocalStorageStorage implements GenerationStorage {
  private prefix: string;

  constructor(prefix = 'recoder_generations') {
    this.prefix = prefix;
  }

  private getKey(path: string): string {
    return `${this.prefix}:${path}`;
  }

  async exists(path: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.getKey(path)) !== null;
  }

  async getJson<T>(params: { path: string }): Promise<T> {
    if (typeof window === 'undefined') {
      throw new Error('LocalStorage not available');
    }
    const data = localStorage.getItem(this.getKey(params.path));
    if (data === null) {
      throw new Error(`Data not found at path: ${params.path}`);
    }
    return JSON.parse(data) as T;
  }

  async setJson<T>(params: { path: string; data: T }): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.getKey(params.path), JSON.stringify(params.data));
  }

  async getBlob(
    path: string,
    options?: { range?: { start?: number; end?: number } },
  ): Promise<Uint8Array> {
    if (typeof window === 'undefined') {
      throw new Error('LocalStorage not available');
    }
    const data = localStorage.getItem(this.getKey(path));
    if (data === null) {
      throw new Error(`Blob not found at path: ${path}`);
    }
    // Decode base64 string to Uint8Array
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (options?.range) {
      const start = options.range.start ?? 0;
      const end = options.range.end ?? bytes.length;
      return bytes.slice(start, end);
    }
    return bytes;
  }

  async setBlob(path: string, data: Uint8Array): Promise<void> {
    if (typeof window === 'undefined') return;
    // Encode Uint8Array to base64 string
    const binary = Array.from(data)
      .map((b) => String.fromCharCode(b))
      .join('');
    localStorage.setItem(this.getKey(path), btoa(binary));
  }

  async contentLength(path: string): Promise<number> {
    if (typeof window === 'undefined') return 0;
    const data = localStorage.getItem(this.getKey(path));
    if (data === null) return 0;
    const binary = atob(data);
    return binary.length;
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}

// =============================================================================
// API-Based Storage Implementation
// =============================================================================

export class ApiStorage implements GenerationStorage {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}/${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options?.headers,
      },
    });
    return response;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const response = await this.fetch(`storage/exists?path=${encodeURIComponent(path)}`);
      if (!response.ok) return false;
      const data = (await response.json()) as Record<string, any>;
      return data.exists;
    } catch {
      return false;
    }
  }

  async getJson<T>(params: { path: string }): Promise<T> {
    const response = await this.fetch(`storage/json?path=${encodeURIComponent(params.path)}`);
    if (!response.ok) {
      throw new Error(`Failed to get JSON at path: ${params.path}`);
    }
    return response.json();
  }

  async setJson<T>(params: { path: string; data: T }): Promise<void> {
    const response = await this.fetch('storage/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: params.path,
        data: params.data,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set JSON at path: ${params.path}`);
    }
  }

  async getBlob(
    path: string,
    options?: { range?: { start?: number; end?: number } },
  ): Promise<Uint8Array> {
    const headers: Record<string, string> = {};
    if (options?.range) {
      const start = options.range.start ?? 0;
      const end = options.range.end ? options.range.end - 1 : '';
      headers['Range'] = `bytes=${start}-${end}`;
    }
    const response = await this.fetch(`storage/blob?path=${encodeURIComponent(path)}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to get blob at path: ${path}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async setBlob(path: string, data: Uint8Array): Promise<void> {
    const response = await this.fetch('storage/blob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Path': path,
      },
      body: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer]),
    });
    if (!response.ok) {
      throw new Error(`Failed to set blob at path: ${path}`);
    }
  }

  async contentLength(path: string): Promise<number> {
    const response = await this.fetch(`storage/length?path=${encodeURIComponent(path)}`);
    if (!response.ok) return 0;
    const data = (await response.json()) as Record<string, any>;
    return data.length ?? 0;
  }
}

// =============================================================================
// Generation Storage Operations
// =============================================================================

export async function getGeneration(params: {
  storage: GenerationStorage;
  generationId: GenerationId;
}): Promise<Generation | undefined> {
  const path = generationPath(params.generationId);
  const exists = await params.storage.exists(path);
  if (!exists) {
    return undefined;
  }
  return params.storage.getJson<Generation>({ path });
}

export async function setGeneration(params: {
  storage: GenerationStorage;
  generation: Generation;
}): Promise<void> {
  const path = generationPath(params.generation.id);
  await params.storage.setJson({ path, data: params.generation });
}

export async function getNodeGenerationIndexes(params: {
  storage: GenerationStorage;
  nodeId: NodeId;
}): Promise<NodeGenerationIndex[] | undefined> {
  const path = nodeGenerationIndexPath(params.nodeId);
  const exists = await params.storage.exists(path);
  if (!exists) {
    return undefined;
  }
  return params.storage.getJson<NodeGenerationIndex[]>({ path });
}

export async function setNodeGenerationIndexes(params: {
  storage: GenerationStorage;
  nodeId: NodeId;
  indexes: NodeGenerationIndex[];
}): Promise<void> {
  const path = nodeGenerationIndexPath(params.nodeId);
  await params.storage.setJson({ path, data: params.indexes });
}

export async function getTaskGenerationIndexes(params: {
  storage: GenerationStorage;
  taskId: TaskId;
}): Promise<NodeGenerationIndex[] | undefined> {
  const path = taskGenerationIndexesPath(params.taskId);
  const exists = await params.storage.exists(path);
  if (!exists) {
    return undefined;
  }
  return params.storage.getJson<NodeGenerationIndex[]>({ path });
}

export async function setTaskGenerationIndexes(params: {
  storage: GenerationStorage;
  taskId: TaskId;
  indexes: NodeGenerationIndex[];
}): Promise<void> {
  const path = taskGenerationIndexesPath(params.taskId);
  await params.storage.setJson({ path, data: params.indexes });
}

export async function getGeneratedImage(params: {
  storage: GenerationStorage;
  generationId: GenerationId;
  filename: string;
}): Promise<Uint8Array> {
  const path = generatedImagePath(params.generationId, params.filename);
  return params.storage.getBlob(path);
}

export async function setGeneratedImage(params: {
  storage: GenerationStorage;
  generationId: GenerationId;
  filename: string;
  data: Uint8Array;
}): Promise<void> {
  const path = generatedImagePath(params.generationId, params.filename);
  await params.storage.setBlob(path, params.data);
}
