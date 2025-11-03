import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #heartbeatInterval?: NodeJS.Timeout;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    this.#init();
  }

  async #init() {
    console.log('📺 [PreviewsStore] Initializing preview store...');
    
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
        } else {
          console.log('📺 [PreviewsStore] Updating existing preview for port:', port);
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

      // Start heartbeat to keep previews alive
      this.#startHeartbeat();
    } catch (error) {
      console.error('❌ [PreviewsStore] Failed to initialize preview store:', error);
    }
  }

  #startHeartbeat() {
    // Clear any existing heartbeat
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
    }

    // Ping previews every 60 seconds to keep them alive
    this.#heartbeatInterval = setInterval(async () => {
      const previews = this.previews.get();

      if (previews.length === 0) {
        return;
      }

      console.log('💓 [PreviewsStore] Heartbeat - checking', previews.length, 'previews');

      for (const preview of previews) {
        if (preview.ready && preview.baseUrl) {
          try {
            // Send a lightweight HEAD request to keep connection alive
            await fetch(preview.baseUrl, {
              method: 'HEAD',
              cache: 'no-cache'
            }).catch(() => {
              // Ignore errors, just trying to keep connection alive
              console.log('💓 [PreviewsStore] Heartbeat ping for port', preview.port);
            });
          } catch (error) {
            // Silently ignore errors
          }
        }
      }
    }, 60000); // Every 60 seconds

    console.log('💓 [PreviewsStore] Heartbeat started');
  }

  destroy() {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      console.log('💓 [PreviewsStore] Heartbeat stopped');
    }
  }
}
