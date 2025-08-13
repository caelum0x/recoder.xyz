/**
 * Internationalization (i18n) utilities for backend
 */

export interface I18nConfig {
  defaultLocale: string;
  supportedLocales: string[];
  fallbackLocale: string;
}

export class I18nService {
  private config: I18nConfig;
  private translations: Map<string, Map<string, string>> = new Map();

  constructor(config: I18nConfig = {
    defaultLocale: 'en',
    supportedLocales: ['en', 'es', 'fr', 'de', 'ja', 'zh'],
    fallbackLocale: 'en'
  }) {
    this.config = config;
    this.loadDefaultTranslations();
  }

  private loadDefaultTranslations() {
    // Load default English translations
    const enTranslations = new Map([
      ['error.general', 'An error occurred'],
      ['error.unauthorized', 'Unauthorized access'],
      ['error.not_found', 'Resource not found'],
      ['error.validation', 'Validation error'],
      ['success.operation_completed', 'Operation completed successfully'],
      ['claude_code.initializing', 'Initializing Claude Code session...'],
      ['claude_code.error', 'Claude Code integration error'],
      ['claude_code.success', 'Claude Code operation successful'],
    ]);
    
    this.translations.set('en', enTranslations);
  }

  translate(key: string, locale: string = this.config.defaultLocale, params?: Record<string, any>): string {
    const localeTranslations = this.translations.get(locale) || 
                              this.translations.get(this.config.fallbackLocale) ||
                              new Map();
    
    let translation = localeTranslations.get(key) || key;
    
    // Simple parameter substitution
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        translation = translation.replace(`{{${param}}}`, String(value));
      });
    }
    
    return translation;
  }

  setTranslation(locale: string, key: string, value: string) {
    if (!this.translations.has(locale)) {
      this.translations.set(locale, new Map());
    }
    this.translations.get(locale)!.set(key, value);
  }

  getSupportedLocales(): string[] {
    return this.config.supportedLocales;
  }

  isLocaleSupported(locale: string): boolean {
    return this.config.supportedLocales.includes(locale);
  }
}

// Create default instance
export const i18n = new I18nService();

// Helper function for quick translations
export function t(key: string, locale?: string, params?: Record<string, any>): string {
  return i18n.translate(key, locale, params);
}

// Export for compatibility
export default i18n;
