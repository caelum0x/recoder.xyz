import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'tr', 'es', 'zh', 'de'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  es: 'Español',
  zh: '中文',
  de: 'Deutsch'
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  tr: '🇹🇷',
  es: '🇪🇸',
  zh: '🇨🇳',
  de: '🇩🇪'
};

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request
  let locale = await requestLocale;

  // Validate that the incoming `locale` parameter is valid
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
