import { Router, type Request, type Response } from 'express';
import { getPreviewDeploymentService } from './preview-deployment.service.js';
import { getEdgeSecurityPolicy } from './edge-security.js';

export const edgeRouter = Router();

function buildEdgeScaffold() {
  const policy = getEdgeSecurityPolicy();
  const recentDeployments = getPreviewDeploymentService().listRecent(20).map((deployment) => ({
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    edgeHost: deployment.edgeHost,
    protectionMode: deployment.protectionMode,
    createdAt: deployment.createdAt,
  }));
  return {
    version: '2026-05-14',
    providers: {
      primary: process.env.RECODER_EDGE_PROVIDER || 'traefik',
      supported: ['traefik', 'pingap', 'caddy'],
    },
    previewRouting: {
      pathRoutes: [
        '/preview/:projectId',
        '/preview-access/:previewAccessToken/:projectId',
      ],
      hostPattern: `preview-<project>-<deployment>.${process.env.RECODER_EDGE_PREVIEW_BASE_DOMAIN || 'preview.recoder.xyz'}`,
      protectedByDefault: policy.defaultPreviewProtectionMode !== 'public',
      latestDeployments: recentDeployments,
    },
    manifests: {
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
            rule: `HostRegexp(\`preview-{project:[a-z0-9-]+}-{deployment:[a-z0-9-]+}.${process.env.RECODER_EDGE_PREVIEW_BASE_DOMAIN || 'preview.recoder.xyz'}\`)`,
            service: 'docker-backend-preview',
            middlewares: ['recoder-preview-security'],
          },
        ],
        middlewares: [
          {
            name: 'recoder-preview-security',
            headers: {
              stsSeconds: 31536000,
              frameDeny: false,
              contentTypeNosniff: true,
            },
          },
        ],
      },
      pingap: {
        upstreams: [
          {
            name: 'docker-backend-preview',
            targets: [process.env.DOCKER_INTERNAL_URL || 'http://docker-backend:8000'],
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
    },
    security: policy,
  };
}

edgeRouter.get('/scaffold', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, data: buildEdgeScaffold() });
});
