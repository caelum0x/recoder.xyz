/**
 * Platform URLs configuration
 * Central ecosystem registry for all Recoder services
 */

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

export const RECODER_SERVICES: RecoderService[] = [
  {
    id: 'app',
    label: 'Recoder Hub',
    description: 'Dashboard, auth & settings',
    productionUrl: 'https://recoder.xyz',
    devUrl: 'http://localhost:3000',
    port: 3000,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'frontend',
    label: 'Recoder Frontend',
    description: 'Suna AI IDE',
    productionUrl: 'https://frontend.recoder.xyz',
    devUrl: 'http://localhost:3001',
    port: 3001,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'web',
    label: 'Recoder Web',
    description: 'Bolt AI IDE',
    productionUrl: 'https://web.recoder.xyz',
    devUrl: 'http://localhost:5173',
    port: 5173,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'docker-backend',
    label: 'Docker Backend',
    description: 'API gateway',
    productionUrl: 'https://api.recoder.xyz',
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
    productionUrl: 'https://backend.recoder.xyz',
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
    productionUrl: 'https://pm.recoder.xyz',
    devUrl: 'http://localhost:3004',
    port: 3004,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'studio',
    label: 'Recoder Studio',
    description: 'Visual workflow designer',
    productionUrl: 'https://studio.recoder.xyz',
    devUrl: 'http://localhost:3005',
    port: 3005,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'agency',
    label: 'Recoder Agency',
    description: 'AI agent workflows',
    productionUrl: 'https://agency.recoder.xyz',
    devUrl: 'http://localhost:3007',
    port: 3007,
    healthPath: '/',
    healthResponseType: 'html',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    description: 'Open-source AI tools',
    productionUrl: 'https://openclaw.recoder.xyz',
    devUrl: 'http://localhost:18789',
    port: 18789,
    healthPath: '/health',
    healthResponseType: 'json',
    showInSwitcher: true,
    internal: false,
  },
  {
    id: 'redis',
    label: 'Redis',
    description: 'Cache & pub/sub',
    productionUrl: 'redis://localhost:6379',
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

/** Get services to display in AppSwitcher */
export function getSwitcherApps(): RecoderService[] {
  return RECODER_SERVICES.filter(s => s.showInSwitcher);
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
