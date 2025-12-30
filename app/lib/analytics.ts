// Google Analytics event tracking

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// Pre-defined events
export const analytics = {
  // Auth events
  signUp: (method: 'email' | 'google' | 'github') => {
    trackEvent('sign_up', { method });
  },

  signIn: (method: 'email' | 'google' | 'github') => {
    trackEvent('login', { method });
  },

  signOut: () => {
    trackEvent('logout');
  },

  // Feature usage
  launchWebIDE: () => {
    trackEvent('launch_web_ide');
  },

  createProject: (type?: string) => {
    trackEvent('create_project', { project_type: type });
  },

  apiKeyAdded: (provider: string) => {
    trackEvent('api_key_added', { provider });
  },

  // Page views (automatic with GA, but useful for SPAs)
  pageView: (pagePath: string, pageTitle?: string) => {
    trackEvent('page_view', {
      page_path: pagePath,
      page_title: pageTitle,
    });
  },
};
