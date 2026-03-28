/**
 * Platform URLs configuration
 * Central ecosystem registry for all Recoder services
 */

import { RECODER_ECOSYSTEM_URLS, getSwitcherApps as getEcosystemSwitcherApps } from '@recoder/ecosystem-config';

export interface RecoderService {
  id: string;
  label: string;
  description: string;
  productionUrl: string;
  devUrl: string;
  port: number;
  healthPath: string;
  healthResponseType: 'html' | 'json';
  showInSwitcher: boolean;
  internal: boolean;
}

const SWITCHER_SERVICE_IDS = new Set(
  getEcosystemSwitcherApps().map((app) => (app.id === 'home' ? 'app' : app.id)),
);

export const RECODER_SERVICES: RecoderService[] = [
  {
    id: 'app',
    label: 'Recoder Hub',
    description: 'Dashboard, auth & settings',
    productionUrl: RECODER_ECOSYSTEM_URLS.home,
    devUrl: 'http://localhost:3000',
    port: 3000,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: SWITCHER_SERVICE_IDS.has('app'),
    internal: false,
  },
  {
    id: 'agents',
    label: 'Recoder Agents',
    description: 'AI agent IDE',
    productionUrl: RECODER_ECOSYSTEM_URLS.agents,
    devUrl: 'http://localhost:3001',
    port: 3001,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: SWITCHER_SERVICE_IDS.has('agents'),
    internal: false,
  },
  {
    id: 'web',
    label: 'Recoder Web',
    description: 'Web AI IDE',
    productionUrl: RECODER_ECOSYSTEM_URLS.web,
    devUrl: 'http://localhost:5173',
    port: 5173,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: SWITCHER_SERVICE_IDS.has('web'),
    internal: false,
  },
  {
    id: 'api',
    label: 'Recoder API',
    description: 'Unified API gateway & task engine',
    productionUrl: 'https://docker.recoder.xyz',
    devUrl: 'http://localhost:3100',
    port: 3100,
    healthPath: '/health',
    healthResponseType: 'json',
    showInSwitcher: false,
    internal: false,
  },
  {
    id: 'backend',
    label: 'Python Backend',
    description: 'Core AI backend',
    productionUrl: 'https://api.recoder.xyz',
    devUrl: 'http://localhost:8000',
    port: 8000,
    healthPath: '/v1/health',
    healthResponseType: 'json',
    showInSwitcher: false,
    internal: true,
  },
  {
    id: 'pm',
    label: 'Recoder PM',
    description: 'Project management',
    productionUrl: RECODER_ECOSYSTEM_URLS.pm,
    devUrl: 'http://localhost:3004',
    port: 3004,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: SWITCHER_SERVICE_IDS.has('pm'),
    internal: false,
  },
  {
    id: 'agency',
    label: 'Recoder Agency',
    description: 'AI agent workflows',
    productionUrl: RECODER_ECOSYSTEM_URLS.agency,
    devUrl: 'http://localhost:3007',
    port: 3007,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: SWITCHER_SERVICE_IDS.has('agency'),
    internal: false,
  },
  // OpenClaw removed (2026-03-28) — redirects to agency.recoder.xyz
  {
    id: 'redis',
    label: 'Redis',
    description: 'Cache & pub/sub',
    productionUrl: 'redis://redis:6379',
    devUrl: 'redis://localhost:6379',
    port: 6379,
    healthPath: '',
    healthResponseType: 'html',
    showInSwitcher: false,
    internal: true,
  },
];

/** Get a service by ID */
export function getService(id: string): RecoderService | undefined {
  return RECODER_SERVICES.find(s => s.id === id);
}

/** Get the URL for a service (server-side, respects NODE_ENV) */
export function getServiceUrl(id: string): string {
  const service = getService(id);
  if (!service) return '';
  return process.env.NODE_ENV === 'production' ? service.productionUrl : service.devUrl;
}

/** Get the URL for a service (client-side, checks window.location) */
export function getServiceUrlClient(id: string): string {
  const service = getService(id);
  if (!service) return '';

  if (typeof window === 'undefined') {
    return getServiceUrl(id);
  }

  const hostname = window.location.hostname;
  if (hostname === 'recoder.xyz' || hostname === 'www.recoder.xyz') {
    return service.productionUrl;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return service.devUrl;
  }

  return service.productionUrl;
}

/** Get all production origins (for auth trustedOrigins, CORS, etc.) */
export function getAllProductionOrigins(): string[] {
  return RECODER_SERVICES
    .filter(s => !s.internal && s.productionUrl.startsWith('https://'))
    .map(s => s.productionUrl);
}

/** Get services that should be health-monitored */
export function getMonitoredServices(): RecoderService[] {
  return RECODER_SERVICES.filter(s => s.healthPath !== '');
}

// ── Legacy helpers (backward compat) ──

export function getRecoderWebUrl(): string {
  if (process.env.RECODER_WEB_URL) {
    return process.env.RECODER_WEB_URL;
  }
  return getServiceUrl('web');
}

export function getRecoderChatUrl(): string {
  if (process.env.RECODER_CHAT_URL) {
    return process.env.RECODER_CHAT_URL;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://chat.recoder.xyz';
  }
  return 'http://localhost:3002';
}

export function getMainSiteUrl(): string {
  if (process.env.MAIN_SITE_URL) {
    return process.env.MAIN_SITE_URL;
  }
  return getServiceUrl('app');
}

export function getWebIdeUrl(path: string = ''): string {
  const baseUrl = getRecoderWebUrl();
  return path ? `${baseUrl}${path}` : baseUrl;
}

export function getRecoderWebUrlClient(): string {
  if (typeof window === 'undefined') {
    return getRecoderWebUrl();
  }

  if (process.env.NEXT_PUBLIC_RECODER_WEB_URL) {
    return process.env.NEXT_PUBLIC_RECODER_WEB_URL;
  }

  return getServiceUrlClient('web');
}
