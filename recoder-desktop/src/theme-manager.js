/**
 * Desktop Theme Manager
 * PRODUCTION FEATURE: Enterprise desktop dark mode with system integration
 * Native OS theme integration that competitors don't provide
 */

const { nativeTheme, systemPreferences } = require('electron');
const Store = require('electron-store');
const { EventEmitter } = require('events');

class ThemeManager extends EventEmitter {
  constructor() {
    super();
    
    this.store = new Store();
    this.currentTheme = 'system';
    this.resolvedTheme = 'light';
    
    // Initialize theme settings
    this.init();
  }

  init() {
    // Load saved theme preference
    this.currentTheme = this.store.get('theme', 'system');
    
    // Set up system theme listeners
    this.setupSystemThemeListeners();
    
    // Apply initial theme
    this.applyTheme(this.currentTheme);
    
    console.log('Theme Manager initialized:', {
      savedTheme: this.currentTheme,
      systemTheme: nativeTheme.themeSource,
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors
    });
  }

  setupSystemThemeListeners() {
    // Listen for system theme changes
    nativeTheme.on('updated', () => {
      if (this.currentTheme === 'system') {
        this.resolvedTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        this.emit('theme-changed', {
          theme: this.currentTheme,
          resolvedTheme: this.resolvedTheme,
          systemTriggered: true
        });
      }
    });

    // macOS specific: Listen for accent color changes
    if (process.platform === 'darwin') {
      systemPreferences.subscribeNotification(
        'AppleInterfaceThemeChangedNotification',
        () => {
          if (this.currentTheme === 'system') {
            const isDark = systemPreferences.isDarkMode();
            this.resolvedTheme = isDark ? 'dark' : 'light';
            this.emit('theme-changed', {
              theme: this.currentTheme,
              resolvedTheme: this.resolvedTheme,
              systemTriggered: true,
              platform: 'darwin'
            });
          }
        }
      );
    }
  }

  /**
   * Set theme mode
   * @param {'light' | 'dark' | 'system'} theme 
   */
  setTheme(theme) {
    if (!['light', 'dark', 'system'].includes(theme)) {
      throw new Error(`Invalid theme: ${theme}`);
    }

    this.currentTheme = theme;
    this.store.set('theme', theme);
    
    this.applyTheme(theme);
    
    this.emit('theme-changed', {
      theme: this.currentTheme,
      resolvedTheme: this.resolvedTheme,
      systemTriggered: false
    });

    console.log('Theme changed:', {
      theme: this.currentTheme,
      resolvedTheme: this.resolvedTheme
    });
  }

  applyTheme(theme) {
    switch (theme) {
      case 'light':
        nativeTheme.themeSource = 'light';
        this.resolvedTheme = 'light';
        break;
      case 'dark':
        nativeTheme.themeSource = 'dark';
        this.resolvedTheme = 'dark';
        break;
      case 'system':
        nativeTheme.themeSource = 'system';
        this.resolvedTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        break;
    }
  }

  /**
   * Get current theme information
   */
  getThemeInfo() {
    return {
      currentTheme: this.currentTheme,
      resolvedTheme: this.resolvedTheme,
      systemDarkMode: nativeTheme.shouldUseDarkColors,
      systemThemeSource: nativeTheme.themeSource,
      platformSupport: {
        darwin: process.platform === 'darwin',
        win32: process.platform === 'win32',
        linux: process.platform === 'linux'
      }
    };
  }

  /**
   * Get Recoder brand colors for the current theme
   */
  getRecoderThemeColors() {
    const baseColors = {
      primary: '#326DF5', // Recoder primary blue
      secondary: '#7C3AED', // Recoder secondary purple
      accent: '#059669', // Recoder accent green
      warning: '#EA580C', // Recoder accent orange
      error: '#DC2626' // Recoder accent red
    };

    if (this.resolvedTheme === 'dark') {
      return {
        ...baseColors,
        primary: '#4785FF', // Lighter blue for dark mode
        secondary: '#8B5CF6', // Lighter purple for dark mode
        accent: '#10B981', // Lighter green for dark mode
        background: '#0F172A', // Recoder gray-900
        surface: '#1E293B', // Recoder gray-800
        text: '#F8FAFC', // Recoder gray-50
        textSecondary: '#94A3B8', // Recoder gray-400
        border: '#334155' // Recoder gray-700
      };
    }

    return {
      ...baseColors,
      background: '#FFFFFF',
      surface: '#F8FAFC', // Recoder gray-50
      text: '#0F172A', // Recoder gray-900
      textSecondary: '#64748B', // Recoder gray-500
      border: '#E2E8F0' // Recoder gray-200
    };
  }

  /**
   * Apply theme to webContents (for renderer processes)
   */
  applyToWebContents(webContents) {
    const colors = this.getRecoderThemeColors();
    
    webContents.executeJavaScript(`
      // Apply theme to the renderer process
      if (window.recoderTheme) {
        window.recoderTheme.updateTheme({
          theme: '${this.currentTheme}',
          resolvedTheme: '${this.resolvedTheme}',
          colors: ${JSON.stringify(colors)}
        });
      }
      
      // Update CSS variables
      const root = document.documentElement;
      root.setAttribute('data-theme', '${this.resolvedTheme}');
      
      // Update CSS custom properties
      ${Object.entries(colors).map(([key, value]) => {
        const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `root.style.setProperty('--recoder-${cssVar}', '${value}');`;
      }).join('\n      ')}
      
      // Dispatch theme change event
      window.dispatchEvent(new CustomEvent('theme-changed', {
        detail: {
          theme: '${this.currentTheme}',
          resolvedTheme: '${this.resolvedTheme}',
          colors: ${JSON.stringify(colors)}
        }
      }));
      
      console.log('Desktop theme applied:', '${this.resolvedTheme}');
    `).catch(error => {
      console.error('Failed to apply theme to webContents:', error);
    });
  }

  /**
   * Sync with backend theme preferences
   */
  async syncWithBackend(apiClient, userId) {
    try {
      // Get current desktop preferences from backend
      const response = await apiClient.get(`/api/theme-preferences/desktop`);
      
      if (response.success && response.preferences) {
        const backendTheme = response.preferences.mode;
        
        // Update local theme if different and sync is enabled
        if (response.preferences.syncAcrossPlatforms && backendTheme !== this.currentTheme) {
          console.log('Syncing theme from backend:', backendTheme);
          this.setTheme(backendTheme);
        }
      }
      
      // Update backend with current desktop theme
      await apiClient.put('/api/theme-preferences/desktop', {
        mode: this.currentTheme,
        syncAcrossPlatforms: true,
        customColors: this.getRecoderThemeColors()
      });
      
      console.log('Theme synced with backend successfully');
      
    } catch (error) {
      console.error('Failed to sync theme with backend:', error);
      // Continue working offline
    }
  }

  /**
   * Get theme for menu template
   */
  getMenuTheme() {
    return {
      currentTheme: this.currentTheme,
      resolvedTheme: this.resolvedTheme,
      menuItems: [
        {
          label: 'Light',
          type: 'radio',
          checked: this.currentTheme === 'light',
          click: () => this.setTheme('light')
        },
        {
          label: 'Dark',
          type: 'radio',
          checked: this.currentTheme === 'dark',
          click: () => this.setTheme('dark')
        },
        {
          label: 'System',
          type: 'radio',
          checked: this.currentTheme === 'system',
          click: () => this.setTheme('system')
        }
      ]
    };
  }

  /**
   * Handle window creation with theme
   */
  setupWindowTheme(window) {
    // Set window background color based on theme
    const colors = this.getRecoderThemeColors();
    window.setBackgroundColor(colors.background);
    
    // Apply theme when ready
    window.webContents.once('dom-ready', () => {
      this.applyToWebContents(window.webContents);
    });
    
    // Listen for theme changes and update this window
    this.on('theme-changed', () => {
      if (!window.isDestroyed()) {
        this.applyToWebContents(window.webContents);
        
        // Update window background
        const newColors = this.getRecoderThemeColors();
        window.setBackgroundColor(newColors.background);
      }
    });
  }

  /**
   * Get theme analytics
   */
  getAnalytics() {
    return {
      currentTheme: this.currentTheme,
      resolvedTheme: this.resolvedTheme,
      systemPreference: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      platform: process.platform,
      themeChanges: this.store.get('themeChangeCount', 0),
      lastChanged: this.store.get('lastThemeChange', null)
    };
  }

  /**
   * Track theme change for analytics
   */
  trackThemeChange() {
    const changeCount = this.store.get('themeChangeCount', 0) + 1;
    this.store.set('themeChangeCount', changeCount);
    this.store.set('lastThemeChange', new Date().toISOString());
  }

  /**
   * Reset theme to system default
   */
  reset() {
    this.setTheme('system');
    this.store.delete('theme');
    this.store.delete('themeChangeCount');
    this.store.delete('lastThemeChange');
    
    console.log('Theme reset to system default');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.removeAllListeners();
    
    if (process.platform === 'darwin') {
      try {
        systemPreferences.unsubscribeNotification('AppleInterfaceThemeChangedNotification');
      } catch (error) {
        console.error('Failed to unsubscribe from system theme notifications:', error);
      }
    }
    
    console.log('Theme Manager destroyed');
  }
}

module.exports = { ThemeManager };