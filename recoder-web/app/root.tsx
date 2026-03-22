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
import { ErrorBoundary as AppErrorBoundary } from './components/ErrorBoundary';
import { useGlobalErrorHandler } from './lib/hooks/useGlobalErrorHandler';
import { useErrorToasts } from './lib/errors/toast-error';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import roobertStyles from './styles/roobert-font.css?url';

import 'virtual:uno.css';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('Root');

/**
 * Root loader - Verify authentication before loading the app
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const env = (context as any)?.cloudflare?.env || {};
  
  // Set env vars for session.server.ts
  if (env.MAIN_SITE_URL) process.env.MAIN_SITE_URL = env.MAIN_SITE_URL;
  if (env.RECODER_WEB_URL) process.env.RECODER_WEB_URL = env.RECODER_WEB_URL;
  if (env.INTERNAL_SERVICE_KEY) process.env.INTERNAL_SERVICE_KEY = env.INTERNAL_SERVICE_KEY;

  // Allow public routes (but still try to get user if authenticated)
  const publicPaths = ['/api/', '/health', '/platform/'];
  if (publicPaths.some(path => url.pathname.startsWith(path))) {
    // Still try to get user session for personalization, but don't require it
    const session = await verifySession(request).catch(() => null);
    return json({ user: session?.user ?? null });
  }

  // For /projects, try to get user but don't require authentication
  if (url.pathname.startsWith('/projects')) {
    const session = await verifySession(request);
    return json({ user: session?.user ?? null });
  }

  // Verify session with main site
  const session = await verifySession(request);

  // If no session, redirect to login on main site
  if (!session) {
    logger.info('[Auth] No session found, redirecting to login');
    const loginUrl = getLoginUrl(url.pathname);
    return redirect(loginUrl);
  }

  logger.info('[Auth] Session verified for user:', session.user.email);

  return json({
    user: session.user,
    ENV: {
      MAIN_SITE_URL: process.env.MAIN_SITE_URL || 'https://recoder.xyz',
    },
  });
}

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.png',
    type: 'image/png',
    sizes: '32x32',
  },
  {
    rel: 'icon',
    href: '/icon.png',
    type: 'image/png',
    sizes: '512x512',
  },
  {
    rel: 'shortcut icon',
    href: '/favicon.ico',
  },
  {
    rel: 'apple-touch-icon',
    href: '/apple-touch-icon.png',
    sizes: '180x180',
  },
  {
    rel: 'manifest',
    href: '/manifest.json',
  },
  { rel: 'stylesheet', href: roobertStyles },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('recoder_theme');

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

/**
 * Remix ErrorBoundary for route-level errors
 * Catches errors during route loading/rendering
 */
export function ErrorBoundary() {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error - Recoder Web</title>
        <Links />
      </head>
      <body className="bg-recoder-elements-background-depth-1">
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <div className="i-ph:warning-circle text-3xl text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-6">
              An unexpected error occurred while loading this page.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
              <a
                href="/"
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Go Home
              </a>
            </div>
            <div className="mt-8">
              <a
                href="https://github.com/recoder-xyz/recoder/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                <div className="i-ph:github-logo w-4 h-4" />
                Report this issue
              </a>
            </div>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-[10000] focus:px-4 focus:py-2 focus:bg-orange-500 focus:text-white focus:rounded-lg">Skip to main content</a>
      {/* Logo is rendered in Header component — no duplicate here */}
      <main id="main-content">{children}</main>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

/**
 * Global error handler component
 * Catches unhandled errors and shows toasts
 */
function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  // Set up global error handlers
  useGlobalErrorHandler({
    showToasts: true,
    logToConsole: process.env.NODE_ENV !== 'production',
  });

  // Subscribe to error events for toast notifications
  useErrorToasts();

  return <>{children}</>;
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AppErrorBoundary
      scope="app-root"
      showDetails={process.env.NODE_ENV !== 'production'}
      onError={(error: Error, errorInfo: React.ErrorInfo) => {
        // Log to console in development
        if (process.env.NODE_ENV !== 'production') {
          logger.error('[App Root Error]', error, errorInfo);
        }
      }}
    >
      <GlobalErrorHandler>
        <AuthProvider user={user}>
          <Outlet />
        </AuthProvider>
      </GlobalErrorHandler>
    </AppErrorBoundary>
  );
}
