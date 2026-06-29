/**
 * electron-builder beforeBuild hook.
 *
 * Ensures the conductor cockpit renderer is freshly built into cockpit/dist
 * before the app is packaged, so the shipped app always bundles an up-to-date
 * cockpit. main.js loads cockpit/dist/index.html when RECODER_COCKPIT=1.
 *
 * The cockpit build (cockpit/build.mjs) runs esbuild against an already-installed
 * cockpit/node_modules. If the cockpit deps are not installed we install them
 * first (pnpm preferred, npm fallback) so the build does not silently skip.
 *
 * Returning `true` tells electron-builder we handled (no) dependency install and
 * it should NOT run its own npm install step for the app.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cockpitDir = path.join(__dirname, 'cockpit');
const cockpitBuild = path.join(cockpitDir, 'build.mjs');
const cockpitNodeModules = path.join(cockpitDir, 'node_modules');
const cockpitDist = path.join(cockpitDir, 'dist');

// Repo root is two levels up from apps/desktop; the embedded backend lives here.
const repoRoot = path.resolve(__dirname, '..', '..');
const backendDir = path.join(repoRoot, 'docker-backend');

function run(cmd) {
  console.log(`[before-build] $ ${cmd}`);
  execSync(cmd, { cwd: cockpitDir, stdio: 'inherit' });
}

function runIn(cwd, cmd) {
  console.log(`[before-build] (${path.basename(cwd)}) $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

/**
 * Build the embedded docker-backend dist so extraResources ships a fresh
 * compiled backend, including dist/conductor/mint-conductor-key.js (the packaged
 * supervisor runs this to mint the local conductor key). We fail the build if
 * the two load-bearing entrypoints are missing afterwards, so we never package
 * a backend that cannot boot or cannot mint a key.
 */
function buildEmbeddedBackend() {
  const serverEntry = path.join(backendDir, 'dist', 'server.js');
  const mintEntry = path.join(backendDir, 'dist', 'conductor', 'mint-conductor-key.js');

  if (!fs.existsSync(path.join(backendDir, 'node_modules', '.bin', 'tsc'))) {
    throw new Error(
      `[before-build] docker-backend devDependencies (tsc) not installed at ${backendDir}. ` +
        'Install backend deps before packaging the desktop app.',
    );
  }

  console.log('[before-build] building embedded docker-backend (tsc)');
  runIn(backendDir, 'npx tsc');

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`[before-build] backend build did not produce ${serverEntry}`);
  }
  if (!fs.existsSync(mintEntry)) {
    throw new Error(
      `[before-build] backend build did not produce ${mintEntry}; the packaged ` +
        'supervisor could not mint a conductor key. Check src/conductor/mint-conductor-key.ts.',
    );
  }
  console.log('[before-build] embedded backend dist ready (server.js + mint-conductor-key.js)');
}

function hasPnpm() {
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const appNodeModules = path.join(__dirname, 'node_modules');

/**
 * Assert the native-module inputs are present BEFORE electron-builder packages
 * them. node-pty ships a native `pty.node` plus a `spawn-helper` exec'd at
 * runtime; electron-updater is the auto-update engine. If a partial/corrupt
 * install dropped either, the produced app silently loses its terminal or its
 * updater. We fail the build here instead of shipping a broken artifact.
 *
 * This guards the INPUTS. The packaged OUTPUT (node-pty in app.asar.unpacked,
 * electron-updater bundled) is asserted separately by the afterPack hook
 * (after-pack.js), so a regression in the asar/asarUnpack config also fails.
 */
function assertNativeModuleInputs() {
  // electron-updater must resolve as a real package directory with a main entry.
  const updaterPkg = path.join(appNodeModules, 'electron-updater', 'package.json');
  if (!fs.existsSync(updaterPkg)) {
    throw new Error(
      `[before-build] electron-updater not installed at ${updaterPkg}; ` +
        'auto-update would be missing from the build. Run `npm install` in apps/desktop.',
    );
  }

  // node-pty must be installed.
  const ptyPkg = path.join(appNodeModules, 'node-pty', 'package.json');
  if (!fs.existsSync(ptyPkg)) {
    throw new Error(
      `[before-build] node-pty not installed at ${ptyPkg}; the desktop terminal ` +
        'would be missing. Run `npm install` in apps/desktop.',
    );
  }

  // node-pty must carry at least one native binary for the platform(s) we ship.
  // On posix it also ships a `spawn-helper` that node-pty exec()s at runtime, so
  // it MUST end up on real disk (app.asar.unpacked) — see after-pack.js.
  const ptyRoot = path.join(appNodeModules, 'node-pty');
  const nativeBinaries = [];
  const stack = [ptyRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith('.node') || entry.name === 'spawn-helper') {
        nativeBinaries.push(full);
      }
    }
  }
  if (nativeBinaries.length === 0) {
    throw new Error(
      `[before-build] node-pty has no native binaries under ${ptyRoot} ` +
        '(.node / spawn-helper). The install is incomplete; rebuild node-pty.',
    );
  }
  console.log(
    `[before-build] native-module inputs OK: electron-updater present, ` +
      `node-pty has ${nativeBinaries.length} native binary file(s).`,
  );
}

exports.default = async function beforeBuild() {
  assertNativeModuleInputs();
  buildEmbeddedBackend();

  if (!fs.existsSync(cockpitBuild)) {
    throw new Error(`[before-build] cockpit build script missing at ${cockpitBuild}`);
  }

  if (!fs.existsSync(cockpitNodeModules)) {
    console.log('[before-build] cockpit node_modules missing — installing cockpit deps');
    if (hasPnpm()) {
      run('pnpm install --ignore-workspace');
    } else {
      run('npm install');
    }
  }

  console.log('[before-build] building cockpit renderer (node cockpit/build.mjs)');
  run('node build.mjs');

  const indexHtml = path.join(cockpitDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`[before-build] cockpit build did not produce ${indexHtml}`);
  }
  console.log('[before-build] cockpit bundle ready at cockpit/dist');

  // We did not run an app-level dependency install; let electron-builder do its
  // own (default behavior is to install app deps). Return false so it proceeds.
  return false;
};
