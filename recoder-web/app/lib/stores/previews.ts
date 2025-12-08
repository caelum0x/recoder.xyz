import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';

// Docker backend URL from environment
const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || null;

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #heartbeatInterval?: NodeJS.Timeout;
  #useDocker: boolean = false;
  #projectId: string | null = null;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
    this.#init();
  }

  setProjectId(projectId: string) {
    this.#projectId = projectId;
    // Reinitialize Docker preview with new projectId
    if (this.#useDocker && DOCKER_URL) {
      this.#initDockerPreview();
    }
  }

  async #init() {
    console.log('📺 [PreviewsStore] Initializing preview store...');

    // Check if Docker is available
    if (DOCKER_URL) {
      try {
        const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          this.#useDocker = true;
          console.log('🐳 [PreviewsStore] Docker backend available for previews');
        }
      } catch {
        this.#useDocker = false;
      }
    }

    if (this.#useDocker) {
      // Docker preview - add default preview
      this.#initDockerPreview();
    } else {
      // WebContainer preview
      this.#initWebContainerPreview();
    }
  }

  #initDockerPreview() {
    // For Docker, we create a preview that points to the Docker proxy
    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: true,
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId || 'default'}`,
    };

    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);

    console.log('🐳 [PreviewsStore] Docker preview initialized:', previewInfo.baseUrl);
  }

  async #initWebContainerPreview() {
    try {
      console.log('📺 [PreviewsStore] Waiting for WebContainer...');
      const webcontainer = await this.#webcontainer;
      console.log('✅ [PreviewsStore] WebContainer ready, setting up port listener...');

      webcontainer.on('port', (port, type, url) => {
        console.log('📺 [PreviewsStore] Port event:', { port, type, url });

        let previewInfo = this.#availablePreviews.get(port);

        if (type === 'close' && previewInfo) {
          console.log('📺 [PreviewsStore] Closing preview for port:', port);
          this.#availablePreviews.delete(port);
          this.previews.set(this.previews.get().filter((preview) => preview.port !== port));
          return;
        }

        const previews = this.previews.get();

        if (!previewInfo) {
          console.log('📺 [PreviewsStore] Creating new preview info for port:', port);
          previewInfo = { port, ready: type === 'open', baseUrl: url };
          this.#availablePreviews.set(port, previewInfo);
          previews.push(previewInfo);
        }

        previewInfo.ready = type === 'open';
        previewInfo.baseUrl = url;

        console.log('📺 [PreviewsStore] Preview updated:', {
          port,
          ready: previewInfo.ready,
          baseUrl: previewInfo.baseUrl,
          totalPreviews: previews.length,
        });

        this.previews.set([...previews]);
      });

      console.log('✅ [PreviewsStore] Preview store initialized successfully');
      this.#startHeartbeat();
    } catch (error) {
      console.error('❌ [PreviewsStore] Failed to initialize preview store:', error);
    }
  }

  // Update Docker preview URL when project changes
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

    console.log('🐳 [PreviewsStore] Docker preview updated:', previewInfo.baseUrl);
  }

  #startHeartbeat() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
    }

    this.#heartbeatInterval = setInterval(async () => {
      const previews = this.previews.get();

      if (previews.length === 0) return;

      console.log('💓 [PreviewsStore] Heartbeat - checking', previews.length, 'previews');

      for (const preview of previews) {
        if (preview.ready && preview.baseUrl) {
          try {
            await fetch(preview.baseUrl, { method: 'HEAD', cache: 'no-cache' }).catch(() => {});
          } catch {}
        }
      }
    }, 60000);

    console.log('💓 [PreviewsStore] Heartbeat started');
  }

  isUsingDocker(): boolean {
    return this.#useDocker;
  }

  destroy() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      console.log('💓 [PreviewsStore] Heartbeat stopped');
    }
  }
}
