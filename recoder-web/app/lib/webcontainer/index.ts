// WebContainer disabled - using docker-backend instead
// This file exists for compatibility with imports

export const webcontainerContext = {
  loaded: false,
  bootAttempts: 0,
  lastBootTime: null,
  healthy: false,
};

// Return a promise that never resolves (docker-backend handles everything)
export const webcontainer: Promise<never> = new Promise(() => {});

export function getWebContainerHealth() {
  return {
    loaded: false,
    healthy: false,
    bootAttempts: 0,
    lastBootTime: null,
  };
}
