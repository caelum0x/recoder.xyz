import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// NOTE: Canonical/hreflang are intentionally NOT set at the locale-layout
// level. The previous implementation pointed every page's canonical at the
// locale root (and the homepage for the default locale), which told Google
// that all sub-pages were duplicates of "/". Canonical is now declared
// per-page against its English URL. hreflang is omitted until the locale
// variants serve genuinely translated content (today they fall back to en).

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
