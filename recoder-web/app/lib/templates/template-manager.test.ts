import { describe, expect, it } from 'vitest';
import { templateManager } from './template-manager';

describe('template-manager vite-shadcn overrides', () => {
  it('generates Tailwind v3/PostCSS-compatible starter files', () => {
    const files = templateManager.generateFiles('vite-shadcn', {
      projectName: 'hello-world',
    });
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    const packageJson = JSON.parse(byPath.get('package.json') || '{}');

    expect(packageJson.name).toBe('hello-world');
    expect(packageJson.devDependencies.tailwindcss).toBe('^3.4.17');
    expect(packageJson.devDependencies.postcss).toBe('^8.4.49');
    expect(packageJson.devDependencies.autoprefixer).toBe('^10.4.21');
    expect(packageJson.devDependencies['@tailwindcss/vite']).toBeUndefined();
    expect(packageJson.dependencies['tw-animate-css']).toBeUndefined();
    expect(byPath.get('postcss.config.js')).toContain('tailwindcss: {}');
    expect(byPath.get('tailwind.config.ts')).toContain('tailwindcss-animate');
    expect(byPath.get('src/index.css')).toContain('@tailwind base;');
    expect(byPath.get('vite.config.ts')).not.toContain('@tailwindcss/vite');
  });
});
