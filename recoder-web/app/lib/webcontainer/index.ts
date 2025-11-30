import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { installRecoderCLI } from './cli-installer';

interface WebContainerContext {
  loaded: boolean;
  bootAttempts: number;
  lastBootTime: number | null;
  healthy: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
  bootAttempts: 0,
  lastBootTime: null,
  healthy: true,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(async () => {
        // Retry logic for WebContainer boot
        let retries = 3;
        let lastError;
        const startTime = Date.now();

        while (retries > 0) {
          try {
            webcontainerContext.bootAttempts++;
            console.log(`🚀 Booting WebContainer (attempt ${webcontainerContext.bootAttempts})...`);

            const wc = await WebContainer.boot({ workdirName: WORK_DIR_NAME });

            const bootDuration = Date.now() - startTime;
            console.log(`✅ WebContainer booted successfully in ${bootDuration}ms`);

            webcontainerContext.healthy = true;
            webcontainerContext.lastBootTime = bootDuration;

            // Install recoder-code CLI in background
            installRecoderCLI(wc).catch((error) => {
              console.warn('⚠️ Failed to install recoder-code CLI:', error);
            });

            return wc;
          } catch (error) {
            lastError = error;
            retries--;
            webcontainerContext.healthy = false;

            console.warn(`⚠️ WebContainer boot failed, ${retries} retries left:`, error);

            if (retries > 0) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
            }
          }
        }

        console.error('❌ WebContainer failed to boot after all attempts:', lastError);
        webcontainerContext.healthy = false;
        throw lastError;
      })
      .then((webcontainer) => {
        webcontainerContext.loaded = true;
        return webcontainer;
      })
      .catch((error) => {
        webcontainerContext.loaded = false;
        webcontainerContext.healthy = false;
        throw error;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}

/**
 * Get WebContainer health status
 */
export function getWebContainerHealth() {
  return {
    loaded: webcontainerContext.loaded,
    healthy: webcontainerContext.healthy,
    bootAttempts: webcontainerContext.bootAttempts,
    lastBootTime: webcontainerContext.lastBootTime,
  };
}
