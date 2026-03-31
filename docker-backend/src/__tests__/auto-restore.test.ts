import { describe, expect, it } from 'vitest';

import { parseAllErrors } from '../auto-restore.js';

describe('parseAllErrors', () => {
  it('captures full Vite internal server error messages instead of one-character fragments', () => {
    const logs = `
[vite] Internal server error: [postcss] It looks like you're trying to use tailwindcss directly as a PostCSS plugin. The PostCSS plugin has moved to a separate package.
  Plugin: vite:css
  File: /home/daytona/src/index.css:1:0
      at Input.error (/home/daytona/node_modules/postcss/lib/input.js:106:16)
`;

    const errors = parseAllErrors(logs);
    const viteError = errors.find((error) => error.source === 'vite');

    expect(viteError).toBeDefined();
    expect(viteError?.message).toContain("It looks like you're trying to use tailwindcss directly as a PostCSS plugin");
    expect(viteError?.message.length).toBeGreaterThan(40);
    expect(viteError?.filePath).toBe('/workspace/src/index.css');
    expect(viteError?.line).toBe(1);
    expect(viteError?.column).toBe(0);
  });
});
