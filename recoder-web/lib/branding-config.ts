/**
 * Recoder.xyz Domain Configuration and Branding
 * Centralized configuration for all domains and branding
 */

export const RECODER_BRAND = {
  name: 'Recoder.xyz',
  fullName: 'Recoder.xyz',
  tagline: 'AI-Powered Development Platform',
  description: 'Production-ready code generation with multi-AI intelligence',
  logo: '/images/recoder-logo.svg',
  favicon: '/favicon.ico',
  colors: {
    primary: '#667eea',
    secondary: '#764ba2',
    accent: '#f093fb',
    background: '#ffffff',
    text: '#1a202c'
  }
};

export interface RecoderConfig {
  domains: {
    main: string;
    api: string;
    web: string;
    chat: string;
    engine: string;
    cli: string;
    cdn: string;
  };
  brand: typeof RECODER_BRAND;
  features: {
    auth: boolean;
    billing: boolean;
    analytics: boolean;
    multiAI: boolean;
  };
}

export function getRecoderConfig(): RecoderConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    domains: {
      main: isProduction ? 'https://recoder.xyz' : 'http://localhost:3000',
      api: isProduction ? 'https://api.recoder.xyz' : 'http://localhost:3001',
      web: isProduction ? 'https://web.recoder.xyz' : 'http://localhost:3010',
      chat: isProduction ? 'https://chat.recoder.xyz' : 'http://localhost:3011',
      engine: isProduction ? 'https://engine.recoder.xyz' : 'http://localhost:3002',
      cli: isProduction ? 'https://cli.recoder.xyz' : 'http://localhost:3003',
      cdn: isProduction ? 'https://cdn.recoder.xyz' : 'http://localhost:3004'
    },
    brand: RECODER_BRAND,
    features: {
      auth: true,
      billing: isProduction,
      analytics: true,
      multiAI: true
    }
  };
}

export class RecoderURLBuilder {
  private config: RecoderConfig;

  constructor() {
    this.config = getRecoderConfig();
  }

  getMainURL(path = ''): string {
    return `${this.config.domains.main}${path}`;
  }

  getAPIURL(path = ''): string {
    return `${this.config.domains.api}${path}`;
  }

  getWebURL(path = ''): string {
    return `${this.config.domains.web}${path}`;
  }

  getChatURL(path = ''): string {
    return `${this.config.domains.chat}${path}`;
  }

  getEngineURL(path = ''): string {
    return `${this.config.domains.engine}${path}`;
  }

  getCLIURL(path = ''): string {
    return `${this.config.domains.cli}${path}`;
  }

  github(): string {
    return 'https://github.com/arhansubasi/recoder.xyz';
  }

  getAllDomains(): string[] {
    return Object.values(this.config.domains);
  }
}