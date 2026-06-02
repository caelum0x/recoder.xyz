export interface RecoderEdgeScaffoldConfig {
  backendOrigin: string;
  previewDomain: string;
  provider?: 'traefik' | 'pingap' | 'caddy';
}

export function buildRecoderEdgeScaffold(config: RecoderEdgeScaffoldConfig) {
  const provider = config.provider || 'traefik';

  return {
    provider,
    previewDomain: config.previewDomain,
    backendOrigin: config.backendOrigin,
    traefik: {
      routers: [
        {
          name: 'recoder-preview-path',
          rule: 'PathPrefix(`/preview/`) || PathPrefix(`/preview-access/`)',
          service: 'docker-backend-preview',
          middlewares: ['recoder-preview-security'],
        },
        {
          name: 'recoder-preview-host',
          rule: `HostRegexp(\`preview-{project:[a-z0-9-]+}-{deployment:[a-z0-9-]+}.${config.previewDomain}\`)`,
          service: 'docker-backend-preview',
          middlewares: ['recoder-preview-security'],
        },
      ],
      services: [
        {
          name: 'docker-backend-preview',
          url: config.backendOrigin,
        },
      ],
      middlewares: [
        {
          name: 'recoder-preview-security',
          headers: {
            contentTypeNosniff: true,
            browserXssFilter: true,
            customResponseHeaders: {
              'X-Recoder-Edge': provider,
            },
          },
        },
      ],
    },
    pingap: {
      upstreams: [
        {
          name: 'docker-backend-preview',
          targets: [config.backendOrigin],
        },
      ],
      locations: [
        {
          path: '/preview/',
          upstream: 'docker-backend-preview',
          plugins: ['preview-security'],
        },
        {
          path: '/preview-access/',
          upstream: 'docker-backend-preview',
          plugins: ['preview-security'],
        },
      ],
    },
    security: {
      crowdsec: {
        enabled: true,
        mode: 'log',
      },
      openAppSec: {
        enabled: true,
        mode: 'log',
      },
      cache: {
        docs: 'varnish-or-redis',
        preview: 'private-no-store',
      },
    },
  };
}

