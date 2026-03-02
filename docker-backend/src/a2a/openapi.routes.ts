/**
 * @module a2a/openapi.routes
 *
 * Serves the A2A OpenAPI specification and a Swagger UI viewer.
 *
 * Mount under `/api/a2a`:
 * - GET /openapi.yaml
 * - GET /docs
 */

import { Router, type Request, type Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger';

const logger = createLogger('a2a-openapi-routes');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OPENAPI_PATH = resolve(__dirname, '../../docs/a2a-openapi.yaml');

export const a2aOpenApiRouter = Router();

a2aOpenApiRouter.get('/openapi.yaml', (_req: Request, res: Response) => {
  try {
    if (!existsSync(OPENAPI_PATH)) {
      res.status(404).json({
        success: false,
        error: { message: 'A2A OpenAPI spec not found' },
      });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
    createReadStream(OPENAPI_PATH).pipe(res);
  } catch (err) {
    logger.error({ err }, 'failed to serve A2A OpenAPI yaml');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load A2A OpenAPI spec' },
    });
  }
});

a2aOpenApiRouter.get('/docs', (_req: Request, res: Response) => {
  // Lightweight Swagger UI shell from CDN, no additional backend dependency.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A2A API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html, body, #swagger-ui { height: 100%; margin: 0; }
    body { background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/a2a/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      docExpansion: 'list',
      displayRequestDuration: true
    });
  </script>
</body>
</html>`;

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

