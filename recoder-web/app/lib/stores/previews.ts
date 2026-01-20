import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { dockerFetch, dockerGet, DOCKER_URL } from '~/lib/services/docker-api';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  projectId?: string;
}

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #heartbeatInterval?: NodeJS.Timeout;
  #useDocker: boolean = false;
  #projectId: string | null = null;
  #initPromise: Promise<void>;
  // PERFORMANCE: Track subscription cleanup to prevent memory leaks
  #containerReadyUnsubscribe?: () => void;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
    this.#initPromise = this.#init();
  }

  async setProjectId(projectId: string) {
    this.#projectId = projectId;
    
    // Wait for init to complete first
    await this.#initPromise;
    
    if (this.#useDocker && DOCKER_URL) {
      this.#initDockerPreview();
    }
  }

  async #init() {
    if (DOCKER_URL) {
      try {
        const res = await dockerFetch('/health', { signal: AbortSignal.timeout(2000) }) as Response;
        if (res.ok) {
          this.#useDocker = true;
        }
      } catch {
        this.#useDocker = false;
      }
    }

    // Don't init Docker preview yet - wait for projectId to be set
    if (this.#useDocker) {
      // Docker preview will be initialized when setProjectId is called
    } else {
      this.#initWebContainerPreview();
    }
  }

  #initDockerPreview() {
    if (!this.#projectId) {
      console.warn('⚠️ [PreviewsStore] Cannot init Docker preview without projectId');
      return;
    }

    // Don't set ready: true immediately - wait for containerReady
    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: false, // ✅ Not ready until containerReady is true
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId}`,
      projectId: this.#projectId,
    };
    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);
    console.log('🔄 [PreviewsStore] Docker preview URL set (waiting for containerReady):', previewInfo.baseUrl);

    // Subscribe to containerReady - only start polling when container is confirmed ready
    this.#waitForContainerReady();
  }

  async #waitForContainerReady() {
    if (!this.#projectId || !DOCKER_URL) return;

    try {
      // Import workbenchStore dynamically to avoid circular dependency
      const { workbenchStore } = await import('./workbench');

      // Check if already ready
      if (workbenchStore.containerReady.get()) {
        console.log('✅ [PreviewsStore] Container already ready, enabling preview');
        this.#enablePreview();
        return;
      }

      // PERFORMANCE: Subscribe to containerReady changes and track for cleanup
      this.#containerReadyUnsubscribe = workbenchStore.containerReady.subscribe((ready) => {
        if (ready) {
          console.log('✅ [PreviewsStore] containerReady became true, enabling preview');
          this.#containerReadyUnsubscribe?.();
          this.#containerReadyUnsubscribe = undefined;
          this.#enablePreview();
        }
      });
    } catch (e) {
      console.warn('⚠️ [PreviewsStore] Could not subscribe to containerReady:', e);
      // Fallback: poll for health after delay
      setTimeout(() => this.#pollForDevServer(), 5000);
    }
  }

  #enablePreview() {
    if (!this.#projectId) return;

    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: true,
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId}`,
      projectId: this.#projectId,
    };
    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);
    console.log('✅ [PreviewsStore] Preview enabled');
  }

  async #pollForDevServer() {
    if (!this.#projectId || !DOCKER_URL) return;

    const maxAttempts = 30; // 30 attempts * 2s = 60s max
    let attempts = 0;

    const checkHealth = async () => {
      attempts++;
      try {
        const res = await dockerGet(`/api/preview/${this.#projectId}/health`) as Response;
        if (res.ok) {
          const data = await res.json() as { ports: Array<{ port: number; responding: boolean }> };
          const respondingPort = data.ports.find((p: { port: number; responding: boolean }) => p.responding);

          if (respondingPort) {
            this.#enablePreview();
            return; // Stop polling
          }
        }
      } catch {
        // Ignore errors, keep polling
      }

      // Keep polling if not at max attempts
      if (attempts < maxAttempts) {
        setTimeout(checkHealth, 2000);
      } else {
        console.warn('⚠️ [PreviewsStore] Dev server health check timed out');
        this.#enablePreview(); // Allow manual refresh
      }
    };

    setTimeout(checkHealth, 2000);
  }

  async #initWebContainerPreview() {
    try {
      const webcontainer = await this.#webcontainer;

      webcontainer.on('port', (port, type, url) => {
        let previewInfo = this.#availablePreviews.get(port);

        if (type === 'close' && previewInfo) {
          this.#availablePreviews.delete(port);
          this.previews.set(this.previews.get().filter((preview) => preview.port !== port));
          return;
        }

        const previews = this.previews.get();

        if (!previewInfo) {
          previewInfo = { port, ready: type === 'open', baseUrl: url };
          this.#availablePreviews.set(port, previewInfo);
          previews.push(previewInfo);
        }

        previewInfo.ready = type === 'open';
        previewInfo.baseUrl = url;
        this.previews.set([...previews]);
      });

      this.#startHeartbeat();
    } catch (error) {
      console.error('Failed to initialize preview store:', error);
    }
  }

  updateDockerPreview(projectId: string, port: number = 3000) {
    if (!this.#useDocker || !DOCKER_URL) return;

    this.#projectId = projectId;
    const previewInfo: PreviewInfo = {
      port,
      ready: true,
      baseUrl: `${DOCKER_URL}/preview/${projectId}`,
    };
    this.#availablePreviews.set(port, previewInfo);
    this.previews.set([previewInfo]);
  }

  #startHeartbeat() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
    }

    this.#heartbeatInterval = setInterval(async () => {
      const previews = this.previews.get();
      if (previews.length === 0) return;

      for (const preview of previews) {
        if (preview.ready && preview.baseUrl) {
          try {
            await fetch(preview.baseUrl, { method: 'HEAD', cache: 'no-cache' }).catch(() => {});
          } catch {}
        }
      }
    }, 60000);
  }

  isUsingDocker(): boolean {
    return this.#useDocker;
  }

  // PERFORMANCE: Proper cleanup to prevent memory leaks
  destroy() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      this.#heartbeatInterval = undefined;
    }
    // Clean up containerReady subscription if still active
    if (this.#containerReadyUnsubscribe) {
      this.#containerReadyUnsubscribe();
      this.#containerReadyUnsubscribe = undefined;
    }
  }
}
