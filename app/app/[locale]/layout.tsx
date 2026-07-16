import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, defaultLocale, type Locale } from '@/i18n';

const BASE_URL = 'https://recoder.xyz';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  // Build the canonical URL for the current locale
  const canonical =
    locale === defaultLocale ? BASE_URL : `${BASE_URL}/${locale}`;

  // Build hreflang alternate links for every supported locale
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = loc === defaultLocale ? BASE_URL : `${BASE_URL}/${loc}`;
  }
  // x-default points to the default (English) version
  languages['x-default'] = BASE_URL;

  return {
    alternates: {
      canonical,
      languages,
    },
  };
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Providing all messages to the client side
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
