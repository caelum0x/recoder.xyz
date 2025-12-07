import { useStore } from '@nanostores/react';
import type { LinksFunction, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json, redirect } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from './lib/remix-island';
import { useEffect } from 'react';
import { verifySession, getLoginUrl } from './lib/auth/session.server';
import { AuthProvider } from './lib/contexts/AuthContext';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

/**
 * Root loader - Verify authentication before loading the app
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const env = (context as any)?.cloudflare?.env || {};
  
  // Set env vars for session.server.ts
  if (env.MAIN_SITE_URL) process.env.MAIN_SITE_URL = env.MAIN_SITE_URL;
  if (env.RECODER_WEB_URL) process.env.RECODER_WEB_URL = env.RECODER_WEB_URL;

  // Allow public routes
  const publicPaths = ['/api/', '/health', '/projects'];
  if (publicPaths.some(path => url.pathname.startsWith(path))) {
    return json({ user: null });
  }
  
  // Skip auth in development if SKIP_AUTH is set
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return json({ user: { id: 'dev-user', email: 'dev@local', name: 'Dev User' } });
  }

  // Verify session with main site
  const session = await verifySession(request);

  // If no session, redirect to login on main site
  if (!session) {
    console.log('[Auth] No session found, redirecting to login');
    const loginUrl = getLoginUrl(url.pathname);
    return redirect(loginUrl);
  }

  console.log('[Auth] Session verified for user:', session.user.email);

  return json({
    user: session.user,
    ENV: {
      MAIN_SITE_URL: process.env.MAIN_SITE_URL || 'http://localhost:3000',
    },
  });
}

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      {children}
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AuthProvider user={user}>
      <Outlet />
    </AuthProvider>
  );
}
