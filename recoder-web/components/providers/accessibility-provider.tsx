'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AccessibilitySettings {
  highContrast: boolean;
  reduceMotion: boolean;
  largeFocus: boolean;
  colorBlindFriendly: boolean;
  fontSize: 'normal' | 'large' | 'extra-large';
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (newSettings: Partial<AccessibilitySettings>) => void;
  isScreenReaderActive: boolean;
  announceToScreenReader: (message: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | null>(null);

interface AccessibilityProviderProps {
  children: ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    highContrast: false,
    reduceMotion: false,
    largeFocus: false,
    colorBlindFriendly: false,
    fontSize: 'normal',
    screenReaderOptimized: false,
    keyboardNavigation: true,
  });

  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false);
  const [announcer, setAnnouncer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('accessibility-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        applyAccessibilitySettings(parsed);
      } catch (error) {
        console.error('Failed to parse accessibility settings:', error);
      }
    }

    // Detect screen reader
    detectScreenReader();

    // Create screen reader announcer element
    const announcerElement = document.createElement('div');
    announcerElement.setAttribute('aria-live', 'polite');
    announcerElement.setAttribute('aria-atomic', 'true');
    announcerElement.setAttribute('class', 'sr-only');
    announcerElement.setAttribute('id', 'accessibility-announcer');
    document.body.appendChild(announcerElement);
    setAnnouncer(announcerElement);

    // Add skip to content link
    addSkipToContentLink();

    // Monitor for system accessibility preference changes
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');

    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        updateSettings({ reduceMotion: true });
      }
    };

    const handleContrastChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        updateSettings({ highContrast: true });
      }
    };

    prefersReducedMotion.addEventListener('change', handleMotionChange);
    prefersHighContrast.addEventListener('change', handleContrastChange);

    return () => {
      prefersReducedMotion.removeEventListener('change', handleMotionChange);
      prefersHighContrast.removeEventListener('change', handleContrastChange);
      if (announcerElement.parentNode) {
        announcerElement.parentNode.removeChild(announcerElement);
      }
    };
  }, []);

  const detectScreenReader = () => {
    // Various methods to detect screen reader usage
    const hasScreenReader = 
      // Check for screen reader specific APIs
      'speechSynthesis' in window ||
      // Check for high contrast preference (often used by screen reader users)
      (typeof window !== 'undefined' && (window as any).matchMedia?.('(prefers-contrast: high)')?.matches) ||
      // Check for reduced motion preference
      (typeof window !== 'undefined' && (window as any).matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) ||
      // Check if user has previously enabled screen reader optimizations
      localStorage.getItem('screen-reader-optimized') === 'true';

    setIsScreenReaderActive(hasScreenReader);

    // Additional runtime detection
    let focusCount = 0;
    const detectFocusNavigation = () => {
      focusCount++;
      if (focusCount > 5) {
        // User is likely navigating with keyboard/screen reader
        setIsScreenReaderActive(true);
        document.removeEventListener('focusin', detectFocusNavigation);
      }
    };

    document.addEventListener('focusin', detectFocusNavigation);

    setTimeout(() => {
      document.removeEventListener('focusin', detectFocusNavigation);
    }, 10000);
  };

  const addSkipToContentLink = () => {
    const existingSkipLink = document.getElementById('skip-to-content');
    if (existingSkipLink) return;

    const skipLink = document.createElement('a');
    skipLink.id = 'skip-to-content';
    skipLink.href = '#main-content';
    skipLink.className = 'skip-to-content sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:bg-black focus:text-white focus:p-2 focus:z-50';
    skipLink.textContent = 'Skip to main content';
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const mainContent = document.getElementById('main-content') || 
                         document.querySelector('main') ||
                         document.querySelector('[role="main"]');
      if (mainContent) {
        mainContent.focus();
        mainContent.scrollIntoView({ behavior: 'smooth' });
      }
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
  };

  const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    applyAccessibilitySettings(updatedSettings);
    localStorage.setItem('accessibility-settings', JSON.stringify(updatedSettings));

    // Announce changes to screen reader
    const changes = Object.keys(newSettings)
      .filter(key => newSettings[key as keyof AccessibilitySettings] !== settings[key as keyof AccessibilitySettings])
      .map(key => {
        const value = newSettings[key as keyof AccessibilitySettings];
        const friendlyNames: Record<string, string> = {
          highContrast: 'High contrast mode',
          reduceMotion: 'Reduced motion',
          largeFocus: 'Large focus indicators',
          colorBlindFriendly: 'Color blind friendly mode',
          fontSize: 'Font size',
          screenReaderOptimized: 'Screen reader optimization',
          keyboardNavigation: 'Enhanced keyboard navigation',
        };
        
        return `${friendlyNames[key]} ${typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : `set to ${value}`}`;
      })
      .join(', ');

    if (changes) {
      announceToScreenReader(`Accessibility settings updated: ${changes}`);
    }
  };

  const applyAccessibilitySettings = (settings: AccessibilitySettings) => {
    const root = document.documentElement;

    // Apply classes based on settings
    root.classList.toggle('high-contrast', settings.highContrast);
    root.classList.toggle('reduce-motion', settings.reduceMotion);
    root.classList.toggle('large-focus', settings.largeFocus);
    root.classList.toggle('color-blind-friendly', settings.colorBlindFriendly);
    root.classList.toggle('screen-reader-optimized', settings.screenReaderOptimized);
    root.classList.toggle('enhanced-keyboard-nav', settings.keyboardNavigation);

    // Apply font size
    switch (settings.fontSize) {
      case 'large':
        root.style.setProperty('--base-font-size', '18px');
        break;
      case 'extra-large':
        root.style.setProperty('--base-font-size', '22px');
        break;
      default:
        root.style.removeProperty('--base-font-size');
    }

    // Apply high contrast styles
    if (settings.highContrast) {
      root.style.setProperty('--background', '#000000');
      root.style.setProperty('--foreground', '#ffffff');
      root.style.setProperty('--muted', '#1a1a1a');
      root.style.setProperty('--muted-foreground', '#e5e5e5');
      root.style.setProperty('--border', '#ffffff');
    } else {
      root.style.removeProperty('--background');
      root.style.removeProperty('--foreground');
      root.style.removeProperty('--muted');
      root.style.removeProperty('--muted-foreground');
      root.style.removeProperty('--border');
    }

    // Update meta tag for better screen reader support
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && settings.fontSize !== 'normal') {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1, user-scalable=yes');
    }
  };

  const announceToScreenReader = (message: string) => {
    if (!announcer) return;

    // Clear previous message
    announcer.textContent = '';
    
    // Add new message with a slight delay to ensure it's announced
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);

    // Clear message after announcement
    setTimeout(() => {
      announcer.textContent = '';
    }, 5000);
  };

  const value: AccessibilityContextType = {
    settings,
    updateSettings,
    isScreenReaderActive,
    announceToScreenReader,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}