import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { dockerFetch, dockerGet, DOCKER_URL } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewsStore');


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
    logger.info(`📺 [PreviewsStore] setProjectId called: ${projectId}`);
    this.#projectId = projectId;
    
    // Wait for init to complete first
    await this.#initPromise;
    
    logger.info(`📺 [PreviewsStore] Init complete, useDocker: ${this.#useDocker}, DOCKER_URL: ${DOCKER_URL}`);
    
    if (this.#useDocker && DOCKER_URL) {
      this.#initDockerPreview();
    }
  }

  async #init() {
    if (DOCKER_URL) {
      try {
        // dockerFetch returns parsed JSON, check for success response
        const res = await dockerFetch<{ status?: string }>('/health', { timeout: 2000, skipRetry: true });
        // Health endpoint returns { status: 'ok' } on success
        if (res && (res.status === 'ok' || res.status === 'healthy')) {
          this.#useDocker = true;
          logger.info('✅ [PreviewsStore] Docker backend health check passed, using Docker mode');
        } else {
          // Any successful response means Docker is available
          this.#useDocker = true;
          logger.info('✅ [PreviewsStore] Docker backend responded, using Docker mode');
        }
      } catch (e) {
        this.#useDocker = false;
        logger.info('⚠️ [PreviewsStore] Docker backend health check failed, using WebContainer mode:', e);
      }
    } else {
      logger.info('⚠️ [PreviewsStore] DOCKER_URL not set, using WebContainer mode');
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
      logger.warn('⚠️ [PreviewsStore] Cannot init Docker preview without projectId');
      return;
    }

    logger.info(`📺 [PreviewsStore] Initializing Docker preview for ${this.#projectId}`);

    // Don't set ready: true immediately - wait for containerReady
    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: false, // ✅ Not ready until containerReady is true
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId}`,
      projectId: this.#projectId,
    };
    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);
    logger.info('🔄 [PreviewsStore] Docker preview URL set (waiting for containerReady):', previewInfo.baseUrl);

    // Subscribe to containerReady - only start polling when container is confirmed ready
    this.#waitForContainerReady();
  }

  async #waitForContainerReady() {
    if (!this.#projectId || !DOCKER_URL) {
      logger.warn('⚠️ [PreviewsStore] Cannot wait for container ready - missing projectId or DOCKER_URL');
      return;
    }

    logger.info(`⏳ [PreviewsStore] Waiting for container ready: ${this.#projectId}`);

    try {
      // Import workbenchStore dynamically to avoid circular dependency
      const { workbenchStore } = await import('./workbench');

      // Check if already ready
      const isReady = workbenchStore.containerReady.get();
      logger.info(`📺 [PreviewsStore] Container ready state: ${isReady}`);
      
      if (isReady) {
        logger.info('✅ [PreviewsStore] Container already ready, checking dev server health');
        this.#pollForDevServer();
        return;
      }

      // PERFORMANCE: Subscribe to containerReady changes and track for cleanup
      logger.info('📺 [PreviewsStore] Subscribing to containerReady changes...');
      this.#containerReadyUnsubscribe = workbenchStore.containerReady.subscribe((ready) => {
        logger.info(`📺 [PreviewsStore] containerReady subscription fired: ${ready}`);
        if (ready) {
          logger.info('✅ [PreviewsStore] containerReady became true, checking dev server health');
          this.#containerReadyUnsubscribe?.();
          this.#containerReadyUnsubscribe = undefined;
          this.#pollForDevServer();
        }
      });
    } catch (e) {
      logger.warn('⚠️ [PreviewsStore] Could not subscribe to containerReady:', e);
      // Fallback: poll for health after delay
      setTimeout(() => this.#pollForDevServer(), 5000);
    }
  }

  #enablePreview() {
    if (!this.#projectId) {
      logger.warn('⚠️ [PreviewsStore] Cannot enable preview without projectId');
      return;
    }

    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: true,
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId}`,
      projectId: this.#projectId,
    };
    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);
    logger.info('✅ [PreviewsStore] Preview enabled:', previewInfo.baseUrl);
  }

  async #pollForDevServer() {
    if (!this.#projectId || !DOCKER_URL) return;

    const maxAttempts = 30; // 30 attempts * 2s = 60s max
    let attempts = 0;

    logger.info(`🔄 [PreviewsStore] Starting dev server health polling for ${this.#projectId}`);

    const checkHealth = async () => {
      attempts++;
      try {
        // dockerGet returns parsed JSON directly, not a Response object
        const data = await dockerGet<{ ports: Array<{ port: number; responding: boolean }> }>(
          `/api/preview/${this.#projectId}/health`, 
          { timeout: 10000, skipRetry: true }
        );
        
        logger.info(`🔍 [PreviewsStore] Health check attempt ${attempts}:`, data);
        
        const respondingPort = data?.ports?.find((p) => p.responding);

        if (respondingPort) {
          logger.info(`✅ [PreviewsStore] Dev server responding on port ${respondingPort.port}`);
          this.#enablePreview();
          return; // Stop polling
        }
      } catch (e) {
        logger.info(`⚠️ [PreviewsStore] Health check attempt ${attempts} failed:`, e);
        // Ignore errors, keep polling
      }

      // Keep polling if not at max attempts
      if (attempts < maxAttempts) {
        setTimeout(checkHealth, 2000);
      } else {
        logger.warn('⚠️ [PreviewsStore] Dev server health check timed out after 30 attempts');
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
      logger.error('Failed to initialize preview store:', error);
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
