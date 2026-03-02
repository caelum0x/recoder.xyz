export {};

declare global {
  interface RecoderDesktopBridge {
    isDesktop?: boolean;
    getAgentWorkflowPlan?: (payload?: Record<string, unknown>) => Promise<any>;
    delegateTask?: (payload?: Record<string, unknown>) => Promise<any>;
    getDelegatedTaskStatus?: (payload?: Record<string, unknown>) => Promise<any>;
    pollDelegatedTaskStatus?: (payload?: Record<string, unknown>) => Promise<any>;
  }

  interface Window {
    recoderDesktop?: RecoderDesktopBridge;
  }
}

