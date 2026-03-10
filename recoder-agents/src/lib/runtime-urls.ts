import { RECODER_ECOSYSTEM_URLS } from '@recoder/ecosystem-config';

const PRODUCTION_AGENTS_URL = 'https://agents.recoder.xyz';
const PRODUCTION_BACKEND_API_URL = 'https://api.recoder.xyz/v1';
const PRODUCTION_DOCKER_BACKEND_URL = 'https://docker.recoder.xyz';

export function resolveAgentsSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    PRODUCTION_AGENTS_URL
  );
}

export function resolveAuthBaseUrl(): string {
  return process.env.NEXT_PUBLIC_AUTH_URL || RECODER_ECOSYSTEM_URLS.home;
}

export function resolveBackendApiUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || PRODUCTION_BACKEND_API_URL;
}

export function resolveDockerBackendUrl(): string {
  return process.env.NEXT_PUBLIC_DOCKER_BACKEND_URL || PRODUCTION_DOCKER_BACKEND_URL;
}
