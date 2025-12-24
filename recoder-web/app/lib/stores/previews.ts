import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';

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
    if (this.#useDocker && DOCKER_URL) {
      this.#initDockerPreview();
    }
  }

  async #init() {
    if (DOCKER_URL) {
      try {
        const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          this.#useDocker = true;
        }
      } catch {
        this.#useDocker = false;
      }
    }

    if (this.#useDocker) {
      this.#initDockerPreview();
    } else {
      this.#initWebContainerPreview();
    }
  }

  #initDockerPreview() {
    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: true,
      baseUrl: `${DOCKER_URL}/preview/${this.#projectId || 'default'}`,
    };
    this.#availablePreviews.set(3000, previewInfo);
    this.previews.set([previewInfo]);
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

  destroy() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
    }
  }
}
