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
    id: 'api',
    label: 'Recoder API',
    description: 'Unified API gateway & task engine',
    productionUrl: 'https://docker.recoder.xyz',
    devUrl: 'http://localhost:3100',
    port: 3100,
    healthPath: '/health',
    healthResponseType: 'json',
    showInSwitcher: false,
    internal: true,
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

// ── Compatibility helpers for older callers ──

export function getSpacesUrl(): string {
  if (process.env.SPACES_URL) {
    return process.env.SPACES_URL;
  }
  return `${getServiceUrl('app')}/dashboard/spaces`;
}

export function getRecoderChatUrl(): string {
  if (process.env.RECODER_CHAT_URL) {
    return process.env.RECODER_CHAT_URL;
  }
  return getServiceUrl('agency');
}

export function getMainSiteUrl(): string {
  if (process.env.MAIN_SITE_URL) {
    return process.env.MAIN_SITE_URL;
  }
  return getServiceUrl('app');
}

export function getSpacesPathUrl(path: string = ''): string {
  const baseUrl = getSpacesUrl();
  return path ? `${baseUrl}${path}` : baseUrl;
}

export function getSpacesUrlClient(): string {
  if (typeof window === 'undefined') {
    return getSpacesUrl();
  }

  if (process.env.NEXT_PUBLIC_SPACES_URL) {
    return process.env.NEXT_PUBLIC_SPACES_URL;
  }

  return `${getServiceUrlClient('app')}/dashboard/spaces`;
}
