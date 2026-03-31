const TYPES_PACKAGES_WITH_BUNDLED_TYPES = new Set([
  '@types/react-router-dom',
  '@types/react-router',
  '@types/zustand',
  '@types/zod',
  '@types/jotai',
]);

const TAILWIND_V4_ONLY_PACKAGES = new Set([
  '@tailwindcss/postcss',
  '@tailwindcss/vite',
]);

const PINNED_TOOLCHAIN_VERSIONS: Record<string, string> = {
  tailwindcss: '^3.4.17',
  postcss: '^8.4.49',
  autoprefixer: '^10.4.21',
};

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function hasTailwindToolchain(pkg: PackageJsonShape): boolean {
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return Boolean(
    allDeps.tailwindcss ||
    allDeps['@tailwindcss/postcss'] ||
    allDeps['@tailwindcss/vite']
  );
}

export function normalizeTailwindToolchainPackageJson(
  packageJsonStr: string
): { sanitized: string; changed: boolean } {
  try {
    const pkg = JSON.parse(packageJsonStr) as PackageJsonShape;
    let changed = false;

    if (!hasTailwindToolchain(pkg)) {
      return { sanitized: packageJsonStr, changed: false };
    }

    const sources = [pkg.dependencies, pkg.devDependencies];
    const devDependencies = { ...(pkg.devDependencies || {}) };

    for (const deps of sources) {
      if (!deps) {
        continue;
      }

      for (const pkgName of TAILWIND_V4_ONLY_PACKAGES) {
        if (deps[pkgName]) {
          delete deps[pkgName];
          delete devDependencies[pkgName];
          changed = true;
        }
      }
    }

    for (const [pkgName, version] of Object.entries(PINNED_TOOLCHAIN_VERSIONS)) {
      if (pkg.dependencies && pkg.dependencies[pkgName]) {
        delete pkg.dependencies[pkgName];
        changed = true;
      }

      if (devDependencies[pkgName] !== version) {
        devDependencies[pkgName] = version;
        changed = true;
      }
    }

    pkg.devDependencies = devDependencies;

    return {
      sanitized: changed ? JSON.stringify(pkg, null, 2) : packageJsonStr,
      changed,
    };
  } catch {
    return { sanitized: packageJsonStr, changed: false };
  }
}

/**
 * Replace brittle explicit versions with "latest" for general packages while
 * preserving the Tailwind v3 PostCSS toolchain required by the preview starter.
 */
export function sanitizePackageJsonVersions(
  packageJsonStr: string
): { sanitized: string; changed: boolean } {
  try {
    const pkg = JSON.parse(packageJsonStr) as PackageJsonShape;
    let changed = false;

    const sanitizeDeps = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
      if (!deps) {
        return deps;
      }

      const result: Record<string, string> = {};

      for (const [name, version] of Object.entries(deps)) {
        if (TYPES_PACKAGES_WITH_BUNDLED_TYPES.has(name) || TAILWIND_V4_ONLY_PACKAGES.has(name)) {
          changed = true;
          continue;
        }

        if (PINNED_TOOLCHAIN_VERSIONS[name]) {
          result[name] = PINNED_TOOLCHAIN_VERSIONS[name];
          if (version !== PINNED_TOOLCHAIN_VERSIONS[name]) {
            changed = true;
          }
          continue;
        }

        if (
          version !== 'latest' &&
          version !== '*' &&
          !version.startsWith('workspace:') &&
          !version.startsWith('file:') &&
          !version.startsWith('link:') &&
          !version.startsWith('git') &&
          !version.startsWith('http')
        ) {
          result[name] = 'latest';
          changed = true;
          continue;
        }

        result[name] = version;
      }

      return result;
    };

    pkg.dependencies = sanitizeDeps(pkg.dependencies);
    pkg.devDependencies = sanitizeDeps(pkg.devDependencies);

    const normalized = normalizeTailwindToolchainPackageJson(JSON.stringify(pkg, null, 2));

    return {
      sanitized: normalized.sanitized,
      changed: changed || normalized.changed,
    };
  } catch {
    return { sanitized: packageJsonStr, changed: false };
  }
}
