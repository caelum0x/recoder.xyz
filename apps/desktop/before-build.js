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

function run(cmd) {
  console.log(`[before-build] $ ${cmd}`);
  execSync(cmd, { cwd: cockpitDir, stdio: 'inherit' });
}

function hasPnpm() {
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

exports.default = async function beforeBuild() {
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
