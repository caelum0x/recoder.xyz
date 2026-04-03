import { describe, expect, it } from 'vitest';
import { rewritePreviewBody, shouldRewritePreviewBody } from '../preview-rewrite.js';

const ERROR_CAPTURE_SCRIPT = '<script data-recoder-error-handler>window.__recoder=true;</script>';

describe('preview rewrite helpers', () => {
  it('injects a project-scoped base tag for static HTML previews', () => {
    const input = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="index.css">
</head>
<body>
  <h1>Preview Base Smoke</h1>
</body>
</html>`;

    const output = rewritePreviewBody(input, {
      proxyPrefix: '/preview/project-123',
      contentType: 'text/html; charset=utf-8',
      requestPath: '',
      errorCaptureScript: ERROR_CAPTURE_SCRIPT,
    });

    expect(output).toContain('<base href="/preview/project-123/">');
    expect(output).toContain(ERROR_CAPTURE_SCRIPT);
    expect(output).toContain('href="index.css"');
  });

  it('rewrites absolute asset paths under the preview prefix', () => {
    const input = '<script src="/src/main.tsx"></script><img src="/assets/logo.png">';

    const output = rewritePreviewBody(input, {
      proxyPrefix: '/preview/project-123',
      contentType: 'text/html',
      requestPath: '',
      errorCaptureScript: ERROR_CAPTURE_SCRIPT,
    });

    expect(output).toContain('src="/preview/project-123/src/main.tsx"');
    expect(output).toContain('src="/preview/project-123/assets/logo.png"');
  });

  it('rewrites JavaScript module imports based on the request path', () => {
    const input = 'import "/src/main.tsx"; export * from "/src/lib.ts";';

    const output = rewritePreviewBody(input, {
      proxyPrefix: '/preview/project-123',
      contentType: 'text/plain',
      requestPath: 'src/entry.ts',
      errorCaptureScript: ERROR_CAPTURE_SCRIPT,
    });

    expect(output).toContain('import "/preview/project-123/src/main.tsx";');
    expect(output).toContain('from "/preview/project-123/src/lib.ts";');
  });

  it('identifies rewrite-worthy preview responses', () => {
    expect(shouldRewritePreviewBody('text/html', '')).toBe(true);
    expect(shouldRewritePreviewBody('application/javascript', '')).toBe(true);
    expect(shouldRewritePreviewBody('text/plain', 'src/main.tsx')).toBe(true);
    expect(shouldRewritePreviewBody('text/css', 'index.css')).toBe(false);
  });
});
