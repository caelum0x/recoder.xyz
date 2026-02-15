import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectBestLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './geo-detection';
import { getSessionTokenPayload } from '@/lib/auth/session-token';

// Import translations
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import de from '@/locales/de.json';
import it from '@/locales/it.json';
import pt from '@/locales/pt.json';
import zh from '@/locales/zh.json';
import ja from '@/locales/ja.json';
import { log } from '@/lib/logger';

const LANGUAGE_KEY = '@recoder_language';

function getLocaleFromSessionTokenPayload(payload: Record<string, unknown> | null): SupportedLocale | null {
  if (!payload) {
    return null;
  }

  const directLocale = payload.locale;
  if (typeof directLocale === 'string' && SUPPORTED_LOCALES.includes(directLocale as SupportedLocale)) {
    return directLocale as SupportedLocale;
  }

  const userMetadata = payload.user_metadata;
  if (
    userMetadata &&
    typeof userMetadata === 'object' &&
    typeof (userMetadata as Record<string, unknown>).locale === 'string'
  ) {
    const metadataLocale = (userMetadata as Record<string, unknown>).locale as string;
    if (SUPPORTED_LOCALES.includes(metadataLocale as SupportedLocale)) {
      return metadataLocale as SupportedLocale;
    }
  }

  const rawUserMetadata = payload.raw_user_meta_data;
  if (
    rawUserMetadata &&
    typeof rawUserMetadata === 'object' &&
    typeof (rawUserMetadata as Record<string, unknown>).locale === 'string'
  ) {
    const rawLocale = (rawUserMetadata as Record<string, unknown>).locale as string;
    if (SUPPORTED_LOCALES.includes(rawLocale as SupportedLocale)) {
      return rawLocale as SupportedLocale;
    }
  }

  return null;
}

// Language resources
const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  pt: { translation: pt },
  zh: { translation: zh },
  ja: { translation: ja },
};

/**
 * Initialize i18n with AsyncStorage persistence and geo-detection
 * Priority (matching web frontend):
 * 1. User profile preference (if authenticated) - HIGHEST PRIORITY
 * 2. Saved AsyncStorage preference
 * 3. Geo-detection (device locale + timezone)
 * 4. Default (English)
 */
export const initializeI18n = async () => {
  try {
    let initialLanguage: SupportedLocale = DEFAULT_LOCALE;

    // Priority 1: Check locale claim in current session token (if authenticated)
    // This ALWAYS takes precedence - user explicitly set it in profile settings
    try {
      const payload = await getSessionTokenPayload();
      const tokenLocale = getLocaleFromSessionTokenPayload(payload);
      if (tokenLocale) {
        initialLanguage = tokenLocale;
        log.log(`✅ Using session locale (highest priority): ${initialLanguage}`);
        
        // Save to AsyncStorage for consistency
        await AsyncStorage.setItem(LANGUAGE_KEY, initialLanguage);
        
        // Initialize i18n with user's profile locale
        await i18n
          .use(initReactI18next)
          .init({
            resources,
            lng: initialLanguage,
            fallbackLng: DEFAULT_LOCALE,
            compatibilityJSON: 'v4',
            interpolation: {
              escapeValue: false,
            },
            react: {
              useSuspense: false,
            },
          });
        
        log.log('✅ i18n initialized with session locale:', i18n.language);
        return;
      }
    } catch (error) {
      // User might not be authenticated, continue with other methods
      log.debug('Could not fetch user locale from session token:', error);
    }

    // Priority 2: Get saved language from AsyncStorage (user's explicit preference)
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    log.log('🌍 Saved language preference:', savedLanguage);
    
    if (savedLanguage && SUPPORTED_LOCALES.includes(savedLanguage as SupportedLocale)) {
      initialLanguage = savedLanguage as SupportedLocale;
      log.log('✅ Using saved language preference:', initialLanguage);
    } else {
      // Priority 3: Geo-detect based on device settings and timezone
      const detectedLocale = detectBestLocale();
      initialLanguage = detectedLocale;
      log.log('✅ Using geo-detected locale:', initialLanguage);
      
      // Save the detected locale so we don't detect again
      // User can still change it manually in settings
      await AsyncStorage.setItem(LANGUAGE_KEY, initialLanguage);
    }

    await i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: initialLanguage,
        fallbackLng: DEFAULT_LOCALE,
        compatibilityJSON: 'v4',
        interpolation: {
          escapeValue: false, // React already escapes values
        },
        react: {
          useSuspense: false, // Important for React Native
        },
      });

    log.log('✅ i18n initialized with language:', i18n.language);
  } catch (error) {
    log.error('❌ i18n initialization error:', error);
    // Fallback to default locale on error
    await i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: DEFAULT_LOCALE,
        fallbackLng: DEFAULT_LOCALE,
        compatibilityJSON: 'v4',
        interpolation: {
          escapeValue: false,
        },
        react: {
          useSuspense: false,
        },
      });
  }
};

/**
 * Change language and persist to AsyncStorage.
 * Server-side profile sync is handled by auth-provider flows outside mobile runtime.
 */
export const changeLanguage = async (languageCode: string) => {
  try {
    log.log('🌍 Changing language to:', languageCode);
    
    // Validate language code
    if (!SUPPORTED_LOCALES.includes(languageCode as SupportedLocale)) {
      log.warn(`⚠️ Invalid language code: ${languageCode}, using default`);
      languageCode = DEFAULT_LOCALE;
    }
    
    // Update i18n
    await i18n.changeLanguage(languageCode);
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(LANGUAGE_KEY, languageCode);
    
    log.log('✅ Language changed and saved:', languageCode);
  } catch (error) {
    log.error('❌ Language change error:', error);
  }
};

/**
 * Get current language
 */
export const getCurrentLanguage = () => {
  return i18n.language;
};

/**
 * Get all available languages
 */
export const getAvailableLanguages = () => {
  return [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  ];
};

export default i18n;
