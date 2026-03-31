import { describe, expect, it } from 'vitest';
import {
  normalizeTailwindToolchainPackageJson,
  sanitizePackageJsonVersions,
} from './package-json-sanitizer';

describe('package-json-sanitizer', () => {
  it('normalizes Tailwind 4 PostCSS setups back to the supported Tailwind 3 toolchain', () => {
    const input = JSON.stringify({
      devDependencies: {
        tailwindcss: 'latest',
        postcss: '^8.5.0',
        autoprefixer: '^10.4.18',
        '@tailwindcss/postcss': '^4.1.0',
        '@tailwindcss/vite': '^4.1.0',
      },
    });

    const { sanitized, changed } = normalizeTailwindToolchainPackageJson(input);
    const parsed = JSON.parse(sanitized);

    expect(changed).toBe(true);
    expect(parsed.devDependencies.tailwindcss).toBe('^3.4.17');
    expect(parsed.devDependencies.postcss).toBe('^8.4.49');
    expect(parsed.devDependencies.autoprefixer).toBe('^10.4.21');
    expect(parsed.devDependencies['@tailwindcss/postcss']).toBeUndefined();
    expect(parsed.devDependencies['@tailwindcss/vite']).toBeUndefined();
  });

  it('keeps the Tailwind toolchain pinned while still relaxing unrelated versions', () => {
    const input = JSON.stringify({
      dependencies: {
        react: '^19.0.0',
      },
      devDependencies: {
        tailwindcss: '^4.1.0',
        postcss: '^8.5.0',
        autoprefixer: '^10.4.18',
        '@types/react-router-dom': '^5.3.0',
        vite: '^6.3.0',
      },
    });

    const { sanitized, changed } = sanitizePackageJsonVersions(input);
    const parsed = JSON.parse(sanitized);

    expect(changed).toBe(true);
    expect(parsed.dependencies.react).toBe('latest');
    expect(parsed.devDependencies.vite).toBe('latest');
    expect(parsed.devDependencies.tailwindcss).toBe('^3.4.17');
    expect(parsed.devDependencies.postcss).toBe('^8.4.49');
    expect(parsed.devDependencies.autoprefixer).toBe('^10.4.21');
    expect(parsed.devDependencies['@types/react-router-dom']).toBeUndefined();
  });

  it('adds react-is when recharts is present without its runtime peer', () => {
    const input = JSON.stringify({
      dependencies: {
        react: '^19.1.0',
        recharts: 'latest',
      },
    });

    const { sanitized, changed } = normalizeTailwindToolchainPackageJson(input);
    const parsed = JSON.parse(sanitized);

    expect(changed).toBe(true);
    expect(parsed.dependencies.recharts).toBe('latest');
    expect(parsed.dependencies['react-is']).toBe('^19.1.0');
  });
});
