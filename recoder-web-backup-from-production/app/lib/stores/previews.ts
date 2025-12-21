import { atom } from 'nanostores';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export class PreviewsStore {
  #projectId: string | null = null;
  previews = atom<PreviewInfo[]>([]);

  setProjectId(projectId: string) {
    this.#projectId = projectId;

    // Immediately set preview URL - the 502 error page has auto-reload logic
    // that will keep trying until dev server starts (every 3 seconds)
    const previewInfo: PreviewInfo = {
      port: 5173,
      ready: false, // Will become ready when dev server starts
      baseUrl: `${DOCKER_URL}/preview/${projectId}`,
    };

    this.previews.set([previewInfo]);
    console.log('🐳 [PreviewsStore] Preview URL set (will auto-reload until server ready):', previewInfo.baseUrl);
  }

  // Called when dev server is confirmed running (optional - for status updates)
  setPreviewReady() {
    if (!this.#projectId) return;

    const currentPreviews = this.previews.get();
    if (currentPreviews.length > 0) {
      // Just update ready status
      const updated = currentPreviews.map(p => ({ ...p, ready: true }));
      this.previews.set(updated);
      console.log('✅ [PreviewsStore] Dev server confirmed ready');
    }
  }
}
