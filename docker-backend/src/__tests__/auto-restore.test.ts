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

  it('parses plugin-prefixed Vite CSS overlay errors', () => {
    const logs = `
[plugin:vite:css] [postcss] It looks like you're trying to use \`tailwindcss\` directly as a PostCSS plugin. The PostCSS plugin has moved to a separate package.
/home/daytona/src/index.css:undefined:null
    at at (/home/daytona/node_modules/tailwindcss/dist/lib.js:38:1643)
`;

    const errors = parseAllErrors(logs);
    const viteError = errors.find((error) => error.source === 'vite');

    expect(viteError).toBeDefined();
    expect(viteError?.message).toContain("It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin");
    expect(viteError?.filePath).toBe('/workspace/src/index.css');
    expect(viteError?.line).toBeUndefined();
    expect(viteError?.column).toBeUndefined();
  });

  it('parses plugin-prefixed Vite import analysis errors with file coordinates', () => {
    const logs = `
plugin:vite:import-analysis] Failed to resolve import "./App" from "src/main.tsx". Does the file exist?
/home/daytona/src/main.tsx:4:16
2  |  import ReactDOM from "react-dom/client";
3  |  import { HashRouter } from "react-router-dom";
4  |  import App from "./App";
   |                   ^
`;

    const errors = parseAllErrors(logs);
    const viteError = errors.find((error) => error.source === 'vite');

    expect(viteError).toBeDefined();
    expect(viteError?.type).toBe('module');
    expect(viteError?.message).toContain('Failed to resolve import "./App"');
    expect(viteError?.filePath).toBe('/workspace/src/main.tsx');
    expect(viteError?.line).toBe(4);
    expect(viteError?.column).toBe(16);
  });

  it('parses Daytona Vite pre-transform errors instead of collapsing them into runtime noise', () => {
    const logs = `
[dev:client] 1:20:40 AM [vite] (client) Pre-transform error: [postcss] It looks like you're trying to use \`tailwindcss\` directly as a PostCSS plugin. The PostCSS plugin has moved to a separate package, so to continue using Tailwind CSS with PostCSS you'll need to install \`@tailwindcss/postcss\` and update your PostCSS configuration.
[dev:client]   Plugin: vite:css
[dev:client]   File: /home/daytona/src/index.css:undefined:NaN
`;

    const errors = parseAllErrors(logs);
    const viteError = errors.find((error) => error.source === 'vite');
    const runtimeNoise = errors.find((error) => error.source === 'runtime' && error.message === '[');

    expect(viteError).toBeDefined();
    expect(viteError?.message).toContain('It looks like you\'re trying to use `tailwindcss` directly as a PostCSS plugin');
    expect(viteError?.filePath).toBe('/workspace/src/index.css');
    expect(runtimeNoise).toBeUndefined();
  });
});
