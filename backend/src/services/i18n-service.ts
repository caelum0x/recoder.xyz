/**
 * Internationalization Service
 * PRODUCTION FEATURE: Enterprise multi-language support for global market expansion
 * Advanced i18n capabilities that Cursor/Copilot don't provide
 */

import { PrismaClient } from '@prisma/client';
import { Logger } from '@recoder/shared';
import { promises as fs } from 'fs';
import path from 'path';

export type SupportedLocale = 
  | 'en' | 'en-US' | 'en-GB' | 'en-CA' | 'en-AU'  // English variants
  | 'es' | 'es-ES' | 'es-MX' | 'es-AR'           // Spanish variants  
  | 'fr' | 'fr-FR' | 'fr-CA'                     // French variants
  | 'de' | 'de-DE' | 'de-AT' | 'de-CH'           // German variants
  | 'it' | 'it-IT'                               // Italian variants
  | 'pt' | 'pt-PT' | 'pt-BR'                     // Portuguese variants
  | 'ru' | 'ru-RU'                               // Russian variants
  | 'zh' | 'zh-CN' | 'zh-TW' | 'zh-HK'           // Chinese variants
  | 'ja' | 'ja-JP'                               // Japanese variants
  | 'ko' | 'ko-KR'                               // Korean variants
  | 'ar' | 'ar-SA' | 'ar-EG'                     // Arabic variants
  | 'hi' | 'hi-IN'                               // Hindi variants
  | 'tr' | 'tr-TR'                               // Turkish variants
  | 'nl' | 'nl-NL' | 'nl-BE'                     // Dutch variants
  | 'sv' | 'sv-SE'                               // Swedish variants
  | 'no' | 'no-NO'                               // Norwegian variants
  | 'da' | 'da-DK'                               // Danish variants
  | 'fi' | 'fi-FI'                               // Finnish variants
  | 'pl' | 'pl-PL'                               // Polish variants
  | 'uk' | 'uk-UA'                               // Ukrainian variants
  | 'cs' | 'cs-CZ'                               // Czech variants
  | 'hu' | 'hu-HU'                               // Hungarian variants
  | 'ro' | 'ro-RO'                               // Romanian variants
  | 'bg' | 'bg-BG'                               // Bulgarian variants
  | 'hr' | 'hr-HR'                               // Croatian variants
  | 'sk' | 'sk-SK'                               // Slovak variants
  | 'sl' | 'sl-SI'                               // Slovenian variants
  | 'et' | 'et-EE'                               // Estonian variants
  | 'lv' | 'lv-LV'                               // Latvian variants
  | 'lt' | 'lt-LT';                              // Lithuanian variants

export interface TranslationEntry {
  key: string;
  locale: SupportedLocale;
  value: string;
  context?: string;
  pluralRule?: 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
  category: 'ui' | 'messages' | 'errors' | 'marketing' | 'legal' | 'technical';
  lastUpdated: Date;
  version: string;
}

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  region: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: {
    decimal: string;
    thousands: string;
  };
  pluralRules: string[];
  completeness: number; // Percentage of translated strings
  isEnabled: boolean;
  fallback?: SupportedLocale;
}

export interface UserLanguagePreference {
  userId: string;
  primaryLocale: SupportedLocale;
  fallbackLocales: SupportedLocale[];
  autoDetect: boolean;
  dateTimeFormat: 'locale' | 'iso' | 'relative';
  numberFormat: 'locale' | 'international';
  platform: 'web' | 'mobile' | 'extension' | 'desktop';
  lastUpdated: Date;
}

export class I18nService {
  private prisma: PrismaClient;
  private translations: Map<string, Map<SupportedLocale, TranslationEntry>> = new Map();
  private localeInfo: Map<SupportedLocale, LocaleInfo> = new Map();
  private translationsDir: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.translationsDir = path.join(__dirname, '../../translations');
    this.initializeLocales();
    this.loadTranslations();
  }

  private initializeLocales() {
    // English (US) - Primary
    this.localeInfo.set('en-US', {
      code: 'en-US',
      name: 'English (United States)',
      nativeName: 'English (United States)',
      direction: 'ltr',
      region: 'North America',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      numberFormat: { decimal: '.', thousands: ',' },
      pluralRules: ['one', 'other'],
      completeness: 100,
      isEnabled: true
    });

    // Spanish (Spain) - High priority for EU market
    this.localeInfo.set('es-ES', {
      code: 'es-ES',
      name: 'Spanish (Spain)',
      nativeName: 'Español (España)',
      direction: 'ltr',
      region: 'Europe',
      currency: 'EUR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: { decimal: ',', thousands: '.' },
      pluralRules: ['one', 'other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // French (France) - High priority for EU market
    this.localeInfo.set('fr-FR', {
      code: 'fr-FR',
      name: 'French (France)',
      nativeName: 'Français (France)',
      direction: 'ltr',
      region: 'Europe',
      currency: 'EUR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: { decimal: ',', thousands: ' ' },
      pluralRules: ['one', 'other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // German (Germany) - High priority for EU market
    this.localeInfo.set('de-DE', {
      code: 'de-DE',
      name: 'German (Germany)',
      nativeName: 'Deutsch (Deutschland)',
      direction: 'ltr',
      region: 'Europe',
      currency: 'EUR',
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: { decimal: ',', thousands: '.' },
      pluralRules: ['one', 'other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // Portuguese (Brazil) - High priority for Latin America
    this.localeInfo.set('pt-BR', {
      code: 'pt-BR',
      name: 'Portuguese (Brazil)',
      nativeName: 'Português (Brasil)',
      direction: 'ltr',
      region: 'South America',
      currency: 'BRL',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: { decimal: ',', thousands: '.' },
      pluralRules: ['one', 'other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // Chinese (Simplified) - High priority for Asian market
    this.localeInfo.set('zh-CN', {
      code: 'zh-CN',
      name: 'Chinese (Simplified)',
      nativeName: '简体中文',
      direction: 'ltr',
      region: 'Asia',
      currency: 'CNY',
      dateFormat: 'YYYY/MM/DD',
      timeFormat: '24h',
      numberFormat: { decimal: '.', thousands: ',' },
      pluralRules: ['other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // Japanese - High priority for Asian market
    this.localeInfo.set('ja-JP', {
      code: 'ja-JP',
      name: 'Japanese',
      nativeName: '日本語',
      direction: 'ltr',
      region: 'Asia',
      currency: 'JPY',
      dateFormat: 'YYYY/MM/DD',
      timeFormat: '24h',
      numberFormat: { decimal: '.', thousands: ',' },
      pluralRules: ['other'],
      completeness: 0,
      isEnabled: false,
      fallback: 'en-US'
    });

    // Add more locales as needed...
    Logger.info('Initialized locale information for internationalization');
  }

  private async loadTranslations() {
    try {
      // Load translations from database
      const dbTranslations = await this.prisma.translation.findMany({
        orderBy: { lastUpdated: 'desc' }
      });

      dbTranslations.forEach(translation => {
        const key = translation.key;
        const locale = translation.locale as SupportedLocale;
        
        if (!this.translations.has(key)) {
          this.translations.set(key, new Map());
        }
        
        this.translations.get(key)!.set(locale, {
          key: translation.key,
          locale: locale,
          value: translation.value,
          context: translation.context || undefined,
          pluralRule: translation.pluralRule as any,
          category: translation.category as any,
          lastUpdated: translation.lastUpdated,
          version: translation.version || '1.0.0'
        });
      });

      Logger.info(`Loaded ${dbTranslations.length} translations for internationalization`);

    } catch (error) {
      Logger.error('Failed to load translations:', error);
      // Continue with default English translations
    }
  }

  /**
   * Get translated string
   */
  public t(key: string, locale: SupportedLocale, options?: {
    count?: number;
    interpolations?: Record<string, string | number>;
    fallbackLocale?: SupportedLocale;
  }): string {
    const keyTranslations = this.translations.get(key);
    
    if (!keyTranslations) {
      Logger.warn(`Translation key not found: ${key}`);
      return key; // Return key if no translation found
    }

    let translation = keyTranslations.get(locale);
    
    // Try fallback locale if not found
    if (!translation && options?.fallbackLocale) {
      translation = keyTranslations.get(options.fallbackLocale);
    }
    
    // Try primary English fallback
    if (!translation) {
      translation = keyTranslations.get('en-US');
    }
    
    if (!translation) {
      Logger.warn(`No translation found for key: ${key}, locale: ${locale}`);
      return key;
    }

    let result = translation.value;

    // Handle pluralization
    if (options?.count !== undefined && translation.pluralRule) {
      const pluralForm = this.getPluralForm(locale, options.count);
      const pluralKey = `${key}.${pluralForm}`;
      const pluralTranslation = keyTranslations.get(locale);
      if (pluralTranslation) {
        result = pluralTranslation.value;
      }
    }

    // Handle interpolations
    if (options?.interpolations) {
      Object.entries(options.interpolations).forEach(([placeholder, value]) => {
        result = result.replace(`{{${placeholder}}}`, String(value));
      });
    }

    return result;
  }

  /**
   * Get plural form for a locale and count
   */
  private getPluralForm(locale: SupportedLocale, count: number): string {
    const localeInfo = this.localeInfo.get(locale);
    if (!localeInfo) return 'other';

    // Simplified plural rules - in production use Intl.PluralRules
    if (count === 0) return 'zero';
    if (count === 1) return 'one';
    if (count === 2) return 'two';
    if (count < 5) return 'few';
    if (count < 20) return 'many';
    return 'other';
  }

  /**
   * Add or update translation
   */
  public async addTranslation(entry: Omit<TranslationEntry, 'lastUpdated' | 'version'>): Promise<boolean> {
    try {
      const translationEntry = {
        ...entry,
        lastUpdated: new Date(),
        version: '1.0.0'
      };

      // Save to database
      await this.prisma.translation.upsert({
        where: {
          key_locale: {
            key: entry.key,
            locale: entry.locale
          }
        },
        update: {
          value: entry.value,
          context: entry.context,
          pluralRule: entry.pluralRule,
          category: entry.category,
          lastUpdated: translationEntry.lastUpdated,
          version: translationEntry.version
        },
        create: {
          key: entry.key,
          locale: entry.locale,
          value: entry.value,
          context: entry.context,
          pluralRule: entry.pluralRule,
          category: entry.category,
          lastUpdated: translationEntry.lastUpdated,
          version: translationEntry.version
        }
      });

      // Update in-memory cache
      if (!this.translations.has(entry.key)) {
        this.translations.set(entry.key, new Map());
      }
      this.translations.get(entry.key)!.set(entry.locale, translationEntry);

      Logger.debug(`Added translation: ${entry.key} (${entry.locale})`);
      return true;

    } catch (error) {
      Logger.error('Failed to add translation:', error);
      return false;
    }
  }

  /**
   * Bulk import translations
   */
  public async importTranslations(translations: Omit<TranslationEntry, 'lastUpdated' | 'version'>[]): Promise<{
    imported: number;
    failed: number;
    errors: string[];
  }> {
    const result = { imported: 0, failed: 0, errors: [] as string[] };

    for (const translation of translations) {
      const success = await this.addTranslation(translation);
      if (success) {
        result.imported++;
      } else {
        result.failed++;
        result.errors.push(`Failed to import: ${translation.key} (${translation.locale})`);
      }
    }

    Logger.info(`Bulk import completed: ${result.imported} imported, ${result.failed} failed`);
    return result;
  }

  /**
   * Get user language preference
   */
  public async getUserLanguagePreference(userId: string, platform?: string): Promise<UserLanguagePreference | null> {
    try {
      const preference = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { languagePreferences: true }
      });

      if (!preference?.languagePreferences) {
        return null;
      }

      const langData = preference.languagePreferences as any;
      return {
        userId,
        primaryLocale: langData.primaryLocale || 'en-US',
        fallbackLocales: langData.fallbackLocales || ['en-US'],
        autoDetect: langData.autoDetect !== false,
        dateTimeFormat: langData.dateTimeFormat || 'locale',
        numberFormat: langData.numberFormat || 'locale',
        platform: platform as any || 'web',
        lastUpdated: langData.lastUpdated ? new Date(langData.lastUpdated) : new Date()
      };

    } catch (error) {
      Logger.error('Failed to get user language preference:', error);
      return null;
    }
  }

  /**
   * Update user language preference
   */
  public async updateUserLanguagePreference(preference: UserLanguagePreference): Promise<boolean> {
    try {
      const langData = {
        primaryLocale: preference.primaryLocale,
        fallbackLocales: preference.fallbackLocales,
        autoDetect: preference.autoDetect,
        dateTimeFormat: preference.dateTimeFormat,
        numberFormat: preference.numberFormat,
        lastUpdated: new Date().toISOString(),
        platforms: {
          [preference.platform]: {
            primaryLocale: preference.primaryLocale,
            lastUpdated: new Date().toISOString()
          }
        }
      };

      await this.prisma.userPreferences.upsert({
        where: { userId: preference.userId },
        update: { languagePreferences: langData },
        create: { 
          userId: preference.userId,
          languagePreferences: langData
        }
      });

      Logger.info(`Updated language preference for user ${preference.userId}`, {
        locale: preference.primaryLocale,
        platform: preference.platform
      });

      return true;

    } catch (error) {
      Logger.error('Failed to update user language preference:', error);
      return false;
    }
  }

  /**
   * Get supported locales
   */
  public getSupportedLocales(): LocaleInfo[] {
    return Array.from(this.localeInfo.values()).filter(locale => locale.isEnabled);
  }

  /**
   * Get all locales (including disabled ones)
   */
  public getAllLocales(): LocaleInfo[] {
    return Array.from(this.localeInfo.values());
  }

  /**
   * Get locale information
   */
  public getLocaleInfo(locale: SupportedLocale): LocaleInfo | null {
    return this.localeInfo.get(locale) || null;
  }

  /**
   * Format date according to locale
   */
  public formatDate(date: Date, locale: SupportedLocale, options?: Intl.DateTimeFormatOptions): string {
    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      Logger.warn(`Failed to format date for locale ${locale}:`, error);
      return date.toISOString();
    }
  }

  /**
   * Format number according to locale
   */
  public formatNumber(number: number, locale: SupportedLocale, options?: Intl.NumberFormatOptions): string {
    try {
      return new Intl.NumberFormat(locale, options).format(number);
    } catch (error) {
      Logger.warn(`Failed to format number for locale ${locale}:`, error);
      return number.toString();
    }
  }

  /**
   * Format currency according to locale
   */
  public formatCurrency(amount: number, locale: SupportedLocale, currency?: string): string {
    try {
      const localeInfo = this.getLocaleInfo(locale);
      const currencyCode = currency || localeInfo?.currency || 'USD';
      
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode
      }).format(amount);
    } catch (error) {
      Logger.warn(`Failed to format currency for locale ${locale}:`, error);
      return `${currency || '$'}${amount}`;
    }
  }

  /**
   * Detect locale from browser headers
   */
  public detectLocaleFromHeaders(acceptLanguage: string): SupportedLocale {
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim())
      .filter(Boolean);

    for (const lang of languages) {
      // Try exact match first
      if (this.localeInfo.has(lang as SupportedLocale)) {
        return lang as SupportedLocale;
      }
      
      // Try language without region
      const baseLang = lang.split('-')[0];
      const matchingLocale = Array.from(this.localeInfo.keys())
        .find(locale => locale.startsWith(baseLang));
      
      if (matchingLocale) {
        return matchingLocale;
      }
    }

    return 'en-US'; // Default fallback
  }

  /**
   * Get translation completeness statistics
   */
  public async getTranslationStats(): Promise<{
    totalKeys: number;
    localeStats: Record<SupportedLocale, {
      translated: number;
      completeness: number;
      lastUpdated: Date | null;
    }>;
  }> {
    const allKeys = Array.from(this.translations.keys());
    const totalKeys = allKeys.length;
    const localeStats: any = {};

    for (const [locale] of this.localeInfo) {
      let translated = 0;
      let lastUpdated: Date | null = null;

      for (const key of allKeys) {
        const keyTranslations = this.translations.get(key);
        const translation = keyTranslations?.get(locale);
        
        if (translation) {
          translated++;
          if (!lastUpdated || translation.lastUpdated > lastUpdated) {
            lastUpdated = translation.lastUpdated;
          }
        }
      }

      localeStats[locale] = {
        translated,
        completeness: totalKeys > 0 ? Math.round((translated / totalKeys) * 100) : 0,
        lastUpdated
      };
    }

    return { totalKeys, localeStats };
  }

  public async shutdown(): Promise<void> {
    await this.prisma.$disconnect();
    Logger.info('I18n service shut down');
  }
}

// Export singleton instance
export const i18nService = new I18nService();