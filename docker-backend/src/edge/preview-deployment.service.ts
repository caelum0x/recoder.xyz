import { loadStore, saveStore, debouncedSave } from '../persistence.js';
import { createPreviewAccessToken, type PreviewProtectionMode } from './preview-access.js';
import { getEdgeSecurityPolicy } from './edge-security.js';

export interface PreviewDeploymentRecord {
  id: string;
  createdOrder: number;
  projectId: string;
  taskId?: string;
  workspaceId?: string;
  threadId?: string;
  traceId?: string;
  prNumber?: number;
  prUrl?: string;
  branchName?: string;
  status: 'ready' | 'failed';
  protectionMode: PreviewProtectionMode;
  basePreviewUrl: string;
  protectedPreviewUrl: string;
  plainPreviewPath: string;
  protectedPreviewPath: string;
  edgeHost: string;
  artifactKey: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

interface CreatePreviewDeploymentInput {
  projectId: string;
  taskId?: string;
  workspaceId?: string;
  threadId?: string;
  traceId?: string;
  prNumber?: number;
  prUrl?: string;
  branchName?: string;
  protectionMode?: PreviewProtectionMode;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

const STORE_NAME = 'preview-deployments';
const STORE_DEBOUNCE_MS = 250;
const DOCKER_PUBLIC_URL = process.env.DOCKER_PUBLIC_URL || 'https://docker.recoder.xyz';
const EDGE_PREVIEW_BASE_DOMAIN = process.env.RECODER_EDGE_PREVIEW_BASE_DOMAIN || 'preview.recoder.xyz';
let previewDeploymentOrder = 0;

function loadPreviewDeployments(): Map<string, PreviewDeploymentRecord> {
  const entries = loadStore<[string, PreviewDeploymentRecord][]>(STORE_NAME, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function savePreviewDeployments(store: Map<string, PreviewDeploymentRecord>): void {
  debouncedSave(STORE_NAME, [...store.entries()], STORE_DEBOUNCE_MS);
}

function buildDeploymentId(): string {
  return `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeHostLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'preview';
}

function buildEdgeHost(projectId: string, deploymentId: string): string {
  return `preview-${sanitizeHostLabel(projectId)}-${sanitizeHostLabel(deploymentId)}.${EDGE_PREVIEW_BASE_DOMAIN}`;
}

export class PreviewDeploymentService {
  private readonly store: Map<string, PreviewDeploymentRecord>;

  constructor(store?: Map<string, PreviewDeploymentRecord>) {
    this.store = store ?? loadPreviewDeployments();
  }

  create(input: CreatePreviewDeploymentInput): PreviewDeploymentRecord {
    const id = buildDeploymentId();
    const protectionMode = input.protectionMode ?? getEdgeSecurityPolicy().defaultPreviewProtectionMode;
    const plainPreviewPath = `/preview/${encodeURIComponent(input.projectId)}`;
    const artifactKey = `preview-deployment:${id}`;
    const edgeHost = buildEdgeHost(input.projectId, id);

    let protectedPreviewPath = plainPreviewPath;
    let protectedPreviewUrl = `${DOCKER_PUBLIC_URL}${plainPreviewPath}`;

    if (protectionMode !== 'public') {
      const token = createPreviewAccessToken({
        projectId: input.projectId,
        deploymentId: id,
        mode: protectionMode,
        taskId: input.taskId,
      });
      protectedPreviewPath = `/preview-access/${encodeURIComponent(token)}/${encodeURIComponent(input.projectId)}`;
      protectedPreviewUrl = `${DOCKER_PUBLIC_URL}${protectedPreviewPath}`;
    }

    const record: PreviewDeploymentRecord = {
      id,
      createdOrder: ++previewDeploymentOrder,
      projectId: input.projectId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(typeof input.prNumber === 'number' ? { prNumber: input.prNumber } : {}),
      ...(input.prUrl ? { prUrl: input.prUrl } : {}),
      ...(input.branchName ? { branchName: input.branchName } : {}),
      status: 'ready',
      protectionMode,
      basePreviewUrl: `${DOCKER_PUBLIC_URL}${plainPreviewPath}`,
      protectedPreviewUrl,
      plainPreviewPath,
      protectedPreviewPath,
      edgeHost,
      artifactKey,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    this.store.set(id, record);
    savePreviewDeployments(this.store);
    return record;
  }

  get(id: string): PreviewDeploymentRecord | undefined {
    return this.store.get(id);
  }

  listByProject(projectId: string): PreviewDeploymentRecord[] {
    return [...this.store.values()]
      .filter((record) => record.projectId === projectId)
      .sort((a, b) => (b.createdOrder || 0) - (a.createdOrder || 0) || b.createdAt.localeCompare(a.createdAt));
  }

  getLatestByProject(projectId: string): PreviewDeploymentRecord | undefined {
    return this.listByProject(projectId)[0];
  }

  getLatestByTask(taskId: string): PreviewDeploymentRecord | undefined {
    return [...this.store.values()]
      .filter((record) => record.taskId === taskId)
      .sort((a, b) => (b.createdOrder || 0) - (a.createdOrder || 0) || b.createdAt.localeCompare(a.createdAt))[0];
  }

  listRecent(limit = 20): PreviewDeploymentRecord[] {
    return [...this.store.values()]
      .sort((a, b) => (b.createdOrder || 0) - (a.createdOrder || 0) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, limit));
  }

  reset(): void {
    this.store.clear();
    saveStore(STORE_NAME, []);
  }
}

let instance: PreviewDeploymentService | null = null;

export function getPreviewDeploymentService(): PreviewDeploymentService {
  if (!instance) {
    instance = new PreviewDeploymentService();
  }
  return instance;
}

export function resetPreviewDeploymentService(): void {
  previewDeploymentOrder = 0;
  instance = null;
}
