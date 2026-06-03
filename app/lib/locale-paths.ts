export function stripLocalePrefix(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  return stripped || '/';
}

export function detectLocaleFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  return match?.[1] ?? null;
}

export function localizePath(pathname: string, locale?: string | null): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return pathname;
  }

  const cleanPath = stripLocalePrefix(pathname);
  if (!locale) {
    return cleanPath;
  }

  return cleanPath === '/' ? `/${locale}` : `/${locale}${cleanPath}`;
}
