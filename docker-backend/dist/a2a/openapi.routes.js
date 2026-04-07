"use strict";
/**
 * @module a2a/openapi.routes
 *
 * Serves the A2A OpenAPI specification and a Swagger UI viewer.
 *
 * Mount under `/api/a2a`:
 * - GET /openapi.yaml
 * - GET /docs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2aOpenApiRouter = void 0;
const express_1 = require("express");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-openapi-routes');
const OPENAPI_PATH = (0, node_path_1.resolve)(process.cwd(), 'docs/a2a-openapi.yaml');
exports.a2aOpenApiRouter = (0, express_1.Router)();
exports.a2aOpenApiRouter.get('/openapi.yaml', (_req, res) => {
    try {
        if (!(0, node_fs_1.existsSync)(OPENAPI_PATH)) {
            res.status(404).json({
                success: false,
                error: { message: 'A2A OpenAPI spec not found' },
            });
            return;
        }
        res.status(200);
        res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
        (0, node_fs_1.createReadStream)(OPENAPI_PATH).pipe(res);
    }
    catch (err) {
        logger.error({ err }, 'failed to serve A2A OpenAPI yaml');
        res.status(500).json({
            success: false,
            error: { message: 'Failed to load A2A OpenAPI spec' },
        });
    }
});
exports.a2aOpenApiRouter.get('/docs', (_req, res) => {
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
