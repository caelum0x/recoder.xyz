import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoreDirs = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.nx',
  'packages-local-backup',
]);
const compromisedAxiosVersions = new Set(['1.14.1', '0.30.4']);
const compromisedPackages = new Set(['plain-crypto-js@4.2.1']);
const minimumReactEmailVersion = { major: 5, minor: 2, patch: 10 };
const minimumNextAuthVersion = { major: 4, minor: 24, patch: 13 };


function parseVersion(input) {
  const match = String(input).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function nextFloor(version) {
  if (!version) return null;
  if (version.major <= 13) return null;
  if (version.major === 14) return { major: 14, minor: 2, patch: 35 };
  if (version.major === 15) {
    const floors = {
      0: { major: 15, minor: 0, patch: 7 },
      1: { major: 15, minor: 1, patch: 11 },
      2: { major: 15, minor: 2, patch: 8 },
      3: { major: 15, minor: 3, patch: 8 },
      4: { major: 15, minor: 4, patch: 10 },
      5: { major: 15, minor: 5, patch: 9 },
    };
    return floors[version.minor] ?? { major: 15, minor: version.minor, patch: 0 };
  }
  if (version.major === 16) return { major: 16, minor: 0, patch: 10 };
  return version;
}

function isSafeExactNext(version) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const floor = nextFloor(parsed);
  if (!floor) return true;
  return compareVersions(parsed, floor) >= 0;
}

function isSafeManifestNext(spec) {
  const trimmed = String(spec).trim();
  if (!trimmed || trimmed === 'catalog:') return true;
  const exact = /^(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (exact) return isSafeExactNext(exact[1]);

  const tilde = /^~(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (tilde) return isSafeExactNext(tilde[1]);

  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (caret) {
    const parsed = parseVersion(caret[1]);
    if (!parsed) return false;
    if (parsed.major <= 13) return true;
    if (parsed.major === 14) return compareVersions(parsed, { major: 14, minor: 2, patch: 35 }) >= 0;
    if (parsed.major === 15) return compareVersions(parsed, { major: 15, minor: 5, patch: 9 }) >= 0;
    if (parsed.major === 16) return compareVersions(parsed, { major: 16, minor: 0, patch: 10 }) >= 0;
    return true;
  }

  return false;
}

function walk(dir, matches = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matches);
      continue;
    }
    if (entry.name === 'package.json' || entry.name === 'package-lock.json' || entry.name === 'pnpm-lock.yaml') {
      matches.push(fullPath);
    }
  }
  return matches;
}

function rel(filePath) {
  return path.relative(rootDir, filePath) || filePath;
}

const issues = [];
const files = walk(rootDir);

for (const filePath of files) {
  const relPath = rel(filePath);
  if (relPath === 'pnpm-workspace.yaml') continue;
  if (path.basename(filePath) === 'package.json') {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const dependencySections = ['dependencies', 'devDependencies'];
    let hasNext = false;
    let hasNextAuth = false;
    for (const section of dependencySections) {
      const nextSpec = pkg?.[section]?.next;
      if (nextSpec) {
        hasNext = true;
        if (!isSafeManifestNext(nextSpec)) {
          issues.push(`${relPath}: next spec ${nextSpec} is below the enforced safe floor`);
        }
      }

      const nextAuthSpec = pkg?.[section]?.['next-auth'];
      if (nextAuthSpec) {
        hasNextAuth = true;
        const parsed = parseVersion(nextAuthSpec);
        if (!parsed || compareVersions(parsed, minimumNextAuthVersion) < 0) {
          issues.push(`${relPath}: next-auth spec ${nextAuthSpec} is below 4.24.13`);
        }
      }

      const reactEmailSpec = pkg?.[section]?.['react-email'];
      if (reactEmailSpec) {
        const parsed = parseVersion(reactEmailSpec);
        if (!parsed || compareVersions(parsed, minimumReactEmailVersion) < 0) {
          issues.push(`${relPath}: react-email spec ${reactEmailSpec} is below 5.2.10`);
        }
      }
    }

    if (hasNextAuth && !hasNext) {
      issues.push(`${relPath}: next-auth is declared without an explicit next dependency`);
    }
    continue;
  }

  if (path.basename(filePath) === 'package-lock.json') {
    const lock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const packages = lock.packages || {};
    const rootPackage = packages[''] || {};
    const rootDependsOnNext = Boolean(
      rootPackage.dependencies?.next || rootPackage.devDependencies?.next,
    );
    for (const [pkgPath, value] of Object.entries(packages)) {
      if (
        rootDependsOnNext
        && pkgPath.endsWith('node_modules/next')
        && value.version
        && !isSafeExactNext(value.version)
      ) {
        issues.push(`${relPath}: resolved next ${value.version} is below the enforced safe floor`);
      }
      if (pkgPath.endsWith('node_modules/axios') && compromisedAxiosVersions.has(String(value.version))) {
        issues.push(`${relPath}: compromised axios ${value.version} detected`);
      }
      if (pkgPath.endsWith('node_modules/plain-crypto-js') && String(value.version) === '4.2.1') {
        issues.push(`${relPath}: compromised plain-crypto-js 4.2.1 detected`);
      }
    }
    continue;
  }

  if (path.basename(filePath) === 'pnpm-lock.yaml') {
    const text = fs.readFileSync(filePath, 'utf8');
    const lock = parseYaml(text);
    for (const [importer, importerData] of Object.entries(lock.importers || {})) {
      const nextRef = importerData?.dependencies?.next ?? importerData?.devDependencies?.next;
      const version = parseVersion(nextRef?.version || nextRef?.specifier || '');
      if (version && !isSafeExactNext(version.raw)) {
        issues.push(`${relPath} importer ${importer}: resolved next ${version.raw} is below the enforced safe floor`);
      }
    }
    for (const compromisedVersion of compromisedAxiosVersions) {
      if (text.includes(`axios@${compromisedVersion}`)) {
        issues.push(`${relPath}: compromised axios ${compromisedVersion} detected`);
      }
    }
    for (const compromisedPackage of compromisedPackages) {
      if (text.includes(compromisedPackage)) {
        issues.push(`${relPath}: compromised ${compromisedPackage} detected`);
      }
    }
  }
}

const workspaceConfig = parseYaml(fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8'));
const catalogNext = workspaceConfig?.catalog?.next;
if (catalogNext && !isSafeManifestNext(catalogNext)) {
  issues.push(`pnpm-workspace.yaml: catalog next spec ${catalogNext} is below the enforced safe floor`);
}

if (issues.length > 0) {
  console.error('[security-audit] dependency issues found:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('[security-audit] Next.js and axios lockfile checks passed.');
