import { PWAConfig } from '../types';

export function generateInstallPrompt(config: PWAConfig): string {
  return `// Install Prompt Manager for ${config.name}
// Auto-generated PWA install prompt functionality

class InstallPromptManager {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.isInstalled = false;
    this.init();
  }

  init() {
    // Check if app is already installed
    this.checkInstallStatus();
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA install prompt available');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
      this.isInstalled = true;
      this.hideInstallButton();
      this.deferredPrompt = null;
      this.trackInstallEvent();
    });

    // Check if already installed
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
    }
  }

  checkInstallStatus() {
    // Check various indicators of app installation
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    const isInstalled = isStandalone || isIOSStandalone;
    
    if (isInstalled) {
      this.isInstalled = true;
      console.log('PWA is already installed');
    }
  }

  showInstallButton() {
    if (this.isInstalled) return;
    
    // Create install button if it doesn't exist
    if (!this.installButton) {
      this.createInstallButton();
    }
    
    if (this.installButton) {
      this.installButton.style.display = 'flex';
    }
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  createInstallButton() {
    this.installButton = document.createElement('button');
    this.installButton.id = 'pwa-install-button';
    this.installButton.innerHTML = \`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
      Install App
    \`;
    
    // Style the button
    Object.assign(this.installButton.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '${config.themeColor}',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      display: 'none',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: '1000',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      transition: 'transform 0.2s ease'
    });

    // Add hover effect
    this.installButton.addEventListener('mouseenter', () => {
      if (this.installButton) {
        this.installButton.style.transform = 'scale(1.05)';
      }
    });

    this.installButton.addEventListener('mouseleave', () => {
      if (this.installButton) {
        this.installButton.style.transform = 'scale(1)';
      }
    });

    // Add click handler
    this.installButton.addEventListener('click', () => {
      this.promptInstall();
    });

    // Add to page
    document.body.appendChild(this.installButton);
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      console.log('No install prompt available');
      return false;
    }

    try {
      // Show the install prompt
      this.deferredPrompt.prompt();
      
      // Wait for user response
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        this.trackInstallEvent();
        return true;
      } else {
        console.log('User dismissed the install prompt');
        this.trackDismissEvent();
        return false;
      }
    } catch (error) {
      console.error('Error showing install prompt:', error);
      return false;
    } finally {
      this.deferredPrompt = null;
      this.hideInstallButton();
    }
  }

  isInstallable() {
    return !!this.deferredPrompt && !this.isInstalled;
  }

  isAppInstalled() {
    return this.isInstalled;
  }

  trackInstallEvent() {
    // Track install event (integrate with your analytics)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pwa_install', {
        event_category: 'PWA',
        event_label: '${config.name}'
      });
    }
    
    // Custom event for your app
    window.dispatchEvent(new CustomEvent('pwa-installed', {
      detail: { appName: '${config.name}' }
    }));
  }

  trackDismissEvent() {
    // Track dismiss event
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pwa_install_dismissed', {
        event_category: 'PWA',
        event_label: '${config.name}'
      });
    }
  }

  // Utility methods for manual integration
  showCustomPrompt(buttonSelector) {
    const button = document.querySelector(buttonSelector);
    if (button && this.isInstallable()) {
      button.style.display = 'block';
      button.addEventListener('click', () => this.promptInstall());
    }
  }

  hideCustomPrompt(buttonSelector) {
    const button = document.querySelector(buttonSelector);
    if (button) {
      button.style.display = 'none';
    }
  }
}

// Auto-initialize if install prompt is enabled
${config.features.installPrompt ? `
// Initialize install prompt manager
window.addEventListener('DOMContentLoaded', () => {
  window.installPromptManager = new InstallPromptManager();
});

// Export for manual control
window.InstallPromptManager = InstallPromptManager;
` : '// Install prompt disabled in configuration'}
`;
}
